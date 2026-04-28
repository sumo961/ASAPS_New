/**
 * IncomingChangesTab - Shows ahead/behind counts, fetch/pull/push actions, incoming commits
 */

import React, { useState, useCallback } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { gitLog, type GitLogEntry } from '../../vcs/GitAdapter';

export const IncomingChangesTab: React.FC = () => {
  const vcs = useVCSStatus();
  const [incomingCommits, setIncomingCommits] = useState<GitLogEntry[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const handleFetch = useCallback(async () => {
    if (!vcs || !vcs.projectPath) return;
    setIsFetching(true);
    try {
      await vcs.fetch();
      // After fetch, get incoming commits
      const commits = await gitLog(vcs.projectPath, 20, undefined);
      setIncomingCommits(commits);
      setHasFetched(true);
      // A pure fetch only updates refs — but in practice ASAPS treats this
      // button as the "bring me current" action and authors expect file
      // changes to appear in the UI. Dispatch the reload event so the
      // project is re-read from disk; if nothing changed it's a quick no-op.
      window.dispatchEvent(new CustomEvent('asaps:git-reset'));
    } finally {
      setIsFetching(false);
    }
  }, [vcs]);

  const handlePull = useCallback(async (rebase = false) => {
    if (!vcs) return;
    setIsPulling(true);
    try {
      const result = await vcs.pull(rebase);
      // Reload in-memory project state from disk so newly-pulled beat
      // files / asset changes / settings show up immediately. Without
      // this, authors had to switch projects and back to see the result.
      if (result?.success !== false) {
        window.dispatchEvent(new CustomEvent('asaps:git-reset'));
      }
    } finally {
      setIsPulling(false);
    }
  }, [vcs]);

  const handlePush = useCallback(async () => {
    if (!vcs) return;
    setIsPushing(true);
    try {
      await vcs.push();
    } finally {
      setIsPushing(false);
    }
  }, [vcs]);

  if (!vcs) return null;

  return (
    <div style={{ padding: 12, color: '#cbd5e1' }}>
      {/* Ahead/Behind summary */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#4ade80', fontSize: '18px' }}>{'\u2191'}</span>
          <span style={{ fontSize: '20px', fontWeight: 600 }}>{vcs.ahead}</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>to push</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#60a5fa', fontSize: '18px' }}>{'\u2193'}</span>
          <span style={{ fontSize: '20px', fontWeight: 600 }}>{vcs.behind}</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>to pull</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={handleFetch} disabled={isFetching} style={btnStyle}>
          {isFetching ? 'Fetching...' : 'Fetch'}
        </button>
        <button onClick={() => handlePull(false)} disabled={isPulling} style={{ ...btnStyle, backgroundColor: '#1e40af' }}>
          {isPulling ? 'Pulling...' : 'Pull'}
        </button>
        <button onClick={() => handlePull(true)} disabled={isPulling} style={btnStyle}>
          Pull (Rebase)
        </button>
        {vcs.ahead > 0 && (
          <button onClick={handlePush} disabled={isPushing} style={{ ...btnStyle, backgroundColor: '#15803d' }}>
            {isPushing ? 'Pushing...' : `Push (${vcs.ahead})`}
          </button>
        )}
      </div>

      {/* Incoming commits after fetch */}
      {hasFetched && incomingCommits.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
            Recent Commits
          </div>
          {incomingCommits.slice(0, 10).map(commit => (
            <div
              key={commit.hash}
              style={{
                padding: '6px 0',
                borderBottom: '1px solid #1e293b',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'monospace', color: '#fbbf24', fontSize: '11px' }}>
                  {commit.hash.substring(0, 7)}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {commit.message}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                <span>{commit.author}</span>
                <span>{formatRelativeDate(commit.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasFetched && incomingCommits.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '13px' }}>No incoming changes detected.</div>
      )}

      {!hasFetched && vcs.behind === 0 && vcs.ahead === 0 && (
        <div style={{ color: '#64748b', fontSize: '13px' }}>
          Click "Fetch" to check for remote changes.
        </div>
      )}
    </div>
  );
};

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '12px',
  backgroundColor: '#334155',
  color: '#e2e8f0',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};
