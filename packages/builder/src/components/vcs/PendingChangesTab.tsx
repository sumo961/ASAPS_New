/**
 * PendingChangesTab - Shows staged, unstaged, and untracked files with commit form
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { gitConfigSet, gitConfigGet, gitStage, gitStageAll } from '../../vcs/GitAdapter';
import type { GitFileStatus } from '../../vcs/GitAdapter';
import { useTranslationState } from '../../contexts/TranslationContext';

const statusIcons: Record<string, { icon: string; color: string }> = {
  M: { icon: 'M', color: '#f59e0b' },
  A: { icon: 'A', color: '#22c55e' },
  D: { icon: 'D', color: '#ef4444' },
  R: { icon: 'R', color: '#8b5cf6' },
  '?': { icon: 'U', color: '#64748b' },
};

interface PendingChangesTabProps {
  onViewDiff?: (filePath: string) => void;
}

export const PendingChangesTab: React.FC<PendingChangesTabProps> = ({ onViewDiff }) => {
  const vcs = useVCSStatus();
  const translationState = useTranslationState();
  const [commitMessage, setCommitMessage] = useState('');
  const commitInputRef = useRef<HTMLTextAreaElement | null>(null);
  // ⌘K (menu: Version Control → Commit…) opens the panel and asks for focus
  // via this event — completing the '/* focus commit input */' the App-side
  // handler shipped as a comment.
  useEffect(() => {
    const focus = () => commitInputRef.current?.focus();
    window.addEventListener('asaps:focusCommitInput', focus);
    return () => window.removeEventListener('asaps:focusCommitInput', focus);
  }, []);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showIdentityForm, setShowIdentityForm] = useState(false);
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const didAutoFill = useRef(false);

  // Auto-fill "Initial commit" on fresh repos (branch is 'unknown' when no commits exist)
  useEffect(() => {
    if (vcs && vcs.branch === 'unknown' && !didAutoFill.current && !commitMessage) {
      setCommitMessage('Initial commit');
      didAutoFill.current = true;
    }
  }, [vcs?.branch]);

  /** Check if the error is a missing git identity */
  const isIdentityError = (message: string) =>
    message.includes('Author identity unknown') || message.includes('Please tell me who you are');

  const handleStage = useCallback(async (files: string[]) => {
    if (!vcs) return;
    await vcs.stage(files);
  }, [vcs]);

  const handleUnstage = useCallback(async (files: string[]) => {
    if (!vcs) return;
    await vcs.unstage(files);
  }, [vcs]);

  const handleRevert = useCallback(async (files: string[]) => {
    if (!vcs) return;
    const confirmed = window.confirm(`Discard changes to ${files.length} file(s)? This cannot be undone.`);
    if (confirmed) {
      const result = await vcs.revertFiles(files);
      if (result.success) {
        // Dispatch git-reset event so App.tsx pauses autosave and reloads
        // the project from disk, preventing stale in-memory state from
        // being written back over the reverted files.
        window.dispatchEvent(new CustomEvent('asaps:git-reset'));
      }
    }
  }, [vcs]);

  const handleDiscardUntracked = useCallback(async (files: string[]) => {
    if (!vcs?.cleanUntrackedFiles) return;
    const fileList = files.slice(0, 10).join('\n  ');
    const suffix = files.length > 10 ? `\n  ...and ${files.length - 10} more` : '';
    const confirmed = window.confirm(
      `Delete ${files.length} untracked file(s)? This cannot be undone.\n\n  ${fileList}${suffix}`
    );
    if (confirmed) {
      await vcs.cleanUntrackedFiles(files);
    }
  }, [vcs]);

  /**
   * Ensure all changes are staged before committing.
   * Uses `git add -A` to stage everything — avoids path-parsing issues and
   * guarantees no files are missed (stale VCS state, files modified after
   * last refresh, etc.).
   * Calls gitStageAll directly (not through VCS wrapper) to avoid a VCS
   * refresh between staging and committing.
   */
  const ensureStaged = useCallback(async (): Promise<boolean> => {
    if (!vcs?.projectPath) return false;
    if (vcs.stagedFiles.length === 0 && vcs.unstagedFiles.length === 0) return false;
    const result = await gitStageAll(vcs.projectPath);
    return result.success;
  }, [vcs]);

  const pendingPushRef = useRef(false);

  /** Set git identity and retry commit */
  const handleSetIdentity = useCallback(async () => {
    if (!vcs?.projectPath || !identityName.trim() || !identityEmail.trim()) return;
    setIsCommitting(true);
    try {
      await gitConfigSet(vcs.projectPath, 'user.name', identityName.trim());
      await gitConfigSet(vcs.projectPath, 'user.email', identityEmail.trim());
      setShowIdentityForm(false);

      // Retry commit
      const ready = await ensureStaged();
      if (!ready) return;
      const result = await vcs.commit(commitMessage.trim());
      if (result.success) {
        setCommitMessage('');
        if (pendingPushRef.current) {
          await vcs.push();
        }
      }
    } finally {
      setIsCommitting(false);
    }
  }, [vcs, identityName, identityEmail, commitMessage, ensureStaged]);

  const handleCommit = useCallback(async () => {
    if (!vcs || !commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      const ready = await ensureStaged();
      if (!ready) return;
      const result = await vcs.commit(commitMessage.trim());
      if (result.success) {
        setCommitMessage('');
      } else if (isIdentityError(result.message)) {
        pendingPushRef.current = false;
        // Pre-fill from existing global config if available
        if (vcs.projectPath) {
          const name = await gitConfigGet(vcs.projectPath, 'user.name');
          const email = await gitConfigGet(vcs.projectPath, 'user.email');
          if (name) setIdentityName(name);
          if (email) setIdentityEmail(email);
        }
        setShowIdentityForm(true);
      }
    } finally {
      setIsCommitting(false);
    }
  }, [vcs, commitMessage, ensureStaged]);

  const handleCommitAndPush = useCallback(async () => {
    if (!vcs || !commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      const ready = await ensureStaged();
      if (!ready) return;
      const commitResult = await vcs.commit(commitMessage.trim());
      if (commitResult.success) {
        setCommitMessage('');
        await vcs.push();
      } else if (isIdentityError(commitResult.message)) {
        pendingPushRef.current = true;
        if (vcs.projectPath) {
          const name = await gitConfigGet(vcs.projectPath, 'user.name');
          const email = await gitConfigGet(vcs.projectPath, 'user.email');
          if (name) setIdentityName(name);
          if (email) setIdentityEmail(email);
        }
        setShowIdentityForm(true);
      }
    } finally {
      setIsCommitting(false);
    }
  }, [vcs, commitMessage, ensureStaged]);

  if (!vcs) return null;

  const staged = vcs.stagedFiles;
  const unstaged = vcs.unstagedFiles;
  const untrackedFiles = unstaged.filter(f => f.status === '?');

  const renderFileRow = (file: GitFileStatus, isStaged: boolean) => {
    const info = statusIcons[file.status] || { icon: file.status, color: '#94a3b8' };
    // Extract beat name from path if possible
    const beatMatch = file.path.match(/\/(\w+)_([^/]+)\.json$/);
    let displayName = beatMatch ? `${beatMatch[1]} (${beatMatch[2]})` : file.path;
    let statusIcon: string | undefined;

    // Semantic display for translation files
    const translationMatch = file.path.match(/translations\/([^/]+)\.strings\.json$/);
    if (translationMatch) {
      const langCode = translationMatch[1];
      const resource = translationState.translations.find(t => t.languageCode === langCode);
      if (resource) {
        const staleCount = Object.values(resource.strings).filter(s => s.status === 'stale').length;
        displayName = `${resource.languageName} translation`;
        if (staleCount > 0) displayName += ` (${staleCount} stale)`;
        statusIcon = '\uD83C\uDF10'; // globe emoji
      }
    } else if (file.path.includes('translations/_manifest.json')) {
      displayName = 'Translation manifest';
      statusIcon = '\uD83C\uDF10';
    }

    return (
      <div
        key={`${isStaged ? 's' : 'u'}-${file.path}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '3px 12px',
          fontSize: '12px',
          color: '#cbd5e1',
          gap: 8,
        }}
        className="hover:bg-slate-800"
      >
        <span
          style={{
            width: 16,
            flexShrink: 0,
            textAlign: 'center',
            color: statusIcon ? undefined : info.color,
            fontWeight: 600,
            fontFamily: statusIcon ? 'inherit' : 'monospace',
            fontSize: statusIcon ? '12px' : '11px',
          }}
        >
          {statusIcon || info.icon}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.path}>
          {displayName}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {isStaged ? (
            <button
              onClick={() => handleUnstage([file.path])}
              style={actionBtnStyle}
              title="Unstage"
            >
              {'\u2212'}
            </button>
          ) : (
            <button
              onClick={() => handleStage([file.path])}
              style={actionBtnStyle}
              title="Stage"
            >
              +
            </button>
          )}
          {onViewDiff && (
            <button
              onClick={() => onViewDiff(file.path)}
              style={actionBtnStyle}
              title="View Diff"
            >
              D
            </button>
          )}
          {!isStaged && file.status !== '?' && (
            <button
              onClick={() => handleRevert([file.path])}
              style={{ ...actionBtnStyle, color: '#f87171' }}
              title="Revert"
            >
              {'\u21A9'}
            </button>
          )}
          {!isStaged && file.status === '?' && (
            <button
              onClick={() => handleDiscardUntracked([file.path])}
              style={{ ...actionBtnStyle, color: '#f87171' }}
              title="Delete untracked file"
            >
              {'\u2715'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* File lists */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Staged section */}
        {staged.length > 0 && (
          <div>
            <div style={sectionHeaderStyle}>
              <span>Staged ({staged.length})</span>
              <button
                onClick={() => handleUnstage(staged.map(f => f.path))}
                style={smallBtnStyle}
              >
                Unstage All
              </button>
            </div>
            {staged.map(f => renderFileRow(f, true))}
          </div>
        )}

        {/* Unstaged section */}
        {unstaged.length > 0 && (
          <div>
            <div style={sectionHeaderStyle}>
              <span>Changes ({unstaged.length})</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {untrackedFiles.length > 0 && (
                  <button
                    onClick={() => handleDiscardUntracked(untrackedFiles.map(f => f.path))}
                    style={{ ...smallBtnStyle, color: '#f87171', borderColor: '#7f1d1d' }}
                  >
                    Discard Untracked
                  </button>
                )}
                <button
                  onClick={() => handleStage(unstaged.map(f => f.path))}
                  style={smallBtnStyle}
                >
                  Stage All
                </button>
              </div>
            </div>
            {unstaged.map(f => renderFileRow(f, false))}
          </div>
        )}

        {staged.length === 0 && unstaged.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            No pending changes
          </div>
        )}
      </div>

      {/* Commit section */}
      {(staged.length > 0 || unstaged.length > 0) && (
        <div style={{ borderTop: '1px solid #334155', padding: 8, flexShrink: 0 }}>
          <textarea
            ref={commitInputRef}
            autoFocus
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            onKeyDown={e => {
              // Cmd/Ctrl+Enter commits — a keyboard-driven commit needed two
              // mouse trips (focus the box, click the button) before this.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCommit();
              }
            }}
            placeholder="Enter commit message to enable commit... (⌘⏎ to commit)"
            style={{
              width: '100%',
              height: 48,
              padding: '6px 8px',
              fontSize: '12px',
              backgroundColor: '#1e293b',
              color: '#e2e8f0',
              border: `1px solid ${!commitMessage.trim() ? '#f59e0b55' : '#334155'}`,
              borderRadius: 4,
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          {/* Identity form — shown when git user.name/email not configured */}
          {showIdentityForm && (
            <div style={{
              marginTop: 6,
              padding: 8,
              backgroundColor: '#1e293b',
              border: '1px solid #f59e0b',
              borderRadius: 4,
            }}>
              <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: 6, fontWeight: 500 }}>
                Git needs your identity for commits:
              </div>
              <input
                value={identityName}
                onChange={e => setIdentityName(e.target.value)}
                placeholder="Your Name"
                style={identityInputStyle}
                autoFocus
              />
              <input
                value={identityEmail}
                onChange={e => setIdentityEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ ...identityInputStyle, marginTop: 4 }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && identityName.trim() && identityEmail.trim()) {
                    handleSetIdentity();
                  }
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowIdentityForm(false)}
                  style={{ ...smallBtnStyle, padding: '4px 10px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetIdentity}
                  disabled={!identityName.trim() || !identityEmail.trim() || isCommitting}
                  style={{
                    ...commitBtnStyle,
                    fontSize: '11px',
                    padding: '4px 12px',
                    ...(!identityName.trim() || !identityEmail.trim() || isCommitting ? disabledBtnStyle : {}),
                  }}
                >
                  {isCommitting ? 'Saving...' : 'Save & Commit'}
                </button>
              </div>
            </div>
          )}
          {!showIdentityForm && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            {staged.length === 0 && unstaged.length > 0 && (
              <span style={{ fontSize: '10px', color: '#64748b', marginRight: 'auto' }}>
                All changes will be staged automatically
              </span>
            )}
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || isCommitting}
              style={{
                ...commitBtnStyle,
                ...(!commitMessage.trim() || isCommitting ? disabledBtnStyle : {}),
              }}
            >
              {isCommitting ? 'Committing...' : staged.length > 0 ? 'Commit' : 'Commit All'}
            </button>
            {vcs.hasRemote && (
            <button
              onClick={handleCommitAndPush}
              disabled={!commitMessage.trim() || isCommitting}
              style={{
                ...commitBtnStyle,
                backgroundColor: '#1d4ed8',
                ...(!commitMessage.trim() || isCommitting ? disabledBtnStyle : {}),
              }}
            >
              {staged.length > 0 ? 'Commit & Push' : 'Commit All & Push'}
            </button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
};

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #334155',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: '11px',
  lineHeight: 1.2,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 12px',
  fontSize: '11px',
  color: '#94a3b8',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #1e293b',
};

const smallBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #334155',
  color: '#64748b',
  cursor: 'pointer',
  padding: '2px 8px',
  borderRadius: 3,
  fontSize: '10px',
};

const commitBtnStyle: React.CSSProperties = {
  padding: '5px 14px',
  fontSize: '12px',
  backgroundColor: '#15803d',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const disabledBtnStyle: React.CSSProperties = {
  opacity: 0.4,
  cursor: 'not-allowed',
};

const identityInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: '12px',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  fontFamily: 'inherit',
};
