import { describe, it, expect } from 'vitest';
import {
  buildAdaptationPrompt,
  parseAdaptationHints,
  generateAdaptationHints,
  hintsToBeatNotes,
  SWEDEN_PROFILE,
  SRI_LANKA_PROFILE,
  KGGraph,
  KGNode,
  AdaptationRequest,
} from '../../src/kg';

function cultural(label: string, contentious = false): KGNode {
  return {
    id: `cult:${label}`,
    layer: 'cultural',
    type: 'Norm',
    label,
    sourceBeatIds: ['beat_1'],
    contention: contentious ? { contentious: true } : undefined,
    cultureBoundness: contentious ? 0.9 : 0.2,
  };
}

const req: AdaptationRequest = {
  source: SRI_LANKA_PROFILE,
  target: SWEDEN_PROFILE,
  projectName: 'test',
  beats: [
    { id: 'beat_1', text: 'Same-sex relationships are banned by law here.' },
    { id: 'beat_2', text: 'You worry what the temple and neighbours will say.' },
  ],
  cultural: {
    nodes: [cultural('Same-sex relationships banned by law', true), cultural('Family honour', true)],
    edges: [],
    meta: { layers: ['cultural'], generatedFrom: 'cultural', counts: { nodes: 2, edges: 0 } },
  },
};

const REPLY = `\`\`\`json
{
  "summary": "Moving from a traditional to a secular self-expression culture eases legal and family-honour pressure.",
  "hints": [
    {"beatId": "beat_1", "concern": "Same-sex relationships banned by law", "rationale": "Sweden has legal equality",
     "suggestion": "Replace the legal-ban framing with acceptance; the tension is social, not legal", "severity": "high"},
    {"beatId": "beat_2", "concern": "Temple/neighbour judgement", "rationale": "Lower honour/face salience",
     "suggestion": "Shift the worry from community reputation to personal/individual concern", "severity": "medium"},
    {"beatId": "beat_999", "concern": "ghost", "suggestion": "drop me", "severity": "low"}
  ]
}
\`\`\``;

describe('buildAdaptationPrompt', () => {
  it('frames from→to, surfaces value gaps and culture-bound elements, demands JSON', () => {
    const p = buildAdaptationPrompt(req);
    expect(p).toContain('FROM culture: Sri Lanka');
    expect(p).toContain('TO culture: Sweden');
    expect(p).toMatch(/TraditionalVsSecularRational/);
    expect(p).toContain('Same-sex relationships banned by law (contentious)');
    expect(p).toContain('[beat_1]');
    expect(p).toContain('STRICT JSON');
  });
});

describe('parseAdaptationHints', () => {
  const { hints, summary, warnings } = parseAdaptationHints(REPLY, new Set(['beat_1', 'beat_2']));

  it('keeps valid hints with severity and drops unknown beats', () => {
    expect(hints.length).toBe(2);
    expect(hints.find((h) => h.beatId === 'beat_1')?.severity).toBe('high');
    expect(summary).toMatch(/traditional/i);
    expect(warnings.some((w) => /unknown beat/.test(w))).toBe(true);
  });

  it('defaults a bad severity to medium', () => {
    const r = parseAdaptationHints(
      '{"hints":[{"beatId":"beat_1","concern":"x","suggestion":"y","severity":"weird"}]}',
      new Set(['beat_1'])
    );
    expect(r.hints[0].severity).toBe('medium');
  });
});

describe('generateAdaptationHints (injected generate)', () => {
  it('runs end-to-end and sorts hints', async () => {
    const result = await generateAdaptationHints(req, async () => REPLY);
    expect(result.hints.length).toBe(2);
    expect(result.summary).toBeTruthy();
    expect(result.hints[0].beatId).toBe('beat_1');
  });

  it('degrades on non-JSON output', async () => {
    const result = await generateAdaptationHints(req, async () => 'cannot help');
    expect(result.hints).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('hintsToBeatNotes', () => {
  it('groups hints into a per-beat author notes block', async () => {
    const { hints } = await generateAdaptationHints(req, async () => REPLY);
    const notes = hintsToBeatNotes(hints, 'Sweden');
    expect(notes.size).toBe(2);
    const b1 = notes.get('beat_1')!;
    expect(b1).toContain('Cultural adaptation needed (→ Sweden)');
    expect(b1).toContain('[HIGH]');
    expect(b1).toContain('Same-sex relationships banned by law');
  });
});
