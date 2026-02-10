/**
 * GitInitDialog - Dialog for initializing a new Git repository
 *
 * Shown when a directory project has no VCS detected.
 * Allows initializing git and optionally adding a remote URL.
 */

import React, { useState } from 'react';

interface GitInitDialogProps {
  onInit: (remoteUrl?: string) => Promise<void>;
  onClose: () => void;
}

export const GitInitDialog: React.FC<GitInitDialogProps> = ({ onInit, onClose }) => {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onInit(remoteUrl.trim() || undefined);
      onClose();
    } catch {
      setLoading(false);
    }
  };

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
          width: 420,
          maxWidth: '90vw',
          border: '1px solid #334155',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: 16, fontWeight: 600 }}>
          Initialize Git Repository
        </h3>
        <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 13 }}>
          Set up version control for this project. You can optionally add a remote
          to sync with GitHub, GitLab, or another Git host.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="remote-url"
            style={{ display: 'block', color: '#cbd5e1', fontSize: 12, marginBottom: 4 }}
          >
            Remote URL (optional)
          </label>
          <input
            id="remote-url"
            type="text"
            value={remoteUrl}
            onChange={e => setRemoteUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            disabled={loading}
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
          <p style={{ margin: '4px 0 16px', color: '#64748b', fontSize: 11 }}>
            You can add or change the remote later from the Branches tab.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
              disabled={loading}
              style={{
                padding: '6px 14px',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 13,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Initializing...' : 'Initialize Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
