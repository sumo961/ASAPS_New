/**
 * BeatSerializer - Deterministic JSON serialization for beats
 *
 * Produces stable, VCS-friendly JSON output with:
 * - Sorted keys at every level
 * - Consistent 2-space indent
 * - Undefined/null cleanup to minimize diffs
 */

import type { Beat } from '../beats/Beat';

const FORMAT_VERSION = '1.0';

/**
 * Strip non-portable blob: URLs from location imageUrl fields.
 * Keeps assetId as the canonical reference and preserves non-blob URLs
 * (e.g. base64 data URLs or http(s) URLs).
 */
function sanitizeLocations(locations: any[]): any[] {
  if (!Array.isArray(locations) || locations.length === 0) return locations;
  return locations.map((loc) => {
    if (loc && typeof loc.imageUrl === 'string' && loc.imageUrl.startsWith('blob:')) {
      const { imageUrl, ...rest } = loc;
      return rest;
    }
    return loc;
  });
}

/**
 * Strip non-portable blob: URLs from a beat-level sound object.
 * Keeps assetId as the canonical reference; drops `file` when it's a blob URL.
 */
function sanitizeSound(sound: any): any {
  if (!sound || typeof sound !== 'object') return sound;
  if (typeof sound.file === 'string' && sound.file.startsWith('blob:')) {
    const { file, ...rest } = sound;
    // If no assetId either, the sound is effectively empty
    if (!rest.assetId && Object.keys(rest).length === 0) return undefined;
    return rest;
  }
  return sound;
}

/**
 * Strip non-portable blob: URLs from soundEffect fields inside
 * beat parameters (dialogChoice, movementOption, propOption arrays).
 */
function sanitizeParameters(params: Record<string, any>): Record<string, any> {
  if (!params || typeof params !== 'object') return params;
  const result = { ...params };

  // Arrays that may contain items with a soundEffect field
  const arrayKeys = ['choices', 'options', 'props', 'dialogNodes'];
  for (const key of arrayKeys) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((item: any) => {
        if (!item || typeof item !== 'object') return item;

        // Sanitize soundEffect (string blob URL)
        let patched = item;
        if (typeof item.soundEffect === 'string' && item.soundEffect.startsWith('blob:')) {
          const { soundEffect, ...rest } = item;
          patched = rest;
        }

        // Recurse into nested choices (dialogNodes have nested choices arrays)
        if (Array.isArray(patched.choices)) {
          patched = {
            ...patched,
            choices: patched.choices.map((c: any) => {
              if (c && typeof c.soundEffect === 'string' && c.soundEffect.startsWith('blob:')) {
                const { soundEffect, ...rest } = c;
                return rest;
              }
              return c;
            }),
          };
        }

        return patched;
      });
    }
  }

  // Top-level soundEffect (unlikely but defensive)
  if (typeof result.soundEffect === 'string' && result.soundEffect.startsWith('blob:')) {
    delete result.soundEffect;
  }

  return result;
}

/**
 * Serialized beat file structure written to disk
 */
export interface SerializedBeat {
  id: string;
  type: string;
  name: string;
  x?: number;
  y?: number;
  parameters: Record<string, any>;
  locations: any[];
  connections: Array<{
    targetId: string;
    label?: string;
    condition?: any;
  }>;
  cluster?: string;
  node?: string;
  transition?: any;
  sound?: any;
  defaultTarget?: string;
  defaultTargetDelay?: number;
  showTimer?: boolean;
  notes?: string;
  _format: string;
}

/**
 * Serialize a beat to a deterministic JSON object ready for file output.
 * Uses Beat.toJSON() as the source and normalizes for VCS-friendly output.
 */
export function serializeBeat(beat: Beat): SerializedBeat {
  const raw = beat.toJSON();

  const sanitizedSound = sanitizeSound(raw.sound);

  const result: SerializedBeat = {
    id: raw.id,
    type: raw.type,
    name: raw.name,
    ...(raw.x !== undefined && raw.x !== null ? { x: raw.x } : {}),
    ...(raw.y !== undefined && raw.y !== null ? { y: raw.y } : {}),
    parameters: sanitizeParameters(raw.parameters || {}),
    locations: sanitizeLocations(raw.locations || []),
    connections: (raw.connections || []).map((c: any) => {
      const conn: any = { targetId: c.targetId };
      if (c.label) conn.label = c.label;
      if (c.condition) conn.condition = c.condition;
      return conn;
    }),
    ...(raw.cluster ? { cluster: raw.cluster } : {}),
    ...(raw.node ? { node: raw.node } : {}),
    ...(raw.transition ? { transition: raw.transition } : {}),
    ...(sanitizedSound ? { sound: sanitizedSound } : {}),
    ...(raw.defaultTarget ? { defaultTarget: raw.defaultTarget } : {}),
    ...(raw.defaultTargetDelay ? { defaultTargetDelay: raw.defaultTargetDelay } : {}),
    ...(raw.showTimer ? { showTimer: raw.showTimer } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    ...(raw.speaker ? { speaker: raw.speaker } : {}),
    ...(raw.showSpeaker != null ? { showSpeaker: raw.showSpeaker } : {}),
    _format: FORMAT_VERSION,
  };

  return result;
}

/**
 * Serialize a beat from its raw JSON (already toJSON()'d).
 * Useful when we already have serialized story data.
 */
export function serializeBeatFromJSON(raw: any): SerializedBeat {
  const sanitizedSound = sanitizeSound(raw.sound);

  const result: SerializedBeat = {
    id: raw.id,
    type: raw.type,
    name: raw.name,
    ...(raw.x !== undefined && raw.x !== null ? { x: raw.x } : {}),
    ...(raw.y !== undefined && raw.y !== null ? { y: raw.y } : {}),
    parameters: sanitizeParameters(raw.parameters || {}),
    locations: sanitizeLocations(raw.locations || []),
    connections: (raw.connections || []).map((c: any) => {
      const conn: any = { targetId: c.targetId };
      if (c.label) conn.label = c.label;
      if (c.condition) conn.condition = c.condition;
      return conn;
    }),
    ...(raw.cluster ? { cluster: raw.cluster } : {}),
    ...(raw.node ? { node: raw.node } : {}),
    ...(raw.transition ? { transition: raw.transition } : {}),
    ...(sanitizedSound ? { sound: sanitizedSound } : {}),
    ...(raw.defaultTarget ? { defaultTarget: raw.defaultTarget } : {}),
    ...(raw.defaultTargetDelay ? { defaultTargetDelay: raw.defaultTargetDelay } : {}),
    ...(raw.showTimer ? { showTimer: raw.showTimer } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    ...(raw.speaker ? { speaker: raw.speaker } : {}),
    ...(raw.showSpeaker != null ? { showSpeaker: raw.showSpeaker } : {}),
    _format: FORMAT_VERSION,
  };

  return result;
}

/**
 * Generate a stable filename for a beat: {beatType}_{beatId}.json
 */
export function beatFilename(beat: { type: string; id: string }): string {
  // Sanitize ID for filesystem safety
  const safeId = beat.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${beat.type}_${safeId}.json`;
}

/**
 * Deterministic JSON.stringify with sorted keys at all levels.
 * This ensures minimal diffs in VCS when only values change.
 */
export function deterministicStringify(obj: any): string {
  return JSON.stringify(obj, sortedReplacer, 2);
}

/**
 * JSON replacer that sorts object keys alphabetically.
 * Handles nested objects and arrays correctly.
 */
function sortedReplacer(_key: string, value: any): any {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = value[k];
    }
    return sorted;
  }
  return value;
}
