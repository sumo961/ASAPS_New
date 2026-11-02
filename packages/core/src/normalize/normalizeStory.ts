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
import { isTextForCounter } from '../engine/variableValues';
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
  // A generator-emitted meterFrame is usually partial (dock + position). The
  // editor and the renderer read style/offset sub-fields directly, so the
  // saved shape must be complete. Authored fields win; gaps get defaults.
  if (out.meterFrame && typeof out.meterFrame === 'object') {
    const completed = completeMeterFrameDefaults(out.meterFrame);
    if (JSON.stringify(completed) !== JSON.stringify(out.meterFrame)) { out.meterFrame = completed; changed = true; }
  }
  void before;
  return { character: out, changed };
}

/** Same defaults as the renderer's FALLBACK_METER_FRAME / the builder's DEFAULT_METER_FRAME_CONFIG (screen-docked variant). */
export function completeMeterFrameDefaults(partial: any): any {
  const base = {
    dockMode: 'screen', anchor: 'top', screenPosition: 'screen-top-left', offset: { x: 0, y: 0 },
    style: { backgroundColor: '#1b1f2b', borderColor: '#3d4356', borderWidth: 1, borderRadius: 6, padding: 8, opacity: 90 },
    meterHeight: 12, meterSpacing: 6, showLabels: true, meterWidth: 130,
  };
  const p = partial && typeof partial === 'object' ? partial : {};
  return { ...base, ...p, offset: { ...base.offset, ...(p.offset ?? {}) }, style: { ...base.style, ...(p.style ?? {}) } };
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

/**
 * A generator that writes `savedscreenshot` for the declared `savedScreenshot`
 * means the same thing, but at runtime they are two values and the check never
 * sees the set. Use the declared spelling. Closer calls than capitals are left
 * for Story Warnings: they may be different things.
 */
function repairDeclaredNameCase(story: any): NormalizeChange[] {
  const declared = new Map<string, string>();
  const declare = (name: unknown) => { if (typeof name === 'string' && name.trim()) declared.set(name.trim().toLowerCase(), name.trim()); };
  for (const v of Array.isArray(story.variables) ? story.variables : []) declare(typeof v === 'string' ? v : v?.name);
  for (const c of Array.isArray(story.characters) ? story.characters : []) {
    for (const d of Array.isArray(c?.counters) ? c.counters : []) declare(d?.name);
  }
  if (declared.size === 0 || !Array.isArray(story.beats)) return [];
  const out: NormalizeChange[] = [];
  const correct = (name: unknown): string | null => {
    if (typeof name !== 'string') return null;
    const right = declared.get(name.trim().toLowerCase());
    return right && right !== name ? right : null;
  };
  const walk = (node: any, beatId: string): void => {
    if (Array.isArray(node)) { node.forEach((v) => walk(v, beatId)); return; }
    if (!node || typeof node !== 'object') return;
    const fix = (key: string) => {
      const right = correct(node[key]);
      if (right) {
        out.push({ beatId, path: key, kind: 'normalized', from: node[key], to: right, note: 'Spelled as declared' });
        node[key] = right;
      }
    };
    if (node.type === 'variable' || node.type === 'counter') { fix('variableName'); fix('variable'); fix('left'); }
    if (node.type === 'setVariable' || node.type === 'setCounter' || node.type === 'incrementCounter') fix('target');
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string' && v.includes('{')) {
        // Text that shows a value, written $ + {name}.
        const next = v.replace(/\$\{([^}@]+)\}/g, (m, n) => { const right = correct(n); return right ? '$' + `{${right}}` : m; });
        if (next !== v) { out.push({ beatId, path: k, kind: 'normalized', from: v.slice(0, 60), to: next.slice(0, 60), note: 'Spelled as declared' }); node[k] = next; }
      } else if (v && typeof v === 'object') walk(v, beatId);
    }
  };
  story.beats = story.beats.map((raw: any) => {
    const beat = { ...raw };
    for (const k of ['parameters', 'connections', 'requires']) if (beat[k]) beat[k] = structuredClone(beat[k]);
    walk(beat.parameters, beat.id);
    walk(beat.connections, beat.id);
    walk(beat.requires, beat.id);
    if (beat.type === 'setVariable' || beat.type === 'inputText') {
      const p = beat.parameters ?? {};
      for (const k of ['name', 'variable', 'variableName', 'counter']) {
        const right = correct(p[k]);
        if (right) { out.push({ beatId: beat.id, path: `parameters.${k}`, kind: 'normalized', from: p[k], to: right, note: 'Spelled as declared' }); p[k] = right; }
      }
    }
    if (beat.type === 'conditionBeat' && beat.parameters) {
      const p = beat.parameters;
      for (const k of ['variableName', 'variable', 'left']) {
        const right = (p.conditionType === 'variable' || p.conditionType === 'counter') ? correct(p[k]) : null;
        if (right) { out.push({ beatId: beat.id, path: `parameters.${k}`, kind: 'normalized', from: p[k], to: right, note: 'Spelled as declared' }); p[k] = right; }
      }
    }
    return beat;
  });
  return out;
}

/**
 * A generator that compares or sets a "counter" with text means a variable:
 * a counter holds a number, and the check could never match. Rewrite those to
 * their variable forms, so what was generated does what it says.
 */
function repairCounterText(beat: any): NormalizeChange[] {
  const out: NormalizeChange[] = [];
  const note = (path: string, from: string, to: string) =>
    out.push({ beatId: beat?.id, path, kind: 'coerced' as NormalizeChange['kind'], from, to, note: 'A counter holds a number; text belongs in a variable' });
  const walk = (node: any, path: string): void => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'counter' && isTextForCounter(node.value ?? node.right)) {
      node.type = 'variable';
      note(`${path}.type`, 'counter', 'variable');
    }
    if (node.type === 'setCounter' && isTextForCounter(node.value)) {
      node.type = 'setVariable';
      note(`${path}.type`, 'setCounter', 'setVariable');
    }
    for (const k of Object.keys(node)) walk(node[k], path ? `${path}.${k}` : k);
  };
  if (!beat?.parameters) return out;
  // normalizeBeat copies only the top level; the story as it arrived stays untouched.
  const p = (beat.parameters = structuredClone(beat.parameters));
  if (beat.type === 'conditionBeat' && p.conditionType === 'counter' && isTextForCounter(p.value)) {
    p.conditionType = 'variable';
    note('parameters.conditionType', 'counter', 'variable');
  }
  if (beat.type === 'setVariable' && p.type === 'counter' && isTextForCounter(p.value) && !String(p.value).trim().startsWith('=')) {
    p.type = 'variable';
    note('parameters.type', 'counter', 'variable');
  }
  walk(p, 'parameters');
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
      const { beat, changes: beatChanges } = normalizeBeat(rawBeat, schema);
      const changes = [...beatChanges, ...repairCounterText(beat)];
      if (changes.length > 0) {
        beatsNormalized++;
        allChanges.push(...changes);
      }
      out.push(beat);
    }
    story.beats = out;
  }

  // Step 2b — names that differ from a declared one only in capitals
  allChanges.push(...repairDeclaredNameCase(story));

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
