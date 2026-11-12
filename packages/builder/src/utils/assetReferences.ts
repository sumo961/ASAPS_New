/**
 * Which beats use which sound or picture, and swapping one for another on
 * every beat at once (a student project lost its background sound on 487
 * beats; picking it again beat by beat isn't realistic).
 *
 * Beats name an asset by its id somewhere in their saved form (a parameter,
 * a look, a dialog line's sound). Same walk as the "Sound or picture missing"
 * Story Warning in core, so the two always agree on what counts as a use.
 */

/** Ids the builder gives assets: `asset_<ms>_<suffix>`. */
export const ASSET_ID = /^asset_\d{6,}(?:_[A-Za-z0-9_-]+)?$/;

export interface AssetUse {
  /** Beat ids, in story order. */
  beats: string[];
  /** Named under a sound/music/audio/voice key somewhere. */
  sound: boolean;
}

/** Top-level beat fields that never hold an asset. */
const SKIP = new Set(['id', 'type', 'name', 'x', 'y', 'connections']);

function plainOf(beat: any): Record<string, any> {
  return (typeof beat?.toJSON === 'function' ? beat.toJSON() : beat) ?? {};
}

/** Every asset id the beats name, with the beats that name it. */
export function collectAssetUses(beats: readonly any[]): Map<string, AssetUse> {
  const uses = new Map<string, AssetUse>();
  for (const beat of beats) {
    const seen = new Set<string>();
    const walk = (o: any, soundy: boolean): void => {
      if (typeof o === 'string') {
        if (!ASSET_ID.test(o)) return;
        const u = uses.get(o) ?? { beats: [], sound: false };
        u.sound ||= soundy;
        if (!seen.has(o)) { seen.add(o); u.beats.push(beat.id); }
        uses.set(o, u);
        return;
      }
      if (Array.isArray(o)) { o.forEach((v) => walk(v, soundy)); return; }
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) walk(v, soundy || /sound|music|audio|voice/i.test(k));
    };
    for (const [k, v] of Object.entries(plainOf(beat))) {
      if (!SKIP.has(k)) walk(v, /sound|music|audio|voice/i.test(k));
    }
  }
  return uses;
}

/** Asset ids the beats use that the project doesn't have. */
export function missingAssetUses(beats: readonly any[], assetIds: Iterable<string>): Map<string, AssetUse> {
  const have = new Set(assetIds);
  const out = new Map<string, AssetUse>();
  for (const [id, use] of collectAssetUses(beats)) if (!have.has(id)) out.set(id, use);
  return out;
}

function replaceDeep(o: any, from: string, to: string): { value: any; changed: boolean } {
  if (o === from) return { value: to, changed: true };
  if (Array.isArray(o)) {
    let changed = false;
    const value = o.map((v) => { const r = replaceDeep(v, from, to); changed ||= r.changed; return r.value; });
    return changed ? { value, changed } : { value: o, changed: false };
  }
  if (o && typeof o === 'object' && !(o instanceof Map)) {
    let changed = false;
    const value: Record<string, any> = {};
    for (const [k, v] of Object.entries(o)) {
      const r = replaceDeep(v, from, to);
      changed ||= r.changed;
      value[k] = r.value;
    }
    return changed ? { value, changed } : { value: o, changed: false };
  }
  return { value: o, changed: false };
}

export interface BeatAssetEdit {
  beatId: string;
  /** What the beat holds now, for undo. */
  oldValues: Record<string, any>;
  /** The same fields with `from` swapped for `to`. */
  updates: Record<string, any>;
}

/**
 * The per-beat edits that make every beat use `to` where it used `from`.
 * Fields come in the shapes the builder's updateBeat accepts: `parameters`
 * as the beat's parameters, `locations` as an array, the rest as stored.
 */
export function planAssetReplace(beats: readonly any[], from: string, to: string): BeatAssetEdit[] {
  if (!from || !to || from === to) return [];
  const edits: BeatAssetEdit[] = [];
  for (const beat of beats) {
    const plain = plainOf(beat);
    const oldValues: Record<string, any> = {};
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(plain)) {
      if (SKIP.has(k)) continue;
      const r = replaceDeep(v, from, to);
      if (!r.changed) continue;
      if (k === 'parameters') {
        const now = typeof beat.getParameters === 'function' ? beat.getParameters() : beat.parameters;
        const swapped = replaceDeep(now, from, to);
        oldValues[k] = structuredClone(now);
        updates[k] = swapped.changed ? swapped.value : r.value;
      } else if (k === 'locations') {
        const now = beat.locations instanceof Map ? Array.from(beat.locations.values()) : (beat.locations ?? v);
        oldValues[k] = structuredClone(now);
        updates[k] = replaceDeep(now, from, to).value;
      } else {
        const now = beat[k] !== undefined ? beat[k] : v;
        oldValues[k] = now && typeof now === 'object' ? structuredClone(now) : now;
        updates[k] = replaceDeep(now, from, to).value;
      }
    }
    if (Object.keys(updates).length) edits.push({ beatId: beat.id, oldValues, updates });
  }
  return edits;
}
