/**
 * New beat ids. They used to count up per copy of a project (beat_1,
 * beat_2, …), so people working in parallel on copies of one story each
 * created their own beat_45 — and git could not tell them apart (Birka
 * groups, 2026-10-20). A random part makes an id unique without any
 * coordination. Existing ids are never changed.
 */
import { derivedBeatId } from '@asaps/core';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newBeatId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let suffix = '';
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `beat_${suffix}`;
}

/**
 * The short id a runaway id becomes: derived from the old id, not random.
 * With random ids every repair invented different ones — two teammates
 * opening the same old project each renamed the beat differently (their
 * pulls then conflicted), and two repairs in one session left links and the
 * beat file disagreeing: a choice pointed at an id no beat had
 * (bullying-IDN, 2026-10-20). Derived, every repair anywhere agrees.
 */
export function shortBeatIdFor(oldId: string, attempt = 0): string {
  return derivedBeatId(attempt ? `${oldId}#${attempt}` : oldId);
}

/** An id grown by copy-of-copy (or merge) suffixes: long, or more than one `_copy`. */
export function isRunawayBeatId(id: string): boolean {
  return id.length > 32 || (id.match(/_copy[0-9a-z]+/g) || []).length > 1;
}

/** Exact-value rewrite of every string in plain JSON data. */
export function rewriteValues(value: any, map: Map<string, string>): any {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => rewriteValues(v, map));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteValues(v, map);
    return out;
  }
  return value;
}

/**
 * Give beats with runaway ids a short new one, and rewrite every reference
 * to them in the story and project settings (links, choice targets,
 * clusters, start beat …). Ids are unique strings, so an exact-value
 * rewrite catches every reference without knowing each field. Returns the
 * project unchanged (same object) when nothing needed shortening.
 */
export function shortenRunawayBeatIds<P extends { story?: any; globalSettings?: any; settings?: any }>(
  project: P,
): { project: P; renamed: number } {
  const beats: any[] = Array.isArray(project.story?.beats) ? project.story.beats : [];
  const taken = new Set(beats.map((b) => String(b?.id)));
  const map = new Map<string, string>();
  for (const b of beats) {
    const id = String(b?.id ?? '');
    if (!id || !isRunawayBeatId(id)) continue;
    let attempt = 0;
    let fresh = shortBeatIdFor(id);
    while (taken.has(fresh)) fresh = shortBeatIdFor(id, ++attempt);
    taken.add(fresh);
    map.set(id, fresh);
  }
  if (map.size === 0) return { project, renamed: 0 };
  return {
    project: {
      ...project,
      story: rewriteValues(project.story, map),
      ...(project.globalSettings ? { globalSettings: rewriteValues(project.globalSettings, map) } : {}),
      ...(project.settings ? { settings: rewriteValues(project.settings, map) } : {}),
    },
    renamed: map.size,
  };
}
