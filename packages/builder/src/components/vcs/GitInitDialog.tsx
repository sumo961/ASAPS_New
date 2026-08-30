/**
 * GitInitDialog - the dialog behind the status bar's "Track versions" offer.
 *
 * Speaks plain language on purpose: this is the first thing a VCS-naive
 * author sees after clicking a two-word affordance, and it must answer the
 * one question they actually have — "does this leave my computer?" — before
 * any Git vocabulary. Two explicit choices; the server URL field exists only
 * once the author has chosen to back up to a server, so an example URL can
 * never read as a pre-filled value they need to clear.
 *
 * Both choices initialize a Git repository in the project folder and save
 * the first version (see VCSStatusProvider.initRepo).
 */

import React, { useState } from 'react';

interface GitInitDialogProps {
  onInit: (remoteUrl?: string) => Promise<void>;
  onClose: () => void;
}

type Where = 'local' | 'server';

export const GitInitDialog: React.FC<GitInitDialogProps> = ({ onInit, onClose }) => {
  const [where, setWhere] = useState<Where>('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const url = remoteUrl.trim();
  const canSubmit = !loading && (where === 'local' || url.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onInit(where === 'server' ? url : undefined);
      onClose();
    } catch {
      setLoading(false);
    }
  };

  const option = (value: Where, title: string, detail: string) => {
    const selected = where === value;
    return (
      <label
        style={{
          display: 'flex',
          gap: 10,
          padding: '10px 12px',
          border: `1px solid ${selected ? '#3b82f6' : '#334155'}`,
          background: selected ? 'rgba(59,130,246,0.10)' : 'transparent',
          borderRadius: 6,
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        <input
          type="radio"
          name="track-where"
          value={value}
          checked={selected}
          disabled={loading}
          onChange={() => setWhere(value)}
          style={{ marginTop: 3 }}
        />
        <span>
          <span style={{ display: 'block', color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{title}</span>
          <span style={{ display: 'block', color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{detail}</span>
        </span>
      </label>
    );
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
        role="dialog"
        aria-labelledby="track-versions-title"
        style={{
          backgroundColor: '#1e293b',
          borderRadius: 8,
          padding: '24px',
          width: 440,
          maxWidth: '90vw',
          border: '1px solid #334155',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 id="track-versions-title" style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: 16, fontWeight: 600 }}>
          Track versions of this project
        </h3>
        <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 13 }}>
          ASAPS will keep a history of your changes so you can see what changed
          and go back to an earlier version. Where should that history live?
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {option(
              'local',
              'On this computer only',
              'Nothing leaves your machine. You can add a server later.',
            )}
            {option(
              'server',
              'Also back up to a server',
              'Sync with GitHub, GitLab, or another Git host you already have.',
            )}
          </div>

          {where === 'server' && (
            <div style={{ marginTop: 12 }}>
              <label
                htmlFor="remote-url"
                style={{ display: 'block', color: '#cbd5e1', fontSize: 12, marginBottom: 4 }}
              >
                Server address
              </label>
              <input
                id="remote-url"
                type="text"
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                placeholder="e.g. https://github.com/you/my-story.git"
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
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 11 }}>
                Paste the repository address from your Git host. You can change it later from the Branches tab.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
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
              Not now
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: '6px 14px',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 13,
                cursor: loading ? 'wait' : canSubmit ? 'pointer' : 'default',
                opacity: canSubmit ? 1 : 0.6,
              }}
            >
              {loading ? 'Setting up…' : 'Start tracking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
