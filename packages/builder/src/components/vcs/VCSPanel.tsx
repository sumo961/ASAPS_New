/**
 * VCSPanel - Bottom panel with VCS tabs (Pending Changes, Incoming, History, Branches)
 *
 * Resizable via drag handle on top edge. Toggle with VCSStatusBar or keyboard shortcut.
 * Includes a collapsible Activity Log showing persistent VCS operation messages.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVCSStatus, type VCSLogEntry } from '../../vcs/VCSStatusProvider';
import { PendingChangesTab } from './PendingChangesTab';
import { IncomingChangesTab } from './IncomingChangesTab';
import { HistoryTab } from './HistoryTab';
import { BranchesTab } from './BranchesTab';

type TabId = 'pending' | 'incoming' | 'history' | 'branches';

const TABS: { id: TabId; label: string }[] = [
  { id: 'pending', label: 'Pending Changes' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'history', label: 'History' },
  { id: 'branches', label: 'Branches' },
];

const STORAGE_KEY = 'vcs-panel-state';
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 260;

interface VCSPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Callback when user wants to view diff for a file */
  onViewDiff?: (filePath: string) => void;
  /** Callback when user wants to view history for a file */
  onViewFileHistory?: (filePath: string) => void;
}

function loadPersistedState(): { activeTab: TabId; height: number } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        activeTab: parsed.activeTab || 'pending',
        height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parsed.height || DEFAULT_HEIGHT)),
      };
    }
  } catch { /* ignore */ }
  return { activeTab: 'pending', height: DEFAULT_HEIGHT };
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const dotColors: Record<VCSLogEntry['type'], string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#3b82f6',
};

export const VCSPanel: React.FC<VCSPanelProps> = ({ isOpen, onToggle, onViewDiff, onViewFileHistory }) => {
  const vcs = useVCSStatus();
  const [activeTab, setActiveTab] = useState<TabId>(() => loadPersistedState().activeTab);
  const [height, setHeight] = useState(() => loadPersistedState().height);
  const [logOpen, setLogOpen] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Persist state on changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeTab, height }));
  }, [activeTab, height]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragRef.current.startHeight + delta));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height]);

  const handleDoubleClick = useCallback(() => {
    onToggle();
  }, [onToggle]);

  if (!vcs || !vcs.initialized || vcs.type === 'none' || !isOpen) {
    return null;
  }

  const logEntries = vcs.messageLog;
  const hasErrors = logEntries.some(e => e.type === 'error');

  return (
    <div
      className="vcs-panel"
      style={{
        height,
        borderTop: '1px solid #334155',
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{
          height: 4,
          cursor: 'ns-resize',
          backgroundColor: '#1e293b',
          flexShrink: 0,
        }}
      />

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #334155',
          backgroundColor: '#1e293b',
          flexShrink: 0,
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              color: activeTab === tab.id ? '#e2e8f0' : '#64748b',
              backgroundColor: activeTab === tab.id ? '#0f172a' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
            {tab.id === 'pending' && vcs.changedFileCount > 0 && (
              <span style={{
                marginLeft: 6,
                padding: '1px 5px',
                borderRadius: 8,
                backgroundColor: '#854d0e',
                color: '#fbbf24',
                fontSize: '10px',
              }}>
                {vcs.changedFileCount}
              </span>
            )}
            {tab.id === 'incoming' && vcs.behind > 0 && (
              <span style={{
                marginLeft: 6,
                padding: '1px 5px',
                borderRadius: 8,
                backgroundColor: '#1e3a5f',
                color: '#60a5fa',
                fontSize: '10px',
              }}>
                {vcs.behind}
              </span>
            )}
          </button>
        ))}

        {/* Log toggle button */}
        <button
          onClick={() => setLogOpen(prev => !prev)}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            background: logOpen ? '#0f172a' : 'none',
            border: 'none',
            borderBottom: logOpen ? '2px solid #8b5cf6' : '2px solid transparent',
            color: logOpen ? '#e2e8f0' : '#64748b',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: logOpen ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Toggle Activity Log"
        >
          Log
          {logEntries.length > 0 && (
            <span style={{
              padding: '1px 5px',
              borderRadius: 8,
              backgroundColor: hasErrors ? '#991b1b' : '#334155',
              color: hasErrors ? '#fca5a5' : '#94a3b8',
              fontSize: '10px',
            }}>
              {logEntries.length}
            </span>
          )}
        </button>

        {/* Close button */}
        <button
          onClick={onToggle}
          style={{
            padding: '4px 10px',
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '14px',
          }}
          title="Close VCS Panel"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Tab content + optional log */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {activeTab === 'pending' && <PendingChangesTab onViewDiff={onViewDiff} />}
          {activeTab === 'incoming' && <IncomingChangesTab />}
          {activeTab === 'history' && <HistoryTab onViewDiff={onViewDiff} filterFile={undefined} />}
          {activeTab === 'branches' && <BranchesTab />}
        </div>

        {/* Activity Log (collapsible) */}
        {logOpen && (
          <div style={{
            maxHeight: '40%',
            borderTop: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            {/* Log header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 12px',
              backgroundColor: '#1e293b',
              flexShrink: 0,
            }}>
              <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>Activity Log</span>
              <button
                onClick={() => vcs.clearMessageLog()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '2px 6px',
                }}
              >
                Clear
              </button>
            </div>

            {/* Log entries */}
            <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              {logEntries.length === 0 ? (
                <div style={{ padding: '12px', color: '#475569', fontSize: 12, textAlign: 'center' }}>
                  No activity yet
                </div>
              ) : (
                logEntries.map(entry => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '3px 12px',
                      fontSize: 11,
                      borderBottom: '1px solid #1e293b',
                    }}
                  >
                    <span style={{ color: '#475569', fontFamily: 'monospace', flexShrink: 0, fontSize: 10 }}>
                      {formatTime(entry.timestamp)}
                    </span>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: dotColors[entry.type],
                      flexShrink: 0,
                      marginTop: 4,
                    }} />
                    <span style={{
                      color: '#cbd5e1',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      flex: 1,
                    }}>
                      {entry.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
