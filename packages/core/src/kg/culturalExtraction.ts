// Cultural-semantic layer extraction.
//
// Provider-agnostic: the LLM call is INJECTED as a `generate` function, so this
// module is pure/testable and core stays decoupled from any AI SDK. The builder
// passes its configured AI service's text-completion as `generate`.
//
// Schema-grounded (see types.ts + docs/KG): descriptive seed types from the
// cultural-KG papers, a Nesterov contention model, and the value dimensions from
// the value-framework research. "Emerging, not prescribing": the model may
// invent a type (marked emergent) when no seed fits.

import {
  KGGraph,
  KGNode,
  KGEdge,
  CultureProfile,
  CULTURAL_SEED_TYPES,
  CULTURAL_EDGE_TYPES,
  CONTENTION_EDGE_TYPES,
  VALUE_DIMENSION_TYPES,
  ContentionInfo,
} from './types';

export interface CulturalBeatText {
  id: string;
  text: string;
}

export interface CulturalExtractionRequest {
  /** Per-beat English source text (one entry per beat that has content). */
  beats: CulturalBeatText[];
  /** The culture the story is set in (gives the model context). */
  profile: CultureProfile;
  projectId?: string;
  projectName?: string;
}

export type GenerateFn = (prompt: string) => Promise<string>;

export interface CulturalExtractionResult {
  /** Cultural-layer-only graph (merge with a systemic graph for display). */
  graph: KGGraph;
  raw: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** Build the extraction prompt. Pure — no side effects. */
export function buildCulturalExtractionPrompt(req: CulturalExtractionRequest): string {
  const seedList = CULTURAL_SEED_TYPES.join(', ');
  const valueList = VALUE_DIMENSION_TYPES.join(', ');
  const profileLines = req.profile.values
    .map((v) => `  - ${v.dimension}: ${v.label ?? v.position ?? '?'}`)
    .join('\n');

  const beatsBlock = req.beats
    .map((b) => `[${b.id}] ${b.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');

  return `You are a cultural analyst building a CULTURAL KNOWLEDGE GRAPH from an interactive narrative.
The narrative is set in the culture "${req.profile.label}". Its cultural profile:
${profileLines || '  (none provided)'}

TASK: Read the beats below (each prefixed with its [beat_id]) and extract the cultural elements the narrative assumes or depicts — social roles, family/kinship relations, norms, values, religious/belief elements, practices/rituals, institutions, places, material culture (food/dress/housing), language/naming, identity groups, emotional framings, and any culturally-held beliefs/stereotypes.

GUIDANCE:
- Prefer these SEED TYPES when one fits: ${seedList}.
- If none fits, INVENT a concise type and set "emergent": true. Do not force-fit.
- Anchor every node to the beat id(s) it appears in via "sourceBeatIds".
- "cultureBoundness": 0 (universal) to 1 (highly specific to this culture).
- Flag CONTENTION when an element is sensitive/contested or could read as offensive or stereotyping, or is tied to these value dimensions: ${valueList}. Use the "contention" object {contentious, reason, perspective}.
- Add "edges" for meaningful relations between cultural nodes (use "relatesTo"), and "${CONTENTION_EDGE_TYPES.assertsAbout}" when a belief is asserted about an identity group.

OUTPUT: STRICT JSON only, no prose, in this exact shape:
{
  "nodes": [
    {"type": "<seed-or-invented>", "label": "<short name>", "description": "<one line>",
     "sourceBeatIds": ["beat_x"], "cultureBoundness": 0.0,
     "emergent": false, "contention": {"contentious": false, "reason": "", "perspective": ""}}
  ],
  "edges": [
    {"type": "relatesTo", "source": "<node label>", "target": "<node label>"}
  ]
}

BEATS:
${beatsBlock}

Return ONLY the JSON object.`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Tolerant JSON extraction: strips code fences and finds the outer object. */
export function extractJSONObject(text: string): string | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return t.slice(start); // unbalanced — return best effort
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'node';

const SEED_SET = new Set<string>(CULTURAL_SEED_TYPES as readonly string[]);

interface ParsedResult {
  nodes: KGNode[];
  edges: KGEdge[];
  warnings: string[];
}

/**
 * Parse the LLM output into cultural KGNodes/KGEdges. Pure. Resolves edge
 * endpoints (given as node labels) to node ids; drops/normalizes bad entries
 * and records warnings rather than throwing.
 */
export function parseCulturalExtraction(raw: string, validBeatIds: Set<string>): ParsedResult {
  const warnings: string[] = [];
  const jsonStr = extractJSONObject(raw);
  if (!jsonStr) return { nodes: [], edges: [], warnings: ['No JSON object found in model output.'] };

  let data: { nodes?: unknown[]; edges?: unknown[] };
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    return { nodes: [], edges: [], warnings: [`JSON parse failed: ${(e as Error).message}`] };
  }

  const nodes = new Map<string, KGNode>();
  const labelToId = new Map<string, string>();

  for (const rawNode of data.nodes ?? []) {
    const n = rawNode as Record<string, unknown>;
    const label = typeof n.label === 'string' ? n.label.trim() : '';
    const type = typeof n.type === 'string' ? n.type.trim() : '';
    if (!label || !type) {
      warnings.push(`Skipped node missing label/type: ${JSON.stringify(n).slice(0, 80)}`);
      continue;
    }
    const id = `cult:${slug(label)}`;
    const sourceBeatIds = Array.isArray(n.sourceBeatIds)
      ? (n.sourceBeatIds as unknown[]).filter(
          (b): b is string => typeof b === 'string' && validBeatIds.has(b)
        )
      : [];
    const emergent = n.emergent === true || !SEED_SET.has(type);
    let contention: ContentionInfo | undefined;
    const c = n.contention as Record<string, unknown> | undefined;
    if (c && c.contentious === true) {
      contention = {
        contentious: true,
        reason: typeof c.reason === 'string' ? c.reason : undefined,
        perspective: typeof c.perspective === 'string' ? c.perspective : undefined,
      };
    }

    const existing = nodes.get(id);
    if (existing) {
      for (const b of sourceBeatIds)
        if (!existing.sourceBeatIds.includes(b)) existing.sourceBeatIds.push(b);
      continue;
    }
    nodes.set(id, {
      id,
      layer: 'cultural',
      type,
      label,
      sourceBeatIds,
      emergent,
      cultureBoundness:
        typeof n.cultureBoundness === 'number'
          ? Math.max(0, Math.min(1, n.cultureBoundness))
          : undefined,
      contention,
      props: typeof n.description === 'string' ? { description: n.description } : undefined,
    });
    labelToId.set(label.toLowerCase(), id);
  }

  const edges: KGEdge[] = [];
  const seen = new Set<string>();
  for (const rawEdge of data.edges ?? []) {
    const e = rawEdge as Record<string, unknown>;
    const src = typeof e.source === 'string' ? labelToId.get(e.source.toLowerCase()) : undefined;
    const tgt = typeof e.target === 'string' ? labelToId.get(e.target.toLowerCase()) : undefined;
    if (!src || !tgt) {
      warnings.push(`Dropped edge with unresolved endpoint: ${JSON.stringify(e).slice(0, 80)}`);
      continue;
    }
    const type = typeof e.type === 'string' && e.type.trim() ? e.type.trim() : CULTURAL_EDGE_TYPES.relatesTo;
    const id = `ce:${type}:${src}->${tgt}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, type, source: src, target: tgt });
  }

  return { nodes: [...nodes.values()], edges, warnings };
}

// ---------------------------------------------------------------------------
// Orchestration + merge
// ---------------------------------------------------------------------------

/** Run extraction end-to-end with an injected LLM `generate` function. */
export async function extractCulturalLayer(
  req: CulturalExtractionRequest,
  generate: GenerateFn
): Promise<CulturalExtractionResult> {
  const prompt = buildCulturalExtractionPrompt(req);
  const raw = await generate(prompt);
  const validBeatIds = new Set(req.beats.map((b) => b.id));
  const { nodes, edges, warnings } = parseCulturalExtraction(raw, validBeatIds);

  // Sort for determinism of display.
  const sortedNodes = nodes.sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = edges.sort((a, b) => a.id.localeCompare(b.id));

  return {
    raw,
    warnings,
    graph: {
      nodes: sortedNodes,
      edges: sortedEdges,
      meta: {
        projectId: req.projectId,
        projectName: req.projectName,
        layers: ['cultural'],
        generatedFrom: 'cultural',
        counts: { nodes: sortedNodes.length, edges: sortedEdges.length },
      },
    },
  };
}

/**
 * Merge a cultural-layer graph onto a systemic graph, adding `assertedIn` edges
 * from each cultural node to the beat nodes it is anchored to (when present).
 */
export function mergeCulturalLayer(systemic: KGGraph, cultural: KGGraph): KGGraph {
  const beatNodeIds = new Set(
    systemic.nodes.filter((n) => n.type === 'Beat').map((n) => n.id)
  );

  const anchorEdges: KGEdge[] = [];
  for (const cn of cultural.nodes) {
    for (const beatId of cn.sourceBeatIds) {
      const target = `beat:${beatId}`;
      if (!beatNodeIds.has(target)) continue;
      anchorEdges.push({
        id: `ce:${CULTURAL_EDGE_TYPES.assertedIn}:${cn.id}->${target}`,
        type: CULTURAL_EDGE_TYPES.assertedIn,
        source: cn.id,
        target,
      });
    }
  }

  const nodes = [...systemic.nodes, ...cultural.nodes];
  const edges = [...systemic.edges, ...cultural.edges, ...anchorEdges];
  return {
    nodes,
    edges,
    meta: {
      projectId: systemic.meta.projectId,
      projectName: systemic.meta.projectName,
      layers: ['systemic', 'cultural'],
      generatedFrom: 'combined',
      counts: { nodes: nodes.length, edges: edges.length },
    },
  };
}
