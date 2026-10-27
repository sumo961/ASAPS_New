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

/** Several beats at once from here on are named before they go. */
export const MANY_BEATS = 3;

function typeWords(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/**
 * The message for deleting several beats: how many of which kind, their
 * names, how many lie outside the visible flowchart, and what breaks. Ten
 * dialog trees went with one key press while the author looked at two
 * other beats (Birka group, 2026-10-27).
 */
export function describeManyBeatsDelete(beats: Array<{ name?: string; type?: string; id: string }>, outOfView: number, impact: string | null): string {
  const byType = new Map<string, number>();
  for (const b of beats) byType.set(b.type ?? 'beat', (byType.get(b.type ?? 'beat') ?? 0) + 1);
  const kinds = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${typeWords(t)}${n === 1 ? '' : 's'}`).join(', ');
  const names = beats.slice(0, 8).map((b) => `“${(b.name || b.id).trim()}”`).join(', ') + (beats.length > 8 ? ` and ${beats.length - 8} more` : '');
  return [
    `${kinds}: ${names}.`,
    outOfView > 0 ? `${outOfView === beats.length ? 'All of them are' : `${outOfView} of them ${outOfView === 1 ? 'is' : 'are'}`} outside the part of the flowchart you can see.` : '',
    impact ?? '',
  ].filter(Boolean).join('\n');
}

/** Confirm deleting several beats (or ones other beats link to). */
export function confirmBeatsDelete(count: number, message: string): Promise<boolean> {
  return confirmAction({
    title: `Delete ${count} beats?`,
    message: `${message}\n\nUndo brings them back, and so does Tools ▸ Recently deleted beats for 30 days.`,
    confirmLabel: `Delete ${count} beats`,
    destructive: true,
  });
}
