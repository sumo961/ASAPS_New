/**
 * VCSStatusBar - Status bar showing VCS info (branch, changed files count)
 *
 * Displayed in the toolbar area for directory-format projects under VCS.
 * Shows branch name, modified file count, and ahead/behind indicators.
 * Clickable to toggle the VCS panel. Has quick-action push/pull buttons.
 *
 * When no VCS is detected but a directory project is open, shows a
 * "Set up Version Control" button to initialize a Git repository.
 */

import React from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';

interface VCSStatusBarProps {
  /** Whether the VCS panel is currently open */
  panelOpen?: boolean;
  /** Toggle the VCS panel */
  onTogglePanel?: () => void;
  /** Called when the user wants to initialize a Git repo */
  onInitRepo?: () => void;
}

export const VCSStatusBar: React.FC<VCSStatusBarProps> = ({ panelOpen, onTogglePanel, onInitRepo }) => {
  const vcs = useVCSStatus();

  // Show "Git not found" warning when git binary is missing for a directory project
  if (vcs && vcs.initialized && vcs.gitNotInstalled && vcs.projectPath) {
    return (
      <div
        className="vcs-status-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          fontSize: '12px',
          color: '#fbbf24',
          borderLeft: '1px solid #334155',
        }}
      >
        <span style={{ fontSize: '11px' }} title="Git is not installed on this system">
          {'\u26A0'} Git not found
        </span>
        <a
          href="https://git-scm.com/downloads"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#60a5fa',
            fontSize: '11px',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Install Git
        </a>
      </div>
    );
  }

  // Show "Set up Version Control" when project is open but no VCS detected
  if (vcs && vcs.initialized && vcs.type === 'none' && vcs.projectPath) {
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
          style={{
            background: 'none',
            border: '1px solid #334155',
            color: '#60a5fa',
            cursor: 'pointer',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: '11px',
            lineHeight: '16px',
            whiteSpace: 'nowrap',
          }}
          title="Initialize a Git repository for this project"
        >
          Set up Git
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

      {/* Branch name */}
      {vcs.branch && (
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
      {vcs.type === 'git' && (
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
