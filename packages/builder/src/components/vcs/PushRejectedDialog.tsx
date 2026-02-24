/**
 * PushRejectedDialog - Modal shown when git push fails because remote has newer commits.
 *
 * Offers to pull (with or without rebase) then retry the push automatically.
 * If pull creates merge conflicts, delegates to MergeConflictDialog for
 * resolution, then auto-pushes on success.
 *
 * Calls GitAdapter functions directly to avoid duplicate toast emissions.
 */

import React, { useState } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { gitPull, gitPush, gitForcePush } from '../../vcs/GitAdapter';
import { MergeConflictDialog } from './MergeConflictDialog';

interface PushRejectedDialogProps {
  errorMessage: string;
  onClose: () => void;
}

type Phase = 'idle' | 'pulling' | 'pushing';

/** Check if an error message indicates merge/rebase conflicts */
function hasConflicts(message: string): boolean {
  return message.includes('CONFLICT') || message.includes('Merge conflict') || message.includes('could not apply');
}

export const PushRejectedDialog: React.FC<PushRejectedDialogProps> = ({ errorMessage, onClose }) => {
  const vcs = useVCSStatus();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const projectPath = vcs?.projectPath;

  const handleForcePush = async () => {
    if (!projectPath || !vcs) return;
    const confirmed = window.confirm(
      'Force push will overwrite the remote history with your local state.\n\n' +
      'This is safe after a reset (to sync the remote with your restored state), ' +
      'but destructive if others have pushed commits you don\'t have.\n\n' +
      'Continue with force push?'
    );
    if (!confirmed) return;
    setError(null);
    setPhase('pushing');
    const result = await gitForcePush(projectPath);
    await vcs.refresh();
    if (!result.success) {
      setError(result.message);
      setPhase('idle');
      return;
    }
    onClose();
  };

  const handlePullAndPush = async (rebase: boolean) => {
    if (!projectPath || !vcs) return;
    setError(null);

    // Pull (call adapter directly — no toast emission)
    setPhase('pulling');
    const pullResult = await gitPull(projectPath, rebase);

    if (!pullResult.success) {
      // Check if pull created conflicts → delegate to MergeConflictDialog
      if (hasConflicts(pullResult.message)) {
        setConflictMessage(pullResult.message);
        setPhase('idle');
        await vcs.refresh();
        return;
      }
      setError(pullResult.message);
      setPhase('idle');
      await vcs.refresh();
      return;
    }

    // Pull succeeded — push
    await doPush();
  };

  const doPush = async () => {
    if (!projectPath || !vcs) return;
    setPhase('pushing');
    const pushResult = await gitPush(projectPath);
    await vcs.refresh();

    if (!pushResult.success) {
      setError(pushResult.message);
      setPhase('idle');
      return;
    }

    onClose();
  };

  /** Called by MergeConflictDialog after conflicts resolved and merge/rebase continued */
  const handleConflictsResolved = () => {
    setConflictMessage(null);
    // Auto-push after successful conflict resolution
    doPush();
  };

  const handleConflictDialogClose = () => {
    // User aborted the merge/rebase — close everything
    setConflictMessage(null);
    onClose();
  };

  const loading = phase === 'pulling' || phase === 'pushing';
  const phaseLabel = phase === 'pulling' ? 'Pulling...' : phase === 'pushing' ? 'Pushing...' : '';

  // Show MergeConflictDialog if conflicts were detected
  if (conflictMessage) {
    return (
      <MergeConflictDialog
        errorMessage={conflictMessage}
        onClose={handleConflictDialogClose}
        onResolved={handleConflictsResolved}
      />
    );
  }

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
      onClick={loading ? undefined : onClose}
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
          Push Rejected
        </h3>
        <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
          The remote repository has changes you don't have locally.
          Pull the latest changes first, then push again.
        </p>

        {error && (
          <details style={{ marginBottom: 12 }} open>
            <summary style={{ color: '#64748b', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              Error details
            </summary>
            <pre style={{
              marginTop: 6,
              padding: '8px 10px',
              backgroundColor: '#450a0a',
              border: '1px solid #991b1b',
              borderRadius: 4,
              color: '#fca5a5',
              fontSize: 11,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 160,
              overflow: 'auto',
            }}>
              {error}
            </pre>
          </details>
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

        <details style={{ marginBottom: 16 }}>
          <summary style={{ color: '#64748b', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
            Show raw push error
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
            maxHeight: 160,
            overflow: 'auto',
          }}>
            {errorMessage}
          </pre>
        </details>

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
            Cancel
          </button>
          <button
            type="button"
            onClick={handleForcePush}
            disabled={loading}
            title="Overwrite remote with local state (use after reset)"
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: '1px solid #7f1d1d',
              borderRadius: 4,
              color: '#f87171',
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Force Push
          </button>
          <button
            type="button"
            onClick={() => handlePullAndPush(true)}
            disabled={loading}
            style={{
              padding: '6px 14px',
              backgroundColor: '#475569',
              border: 'none',
              borderRadius: 4,
              color: '#e2e8f0',
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Pull (Rebase) & Push
          </button>
          <button
            type="button"
            onClick={() => handlePullAndPush(false)}
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
            Pull & Push
          </button>
        </div>
      </div>
    </div>
  );
};
