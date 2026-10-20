/**
 * Story merge — combine another story (.asaps zip) into the currently
 * open project without conflicts.
 *
 * Design (v1, decided with the author):
 *   - Merge INTO the open project; the open project's settings/theme win.
 *   - Incoming beats arrive as their own disconnected group, wrapped in a
 *     new organizational cluster and positioned beside the existing graph.
 *     The author wires the two stories together manually afterwards.
 *   - Character name collisions are decided per character: 'reuse' (same
 *     person — incoming references rewired to the existing character) or
 *     'keep-both' (incoming character renamed, e.g. "Elena 2").
 *   - Variables are unioned by name (same name = same variable).
 *   - IDs (beats / characters / assets) keep their original value unless
 *     they collide with the current project, in which case they're
 *     suffixed. All references inside the INCOMING content are rewritten
 *     via a deep walk that replaces exact string matches of remapped ids
 *     — beat ids only occur as references within the incoming story, so
 *     value-equality rewriting is complete without per-beat-type field
 *     knowledge (and therefore can't miss a field the way a curated list
 *     would).
 *
 * Not merged in v1 (documented): translations, theme/global settings,
 * incoming clusters (all incoming beats land in ONE merged cluster).
 *
 * Mode 'versions' (2026-10-20, Birka groups): the other file is ANOTHER
 * VERSION OF THIS STORY — copies that people edited in parallel. Beats
 * whose id and content match the open project's are the shared part and
 * are left out; beats only the other version has come in; a beat with the
 * same id but different content comes in as a marked copy (new id; the
 * incoming links follow it) for the author to decide. Characters and
 * assets with the same id are the same ones and are not added twice.
 */

import JSZip from 'jszip';
import type { StoredAsset } from '../storage/types';
import { readAssetsFromZip, type ParsedZipAsset } from './projectZipManager';
import { grownClusterBounds } from './clusterAutosize';

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface CharacterCollision {
  incomingId: string;
  incomingName: string;
  existingId: string;
  existingName: string;
}

export interface MergeSourceAnalysis {
  projectName: string;
  storyTitle: string;
  /** Parsed project.json (the whole export envelope). */
  projectData: any;
  /** Assets parsed out of the zip (original ids preserved). */
  parsedAssets: ParsedZipAsset[];
  incomingBeats: any[];
  incomingCharacters: any[];
  incomingVariables: any[];
  characterCollisions: CharacterCollision[];
}

/** Human-facing label (characters carry a machine `name` slug like
 *  'environmental_consultant' plus a human `displayName`). */
function charLabel(c: any): string {
  return String(c?.displayName ?? c?.name ?? c?.id ?? '');
}

/** Normalize for collision comparison: case-insensitive, and underscores
 *  equal spaces so the machine slug matches its own display form. */
function normalizeCharKey(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

/** All comparison keys a character answers to (name + displayName). */
function charKeys(c: any): string[] {
  return [c?.name, c?.displayName]
    .map(normalizeCharKey)
    .filter(k => k.length > 0);
}

/**
 * Parse an .asaps zip and report what a merge would bring in, including
 * character name collisions the author must decide on.
 */
export async function analyzeMergeSource(
  zipBlob: Blob,
  existingCharacters: any[]
): Promise<MergeSourceAnalysis> {
  const zip = await JSZip.loadAsync(zipBlob);

  const projectJsonFile = zip.file('project.json');
  if (!projectJsonFile) {
    throw new Error('Invalid story file: project.json not found');
  }
  const projectData = JSON.parse(await projectJsonFile.async('text'));
  if (!projectData.project?.story) {
    throw new Error('Invalid story file: no story data');
  }

  const story = projectData.project.story;
  const incomingBeats: any[] = Array.isArray(story.beats) ? story.beats : [];
  const incomingCharacters: any[] = Array.isArray(story.characters) ? story.characters : [];
  const incomingVariables: any[] =
    projectData.project.globalSettings?.variables
    ?? story.settings?.variables
    ?? [];

  // Name collisions — compare every key a character answers to (machine
  // name slug AND displayName, normalized) so 'environmental_consultant'
  // collides with 'Environmental Consultant'.
  const existingByKey = new Map<string, any>();
  for (const c of existingCharacters || []) {
    for (const key of charKeys(c)) existingByKey.set(key, c);
  }
  const characterCollisions: CharacterCollision[] = [];
  for (const inc of incomingCharacters) {
    const existing = charKeys(inc).map(k => existingByKey.get(k)).find(Boolean);
    if (existing) {
      characterCollisions.push({
        incomingId: String(inc.id),
        incomingName: charLabel(inc),
        existingId: String(existing.id),
        existingName: charLabel(existing),
      });
    }
  }

  const parsedAssets = await readAssetsFromZip(zip);

  return {
    projectName: projectData.project.name || 'Imported story',
    storyTitle: story.metadata?.title || projectData.project.name || 'Merged story',
    projectData,
    parsedAssets,
    incomingBeats,
    incomingCharacters,
    incomingVariables,
    characterCollisions,
  };
}

// ---------------------------------------------------------------------------
// Merge computation (pure)
// ---------------------------------------------------------------------------

export interface CharacterDecision {
  incomingId: string;
  action: 'reuse' | 'keep-both';
}

export interface MergeInput {
  source: MergeSourceAnalysis;
  /** Current project's beats in SERIALIZED (plain-object) form — used for
   *  id-collision checks and graph bounds. */
  existingBeats: any[];
  existingCharacters: any[];
  existingClusters: any[];
  existingVariables: any[];
  /** Existing asset ids in the current project (collision checks). */
  existingAssetIds: string[];
  /** Author's per-collision choices; collisions without a decision
   *  default to 'keep-both' (never silently fuse two characters). */
  decisions: CharacterDecision[];
  targetProjectId: string;
  /** 'separate' (default): a different story, added alongside.
   *  'versions': another version of this story — see the header. */
  mode?: 'separate' | 'versions';
  /** 'versions': the incoming beats in the same stored form as
   *  existingBeats (by id), for the content comparison. */
  comparableIncoming?: Map<string, any>;
}

/** A beat both versions have, with different content. */
export interface VersionConflict {
  id: string;
  name: string;
  /** The id the other version's beat came in under. */
  copyId: string;
}

export interface MergeResult {
  /** Plain serialized beats to append (deserialize before adding to state). */
  beats: any[];
  /** New characters to append (reused ones are NOT included). */
  characters: any[];
  /** Assets to persist (ids final, projectId set). */
  assets: StoredAsset[];
  /** The organizational cluster wrapping the incoming beats. */
  cluster: any;
  /** Variables to append to globalSettings.variables (name-unioned). */
  variables: any[];
  summary: {
    beats: number;
    charactersAdded: number;
    charactersReused: number;
    assets: number;
    variablesAdded: number;
    clusterName: string;
    /** 'versions' mode: beats both versions have unchanged (left out). */
    identical?: number;
    /** 'versions' mode: beats both have, changed differently. */
    conflicts?: VersionConflict[];
  };
}

/** Keys that don't make two versions of a beat different. */
const LAYOUT_KEYS = new Set(['x', 'y', 'cluster', 'node', '_version']);

/** A comparable form of a beat: no layout fields, no empty values, sorted keys. */
function canonicalBeat(value: any, top = true): any {
  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalBeat(v, false)).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const key of Object.keys(value).sort()) {
      if (top && LAYOUT_KEYS.has(key)) continue;
      const v = canonicalBeat(value[key], false);
      if (v !== undefined) out[key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  return value;
}

/** Same beat in both versions (layout aside)? */
export function sameBeatContent(a: any, b: any): boolean {
  return JSON.stringify(canonicalBeat(a)) === JSON.stringify(canonicalBeat(b));
}

/** Share of the incoming beats whose id the open project also has — high means "another version of this story". */
export function sharedBeatShare(incomingBeats: any[], existingBeatIds: Iterable<string>): number {
  if (!incomingBeats.length) return 0;
  const ids = new Set(existingBeatIds);
  return incomingBeats.filter((b) => ids.has(String(b?.id))).length / incomingBeats.length;
}

/** Suffix helper: "Elena" → "Elena 2" (first free numeric suffix). */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base.trim().toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.trim().toLowerCase())) return candidate;
  }
}

export function uniqueId(base: string, taken: Set<string>, tag: string): string {
  if (!taken.has(base)) return base;
  for (let n = 1; ; n++) {
    const candidate = `${base}_${tag}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Deep-rewrite every string VALUE in `obj` that exactly matches a key in
 * `valueMap`. Returns a new structure; does not mutate the input.
 */
export function deepRewrite(obj: any, valueMap: Map<string, string>): any {
  if (typeof obj === 'string') {
    return valueMap.get(obj) ?? obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepRewrite(item, valueMap));
  }
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepRewrite(v, valueMap);
    }
    return out;
  }
  return obj;
}

/** Fields that reference characters BY NAME (not id) in beat data. */
const CHARACTER_NAME_FIELDS = new Set([
  'speaker', 'character', 'fromChar', 'toChar', 'sentimentTarget', 'npcName', 'owner',
]);

/**
 * Rewrite character NAME references (speaker etc.) for renamed characters.
 * Only applies to the curated name-bearing fields so ordinary story text
 * ("Elena walked in") is never touched.
 */
function rewriteNameFields(obj: any, nameMap: Map<string, string>): any {
  if (Array.isArray(obj)) {
    return obj.map(item => rewriteNameFields(item, nameMap));
  }
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && CHARACTER_NAME_FIELDS.has(k) && nameMap.has(v)) {
        out[k] = nameMap.get(v);
      } else {
        out[k] = rewriteNameFields(v, nameMap);
      }
    }
    return out;
  }
  return obj;
}

export function computeMerge(input: MergeInput): MergeResult {
  const { source, decisions, targetProjectId } = input;
  const versions = input.mode === 'versions';
  const tag = 'm' + Date.now().toString(36);

  const decisionByIncoming = new Map(decisions.map(d => [d.incomingId, d.action]));
  const collisionByIncoming = new Map(source.characterCollisions.map(c => [c.incomingId, c]));

  // ---- ids currently taken in the open project --------------------------
  const takenBeatIds = new Set<string>((input.existingBeats || []).map(b => String(b.id)));
  const takenCharIds = new Set<string>((input.existingCharacters || []).map(c => String(c.id)));
  const takenCharNames = new Set<string>(
    (input.existingCharacters || []).flatMap(c => charKeys(c))
  );
  const takenAssetIds = new Set<string>(input.existingAssetIds || []);

  // ---- value map shared by the deep rewrite -----------------------------
  const valueMap = new Map<string, string>();
  const nameMap = new Map<string, string>();

  // Assets: keep id unless it collides
  const assets: StoredAsset[] = [];
  for (const parsed of source.parsedAssets) {
    // Another version of this story: an asset with an id we have is ours.
    if (versions && parsed.id && takenAssetIds.has(parsed.id)) continue;
    const originalId = parsed.id || `asset_${Date.now()}_${assets.length}`;
    const newId = uniqueId(originalId, takenAssetIds, tag);
    takenAssetIds.add(newId);
    if (newId !== originalId) valueMap.set(originalId, newId);
    assets.push({ ...parsed.asset, id: newId, projectId: targetProjectId } as StoredAsset);
  }

  // Characters
  const characters: any[] = [];
  let charactersReused = 0;
  for (const inc of source.incomingCharacters) {
    const incId = String(inc.id);
    // Another version of this story: a character with an id we have is ours.
    if (versions && takenCharIds.has(incId)) {
      charactersReused++;
      continue;
    }
    const collision = collisionByIncoming.get(incId);
    if (collision) {
      const action = decisionByIncoming.get(incId) ?? 'keep-both';
      const existing = (input.existingCharacters || []).find(c => String(c.id) === collision.existingId);
      if (action === 'reuse') {
        // Same person: rewire every incoming reference to the existing character
        if (incId !== collision.existingId) valueMap.set(incId, collision.existingId);
        // Map both reference axes (machine name + displayName) so speaker
        // strings and name-bearing params resolve to the existing character.
        if (inc.name && existing?.name && inc.name !== existing.name) {
          nameMap.set(String(inc.name), String(existing.name));
        }
        if (inc.displayName && existing?.displayName && inc.displayName !== existing.displayName) {
          nameMap.set(String(inc.displayName), String(existing.displayName));
        }
        charactersReused++;
        continue; // do not add the incoming character
      }
      // keep-both: rename + re-id. Human label gets "Elena 2"; the machine
      // name gets a matching slug ("elena_2") following the app convention.
      const newId = uniqueId(incId, takenCharIds, tag);
      const newLabel = uniqueName(charLabel(inc), takenCharNames);
      const newSlug = normalizeCharKey(newLabel).replace(/ /g, '_');
      takenCharIds.add(newId);
      takenCharNames.add(normalizeCharKey(newLabel));
      takenCharNames.add(normalizeCharKey(newSlug));
      if (newId !== incId) valueMap.set(incId, newId);
      if (inc.name && String(inc.name) !== newSlug) nameMap.set(String(inc.name), newSlug);
      if (inc.displayName && String(inc.displayName) !== newLabel) nameMap.set(String(inc.displayName), newLabel);
      if (!inc.displayName && inc.name && String(inc.name) !== newLabel) nameMap.set(String(inc.name), newLabel);
      characters.push({
        ...inc,
        id: newId,
        name: inc.displayName ? newSlug : newLabel,
        // Keep displayName in sync with the rename so the author sees
        // "Elena 2" everywhere, not a stale "Elena" label.
        ...(inc.displayName ? { displayName: newLabel } : {}),
      });
      continue;
    }
    // No name collision — keep, but guard against raw id collisions
    const newId = uniqueId(incId, takenCharIds, tag);
    takenCharIds.add(newId);
    for (const key of charKeys(inc)) takenCharNames.add(key);
    if (newId !== incId) valueMap.set(incId, newId);
    characters.push(newId === incId ? inc : { ...inc, id: newId });
  }

  // Beats: keep id unless it collides. Versions: a beat we have unchanged
  // is shared and stays out; one we have changed differently comes in as
  // a copy under a new id.
  const existingById = new Map((input.existingBeats || []).map((b) => [String(b.id), b]));
  const identicalIds = new Set<string>();
  const conflicts: VersionConflict[] = [];
  const beatIdFinal = new Map<string, string>();
  for (const beat of source.incomingBeats) {
    const incId = String(beat.id);
    if (versions && existingById.has(incId)
        && sameBeatContent(existingById.get(incId), input.comparableIncoming?.get(incId) ?? beat)) {
      identicalIds.add(incId);
      continue;
    }
    const newId = uniqueId(incId, takenBeatIds, tag);
    if (versions && newId !== incId) conflicts.push({ id: incId, name: String(beat.name || incId), copyId: newId });
    takenBeatIds.add(newId);
    beatIdFinal.set(incId, newId);
    if (newId !== incId) valueMap.set(incId, newId);
  }

  // ---- graph placement ----------------------------------------------------
  // Put the merged cluster to the right of the existing graph.
  let maxExistingX = 0;
  for (const b of input.existingBeats || []) {
    const x = typeof b.x === 'number' ? b.x : 0;
    if (x > maxExistingX) maxExistingX = x;
  }
  let minIncomingX = Infinity;
  let minIncomingY = Infinity;
  for (const b of source.incomingBeats) {
    if (typeof b.x === 'number' && b.x < minIncomingX) minIncomingX = b.x;
    if (typeof b.y === 'number' && b.y < minIncomingY) minIncomingY = b.y;
  }
  if (!isFinite(minIncomingX)) minIncomingX = 0;
  if (!isFinite(minIncomingY)) minIncomingY = 0;
  const offsetX = maxExistingX + 500 - minIncomingX;
  const offsetY = 100 - minIncomingY;

  // ---- cluster --------------------------------------------------------------
  const clusterId = `cluster_${tag}`;
  const clusterName = versions ? `Other version: ${source.storyTitle}` : `Merged: ${source.storyTitle}`;
  const cluster = {
    id: clusterId,
    name: clusterName,
    type: 'organizational' as const,
    containerPosition: { x: maxExistingX + 400, y: 50 },
    // Sized for the editor's default member grid — a fixed 800×600 box
    // overflowed for merges with more than ~10 beats.
    containerBounds: grownClusterBounds({ width: 800, height: 600 }, source.incomingBeats.length),
    isExpanded: true,
  };

  // ---- rewrite + assemble beats ---------------------------------------------
  const conflictIds = new Set(conflicts.map((c) => c.id));
  const beats = source.incomingBeats.filter(beat => !identicalIds.has(String(beat.id))).map(beat => {
    // Deep rewrite ids first (connections, choice targets, nested dialog
    // trees, condition targets, asset refs, characterRef ids — everything,
    // because it's value-equality based).
    let rewritten = deepRewrite(beat, valueMap);
    // Character NAME references (speaker fields etc.) for renamed characters
    if (nameMap.size > 0) {
      rewritten = rewriteNameFields(rewritten, nameMap);
    }
    return {
      ...rewritten,
      id: beatIdFinal.get(String(beat.id)),
      // A beat both versions changed: mark the other version's copy.
      ...(conflictIds.has(String(beat.id)) ? { name: `${rewritten.name || beat.id} (other version)` } : {}),
      x: (typeof beat.x === 'number' ? beat.x : 0) + offsetX,
      y: (typeof beat.y === 'number' ? beat.y : 0) + offsetY,
      // v1: all incoming beats land in the single merged cluster
      cluster: clusterId,
    };
  });

  // Rewrite character-internal asset references too (portraits, sprite sheets)
  const finalCharacters = characters.map(c => deepRewrite(c, valueMap));

  // ---- variables (union by name; existing wins) -------------------------------
  const existingVarNames = new Set(
    (input.existingVariables || []).map((v: any) => String(v?.name ?? v).trim().toLowerCase())
  );
  const variables = (source.incomingVariables || []).filter((v: any) => {
    const name = String(v?.name ?? v).trim().toLowerCase();
    return name && !existingVarNames.has(name);
  });

  return {
    beats,
    characters: finalCharacters,
    assets,
    cluster,
    variables,
    summary: {
      beats: beats.length,
      charactersAdded: finalCharacters.length,
      charactersReused,
      assets: assets.length,
      variablesAdded: variables.length,
      clusterName,
      ...(versions ? { identical: identicalIds.size, conflicts } : {}),
    },
  };
}
