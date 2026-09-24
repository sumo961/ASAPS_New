/**
 * Co-Designer and story state: it must know story counters need no
 * declaration (and see the ones in use), be able to declare a variable,
 * know every beat type (it didn't know randomTarget), and write ${name}.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildStoryDigest } from '../storyDigest';
import { applyChangeProposals } from '../applyChangeProposals';
import { extractProposalsFromReply } from '../../components/ai/codesigner/proposalParsing';
import { buildCoDesignerSystemPrompt } from '../../components/ai/codesigner/systemPrompt';

describe('digest: story state in use', () => {
  it('lists story counters and undeclared variables, not character counters', () => {
    const digest = buildStoryDigest({
      beats: [
        { id: 'b1', type: 'multiChoice', parameters: { choices: [{ id: 'a', text: 'A', target: 'b2', effects: [{ type: 'incrementCounter', target: 'Tension' }, { type: 'incrementCounter', target: 'trust', character: 'karin' }, { type: 'setVariable', target: 'route', value: 'x' }], conditions: [{ type: 'counter', variableName: 'Clock', operator: '>', value: 0 }] }] } },
        { id: 'b2', type: 'setVariable', parameters: { type: 'counter', name: 'Prep', operation: 'set', value: 0 } },
      ],
      characters: [{ id: 'karin', counters: [{ name: 'trust' }] }],
      variables: [{ name: 'caseName' }],
    });
    expect(digest).toContain('VARIABLES (declared in Project Settings): caseName');
    expect(digest).toContain('VARIABLES used but not declared: route');
    expect(digest).toContain('STORY COUNTERS (story-wide, no declaration needed): Clock, Prep, Tension');
  });
});

describe('defineVariable', () => {
  it('parses a usable name and declares it once', () => {
    const out = extractProposalsFromReply('x\n```asaps-proposals\n' + JSON.stringify({ title: 't', proposals: [
      { kind: 'defineVariable', name: 'caseVariant', defaultValue: 'A' },
      { kind: 'defineVariable', name: 'case variant', defaultValue: 'A' },
    ] }) + '\n```');
    expect(out.proposalSet?.proposals).toHaveLength(1);
    expect(out.problems?.[0]).toMatch(/not a usable name/);
    const declared = new Set<string>();
    const ctx = { beats: [], updateBeat: vi.fn(), addBeat: vi.fn(), connectBeats: vi.fn(),
      defineVariable: vi.fn((v: { name: string }) => (declared.has(v.name) ? false : (declared.add(v.name), true))) };
    const p = out.proposalSet!.proposals;
    const res = applyChangeProposals([...p, ...p], ctx as any);
    expect(res[0]).toMatchObject({ ok: true, detail: expect.stringContaining('Declared story variable caseVariant') });
    expect(res[1].detail).toMatch(/already exists/);
  });
});

describe('Co-Designer prompt', () => {
  it('knows every beat type, story-state rules and the ${name} placeholder', () => {
    const prompt = buildCoDesignerSystemPrompt({ digest: 'x', capturedAt: 0 } as any, { beatContentToolAvailable: true });
    expect(prompt).toMatch(/- randomTarget \("Random Target", invisible\)/);
    expect(prompt).toContain('need NO declaration');
    expect(prompt).toContain('${Clock}');
    expect(prompt).toContain('never {name}');
    expect(prompt).toContain('get_beat_type_schema');
  });
});
