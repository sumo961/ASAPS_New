import { describe, it, expect } from 'vitest';
import {
  compareProfiles,
  compareCulturalGraphs,
  compareCulturalGraphsSemantic,
  buildAlignmentPrompt,
  parseAlignment,
  diffFromAlignment,
  normalizeLabel,
  SWEDEN_PROFILE,
  SRI_LANKA_PROFILE,
  KGGraph,
  KGNode,
} from '../../src/kg';

describe('compareProfiles', () => {
  const gaps = compareProfiles(SWEDEN_PROFILE, SRI_LANKA_PROFILE);

  it('returns one entry per dimension with source/target labels', () => {
    expect(gaps.length).toBe(SWEDEN_PROFILE.values.length);
    const sse = gaps.find((g) => g.dimension === 'SurvivalVsSelfExpression');
    expect(sse?.sourceLabel).toMatch(/self-expression/i);
    expect(sse?.targetLabel).toMatch(/survival/i);
  });

  it('sorts by gap size (biggest adaptation pressure first)', () => {
    const deltas = gaps.map((g) => g.delta ?? -1);
    for (let i = 1; i < deltas.length; i++) expect(deltas[i - 1]).toBeGreaterThanOrEqual(deltas[i]);
    // Sweden↔Sri Lanka should show a large Self-Expression gap (gay acceptance axis).
    const sse = gaps.find((g) => g.dimension === 'SurvivalVsSelfExpression');
    expect(sse!.delta!).toBeGreaterThan(1); // 0.95 vs -0.6
  });
});

function culturalNode(label: string, type = 'Practice'): KGNode {
  return { id: `cult:${label}`, layer: 'cultural', type, label, sourceBeatIds: [] };
}
function graph(nodes: KGNode[]): KGGraph {
  return {
    nodes,
    edges: [],
    meta: { layers: ['cultural'], generatedFrom: 'cultural', counts: { nodes: nodes.length, edges: 0 } },
  };
}

describe('normalizeLabel', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeLabel('Buddhist  Temple!')).toBe('buddhist temple');
    expect(normalizeLabel('Same-Sex relationships')).toBe('same sex relationships');
  });
});

describe('compareCulturalGraphs', () => {
  const a = graph([
    culturalNode('Buddhist temple', 'Religion'),
    culturalNode('Family honor', 'Value'),
    culturalNode('Class teacher', 'SocialRole'),
  ]);
  const b = graph([
    culturalNode('Buddhist Temple!', 'Religion'), // matches via normalization
    culturalNode('Lutheran church', 'Religion'),
  ]);

  const diff = compareCulturalGraphs(a, b);

  it('matches nodes by normalized label', () => {
    expect(diff.counts.common).toBe(1);
    expect(diff.common[0].a.label).toBe('Buddhist temple');
    expect(diff.common[0].b.label).toBe('Buddhist Temple!');
  });

  it('reports nodes unique to each side', () => {
    expect(diff.onlyA.map((n) => n.label)).toEqual(['Class teacher', 'Family honor']);
    expect(diff.onlyB.map((n) => n.label)).toEqual(['Lutheran church']);
  });

  it('ignores systemic nodes', () => {
    const withSystemic = graph([
      culturalNode('X'),
      { id: 'beat:1', layer: 'systemic', type: 'Beat', label: 'B', sourceBeatIds: ['1'] },
    ]);
    const d = compareCulturalGraphs(withSystemic, graph([]));
    expect(d.counts.onlyA).toBe(1); // only the cultural node counts
  });
});

describe('semantic alignment', () => {
  // Same concept worded differently — exact matching misses it, alignment catches it.
  const a = graph([culturalNode("Child's room"), culturalNode('Ayyo exclamation')]);
  const b = graph([culturalNode("Child's bedroom"), culturalNode('Conservative uncle')]);

  it('buildAlignmentPrompt lists both sets and demands strict JSON pairs', () => {
    const p = buildAlignmentPrompt(["Child's room"], ["Child's bedroom"]);
    expect(p).toContain("Child's room");
    expect(p).toContain("Child's bedroom");
    expect(p).toContain('"pairs"');
  });

  it('parseAlignment tolerates fences and bad entries', () => {
    const pairs = parseAlignment('```json\n{"pairs":[{"a":"X","b":"Y"},{"a":1}]}\n```');
    expect(pairs).toEqual([{ a: 'X', b: 'Y' }]);
  });

  it('diffFromAlignment pairs paraphrases as common, leaving the rest unique', () => {
    const diff = diffFromAlignment(a, b, [{ a: "Child's room", b: "Child's bedroom" }]);
    expect(diff.counts.common).toBe(1);
    expect(diff.onlyA.map((n) => n.label)).toEqual(['Ayyo exclamation']);
    expect(diff.onlyB.map((n) => n.label)).toEqual(['Conservative uncle']);
  });

  it('compareCulturalGraphsSemantic uses the LLM alignment when available', async () => {
    const generate = async () => '{"pairs":[{"a":"Child\\u2019s room","b":"Child\\u2019s bedroom"}]}';
    // Use straight apostrophes so the match is unambiguous in this test.
    const a2 = graph([culturalNode("Child's room")]);
    const b2 = graph([culturalNode("Child's bedroom")]);
    const diff = await compareCulturalGraphsSemantic(a2, b2, async () =>
      '{"pairs":[{"a":"Child\'s room","b":"Child\'s bedroom"}]}'
    );
    expect(diff.counts.common).toBe(1);
  });

  it('falls back to exact matching when alignment yields nothing', async () => {
    const diff = await compareCulturalGraphsSemantic(a, b, async () => 'no json');
    expect(diff.counts.common).toBe(0); // exact fallback finds no shared labels
  });
});
