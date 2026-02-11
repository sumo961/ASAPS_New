/**
 * CloneRepoDialog - Dialog for cloning a remote Git repository
 *
 * Allows the user to enter a remote URL, pick a destination folder,
 * and clone the repository. On success, calls onCloned with the path.
 */

import React, { useState } from 'react';
import { gitClone } from '../../vcs/GitAdapter';

interface CloneRepoDialogProps {
  onCloned: (clonedPath: string) => void;
  onClose: () => void;
}

/** Extract repository name from a git remote URL */
function extractRepoName(url: string): string {
  // Handle URLs like:
  //   https://github.com/user/repo.git
  //   git@github.com:user/repo.git
  //   https://github.com/user/repo
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  const lastColon = trimmed.lastIndexOf(':');
  const sep = Math.max(lastSlash, lastColon);
  if (sep >= 0 && sep < trimmed.length - 1) {
    return trimmed.substring(sep + 1);
  }
  return '';
}

export const CloneRepoDialog: React.FC<CloneRepoDialogProps> = ({ onCloned, onClose }) => {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoName = extractRepoName(remoteUrl);
  const targetPath = parentDir && repoName ? `${parentDir}/${repoName}` : '';

  const handleBrowse = async () => {
    const api = window.electronAPI;
    if (!api?.dialog?.open) return;
    const result = await api.dialog.open({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      setParentDir(result.filePaths[0]);
    }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteUrl.trim() || !parentDir || !repoName) return;

    setLoading(true);
    setError(null);

    try {
      const result = await gitClone(remoteUrl.trim(), targetPath);
      if (result.success) {
        onCloned(targetPath);
        onClose();
      } else {
        setError(result.message || 'Clone failed');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
      setLoading(false);
    }
  };

  const canClone = remoteUrl.trim() && parentDir && repoName && !loading;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: 8,
          padding: '24px',
          width: 500,
          maxWidth: '90vw',
          border: '1px solid #334155',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: 16, fontWeight: 600 }}>
          Clone Repository
        </h3>
        <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 13 }}>
          Clone a remote Git repository to work on locally.
        </p>

        <form onSubmit={handleClone}>
          {/* Remote URL */}
          <label
            htmlFor="clone-url"
            style={{ display: 'block', color: '#cbd5e1', fontSize: 12, marginBottom: 4 }}
          >
            Repository URL
          </label>
          <input
            id="clone-url"
            type="text"
            value={remoteUrl}
            onChange={e => { setRemoteUrl(e.target.value); setError(null); }}
            placeholder="https://github.com/user/repo.git"
            disabled={loading}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#f1f5f9',
              fontSize: 13,
              fontFamily: 'monospace',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Parent directory */}
          <label
            style={{ display: 'block', color: '#cbd5e1', fontSize: 12, marginTop: 12, marginBottom: 4 }}
          >
            Clone into
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={parentDir}
              readOnly
              placeholder="Select a folder..."
              style={{
                flex: 1,
                padding: '8px 10px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 4,
                color: '#94a3b8',
                fontSize: 13,
                fontFamily: 'monospace',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={handleBrowse}
              disabled={loading}
              style={{
                padding: '8px 14px',
                backgroundColor: '#334155',
                border: 'none',
                borderRadius: 4,
                color: '#f1f5f9',
                fontSize: 13,
                cursor: loading ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Browse...
            </button>
          </div>

          {/* Target path display */}
          {targetPath && (
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>
              {targetPath}
            </p>
          )}

          {/* Error display */}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 4,
                color: '#fca5a5',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '6px 14px',
                backgroundColor: 'transparent',
                border: '1px solid #475569',
                borderRadius: 4,
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canClone}
              style={{
                padding: '6px 14px',
                backgroundColor: canClone ? '#2563eb' : '#1e3a5f',
                border: 'none',
                borderRadius: 4,
                color: canClone ? '#fff' : '#64748b',
                fontSize: 13,
                cursor: canClone ? 'pointer' : 'not-allowed',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Cloning...' : 'Clone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
