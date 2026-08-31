/**
 * VCSStatusBar - Status bar showing VCS info (branch, changed files count)
 *
 * Displayed in the toolbar area for directory-format projects under VCS.
 * Shows branch name, modified file count, and ahead/behind indicators.
 * Clickable to toggle the VCS panel. Has quick-action push/pull buttons.
 *
 * When no VCS is detected but a directory project is open, shows a
 * "Set up Version Control" button to initialize a Git repository.
 *
 * When a merge/rebase is in progress, shows a prominent warning with
 * a button to open the MergeConflictDialog.
 */

import React, { useState, useEffect } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { MergeConflictDialog } from './MergeConflictDialog';

interface VCSStatusBarProps {
  /** Whether the VCS panel is currently open */
  panelOpen?: boolean;
  /** Toggle the VCS panel */
  onTogglePanel?: () => void;
  /** Called when the user wants to initialize a Git repo */
  onInitRepo?: () => void;
}

const TRACK_VERSIONS_HINT_KEY = 'asaps.trackVersionsHintShown';

export const VCSStatusBar: React.FC<VCSStatusBarProps> = ({ panelOpen, onTogglePanel, onInitRepo }) => {
  const vcs = useVCSStatus();
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  // One-time discoverability pulse on the quiet "Track versions" affordance —
  // the author it exists for (VCS-naive) is the least likely to spot a grey
  // label. Pulses a few times the FIRST time it ever appears, then never again
  // on this machine (localStorage flag).
  const [hintActive] = useState(() => {
    try {
      return !window.localStorage.getItem(TRACK_VERSIONS_HINT_KEY);
    } catch {
      return false;
    }
  });
  const offerVisible = !!(vcs && vcs.initialized && vcs.projectPath && (vcs.type === 'none' || vcs.gitNotInstalled));
  useEffect(() => {
    if (!offerVisible || !hintActive) return;
    try {
      window.localStorage.setItem(TRACK_VERSIONS_HINT_KEY, '1');
    } catch {
      /* storage unavailable — the hint just repeats next launch */
    }
  }, [offerVisible, hintActive]);

  // No repo yet (whether or not git is even installed): ONE quiet,
  // plain-language affordance. Pressing Save used to escalate to
  // "\u26A0 Git not found + Install Git" for authors who never asked for
  // version control — git vocabulary now starts only after this click
  // (the setup flow explains tooling, including installation if needed).
  if (offerVisible) {
    return (
      <div
        className="vcs-status-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          fontSize: '12px',
          color: '#94a3b8',
          borderLeft: '1px solid #334155',
        }}
      >
        <button
          onClick={onInitRepo}
          className={hintActive ? 'vcs-track-versions-hint' : undefined}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 3,
            fontSize: '11px',
            lineHeight: '16px',
            whiteSpace: 'nowrap',
          }}
          title="Keep a history of this project's changes and back it up to a server \u2014 optional, uses Git under the hood"
        >
          Track versions
        </button>
      </div>
    );
  }

  // Don't render if no VCS or not initialized
  if (!vcs || !vcs.initialized || vcs.type === 'none') {
    return null;
  }

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await vcs.refresh();
  };

  const handlePush = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await vcs.push();
  };

  const handlePull = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await vcs.pull();
  };

  return (
    <>
      {showConflictDialog && (
        <MergeConflictDialog
          errorMessage=""
          onClose={() => setShowConflictDialog(false)}
        />
      )}
      <div
        className="vcs-status-bar"
        onClick={onTogglePanel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '2px 8px',
          fontSize: '12px',
          color: '#94a3b8',
          borderLeft: '1px solid #334155',
          cursor: onTogglePanel ? 'pointer' : 'default',
        }}
      >
        {/* Panel open indicator */}
        {onTogglePanel && (
          <span style={{ fontSize: '8px', color: '#64748b' }}>
            {panelOpen ? '\u25BC' : '\u25B6'}
          </span>
        )}

        {/* VCS type icon */}
        <span style={{ opacity: 0.7 }}>
          {vcs.type === 'git' ? 'Git' : 'P4'}
        </span>

        {/* Merge/rebase in progress warning */}
        {vcs.mergeState && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowConflictDialog(true);
            }}
            style={{
              padding: '1px 6px',
              borderRadius: '3px',
              backgroundColor: '#7f1d1d',
              color: '#fca5a5',
              border: '1px solid #991b1b',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title={`${vcs.mergeState === 'rebase' ? 'Rebase' : 'Merge'} in progress — click to resolve or abort`}
          >
            {vcs.mergeState === 'rebase' ? 'REBASING' : 'MERGING'}
          </button>
        )}

        {/* Branch name */}
        {vcs.branch && !vcs.mergeState && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '3px',
              backgroundColor: '#1e293b',
              color: '#60a5fa',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          >
            {vcs.branch}
          </span>
        )}

        {/* Changed files count */}
        {vcs.isDirty && (
          <span
            style={{
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: vcs.changedFileCount > 0 ? '#854d0e' : 'transparent',
              color: '#fbbf24',
              fontSize: '11px',
            }}
            title={`${vcs.changedFileCount} changed file${vcs.changedFileCount !== 1 ? 's' : ''}`}
          >
            {vcs.changedFileCount} changed
          </span>
        )}

        {/* Ahead/behind (Git only) */}
        {vcs.type === 'git' && (vcs.ahead > 0 || vcs.behind > 0) && (
          <span style={{ fontSize: '11px' }}>
            {vcs.ahead > 0 && (
              <span style={{ color: '#4ade80' }} title={`${vcs.ahead} commits ahead of remote`}>
                {'\u2191'}{vcs.ahead}
              </span>
            )}
            {vcs.behind > 0 && (
              <span style={{ color: '#f87171', marginLeft: vcs.ahead > 0 ? '4px' : 0 }} title={`${vcs.behind} commits behind remote`}>
                {'\u2193'}{vcs.behind}
              </span>
            )}
          </span>
        )}

        {/* Conflict indicator */}
        {vcs.conflictFiles.size > 0 && (
          <span
            style={{
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: '#7f1d1d',
              color: '#fca5a5',
              fontSize: '11px',
            }}
            title={`${vcs.conflictFiles.size} conflict${vcs.conflictFiles.size !== 1 ? 's' : ''}`}
          >
            {vcs.conflictFiles.size} conflicts
          </span>
        )}

        {/* Quick action buttons (Git only) */}
        {vcs.type === 'git' && !vcs.mergeState && (
          <>
            {vcs.behind > 0 && (
              <button
                onClick={handlePull}
                style={quickBtnStyle}
                title="Pull from remote"
              >
                {'\u2193'}
              </button>
            )}
            {vcs.ahead > 0 && (
              <button
                onClick={handlePush}
                style={quickBtnStyle}
                title="Push to remote"
              >
                {'\u2191'}
              </button>
            )}
          </>
        )}

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '2px',
            fontSize: '12px',
            lineHeight: 1,
          }}
          title="Refresh VCS status"
        >
          {'\u21BB'}
        </button>
      </div>
    </>
  );
};

const quickBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #334155',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '1px 4px',
  borderRadius: 3,
  fontSize: '11px',
  lineHeight: 1,
};
