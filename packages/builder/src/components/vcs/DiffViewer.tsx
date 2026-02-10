/**
 * DiffViewer - Modal showing unified diff with syntax highlighting
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { gitDiff, gitResolveConflict } from '../../vcs/GitAdapter';

interface DiffViewerProps {
  filePath: string;
  ref?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ filePath, isOpen, onClose }) => {
  const vcs = useVCSStatus();
  const [diffContent, setDiffContent] = useState('');
  const [loading, setLoading] = useState(false);
  const isConflict = vcs?.conflictFiles.has(filePath) ?? false;

  useEffect(() => {
    if (!isOpen || !vcs?.projectPath) return;
    setLoading(true);
    gitDiff(vcs.projectPath, filePath)
      .then(content => setDiffContent(content))
      .catch(() => setDiffContent('Failed to load diff'))
      .finally(() => setLoading(false));
  }, [isOpen, vcs?.projectPath, filePath]);

  const handleResolve = useCallback(async (resolution: 'ours' | 'theirs') => {
    if (!vcs?.projectPath) return;
    const result = await gitResolveConflict(vcs.projectPath, filePath, resolution);
    if (result.success) {
      await vcs.refresh();
      onClose();
    }
  }, [vcs, filePath, onClose]);

  if (!isOpen) return null;

  // Extract beat name from path
  const beatMatch = filePath.match(/\/(\w+)_([^/]+)\.json$/);
  const displayName = beatMatch ? `${beatMatch[1]} / ${beatMatch[2]}` : filePath;

  const lines = diffContent.split('\n');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '80%',
          maxWidth: 900,
          maxHeight: '80vh',
          backgroundColor: '#0f172a',
          borderRadius: 8,
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #334155',
          backgroundColor: '#1e293b',
        }}>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>
              {displayName}
            </div>
            <div style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>
              {filePath}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isConflict && (
              <>
                <button
                  onClick={() => handleResolve('ours')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: '#1e40af',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Accept Ours
                </button>
                <button
                  onClick={() => handleResolve('theirs')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: '#7c3aed',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Accept Theirs
                </button>
              </>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0 4px',
              }}
            >
              {'\u2715'}
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {loading ? (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>Loading diff...</div>
          ) : diffContent ? (
            <pre style={{ margin: 0, padding: 0, fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6 }}>
              {lines.map((line, i) => {
                let bgColor = 'transparent';
                let color = '#94a3b8';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  bgColor = 'rgba(34, 197, 94, 0.1)';
                  color = '#4ade80';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  bgColor = 'rgba(239, 68, 68, 0.1)';
                  color = '#f87171';
                } else if (line.startsWith('@@')) {
                  color = '#60a5fa';
                } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
                  color = '#64748b';
                }
                return (
                  <div
                    key={i}
                    style={{
                      backgroundColor: bgColor,
                      color,
                      padding: '0 16px',
                      whiteSpace: 'pre',
                      minHeight: '1.6em',
                    }}
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No differences found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
