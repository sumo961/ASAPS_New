/**
 * "Ask AI for a fix" — one validation finding, one small model call, one
 * deterministic acceptance check, one diff for the author.
 *
 * The model never touches the story. It gets the finding, the few beats
 * involved and the schema for their types, and answers with parameter edits
 * (beatId + path + value). Everything it says is then checked by code:
 * only allowed beats, only parseable parameter paths, and — on a simulated
 * copy of the story — the finding must be gone and no new finding may
 * appear. Anything else is rejected with a reason the author can read.
 * What survives is a FixProposal set the existing undoable apply handles.
 */
import { parseJSONWithRepair } from '@asaps/core';
import type { GenerationFinding, FixProposal, AIFixSuggestion } from '../types/generationReview';
import { analyzeStoryFindings, planBeatEdit, applyPlanToSerializedBeat } from '../utils/generationReview';
import { storyLinks } from '../utils/storyLinks';

export interface FixRequestContext {
  /** Serialized beats (parameters as plain JSON). */
  story: { beats: any[]; variables?: any[] };
  /** Raw beat schema (core-beats.json) for per-type parameter excerpts; optional. */
  schema?: any;
}

const MAX_EDITS = 4;
const MAX_CONTEXT_BEATS = 12;

const beatById = (story: any, id: string) => (story?.beats || []).find((b: any) => b?.id === id);

/** Compact `{param: {type, description}}` for one beat type, from the schema. */
export function schemaExcerptFor(schema: any, beatType: string): Record<string, { type: string; description?: string; required?: boolean }> | undefined {
  const params = schema?.beatTypes?.[beatType]?.parameters;
  if (!params) return undefined;
  const out: Record<string, any> = {};
  for (const [name, def] of Object.entries<any>(params)) {
    out[name] = { type: def?.type, ...(def?.description ? { description: def.description } : {}), ...(def?.required ? { required: true } : {}) };
  }
  return out;
}

/**
 * The beats the model may edit and the beats it should see. Deliberately
 * small: the finding's beat, its neighbours in authoring order, the beats
 * that link to it, and (for a counter gate) everything that mentions the
 * counter. The whole story is never sent.
 */
export function contextBeatsFor(finding: GenerationFinding, story: any): { editable: string[]; visible: string[] } {
  const beats: any[] = story?.beats || [];
  const idx = beats.findIndex((b: any) => b?.id === finding.beatId);
  const editable = new Set<string>([finding.beatId]);
  const visible = new Set<string>([finding.beatId]);
  const add = (id: string | undefined, edit = false) => { if (!id || !beatById(story, id)) return; visible.add(id); if (edit) editable.add(id); };
  if (idx > 0) add(beats[idx - 1]?.id, true);
  if (idx >= 0 && idx < beats.length - 1) add(beats[idx + 1]?.id);
  for (const l of storyLinks(story)) {
    if (l.target === finding.beatId) add(l.source, true);
    if (l.source === finding.beatId) add(l.target);
  }
  if (finding.kind === 'unsatisfiable-threshold') {
    add(finding.targetId);
    const needle = `"${finding.counterName}"`;
    for (const b of beats) {
      if (b?.id !== finding.beatId && JSON.stringify(b?.parameters ?? {}).includes(needle)) add(b.id, true);
    }
  }
  if (finding.kind === 'unreachable-beat') {
    // Anything that names the lost scene in its prose is a likely place to link from.
    const name = (finding.beatName || '').toLowerCase();
    if (name.length >= 4) {
      for (const b of beats) {
        if (b?.id !== finding.beatId && JSON.stringify(b?.parameters ?? {}).toLowerCase().includes(name)) add(b.id, true);
      }
    }
  }
  return {
    editable: [...editable].slice(0, MAX_CONTEXT_BEATS),
    visible: [...visible].slice(0, MAX_CONTEXT_BEATS),
  };
}

export function buildFixPrompt(finding: GenerationFinding, ctx: FixRequestContext): { systemPrompt: string; userPrompt: string; editable: string[] } {
  const { editable, visible } = contextBeatsFor(finding, ctx.story);
  // Each shown beat carries its CURRENT outgoing links, whatever shape they
  // are stored in (beat-level connections, choices, condition targets…).
  // Without this the model reads a text beat's parameters, sees no
  // `connection`, and concludes it has no exit — then re-links it and
  // strands whatever it used to point at.
  const links = storyLinks(ctx.story);
  const shown = visible.map((id) => {
    const b = beatById(ctx.story, id);
    const outgoing = links.filter((l) => l.source === id).map((l) => ({ target: l.target, via: l.via, ...(l.path ? { path: l.path } : {}) }));
    return { id: b.id, name: b.name, type: b.type, parameters: b.parameters ?? {}, currentLinks: outgoing };
  });
  const types = [...new Set(shown.map((b) => b.type))];
  const schemaExcerpt: Record<string, any> = {};
  for (const t of types) { const ex = schemaExcerptFor(ctx.schema, t); if (ex) schemaExcerpt[t] = ex; }
  const allIds = (ctx.story.beats || []).map((b: any) => ({ id: b.id, name: b.name, type: b.type }));

  const systemPrompt = `You repair ONE structural problem in an interactive story authored in ASAPS (beats with parameters; links are beat ids stored in parameters).
Reply with JSON only, no prose, in exactly this shape:
{"edits":[{"beatId":"<id>","path":"<parameter path>","value":<json>,"why":"<one sentence>"}],"rationale":"<one or two sentences>"}

Rules:
- Edit ONLY beats listed under editableBeatIds. Never add or delete beats.
- "path" is a parameter path relative to the beat's parameters: e.g. "trueTarget", "connection.target", "choices[1].target", "value", "choices[0].effects".
- A beat's currentLinks lists where it points now (target + the path that holds it). For text-like beats with a single exit, that exit is "connection.target" — setting it REPLACES the current link, so if the beat must still reach its old target, chain through: A → new beat → old target.
- "value" replaces the value at that path. Link values must be existing beat ids from allBeatIds.
- Prefer the smallest edit that resolves the problem and keeps the author's intent. At most ${MAX_EDITS} edits.
- If no edit within these rules genuinely resolves the problem, reply {"edits":[],"rationale":"<why>"}.`;

  const userPrompt = JSON.stringify({
    problem: { ...finding },
    editableBeatIds: editable,
    beats: shown,
    parameterSchema: schemaExcerpt,
    allBeatIds: allIds,
    ...(ctx.story.variables ? { variables: ctx.story.variables } : {}),
  }, null, 1);
  return { systemPrompt, userPrompt, editable };
}

export type FixValidation =
  | { ok: true; suggestion: AIFixSuggestion }
  | { ok: false; reason: string; rationale?: string };

/**
 * The deterministic envelope. Parses the reply, checks every edit against
 * the allowed beats and paths, applies them to a CLONE of the story and
 * re-runs the analysis: the finding must be gone and nothing new may appear.
 */
export function validateAIFix(replyText: string, finding: GenerationFinding, ctx: FixRequestContext, editable: string[]): FixValidation {
  let parsed: any;
  try { parsed = parseJSONWithRepair(replyText); } catch { return { ok: false, reason: 'The model did not answer with JSON.' }; }
  const rationale: string = typeof parsed?.rationale === 'string' ? parsed.rationale : '';
  const rawEdits: any[] = Array.isArray(parsed?.edits) ? parsed.edits : [];
  if (rawEdits.length === 0) return { ok: false, reason: 'The model found no edit that resolves this within the rules.', rationale };
  if (rawEdits.length > MAX_EDITS) return { ok: false, reason: `The model proposed ${rawEdits.length} edits; at most ${MAX_EDITS} are allowed.`, rationale };

  const allowed = new Set(editable);
  const allIds = new Set<string>((ctx.story.beats || []).map((b: any) => b?.id));
  const clone = JSON.parse(JSON.stringify(ctx.story));
  const edits: FixProposal[] = [];
  const preview: AIFixSuggestion['preview'] = [];

  for (const e of rawEdits) {
    if (!e || typeof e.beatId !== 'string' || typeof e.path !== 'string') return { ok: false, reason: 'An edit was missing beatId or path.', rationale };
    if (!allowed.has(e.beatId)) return { ok: false, reason: `The model tried to edit "${e.beatId}", which is outside the beats it was allowed to touch.`, rationale };
    const beat = beatById(clone, e.beatId);
    if (!beat) return { ok: false, reason: `Beat "${e.beatId}" does not exist.`, rationale };
    if (/target|Target|connection\b/.test(e.path) && typeof e.value === 'string' && !allIds.has(e.value)) {
      return { ok: false, reason: `The edit points "${e.beatId}" at "${e.value}", which is not a beat in this story.`, rationale };
    }
    let plan;
    try { plan = planBeatEdit(beat, e.path, e.value); } catch { return { ok: false, reason: `"${e.path}" is not a valid parameter path.`, rationale }; }
    applyPlanToSerializedBeat(beat, plan);
    const before = plan.before;
    edits.push({
      id: `ai:${finding.id}:${edits.length}`, findingId: finding.id, kind: 'ai-edit', beatId: e.beatId, beatName: beat.name,
      path: e.path, value: e.value, description: typeof e.why === 'string' && e.why ? e.why : `Set ${e.path} on "${beat.name || beat.id}"`,
      confidence: 'review', source: 'ai', rationale,
    });
    preview.push({ beatId: e.beatId, beatName: beat.name, path: e.path, before, after: plan.after });
  }

  const before = new Set(analyzeStoryFindings(ctx.story).map((f) => f.id));
  const after = analyzeStoryFindings(clone);
  if (after.some((f) => f.id === finding.id)) return { ok: false, reason: 'The edits do not resolve the problem (it is still found after applying them).', rationale };
  const introduced = after.filter((f) => !before.has(f.id));
  if (introduced.length > 0) return { ok: false, reason: `The edits would introduce a new problem: ${introduced[0].message}`, rationale };

  return { ok: true, suggestion: { findingId: finding.id, rationale, edits, preview } };
}


/** End-to-end: prompt → model → envelope. `complete` is the configured provider (AIService.completeTurn). */
export async function requestAIFix(
  finding: GenerationFinding,
  ctx: FixRequestContext,
  complete: (systemPrompt: string, userPrompt: string, signal?: AbortSignal) => Promise<string>,
  signal?: AbortSignal,
): Promise<FixValidation> {
  const { systemPrompt, userPrompt, editable } = buildFixPrompt(finding, ctx);
  const reply = await complete(systemPrompt, userPrompt, signal);
  return validateAIFix(reply, finding, ctx, editable);
}
