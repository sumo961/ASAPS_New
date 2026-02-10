/**
 * MergeConflictDialog - Shown when a pull/merge creates conflicts, or when
 * the app detects the repo is in a mid-merge/rebase state.
 *
 * Offers three options:
 * - Keep My Changes: resolve all conflicts using local versions
 * - Accept Remote: resolve all conflicts using remote versions
 * - Abort: cancel the merge/rebase entirely
 *
 * For rebases (which apply commits one by one), resolution loops automatically
 * through all steps — the user makes one choice and it applies to everything.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import {
  gitDetectMergeState,
  gitResolveAllAndComplete,
  gitAbortMerge,
  gitAbortRebase,
  gitGetConflicts,
} from '../../vcs/GitAdapter';

interface MergeConflictDialogProps {
  /** Raw error message from the failed operation (may be empty for proactive detection) */
  errorMessage: string;
  /** Called when dialog should close (abort or cancel) */
  onClose: () => void;
  /** Called after conflicts are successfully resolved and merge/rebase continued */
  onResolved?: () => void;
}

type Phase = 'detecting' | 'idle' | 'resolving' | 'aborting';

export const MergeConflictDialog: React.FC<MergeConflictDialogProps> = ({
  errorMessage,
  onClose,
  onResolved,
}) => {
  const vcs = useVCSStatus();
  const [phase, setPhase] = useState<Phase>('detecting');
  const [mergeState, setMergeState] = useState<'merge' | 'rebase' | null>(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const projectPath = vcs?.projectPath;

  // Detect merge state and conflict count on mount
  useEffect(() => {
    if (!projectPath) return;
    (async () => {
      const [state, conflicts] = await Promise.all([
        gitDetectMergeState(projectPath),
        gitGetConflicts(projectPath),
      ]);
      // If no merge/rebase is actually in progress and no conflicts, close immediately
      if (!state && conflicts.length === 0) {
        onClose();
        return;
      }
      setMergeState(state);
      setConflictCount(conflicts.length);
      setPhase('idle');
    })();
  }, [projectPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const stateLabel = mergeState === 'rebase' ? 'rebase' : 'merge';
  const isRebase = mergeState === 'rebase';

  const handleProgress = useCallback((_step: number, message: string) => {
    setProgressMessage(message);
  }, []);

  const handleResolve = async (keepMine: boolean) => {
    if (!projectPath || !vcs) return;
    setError(null);
    setPhase('resolving');
    setProgressMessage(isRebase ? 'Starting resolution...' : 'Resolving conflicts...');

    // This loops automatically for rebases: resolve → continue → resolve → continue → done
    const result = await gitResolveAllAndComplete(projectPath, keepMine, isRebase, handleProgress);
    await vcs.refresh();

    if (!result.success) {
      setError(result.message);
      setProgressMessage(null);
      // Re-detect state in case we're partially through
      const [state, conflicts] = await Promise.all([
        gitDetectMergeState(projectPath),
        gitGetConflicts(projectPath),
      ]);
      setMergeState(state);
      setConflictCount(conflicts.length);
      setPhase('idle');
      return;
    }

    setProgressMessage(null);
    if (onResolved) {
      onResolved();
    } else {
      onClose();
    }
  };

  const handleAbort = async () => {
    if (!projectPath || !vcs) return;
    setPhase('aborting');
    const result = isRebase
      ? await gitAbortRebase(projectPath)
      : await gitAbortMerge(projectPath);
    await vcs.refresh();

    if (!result.success) {
      // If the error says there's nothing to abort, the repo is already clean — just close
      const msg = result.message.toLowerCase();
      if (msg.includes('no rebase in progress') || msg.includes('no merge in progress') || msg.includes('not in progress')) {
        onClose();
        return;
      }
      // Also re-detect: if mergeState is now null, the repo is clean
      const state = await gitDetectMergeState(projectPath);
      if (!state) {
        onClose();
        return;
      }
      setError(result.message);
      setPhase('idle');
      return;
    }
    onClose();
  };

  const loading = phase === 'detecting' || phase === 'resolving' || phase === 'aborting';
  const phaseLabel =
    phase === 'detecting' ? 'Detecting state...'
    : phase === 'resolving' ? (progressMessage || 'Resolving...')
    : phase === 'aborting' ? `Aborting ${stateLabel}...`
    : '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
      }}
    >
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: 8,
          padding: '24px',
          width: 480,
          maxWidth: '90vw',
          border: '1px solid #334155',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: 16, fontWeight: 600 }}>
          {mergeState ? `${isRebase ? 'Rebase' : 'Merge'} Conflicts` : 'Merge Conflicts'}
        </h3>
        <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
          {conflictCount > 0
            ? `${conflictCount} file${conflictCount !== 1 ? 's' : ''} have conflicts. Choose how to resolve:`
            : mergeState
              ? `A ${stateLabel} is in progress. Choose how to proceed:`
              : 'Conflicts detected. Choose how to resolve:'
          }
        </p>

        {error && (
          <div style={{
            padding: '8px 12px',
            marginBottom: 12,
            backgroundColor: '#450a0a',
            border: '1px solid #991b1b',
            borderRadius: 4,
            color: '#fca5a5',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 100,
            overflow: 'auto',
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{
            padding: '8px 12px',
            marginBottom: 12,
            backgroundColor: '#172554',
            border: '1px solid #1e40af',
            borderRadius: 4,
            color: '#93c5fd',
            fontSize: 12,
          }}>
            {phaseLabel}
          </div>
        )}

        {errorMessage && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ color: '#64748b', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              Show raw output
            </summary>
            <pre style={{
              marginTop: 8,
              padding: '8px 10px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              fontSize: 11,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 120,
              overflow: 'auto',
            }}>
              {errorMessage}
            </pre>
          </details>
        )}

        {/* Resolution options */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 16,
          padding: '12px',
          backgroundColor: '#0f172a',
          borderRadius: 6,
          border: '1px solid #1e293b',
        }}>
          <button
            type="button"
            onClick={() => handleResolve(true)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              textAlign: 'left',
            }}
          >
            <strong>Keep My Changes</strong>
            <span style={{ display: 'block', fontSize: 11, opacity: 0.8, marginTop: 2 }}>
              Discard remote changes for all conflicted files
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleResolve(false)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              backgroundColor: '#475569',
              border: 'none',
              borderRadius: 4,
              color: '#e2e8f0',
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              textAlign: 'left',
            }}
          >
            <strong>Accept Remote Changes</strong>
            <span style={{ display: 'block', fontSize: 11, opacity: 0.8, marginTop: 2 }}>
              Discard my changes for all conflicted files
            </span>
          </button>
        </div>

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
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleAbort}
            disabled={loading}
            style={{
              padding: '6px 14px',
              backgroundColor: '#dc2626',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {`Abort ${mergeState === 'rebase' ? 'Rebase' : 'Merge'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
