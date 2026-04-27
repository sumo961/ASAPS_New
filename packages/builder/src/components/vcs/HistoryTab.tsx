/**
 * HistoryTab - Scrollable commit log with expandable file lists
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { gitLog, getGitStatus, type GitLogEntry } from '../../vcs/GitAdapter';

interface HistoryTabProps {
  onViewDiff?: (filePath: string, ref?: string) => void;
  filterFile?: string;
}

const PAGE_SIZE = 30;

export const HistoryTab: React.FC<HistoryTabProps> = ({ onViewDiff, filterFile }) => {
  const vcs = useVCSStatus();
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  const loadCommits = useCallback(async (append = false) => {
    if (!vcs?.projectPath) return;
    setLoading(true);
    try {
      const skip = append ? commits.length : 0;
      const entries = await gitLog(vcs.projectPath, PAGE_SIZE + skip, filterFile);
      // gitLog doesn't support skip directly, so we fetch more and slice
      const newEntries = append ? entries.slice(skip) : entries;
      if (append) {
        setCommits(prev => [...prev, ...newEntries]);
      } else {
        setCommits(entries);
      }
      setHasMore(entries.length >= PAGE_SIZE + skip);
    } finally {
      setLoading(false);
    }
  }, [vcs?.projectPath, filterFile, commits.length]);

  const handleResetToCommit = useCallback(async (commitHash: string) => {
    if (!vcs?.projectPath || !vcs.resetHardAndClean) return;

    // Gather file counts for the confirmation dialog
    let modifiedCount = 0;
    let untrackedCount = 0;
    try {
      const status = await getGitStatus(vcs.projectPath);
      modifiedCount = status.files.filter(f => f.status !== '?').length;
      untrackedCount = status.files.filter(f => f.status === '?').length;
    } catch { /* use zero counts */ }

    const parts: string[] = [];
    if (modifiedCount > 0) parts.push(`${modifiedCount} modified/staged file(s) will be DISCARDED`);
    if (untrackedCount > 0) parts.push(`${untrackedCount} untracked file(s) will be DELETED`);
    const detail = parts.length > 0 ? `\n\n${parts.join('\n')}` : '';

    const confirmed = window.confirm(
      `Reset to commit ${commitHash.substring(0, 7)}?\n\nThis will discard ALL uncommitted changes and cannot be undone.${detail}`
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const result = await vcs.resetHardAndClean(commitHash);
      if (result.success) {
        // Dispatch event so App.tsx reloads the project from disk
        window.dispatchEvent(new CustomEvent('asaps:git-reset'));
        // Refresh the commit list
        await loadCommits();
      }
    } finally {
      setIsResetting(false);
    }
  }, [vcs, loadCommits]);

  useEffect(() => {
    // Clear stale commits from the previous project FIRST so the user never
    // sees another project's history during the brief window before
    // loadCommits resolves. Without this the History tab continues to show
    // the prior project's log when switching/cloning into a new repo.
    setCommits([]);
    setExpandedHash(null);
    setHasMore(true);
    loadCommits();
  }, [vcs?.projectPath, filterFile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vcs) return null;

  return (
    <div style={{ color: '#cbd5e1' }}>
      {filterFile && (
        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #1e293b' }}>
          Showing history for: <span style={{ color: '#fbbf24' }}>{filterFile}</span>
        </div>
      )}

      {commits.map(commit => (
        <div
          key={commit.hash}
          style={{ borderBottom: '1px solid #1e293b' }}
        >
          <div
            onClick={() => setExpandedHash(expandedHash === commit.hash ? null : commit.hash)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              fontSize: '12px',
            }}
            className="hover:bg-slate-800"
          >
            <span style={{ fontFamily: 'monospace', color: '#fbbf24', fontSize: '11px', flexShrink: 0 }}>
              {commit.hash.substring(0, 7)}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {commit.message}
            </span>
            <span style={{ color: '#64748b', fontSize: '11px', flexShrink: 0 }}>
              {commit.author}
            </span>
            <span style={{ color: '#475569', fontSize: '11px', flexShrink: 0 }}>
              {formatRelativeDate(commit.date)}
            </span>
            {commit.files.length > 0 && (
              <span style={{ color: '#475569', fontSize: '10px', flexShrink: 0 }}>
                {expandedHash === commit.hash ? '\u25BC' : '\u25B6'} {commit.files.length}
              </span>
            )}
          </div>

          {/* Expanded: reset button + file list */}
          {expandedHash === commit.hash && (
            <div style={{ padding: '0 12px 8px 40px' }}>
              {/* Reset to this commit — shown at top for visibility */}
              <div style={{ marginBottom: commit.files.length > 0 ? 6 : 0, paddingBottom: commit.files.length > 0 ? 6 : 0, borderBottom: commit.files.length > 0 ? '1px solid #1e293b' : 'none' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleResetToCommit(commit.hash); }}
                  disabled={isResetting}
                  style={{
                    background: 'none',
                    border: '1px solid #7f1d1d',
                    color: '#f87171',
                    cursor: isResetting ? 'not-allowed' : 'pointer',
                    padding: '3px 10px',
                    borderRadius: 3,
                    fontSize: '11px',
                    opacity: isResetting ? 0.5 : 1,
                  }}
                >
                  {isResetting ? 'Resetting...' : 'Reset to here'}
                </button>
              </div>
              {commit.files.map(file => (
                <div
                  key={file}
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    padding: '2px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file}
                  </span>
                  {onViewDiff && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onViewDiff(file, commit.hash); }}
                      style={{
                        background: 'none',
                        border: '1px solid #334155',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '0 4px',
                        borderRadius: 2,
                        fontSize: '10px',
                      }}
                    >
                      diff
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {commits.length === 0 && !loading && (
        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          No commit history found.
        </div>
      )}

      {hasMore && commits.length > 0 && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <button
            onClick={() => loadCommits(true)}
            disabled={loading}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
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
