/**
 * The one delete confirm that earns its modality (UX-Eval §3.6, decided
 * 2026-08-21): deleting beats that OTHER beats link to. A clean delete is
 * undoable and asks nothing; this asks only when links would break, and
 * names them ("3 links in 2 other beats point here and will break.").
 */
import { confirmAction } from './notify';

export function confirmBeatDelete(title: string, impact: string): Promise<boolean> {
  return confirmAction({
    title,
    message: `${impact}\n\nUndo brings back what you delete, links included.`,
    confirmLabel: 'Delete anyway',
    destructive: true,
  });
}
