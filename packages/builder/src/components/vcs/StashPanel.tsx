/**
 * StashPanel - Dropdown for stash operations, accessed from PendingChanges tab
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { gitListStashes, type GitStashEntry } from '../../vcs/GitAdapter';

interface StashPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StashPanel: React.FC<StashPanelProps> = ({ isOpen, onClose }) => {
  const vcs = useVCSStatus();
  const [stashes, setStashes] = useState<GitStashEntry[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadStashes = useCallback(async () => {
    if (!vcs?.projectPath) return;
    try {
      const result = await gitListStashes(vcs.projectPath);
      setStashes(result);
    } catch { /* ignore */ }
  }, [vcs?.projectPath]);

  useEffect(() => {
    if (isOpen) loadStashes();
  }, [isOpen, loadStashes]);

  const handleStash = useCallback(async () => {
    if (!vcs) return;
    setLoading(true);
    try {
      await vcs.stash(message || undefined);
      setMessage('');
      await loadStashes();
    } finally {
      setLoading(false);
    }
  }, [vcs, message, loadStashes]);

  const handlePop = useCallback(async () => {
    if (!vcs) return;
    setLoading(true);
    try {
      await vcs.stashPop();
      await loadStashes();
    } finally {
      setLoading(false);
    }
  }, [vcs, loadStashes]);

  if (!isOpen || !vcs) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px 8px 0 0',
        maxHeight: 300,
        overflow: 'auto',
        zIndex: 10,
      }}
    >
      {/* Stash header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #334155',
      }}>
        <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>Stashes</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
        >
          {'\u2715'}
        </button>
      </div>

      {/* Create stash */}
      {vcs.isDirty && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #334155' }}>
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Stash message (optional)..."
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 4,
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleStash(); }}
          />
          <button
            onClick={handleStash}
            disabled={loading}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              backgroundColor: '#334155',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Stash
          </button>
        </div>
      )}

      {/* Stash list */}
      {stashes.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
          No stashes
        </div>
      ) : (
        stashes.map(stash => (
          <div
            key={stash.index}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#cbd5e1',
              gap: 8,
              borderBottom: '1px solid #0f172a',
            }}
          >
            <span style={{ fontFamily: 'monospace', color: '#fbbf24', fontSize: '11px' }}>
              @{stash.index}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stash.message || '(no message)'}
            </span>
            {stash.index === 0 && (
              <button
                onClick={handlePop}
                disabled={loading}
                style={{
                  background: 'none',
                  border: '1px solid #334155',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '1px 6px',
                  borderRadius: 3,
                  fontSize: '10px',
                }}
              >
                Pop
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};
