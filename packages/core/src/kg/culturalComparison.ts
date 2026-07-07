// Comparison utilities: (1) value-dimension gap between a source and a target
// culture profile (drives adaptation), and (2) a diff between two cultural-layer
// graphs (drives the project-to-project comparison view). Both pure/testable.

import { KGGraph, KGNode, CultureProfile, ValueDimensionType } from './types';
import { extractJSONObject, GenerateFn } from './culturalExtraction';

// ---------------------------------------------------------------------------
// Profile gap
// ---------------------------------------------------------------------------

export interface ValueGap {
  dimension: ValueDimensionType;
  sourceLabel?: string;
  targetLabel?: string;
  sourcePos?: number;
  targetPos?: number;
  /** |targetPos - sourcePos| when both are numeric; undefined otherwise. */
  delta?: number;
}

/**
 * Compare a source and target culture profile dimension-by-dimension, sorted by
 * the size of the gap (biggest adaptation pressure first). Dimensions present in
 * only one profile are included with an undefined delta.
 */
export function compareProfiles(source: CultureProfile, target: CultureProfile): ValueGap[] {
  const byDim = (p: CultureProfile) => new Map(p.values.map((v) => [v.dimension, v]));
  const s = byDim(source);
  const t = byDim(target);
  const dims = new Set<ValueDimensionType>([...s.keys(), ...t.keys()]);

  const gaps: ValueGap[] = [];
  for (const dim of dims) {
    const sv = s.get(dim);
    const tv = t.get(dim);
    const delta =
      typeof sv?.position === 'number' && typeof tv?.position === 'number'
        ? Math.abs(tv.position - sv.position)
        : undefined;
    gaps.push({
      dimension: dim,
      sourceLabel: sv?.label,
      targetLabel: tv?.label,
      sourcePos: sv?.position,
      targetPos: tv?.position,
      delta,
    });
  }

  // Biggest gaps first; dimensions without a numeric delta sink to the bottom.
  return gaps.sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1));
}

// ---------------------------------------------------------------------------
// Cultural-graph diff
// ---------------------------------------------------------------------------

export interface CulturalDiff {
  /** Matched pairs (same normalized label) present in both graphs. */
  common: Array<{ a: KGNode; b: KGNode }>;
  /** Cultural nodes only in graph A. */
  onlyA: KGNode[];
  /** Cultural nodes only in graph B. */
  onlyB: KGNode[];
  counts: { common: number; onlyA: number; onlyB: number };
}

/** Normalize a label for matching: lowercase, strip punctuation, collapse space. */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const culturalNodes = (g: KGGraph) => g.nodes.filter((n) => n.layer === 'cultural');

/**
 * Diff two cultural-layer graphs by normalized label. Intended for comparing two
 * projects' cultural KGs (e.g. parallel cultural adaptations). Label-based so it
 * works across projects that do NOT share beat ids.
 */
export function compareCulturalGraphs(a: KGGraph, b: KGGraph): CulturalDiff {
  const aNodes = culturalNodes(a);
  const bNodes = culturalNodes(b);

  const bByLabel = new Map<string, KGNode>();
  for (const n of bNodes) {
    const key = normalizeLabel(n.label);
    if (!bByLabel.has(key)) bByLabel.set(key, n);
  }

  const common: Array<{ a: KGNode; b: KGNode }> = [];
  const onlyA: KGNode[] = [];
  const matchedB = new Set<string>();

  for (const n of aNodes) {
    const key = normalizeLabel(n.label);
    const match = bByLabel.get(key);
    if (match) {
      common.push({ a: n, b: match });
      matchedB.add(key);
    } else {
      onlyA.push(n);
    }
  }

  const onlyB = bNodes.filter((n) => !matchedB.has(normalizeLabel(n.label)));

  const sortByLabel = (x: KGNode, y: KGNode) => x.label.localeCompare(y.label);
  onlyA.sort(sortByLabel);
  onlyB.sort(sortByLabel);
  common.sort((x, y) => x.a.label.localeCompare(y.a.label));

  return {
    common,
    onlyA,
    onlyB,
    counts: { common: common.length, onlyA: onlyA.length, onlyB: onlyB.length },
  };
}

// ---------------------------------------------------------------------------
// Semantic alignment (LLM-judge) — handles paraphrase/synonymy that exact
// label matching misses (e.g. "Child's room" ↔ "Child's bedroom").
// ---------------------------------------------------------------------------

/** Build a prompt asking the model to align cultural concepts across two lists. Pure. */
export function buildAlignmentPrompt(aLabels: string[], bLabels: string[]): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
  return `You are aligning two lists of cultural concepts extracted from two versions of the same story (set in different cultures). Match concepts that refer to the SAME underlying thing even if worded differently (e.g. "Child's room" and "Child's bedroom" match; "Buddhist temple" and "Lutheran church" do NOT — different institutions).

LIST A:
${list(aLabels)}

LIST B:
${list(bLabels)}

Return ONLY STRICT JSON pairing each genuine match (omit concepts with no match):
{"pairs": [{"a": "<exact label from A>", "b": "<exact label from B>"}]}`;
}

/** Parse alignment pairs from model output. Pure. */
export function parseAlignment(raw: string): Array<{ a: string; b: string }> {
  const json = extractJSONObject(raw);
  if (!json) return [];
  try {
    const data = JSON.parse(json) as { pairs?: Array<{ a?: unknown; b?: unknown }> };
    return (data.pairs ?? [])
      .filter((p) => typeof p.a === 'string' && typeof p.b === 'string')
      .map((p) => ({ a: p.a as string, b: p.b as string }));
  } catch {
    return [];
  }
}

/**
 * Build a CulturalDiff from externally-computed alignment pairs (label↔label).
 * Unpaired cultural nodes fall into onlyA / onlyB. Pure.
 */
export function diffFromAlignment(
  a: KGGraph,
  b: KGGraph,
  pairs: Array<{ a: string; b: string }>
): CulturalDiff {
  const aNodes = culturalNodes(a);
  const bNodes = culturalNodes(b);
  const aByLabel = new Map(aNodes.map((n) => [normalizeLabel(n.label), n]));
  const bByLabel = new Map(bNodes.map((n) => [normalizeLabel(n.label), n]));

  const common: Array<{ a: KGNode; b: KGNode }> = [];
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  for (const p of pairs) {
    const ka = normalizeLabel(p.a);
    const kb = normalizeLabel(p.b);
    const an = aByLabel.get(ka);
    const bn = bByLabel.get(kb);
    if (an && bn && !usedA.has(ka) && !usedB.has(kb)) {
      common.push({ a: an, b: bn });
      usedA.add(ka);
      usedB.add(kb);
    }
  }

  const onlyA = aNodes.filter((n) => !usedA.has(normalizeLabel(n.label))).sort((x, y) => x.label.localeCompare(y.label));
  const onlyB = bNodes.filter((n) => !usedB.has(normalizeLabel(n.label))).sort((x, y) => x.label.localeCompare(y.label));
  common.sort((x, y) => x.a.label.localeCompare(y.a.label));

  return { common, onlyA, onlyB, counts: { common: common.length, onlyA: onlyA.length, onlyB: onlyB.length } };
}

/**
 * Semantic compare: align two cultural graphs via an injected LLM `generate`,
 * then diff. Falls back to exact-label {@link compareCulturalGraphs} if the
 * model returns no usable alignment.
 */
export async function compareCulturalGraphsSemantic(
  a: KGGraph,
  b: KGGraph,
  generate: GenerateFn
): Promise<CulturalDiff> {
  const aLabels = culturalNodes(a).map((n) => n.label);
  const bLabels = culturalNodes(b).map((n) => n.label);
  if (aLabels.length === 0 || bLabels.length === 0) return compareCulturalGraphs(a, b);
  try {
    const raw = await generate(buildAlignmentPrompt(aLabels, bLabels));
    const pairs = parseAlignment(raw);
    if (pairs.length === 0) return compareCulturalGraphs(a, b);
    return diffFromAlignment(a, b, pairs);
  } catch {
    return compareCulturalGraphs(a, b);
  }
}
