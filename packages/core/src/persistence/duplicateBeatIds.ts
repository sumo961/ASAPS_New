/**
 * Beat ids that the story derives instead of inventing, and what to do when
 * a project folder holds the same beat id in two files.
 *
 * Two files with one id (bullying-IDN, 2026-10-20: a beat committed both
 * inside its cluster and outside it) used to load as two beats with one id;
 * the next save kept one and silently deleted the other file. Now an
 * identical extra copy is dropped and reported, and a copy with different
 * content is kept under its own derived id, so nobody's version is lost.
 */
import { deterministicStringify } from './BeatSerializer';

/**
 * `beat_` + 8 base36 characters derived from `seed` (cyrb53 hash). The
 * same seed gives the same id on every computer, so repairs made by
 * teammates independently agree instead of conflicting.
 */
export function derivedBeatId(seed: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `beat_${n.toString(36).padStart(8, '0').slice(-8)}`;
}

/** One id found in more than one beat file. */
export interface DuplicateBeatId {
  id: string;
  name: string;
  /** The file kept under the id, then the other files with it. */
  files: string[];
  /** Extra files whose content matched the kept one: dropped. */
  dropped: string[];
  /** Extra files with different content: kept under a new id. */
  renamed: Array<{ file: string; to: string }>;
}

/** Content that matters for "same beat": everything but where it sits. */
function substance(beat: any): string {
  const { x, y, cluster, position, ...rest } = beat ?? {};
  return deterministicStringify(rest);
}

/**
 * Resolve beats that share an id. `files[i]` is the path `beats[i]` came
 * from; the first file read keeps the id (cluster folders are read before
 * _unclustered, so a beat inside its cluster wins).
 */
export function resolveDuplicateBeatIds<B extends { id: string; name?: string }>(
  beats: B[],
  files: string[],
): { beats: B[]; duplicates: DuplicateBeatId[] } {
  const firstIndex = new Map<string, number>();
  const taken = new Set(beats.map((b) => String(b.id)));
  const byId = new Map<string, DuplicateBeatId>();
  const out: B[] = [];
  beats.forEach((beat, i) => {
    const id = String(beat.id);
    const first = firstIndex.get(id);
    if (first === undefined) {
      firstIndex.set(id, out.length);
      out.push(beat);
      return;
    }
    const kept = out[first];
    const entry = byId.get(id) ?? { id, name: String(kept.name ?? id), files: [files[beats.indexOf(kept)]], dropped: [], renamed: [] };
    byId.set(id, entry);
    entry.files.push(files[i]);
    if (substance(beat) === substance(kept)) {
      entry.dropped.push(files[i]);
      return;
    }
    let attempt = 0;
    let to = derivedBeatId(`${id}@${files[i]}`);
    while (taken.has(to)) to = derivedBeatId(`${id}@${files[i]}#${++attempt}`);
    taken.add(to);
    entry.renamed.push({ file: files[i], to });
    out.push({ ...beat, id: to });
  });
  return { beats: out, duplicates: [...byId.values()] };
}
