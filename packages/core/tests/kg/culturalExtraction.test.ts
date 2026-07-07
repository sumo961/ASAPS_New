import { describe, it, expect } from 'vitest';
import {
  buildCulturalExtractionPrompt,
  parseCulturalExtraction,
  extractCulturalLayer,
  mergeCulturalLayer,
  extractJSONObject,
  buildSystemicGraph,
  SRI_LANKA_PROFILE,
  CulturalExtractionRequest,
} from '../../src/kg';

const req: CulturalExtractionRequest = {
  profile: SRI_LANKA_PROFILE,
  projectName: 'test',
  beats: [
    { id: 'beat_1', text: 'The class teacher calls you about your child.' },
    { id: 'beat_2', text: 'You worry what the neighbours and the temple will say.' },
  ],
};

// A realistic model reply (with code fence + a dash of prose to test tolerance).
const MODEL_REPLY = `Here is the graph:
\`\`\`json
{
  "nodes": [
    {"type": "Institution", "label": "School", "description": "the child's school",
     "sourceBeatIds": ["beat_1"], "cultureBoundness": 0.2, "emergent": false,
     "contention": {"contentious": false}},
    {"type": "Religion", "label": "Buddhist temple", "description": "local temple",
     "sourceBeatIds": ["beat_2"], "cultureBoundness": 0.8},
    {"type": "FaceConcern", "label": "Fear of community judgement",
     "sourceBeatIds": ["beat_2"], "cultureBoundness": 0.7, "emergent": true,
     "contention": {"contentious": true, "reason": "honor/face pressure", "perspective": "parent"}}
  ],
  "edges": [
    {"type": "relatesTo", "source": "Buddhist temple", "target": "Fear of community judgement"},
    {"type": "relatesTo", "source": "Nonexistent", "target": "School"}
  ]
}
\`\`\``;

describe('buildCulturalExtractionPrompt', () => {
  it('includes the profile, beat ids, seed types and strict-JSON instruction', () => {
    const p = buildCulturalExtractionPrompt(req);
    expect(p).toContain('Sri Lanka');
    expect(p).toContain('[beat_1]');
    expect(p).toContain('Religion'); // a seed type
    expect(p).toContain('STRICT JSON');
    expect(p).toContain('HonorFaceDignity'); // a value dimension surfaced
  });
});

describe('extractJSONObject', () => {
  it('strips code fences and returns the balanced object', () => {
    const s = extractJSONObject(MODEL_REPLY);
    expect(s).toBeTruthy();
    expect(() => JSON.parse(s!)).not.toThrow();
  });
  it('returns null when there is no object', () => {
    expect(extractJSONObject('no json here')).toBeNull();
  });
});

describe('parseCulturalExtraction', () => {
  const { nodes, edges, warnings } = parseCulturalExtraction(
    MODEL_REPLY,
    new Set(['beat_1', 'beat_2'])
  );

  it('produces cultural nodes anchored to valid beats', () => {
    expect(nodes.length).toBe(3);
    expect(nodes.every((n) => n.layer === 'cultural')).toBe(true);
    const temple = nodes.find((n) => n.label === 'Buddhist temple');
    expect(temple?.sourceBeatIds).toEqual(['beat_2']);
    expect(temple?.cultureBoundness).toBe(0.8);
  });

  it('marks non-seed types emergent and keeps contention flags', () => {
    const face = nodes.find((n) => n.type === 'FaceConcern');
    expect(face?.emergent).toBe(true);
    expect(face?.contention?.contentious).toBe(true);
    expect(face?.contention?.perspective).toBe('parent');
    // A seed type stays non-emergent.
    expect(nodes.find((n) => n.label === 'School')?.emergent).toBe(false);
  });

  it('resolves edge endpoints by label and drops unresolved ones with a warning', () => {
    expect(edges.length).toBe(1); // the "Nonexistent" edge is dropped
    expect(edges[0].source).toBe('cult:buddhist-temple');
    expect(warnings.some((w) => /unresolved endpoint/.test(w))).toBe(true);
  });

  it('ignores beat ids not in the project', () => {
    const r = parseCulturalExtraction(
      '{"nodes":[{"type":"Place","label":"X","sourceBeatIds":["beat_999"]}]}',
      new Set(['beat_1'])
    );
    expect(r.nodes[0].sourceBeatIds).toEqual([]);
  });
});

describe('extractCulturalLayer (injected generate)', () => {
  it('runs end-to-end with a mock generator and returns a cultural graph', async () => {
    const generate = async () => MODEL_REPLY;
    const result = await extractCulturalLayer(req, generate);
    expect(result.graph.meta.generatedFrom).toBe('cultural');
    expect(result.graph.meta.counts.nodes).toBe(3);
    expect(result.raw).toBe(MODEL_REPLY);
  });

  it('degrades gracefully on non-JSON output', async () => {
    const result = await extractCulturalLayer(req, async () => 'I cannot help with that.');
    expect(result.graph.nodes).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('mergeCulturalLayer', () => {
  it('adds assertedIn edges from cultural nodes to their anchor beats', async () => {
    const systemic = buildSystemicGraph({
      beats: [
        { id: 'beat_1', type: 'infoText', name: 'B1' },
        { id: 'beat_2', type: 'infoText', name: 'B2' },
      ],
    });
    const cultural = (await extractCulturalLayer(req, async () => MODEL_REPLY)).graph;
    const merged = mergeCulturalLayer(systemic, cultural);

    expect(merged.meta.generatedFrom).toBe('combined');
    expect(merged.meta.layers).toEqual(['systemic', 'cultural']);
    const anchors = merged.edges.filter((e) => e.type === 'assertedIn');
    expect(anchors.length).toBeGreaterThan(0);
    // Every anchor edge targets an existing beat node.
    const beatIds = new Set(merged.nodes.filter((n) => n.type === 'Beat').map((n) => n.id));
    for (const e of anchors) expect(beatIds.has(e.target)).toBe(true);
  });
});
