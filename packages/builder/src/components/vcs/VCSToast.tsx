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

/**
 * Git's output, short enough for a notice. A pull or commit of a whole
 * project listed every file ("create mode 100644 clusters/…" × 70) and the
 * notice grew past the window with its close button (students, 2026-10-27).
 * The per-file lines go; the full text stays in the panel's message log.
 */
export function shortVcsMessage(message: string): string {
  const lines = message.split('\n');
  const kept = lines.filter((line) => !/^\s*(create|delete) mode \d+ /.test(line)
    && !/^\s*(rename|copy) .+\(\d+%\)$/.test(line)
    && !/^\s*mode change \d+ => \d+ /.test(line)
    && !/^\s*\S.*\s\|\s+(\d+|Bin)/.test(line));
  if (kept.length <= 6 && kept.length === lines.length) return message;
  const shown = kept.slice(0, 6);
  return `${shown.join('\n')}${kept.length > 6 ? '\n…' : ''}\nAll changed files: Version Control panel ▸ message log.`;
}

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
      else if (event.type === 'success') notify.success(shortVcsMessage(event.message), { durationMs: TOAST_DURATION });
      else notify.info(shortVcsMessage(event.message), { durationMs: TOAST_DURATION });
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
