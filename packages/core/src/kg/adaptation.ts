// Phase 3 — cultural adaptation. Given a project's cultural layer, a source
// profile and a target profile, produce per-beat ADAPTATION HINTS: what is
// culture-bound and won't transfer cleanly, why, and a concrete suggestion.
//
// Deliberately HINTS, not auto-rewrites: per the authorial-intent principle we
// assist at authoring time rather than silently overwriting the author's text.
// The hints are baked into a new derived project's beat notes by the builder.
//
// Provider-agnostic: the LLM call is injected as `generate`.

import { KGGraph, CultureProfile } from './types';
import { extractJSONObject, GenerateFn, CulturalBeatText } from './culturalExtraction';
import { compareProfiles } from './culturalComparison';

export type AdaptationSeverity = 'high' | 'medium' | 'low';

export interface AdaptationHint {
  beatId: string;
  /** The culture-bound element / concern in this beat. */
  concern: string;
  /** Why it needs attention moving source → target. */
  rationale: string;
  /** A concrete adaptation direction (NOT auto-applied). */
  suggestion: string;
  severity: AdaptationSeverity;
}

export interface AdaptationRequest {
  beats: CulturalBeatText[];
  /** The extracted source cultural layer (its contentious/bound nodes focus the work). */
  cultural: KGGraph;
  source: CultureProfile;
  target: CultureProfile;
  projectName?: string;
}

export interface AdaptationResult {
  hints: AdaptationHint[];
  summary: string;
  raw: string;
  warnings: string[];
}

const SEVERITIES = new Set<string>(['high', 'medium', 'low']);

/** Build the adaptation prompt. Pure. */
export function buildAdaptationPrompt(req: AdaptationRequest): string {
  const gaps = compareProfiles(req.source, req.target)
    .filter((g) => g.delta === undefined || g.delta > 0.3)
    .slice(0, 6)
    .map((g) => `  - ${g.dimension}: ${g.sourceLabel ?? '?'} → ${g.targetLabel ?? '?'}`)
    .join('\n');

  const bound = req.cultural.nodes
    .filter((n) => n.layer === 'cultural' && (n.contention?.contentious || (n.cultureBoundness ?? 0) >= 0.5))
    .slice(0, 40)
    .map((n) => `  - ${n.label}${n.contention?.contentious ? ' (contentious)' : ''}`)
    .join('\n');

  const beatsBlock = req.beats
    .map((b) => `[${b.id}] ${b.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');

  return `You are helping a narrative author ADAPT an interactive story from one culture to another. You do NOT rewrite the story — you produce concrete HINTS about what needs cultural adaptation.

FROM culture: ${req.source.label}
TO culture: ${req.target.label}

Largest value-dimension gaps to bridge:
${gaps || '  (none provided)'}

Culture-bound / contentious elements detected in the source:
${bound || '  (none provided)'}

For EACH beat below where something is culture-bound and would NOT transfer cleanly to ${req.target.label}, give a hint: the specific concern, why it matters for the target culture, and a concrete adaptation suggestion. Skip beats that need no change. Be specific and respectful; do not stereotype.

OUTPUT: STRICT JSON only:
{
  "summary": "<2-3 sentence overview of the adaptation challenge>",
  "hints": [
    {"beatId": "beat_x", "concern": "<what>", "rationale": "<why for target>",
     "suggestion": "<concrete direction>", "severity": "high|medium|low"}
  ]
}

BEATS:
${beatsBlock}

Return ONLY the JSON object.`;
}

/** Parse adaptation hints from model output. Pure. */
export function parseAdaptationHints(
  raw: string,
  validBeatIds: Set<string>
): { hints: AdaptationHint[]; summary: string; warnings: string[] } {
  const warnings: string[] = [];
  const json = extractJSONObject(raw);
  if (!json) return { hints: [], summary: '', warnings: ['No JSON object found in model output.'] };

  let data: { summary?: unknown; hints?: unknown[] };
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { hints: [], summary: '', warnings: [`JSON parse failed: ${(e as Error).message}`] };
  }

  const hints: AdaptationHint[] = [];
  for (const rawH of data.hints ?? []) {
    const h = rawH as Record<string, unknown>;
    const beatId = typeof h.beatId === 'string' ? h.beatId : '';
    if (!validBeatIds.has(beatId)) {
      warnings.push(`Dropped hint for unknown beat: ${beatId || '(missing)'}`);
      continue;
    }
    const concern = typeof h.concern === 'string' ? h.concern.trim() : '';
    const suggestion = typeof h.suggestion === 'string' ? h.suggestion.trim() : '';
    if (!concern || !suggestion) {
      warnings.push(`Skipped incomplete hint on ${beatId}`);
      continue;
    }
    const severity = (typeof h.severity === 'string' && SEVERITIES.has(h.severity)
      ? h.severity
      : 'medium') as AdaptationSeverity;
    hints.push({
      beatId,
      concern,
      suggestion,
      rationale: typeof h.rationale === 'string' ? h.rationale.trim() : '',
      severity,
    });
  }

  return { hints, summary: typeof data.summary === 'string' ? data.summary : '', warnings };
}

/** Run adaptation-hint generation end-to-end with an injected LLM `generate`. */
export async function generateAdaptationHints(
  req: AdaptationRequest,
  generate: GenerateFn
): Promise<AdaptationResult> {
  const raw = await generate(buildAdaptationPrompt(req));
  const validBeatIds = new Set(req.beats.map((b) => b.id));
  const { hints, summary, warnings } = parseAdaptationHints(raw, validBeatIds);
  // Stable order: by beat id then severity.
  const order: Record<AdaptationSeverity, number> = { high: 0, medium: 1, low: 2 };
  hints.sort((a, b) => a.beatId.localeCompare(b.beatId) || order[a.severity] - order[b.severity]);
  return { hints, summary, raw, warnings };
}

const SEV_LABEL: Record<AdaptationSeverity, string> = { high: 'HIGH', medium: 'MED', low: 'LOW' };

/**
 * Format hints into an author-facing notes block per beat, for annotating a
 * derived project. Pure. Returns beatId → notes string.
 */
export function hintsToBeatNotes(
  hints: AdaptationHint[],
  targetLabel: string
): Map<string, string> {
  const byBeat = new Map<string, AdaptationHint[]>();
  for (const h of hints) {
    const list = byBeat.get(h.beatId) ?? [];
    list.push(h);
    byBeat.set(h.beatId, list);
  }
  const notes = new Map<string, string>();
  for (const [beatId, list] of byBeat) {
    const lines = list.map(
      (h) => `• [${SEV_LABEL[h.severity]}] ${h.concern} — ${h.suggestion}`
    );
    notes.set(beatId, `⚠ Cultural adaptation needed (→ ${targetLabel}):\n${lines.join('\n')}`);
  }
  return notes;
}
