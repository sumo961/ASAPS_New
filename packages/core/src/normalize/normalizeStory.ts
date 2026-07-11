/**
 * Schema-driven story normalization.
 *
 * Single entry point that:
 *
 *   1. Builds the reference index (characters / clusters / beats / assets)
 *   2. Normalizes each beat (flatten / alias / coerce / default)
 *   3. Auto-creates Cluster containers from per-beat `cluster` strings
 *   4. Backfills editor-only fields on AI-emitted characters
 *   5. Validates the normalized story against the schema
 *
 * Returns the canonical story plus a structured report and any errors /
 * warnings the validator emitted. Pure — does not touch app state, IndexedDB,
 * or React stores. Callers (AI generation, MCP import, zip-import, project
 * load) wire the result into their own flows.
 */

import type {
  BeatSchema,
  NormalizeChange,
  NormalizeReport,
  NormalizeResult,
  RefIndex,
  ValidationIssue,
} from './types';
import { normalizeBeat } from './normalizeBeat';
import { validateBeat } from './validateBeat';

export interface NormalizeStoryOptions {
  /** Auto-create Cluster container objects from per-beat cluster strings. Default true. */
  autoCreateClusters?: boolean;
  /** Backfill editor-only character fields. Default true. */
  normalizeCharacters?: boolean;
}

export function buildRefIndex(rawStory: any): RefIndex {
  const characterIds = new Set<string>();
  const beatIds = new Set<string>();
  const clusterNames = new Set<string>();
  const assetIds = new Set<string>();

  if (rawStory && typeof rawStory === 'object') {
    if (Array.isArray(rawStory.characters)) {
      for (const c of rawStory.characters) {
        if (c?.id) characterIds.add(c.id);
      }
    }
    if (Array.isArray(rawStory.beats)) {
      for (const b of rawStory.beats) {
        if (b?.id) beatIds.add(b.id);
        const c = b?.cluster;
        if (typeof c === 'string' && c.trim()) clusterNames.add(c.trim());
      }
    }
    if (Array.isArray(rawStory.clusters)) {
      for (const c of rawStory.clusters) {
        if (c?.id) clusterNames.add(c.id);
        if (c?.name) clusterNames.add(c.name);
      }
    }
    if (Array.isArray(rawStory.assets)) {
      for (const a of rawStory.assets) {
        if (a?.id) assetIds.add(a.id);
      }
    }
  }

  return { characterIds, beatIds, clusterNames, assetIds };
}

/**
 * Backfill editor-only fields on a raw character so the Character Editor
 * doesn't crash on `character.visual.defaultAssetId` / `.states.length`.
 * Mirrors the v0.9.50 fix in App.tsx and projectDeserializer.ts.
 */
export function normalizeCharacter(c: any): { character: any; changed: boolean } {
  if (!c || typeof c !== 'object') return { character: c, changed: false };
  const now = new Date().toISOString();
  const before = c;
  const out: any = { ...c };
  let changed = false;
  if (!out.visual) { out.visual = { type: 'static' }; changed = true; }
  if (!Array.isArray(out.states) || out.states.length === 0) {
    out.states = [{ id: 'default', name: 'default', displayName: 'Default', visual: {} }];
    changed = true;
  }
  if (!out.defaultState) { out.defaultState = 'default'; changed = true; }
  if (!Array.isArray(out.counters)) { out.counters = []; changed = true; }
  if (!Array.isArray(out.inventory)) { out.inventory = []; changed = true; }
  if (!Array.isArray(out.tags)) { out.tags = []; changed = true; }
  if (!Array.isArray(out.traits)) { out.traits = []; changed = true; }
  if (!Array.isArray(out.goals)) { out.goals = []; changed = true; }
  if (!out.createdAt) { out.createdAt = now; changed = true; }
  if (!out.updatedAt) { out.updatedAt = now; changed = true; }
  void before;
  return { character: out, changed };
}

/**
 * Build Cluster container objects from beats' per-beat `cluster` strings.
 * id = name verbatim (the GraphEditor compares strings). Bounding box
 * computed from member beat positions with a fixed padding.
 */
export function buildClustersFromBeats(beats: any[]): any[] {
  if (!Array.isArray(beats) || beats.length === 0) return [];
  const PADDING = 80;
  const buckets = new Map<string, Array<{ x: number; y: number }>>();
  for (const b of beats) {
    const name = typeof b?.cluster === 'string' ? b.cluster.trim() : '';
    if (!name) continue;
    const pos = b.position || (typeof b.x === 'number' && typeof b.y === 'number' ? { x: b.x, y: b.y } : null);
    if (!pos) continue;
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name)!.push({ x: pos.x, y: pos.y });
  }
  const out: any[] = [];
  for (const [name, positions] of buckets.entries()) {
    const minX = Math.min(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    // Size for how the editor actually RENDERS members: beats without a
    // stored in-container position land on a default 2-column grid
    // (200×110 steps, 160×80 nodes, 20px padding) below a 40px header —
    // NOT at their global x/y. Sizing from the global bbox (the old
    // behavior) produced boxes the member grid overflowed.
    const rows = Math.max(1, Math.ceil(positions.length / 2));
    const width = 400;
    const height = Math.max(300, 40 + 20 + (rows - 1) * 110 + 80 + 20);
    out.push({
      id: name,
      name,
      type: 'organizational',
      containerPosition: { x: minX - PADDING, y: minY - PADDING },
      containerBounds: { width, height },
      isExpanded: true,
    });
  }
  return out;
}

export function normalizeStory(
  rawStory: any,
  schema: BeatSchema,
  options: NormalizeStoryOptions = {}
): NormalizeResult {
  const opts = {
    autoCreateClusters: options.autoCreateClusters !== false,
    normalizeCharacters: options.normalizeCharacters !== false,
  };

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const allChanges: NormalizeChange[] = [];
  let charactersNormalized = 0;
  let beatsNormalized = 0;
  const clustersCreatedNames: string[] = [];

  if (!rawStory || typeof rawStory !== 'object') {
    errors.push({ path: '', message: 'Story is not an object', severity: 'error' });
    return {
      story: rawStory,
      report: {
        changes: [],
        clustersCreated: [],
        charactersNormalized: 0,
        beatsNormalized: 0,
      },
      errors,
      warnings,
      valid: false,
    };
  }

  const story: any = { ...rawStory };

  // Step 1 — characters: normalize editor-only fields
  if (opts.normalizeCharacters && Array.isArray(story.characters)) {
    const out = [];
    for (const c of story.characters) {
      const { character, changed } = normalizeCharacter(c);
      if (changed) {
        charactersNormalized++;
        allChanges.push({
          path: `characters[${character.id || '?'}]`,
          kind: 'normalized',
          note: 'editor-only fields backfilled',
        });
      }
      out.push(character);
    }
    story.characters = out;
  }

  // Step 2 — beats: schema-driven normalize
  if (Array.isArray(story.beats)) {
    const out = [];
    for (const rawBeat of story.beats) {
      const { beat, changes } = normalizeBeat(rawBeat, schema);
      if (changes.length > 0) {
        beatsNormalized++;
        allChanges.push(...changes);
      }
      out.push(beat);
    }
    story.beats = out;
  }

  // Step 3 — clusters: auto-create from per-beat cluster strings if missing
  if (opts.autoCreateClusters && Array.isArray(story.beats)) {
    const existing = new Set<string>();
    if (Array.isArray(story.clusters)) {
      for (const c of story.clusters) {
        if (c?.id) existing.add(c.id);
        if (c?.name) existing.add(c.name);
      }
    }
    const generated = buildClustersFromBeats(story.beats);
    const fresh = generated.filter(c => !existing.has(c.id) && !existing.has(c.name));
    if (fresh.length > 0) {
      story.clusters = [...(story.clusters || []), ...fresh];
      for (const c of fresh) {
        clustersCreatedNames.push(c.name);
        allChanges.push({
          path: `clusters[${c.name}]`,
          kind: 'normalized',
          to: c,
          note: 'auto-created from per-beat cluster string',
        });
      }
    }
  }

  // Step 4 — validate
  const refIndex = buildRefIndex(story);
  if (Array.isArray(story.beats)) {
    for (const beat of story.beats) {
      const result = validateBeat(beat, schema, refIndex);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }

  const report: NormalizeReport = {
    changes: allChanges,
    clustersCreated: clustersCreatedNames,
    charactersNormalized,
    beatsNormalized,
  };

  return {
    story,
    report,
    errors,
    warnings,
    valid: errors.length === 0,
  };
}
