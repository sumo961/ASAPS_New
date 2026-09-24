/**
 * VCSToast - Toast notifications for VCS operation results
 *
 * - Success/info toasts auto-dismiss after 8 seconds
 * - Error toasts stay until manually dismissed (sticky)
 * - Push-rejection errors show a PushRejectedDialog instead of a toast
 * - Merge/rebase conflict errors show a MergeConflictDialog instead of a toast
 */

import React, { useState, useEffect } from 'react';
import { notify } from '../../utils/notify';
import { useVCSStatus, isPushRejected, type VCSEvent } from '../../vcs/VCSStatusProvider';
import { PushRejectedDialog } from './PushRejectedDialog';
import { MergeConflictDialog } from './MergeConflictDialog';

const TOAST_DURATION = 8000;

/** Check if an error message indicates merge/rebase conflicts */
function hasConflicts(message: string): boolean {
  return message.includes('CONFLICT') || message.includes('Merge conflict') || message.includes('could not apply');
}

export const VCSToast: React.FC = () => {
  const vcs = useVCSStatus();
  const [pushRejectedMessage, setPushRejectedMessage] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!vcs) return;
    return vcs.onEvent((event: VCSEvent) => {
      // Log errors to console as fallback
      if (event.type === 'error') {
        console.warn('[VCS]', event.message);
      }

      // Intercept push-rejection errors → show dialog instead of toast
      if (event.type === 'error' && isPushRejected(event.message)) {
        setPushRejectedMessage(event.message);
        return;
      }

      // Intercept merge/rebase conflict errors → show conflict dialog
      if (event.type === 'error' && hasConflicts(event.message)) {
        setConflictMessage(event.message);
        return;
      }

      // Everything else joins the app-wide notice stack (errors sticky,
      // success/info auto-dismiss — same rules this component used to own).
      if (event.type === 'error') notify.error(event.message);
      else if (event.type === 'success') notify.success(event.message, { durationMs: TOAST_DURATION });
      else notify.info(event.message, { durationMs: TOAST_DURATION });
    });
  }, [vcs]);

  return (
    <>
      {pushRejectedMessage && (
        <PushRejectedDialog
          errorMessage={pushRejectedMessage}
          onClose={() => setPushRejectedMessage(null)}
        />
      )}
      {conflictMessage && (
        <MergeConflictDialog
          errorMessage={conflictMessage}
          onClose={() => setConflictMessage(null)}
        />
      )}
    </>
  );
};
