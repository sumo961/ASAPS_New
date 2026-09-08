/**
 * Generation review — deterministic findings and fix proposals over a story
 * as the AI generator handed it over. Pure: no React, no schema, no model.
 * See types/generationReview.ts for the design rule.
 */
import { storyLinks, beatLinks, type StoryLink } from './storyLinks';
import {
  analyzeCounterRanges, readCounterCondition, conditionCanBeTrue, conditionCanBeFalse,
} from './counterRangeAnalysis';
import type {
  GenerationFinding, MissingTargetFinding, UnreachableBeatFinding, UnsatisfiableThresholdFinding,
  FixProposal, GenerationReview,
} from '../types/generationReview';
import { PARAMETER_DERIVED_TYPES } from './beatConnectionModel';

/**
 * Beat types whose only exit is the single `connection` parameter — the
 * ones "link from the previous beat" may write to. Mirrors the schema's
 * beat types that define a `connection` param; passed in when the caller
 * has the schema, this list is the fallback.
 */
export const SINGLE_EXIT_BEAT_TYPES: ReadonlySet<string> = new Set([
  'titleScreen', 'infoText', 'explanation', 'durScreen', 'setVariable', 'addRemoveInventory',
  'setTimer', 'videoBeat', 'inputText', 'keypad', 'webView', 'aiInfoText', 'aiSummary', 'aiDurScreen',
  'onlineContent', 'updateAffect', 'gpsLocation', 'setGpsLocation', 'indoorLocation', 'qrScan', 'inputImage',
]);

const nameOf = (story: any, id: string): string | undefined =>
  (story?.beats || []).find((b: any) => b?.id === id)?.name;

/** Every deterministic finding in a story. Order: missing targets, unreachable beats, thresholds. */
export function analyzeStoryFindings(story: any): GenerationFinding[] {
  const out: GenerationFinding[] = [];
  const beats: any[] = Array.isArray(story?.beats) ? story.beats : [];
  if (beats.length === 0) return out;
  const ids = new Set<string>(beats.map((b: any) => b?.id).filter(Boolean));

  // Missing targets — one finding per (source, target, field), so a retarget
  // proposal knows exactly which field to write.
  const seen = new Set<string>();
  for (const link of storyLinks(story)) {
    if (ids.has(link.target)) continue;
    const id = `missing-target:${link.source}:${link.target}:${link.path ?? link.via}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const f: MissingTargetFinding = {
      id, kind: 'missing-target', beatId: link.source, beatName: nameOf(story, link.source),
      targetId: link.target, via: link.via, ...(link.path ? { path: link.path } : {}),
      message: `"${nameOf(story, link.source) || link.source}" links to "${link.target}", which does not exist.`,
    };
    out.push(f);
  }

  // Unreachable beats — nothing links to them. The first beat is the entry
  // point; a titleScreen anywhere is a legitimate entry too.
  const targeted = new Set<string>(beats.flatMap((b: any) => beatLinks(b)).map((l) => l.target));
  beats.forEach((beat: any, index: number) => {
    if (index === 0 || !beat?.id || beat.type === 'titleScreen') return;
    if (targeted.has(beat.id)) return;
    const f: UnreachableBeatFinding = {
      id: `unreachable-beat:${beat.id}`, kind: 'unreachable-beat', beatId: beat.id, beatName: beat.name,
      beatType: beat.type, index,
      message: `"${beat.name || beat.id}" (${beat.type}) can never be reached — no choice or link leads to it.`,
    };
    out.push(f);
  });

  // Counter gates that can never take one of their branches.
  const ranges = analyzeCounterRanges(beats, story?.variables);
  for (const beat of beats) {
    const cond = readCounterCondition(beat);
    if (!cond) continue;
    const range = ranges.get(cond.counterName) || { min: 0, max: 0, modified: false };
    const base = {
      beatId: beat.id, beatName: beat.name, counterName: cond.counterName, operator: cond.operator,
      requiredValue: cond.value, minValue: range.min, maxValue: range.max,
      counterModified: range.modified, nested: cond.nested,
    };
    if (cond.trueTarget && !conditionCanBeTrue(range, cond.operator, cond.value)) {
      const f: UnsatisfiableThresholdFinding = {
        ...base, id: `unsatisfiable-threshold:${beat.id}:true`, kind: 'unsatisfiable-threshold',
        branch: 'true', targetId: cond.trueTarget,
        message: range.modified
          ? `"${beat.name || beat.id}" checks ${cond.counterName} ${cond.operator} ${cond.value}, but ${cond.counterName} can only reach ${range.min}…${range.max}, so its true branch never runs.`
          : `"${beat.name || beat.id}" checks ${cond.counterName} ${cond.operator} ${cond.value}, but nothing in the story changes ${cond.counterName}, so its true branch never runs.`,
      };
      out.push(f);
    }
    if (cond.falseTarget && !conditionCanBeFalse(range, cond.operator, cond.value)) {
      const f: UnsatisfiableThresholdFinding = {
        ...base, id: `unsatisfiable-threshold:${beat.id}:false`, kind: 'unsatisfiable-threshold',
        branch: 'false', targetId: cond.falseTarget,
        message: `"${beat.name || beat.id}" checks ${cond.counterName} ${cond.operator} ${cond.value}, which is always true for the values ${cond.counterName} can reach (${range.min}…${range.max}), so its false branch never runs.`,
      };
      out.push(f);
    }
  }
  return out;
}

/** Dice coefficient over character bigrams of the normalised strings — good at typos and prefix variants. */
export function idSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) || 0);
  return (2 * overlap) / ((x.length - 1) + (y.length - 1));
}

/** Closest existing id when it is clearly the intended one; null when ambiguous or far. */
export function closestBeatId(target: string, ids: readonly string[]): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null; let second = 0;
  for (const id of ids) {
    const score = idSimilarity(target, id);
    if (!best || score > best.score) { second = best?.score ?? 0; best = { id, score }; }
    else if (score > second) second = score;
  }
  if (!best || best.score < 0.6) return null;
  if (best.score - second < 0.1 && second > 0) return null; // two candidates equally plausible
  return best;
}

const clampedThreshold = (f: UnsatisfiableThresholdFinding): number | null => {
  const { operator: op, minValue: min, maxValue: max, requiredValue: v } = f;
  if (f.branch === 'true') {
    switch (op) {
      case '>=': return max;
      case '>': return max - 1 >= min ? max - 1 : null;
      case '<=': return min;
      case '<': return min + 1 <= max ? min + 1 : null;
      case '==': return v > max ? max : v < min ? min : null;
      default: return null;
    }
  }
  switch (op) {
    case '>=': return min + 1 <= max ? min + 1 : null;
    case '>': return min <= max ? min : null;
    case '<=': return max - 1 >= min ? max - 1 : null;
    case '<': return max;
    default: return null;
  }
};

/** Deterministic proposals for the findings that admit a local edit. */
export function proposeFixes(
  findings: readonly GenerationFinding[],
  story: any,
  singleExitTypes: ReadonlySet<string> = SINGLE_EXIT_BEAT_TYPES,
): FixProposal[] {
  const beats: any[] = Array.isArray(story?.beats) ? story.beats : [];
  const ids = beats.map((b: any) => b?.id).filter(Boolean) as string[];
  const out: FixProposal[] = [];

  for (const f of findings) {
    if (f.kind === 'missing-target') {
      if (!f.path) continue; // dialog-internal or story-level link: no safe write location
      const best = closestBeatId(f.targetId, ids);
      if (!best) continue;
      out.push({
        id: `fix:${f.id}`, findingId: f.id, kind: 'retarget', beatId: f.beatId, beatName: f.beatName,
        path: f.path, value: best.id,
        description: `Point "${f.beatName || f.beatId}" at "${nameOf(story, best.id) || best.id}" (${best.id}) instead of the missing "${f.targetId}".`,
        confidence: best.score >= 0.8 ? 'safe' : 'review',
      });
    } else if (f.kind === 'unsatisfiable-threshold') {
      if (!f.counterModified) continue; // the counter is never changed: not a threshold problem
      const next = clampedThreshold(f);
      if (next === null || next === f.requiredValue) continue;
      out.push({
        id: `fix:${f.id}`, findingId: f.id, kind: 'clamp-threshold', beatId: f.beatId, beatName: f.beatName,
        path: f.nested ? 'condition.value' : 'value', value: next,
        description: `Change the check on "${f.beatName || f.beatId}" to ${f.counterName} ${f.operator} ${next} (${f.counterName} reaches ${f.minValue}…${f.maxValue}) so the ${f.branch} branch can run.`,
        confidence: 'review',
      });
    } else if (f.kind === 'unreachable-beat') {
      const prev = beats[f.index - 1];
      if (!prev?.id || !singleExitTypes.has(prev.type)) continue;
      if (beatLinks(prev).length > 0) continue; // its one exit is taken
      out.push({
        id: `fix:${f.id}`, findingId: f.id, kind: 'link-from-previous', beatId: prev.id, beatName: prev.name,
        path: 'connection.target', value: f.beatId,
        description: `Link "${prev.name || prev.id}" (the beat written just before it) to "${f.beatName || f.beatId}".`,
        confidence: 'review',
      });
    }
  }
  return out;
}

/** `choices[2].target` → [{key:'choices'},{index:2},{key:'target'}] */
function parsePath(path: string): Array<{ key: string } | { index: number }> {
  const segs: Array<{ key: string } | { index: number }> = [];
  for (const part of path.split('.')) {
    const m = part.match(/^([^[]+)((?:\[\d+\])*)$/);
    if (!m) throw new Error(`Bad parameter path: ${path}`);
    segs.push({ key: m[1] });
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) segs.push({ index: Number(idx[1]) });
  }
  return segs;
}

/**
 * The parameter patch that sets `path` to `value`: the whole top-level
 * parameter (cloned) with the leaf replaced, plus the old top-level value
 * for undo. Beat.updateParameters merges per top-level key, so that is the
 * unit of change.
 */
export function buildParameterPatch(
  currentParameters: Record<string, any>,
  path: string,
  value: unknown,
): { key: string; next: Record<string, any>; prev: Record<string, any> } {
  const segs = parsePath(path);
  const first = segs[0];
  if (!('key' in first)) throw new Error(`Path must start with a parameter name: ${path}`);
  const key = first.key;
  const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  let top: any = clone(currentParameters?.[key]);
  if (segs.length === 1) {
    return { key, next: { [key]: value }, prev: { [key]: clone(currentParameters?.[key]) } };
  }
  if (top === undefined || top === null) top = 'index' in segs[1] ? [] : {};
  let cursor: any = top;
  for (let i = 1; i < segs.length - 1; i++) {
    const seg = segs[i]; const nextSeg = segs[i + 1];
    const k = 'key' in seg ? seg.key : seg.index;
    if (cursor[k] === undefined || cursor[k] === null) cursor[k] = 'index' in nextSeg ? [] : {};
    cursor = cursor[k];
  }
  const last = segs[segs.length - 1];
  cursor['key' in last ? last.key : last.index] = value;
  return { key, next: { [key]: top }, prev: { [key]: clone(currentParameters?.[key]) } };
}

/** Read a dotted/indexed parameter path. */
export function readParameterPath(params: Record<string, any>, path: string): unknown {
  let cur: any = params;
  for (const part of path.split('.')) {
    const m = part.match(/^([^[]+)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    cur = cur?.[m[1]];
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) cur = cur?.[Number(idx[1])];
    if (cur === undefined) return undefined;
  }
  return cur;
}

export interface BeatEditPlan {
  /** Which store the edit writes: the beat-level connections array, or a parameter. */
  kind: 'connections' | 'parameters';
  /** `updates` objects for useStoryBuilder.updateBeat — the undo pair. */
  prev: Record<string, any>;
  next: Record<string, any>;
  before: unknown;
  after: unknown;
}

/**
 * Turn (path, value) into the edit the LIVE beat needs. A single-exit beat
 * (infoText, titleScreen, …) keeps its link in the beat-level `connections`
 * array — `parameters.connection` is only the generators' wire shape, and
 * a live beat ignores it. So `connection` / `connection.target` on such a
 * beat becomes a connections edit; everything else is a parameter patch.
 * The AI-fix simulation, the preview and the apply all go through here, so
 * they cannot disagree about what an edit does.
 */
export function planBeatEdit(
  beat: { type?: string; name?: string; parameters?: Record<string, any>; connections?: Array<{ targetId?: string; target?: string; label?: string }> },
  path: string,
  value: unknown,
): BeatEditPlan {
  const params = beat.parameters ?? {};
  const isConnectionPath = path === 'connection.target' || path === 'connection';
  if (isConnectionPath && !PARAMETER_DERIVED_TYPES.has(beat.type ?? '')) {
    const targetId = path === 'connection' ? (value as any)?.target : value;
    const existing = Array.isArray(beat.connections) ? beat.connections : [];
    const label = (path === 'connection' ? (value as any)?.label : undefined) ?? existing[0]?.label;
    const before = existing[0]?.targetId ?? existing[0]?.target ?? params.connection?.target;
    return {
      kind: 'connections',
      prev: { connections: JSON.parse(JSON.stringify(existing)) },
      next: { connections: typeof targetId === 'string' && targetId ? [{ targetId, ...(label ? { label } : {}) }] : [] },
      before,
      after: targetId,
    };
  }
  const patch = buildParameterPatch(params, path, value);
  return { kind: 'parameters', prev: { parameters: patch.prev }, next: { parameters: patch.next }, before: readParameterPath(params, path), after: value };
}

/** Apply a plan to a SERIALIZED beat (toJSON shape) in place — the simulation's write. */
export function applyPlanToSerializedBeat(beat: any, plan: BeatEditPlan): void {
  if (plan.kind === 'connections') {
    beat.connections = JSON.parse(JSON.stringify(plan.next.connections));
    if (beat.parameters?.connection) delete beat.parameters.connection;
  } else {
    beat.parameters = { ...(beat.parameters ?? {}), ...plan.next.parameters };
  }
}

export function createGenerationReview(args: {
  source: GenerationReview['source'];
  title: string;
  original: unknown;
  findings: GenerationFinding[];
  proposals: FixProposal[];
  model?: string;
  request?: GenerationReview['request'];
}): GenerationReview {
  return {
    version: 1, source: args.source, createdAt: new Date().toISOString(), title: args.title,
    ...(args.model ? { model: args.model } : {}), ...(args.request ? { request: args.request } : {}),
    original: args.original, findings: args.findings, proposals: args.proposals, status: {},
  };
}

/** Findings that are neither applied nor skipped. */
export function openFindings(review: GenerationReview): GenerationFinding[] {
  return review.findings.filter((f) => (review.status[f.id] ?? 'open') === 'open');
}
