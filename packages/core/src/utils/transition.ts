import type { Transition } from '../types';

/** ASML 1.0's entrance names that ASML 2.0 doesn't have, by their nearest one. */
const LEGACY_TYPES: Record<string, Transition['type']> = {
  wipe: 'slide',
  rotate: 'zoom',
  blinds: 'fade',
};
const TYPES = new Set<string>(['none', 'fade', 'slide', 'zoom', 'dissolve']);

/**
 * A beat's transition as ASML 2.0 keeps it: a lower-case type the renderer
 * and the Visual Editor know, and a duration in milliseconds. Stories brought
 * in from ASML 1.0 kept "Fade" with its duration in seconds (0.5): nothing
 * matched it, so the authored fades never played.
 */
export function normalizeTransition(t: any): Transition | undefined {
  if (!t || typeof t !== 'object') return t ?? undefined;
  const raw = String(t.type ?? 'none').trim().toLowerCase();
  const type = (TYPES.has(raw) ? raw : LEGACY_TYPES[raw] ?? 'fade') as Transition['type'];
  const n = typeof t.duration === 'number' ? t.duration : parseFloat(String(t.duration ?? ''));
  // A few at most is seconds (ASML 1.0); no entrance is shorter than 20 ms.
  const duration = !Number.isFinite(n) || n <= 0 ? 500 : n < 20 ? Math.round(n * 1000) : n;
  const out: Transition = { ...t, type, duration };
  if (typeof t.direction === 'string') out.direction = t.direction.trim().toLowerCase() as Transition['direction'];
  return out;
}
