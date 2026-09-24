/**
 * Co-Designer wiring: effects / conditions on one option and a beat's entry
 * gate — parsing (engine-faithful validation), locating options across
 * choices / props / hotspots / nested dialog, applying through the undoable
 * update path, and showing the wiring in the digest.
 */
import { describe, it, expect, vi } from 'vitest';
import { EFFECT_TYPES } from '@asaps/core';
import { applyChangeProposals, type ApplyContext } from '../applyChangeProposals';
import { extractProposalsFromReply } from '../../components/ai/codesigner/proposalParsing';
import { listWiringSites, setSiteField } from '../choiceWiring';
import { normalizeEffect, normalizeCondition, EFFECT_SPECS, wiringPromptReference } from '../wiringVocabulary';
import { buildStoryDigest } from '../storyDigest';

const reply = (proposals: unknown[]) =>
  `ok\n\`\`\`asaps-proposals\n${JSON.stringify({ title: 't', proposals })}\n\`\`\``;

const dialogParams = () => ({
  dialogTree: {
    id: 'n0', speaker: 'Elena', text: 'Well?',
    choices: [
      { id: 'c1', text: 'Trust me', dialogNode: { id: 'n1', speaker: 'Elena', text: 'Fine.', choices: [{ id: 'c1a', text: 'Go', target: 'b9' }] } },
      { id: 'c2', text: 'Leave', target: 'b8' },
    ],
  },
});

function ctx(beats: any[], characters: any[] = []): ApplyContext & { updateBeat: ReturnType<typeof vi.fn> } {
  return {
    beats,
    characters,
    updateBeat: vi.fn(),
    addBeat: vi.fn(() => null),
    connectBeats: vi.fn(),
  };
}

describe('wiring vocabulary', () => {
  it('describes every engine effect type', () => {
    expect(Object.keys(EFFECT_SPECS).sort()).toEqual([...EFFECT_TYPES].sort());
    for (const t of EFFECT_TYPES) expect(wiringPromptReference()).toContain(`- ${t}:`);
  });

  it('refuses effects the engine would ignore', () => {
    expect(normalizeEffect({ type: 'addSentiment', target: 'elena', sentimentTarget: 'player', strengthDelta: 0.2 }))
      .toMatchObject({ ok: false, problem: expect.stringContaining('sentimentEmotion') });
    expect(normalizeEffect({ type: 'fireEmotion', target: 'elena', emotion: 'fear', emotionDelta: 0 }))
      .toMatchObject({ ok: false, problem: expect.stringContaining('non-zero') });
    expect(normalizeEffect({ type: 'teleport', target: 'x' })).toMatchObject({ ok: false });
    expect(normalizeEffect({ type: 'incrementCounter', target: 'clues', value: '2', junk: 1 }))
      .toEqual({ ok: true, value: { type: 'incrementCounter', target: 'clues', value: 2 } });
  });

  it('validates conditions from the schema table, applying aliases', () => {
    expect(normalizeCondition({ type: 'counter', counter: 'clues', operator: '>=', value: 2 }))
      .toEqual({ ok: true, value: { type: 'counter', variableName: 'clues', operator: '>=', value: 2 } });
    expect(normalizeCondition({ type: 'mood', character: 'elena', operator: '>', value: 0 }))
      .toMatchObject({ ok: false, problem: expect.stringContaining('moodAxis') });
    expect(normalizeCondition({ type: 'variable', variableName: 'x', operator: '=~', value: 1 }))
      .toMatchObject({ ok: false });
  });
});

describe('choice wiring sites', () => {
  it('lists flat options and every dialog node / choice at any depth', () => {
    expect(listWiringSites({ choices: [{ id: 'a' }], props: [{ id: 'p' }], hotspots: [{ id: 'h' }] }).map(s => s.id))
      .toEqual(['a', 'p', 'h']);
    expect(listWiringSites(dialogParams()).map(s => `${s.kind}:${s.id}`))
      .toEqual(['dialogNode:n0', 'dialogChoice:c1', 'dialogNode:n1', 'dialogChoice:c1a', 'dialogChoice:c2']);
  });

  it('replaces one nested dialog choice immutably', () => {
    const params = dialogParams();
    const r = setSiteField(params, 'c1a', 'effects', [{ type: 'incrementCounter', target: 'clues' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tree = (r.parametersPatch as any).dialogTree;
    expect(tree.choices[0].dialogNode.choices[0].effects).toHaveLength(1);
    expect(tree.choices[1]).toBe(params.dialogTree.choices[1]);
    expect((params.dialogTree.choices[0].dialogNode.choices[0] as any).effects).toBeUndefined();
  });

  it('refuses unknown and ambiguous ids', () => {
    expect(setSiteField({ choices: [{ id: 'a' }] }, 'zz', 'effects', [])).toMatchObject({ ok: false, problem: expect.stringContaining('options: a') });
    expect(setSiteField({ choices: [{ id: 'a' }], props: [{ id: 'a' }] }, 'a', 'effects', [])).toMatchObject({ ok: false });
  });
});

describe('wiring proposals', () => {
  it('parses the three kinds and reports why a bad one was left out', () => {
    const out = extractProposalsFromReply(reply([
      { kind: 'setChoiceEffects', beatId: 'b1', choiceId: 'c2', effects: [{ type: 'incrementCounter', target: 'clues' }] },
      { kind: 'setChoiceConditions', beatId: 'b1', choiceId: 'c1', conditions: [{ type: 'inventory', item: 'key' }] },
      { kind: 'setRequirements', beatId: 'b2', requires: [{ condition: { type: 'visitedBeat', beatId: 'b1' }, explanation: 'x' }], requiresMode: 'any' },
      { kind: 'setChoiceEffects', beatId: 'b1', choiceId: 'c1', effects: [{ type: 'nudgeMood', target: 'elena' }] },
    ]));
    expect(out.proposalSet?.proposals.map(p => p.kind)).toEqual(['setChoiceEffects', 'setChoiceConditions', 'setRequirements']);
    expect(out.droppedCount).toBe(1);
    expect(out.problems?.[0]).toMatch(/nudgeMood needs a non-zero/);
  });

  it('two proposals on one beat both survive (batch overlay)', () => {
    const params = { choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] };
    const c = ctx([{ id: 'b1', name: 'Hall', getParameters: () => params }]);
    const res = applyChangeProposals([
      { kind: 'setChoiceEffects', beatId: 'b1', choiceId: 'a', effects: [{ type: 'incrementCounter', target: 'clues' }] },
      { kind: 'setChoiceConditions', beatId: 'b1', choiceId: 'b', conditions: [{ type: 'inventory', item: 'key' }] },
    ], c);
    expect(res.every(r => r.ok)).toBe(true);
    const second = c.updateBeat.mock.calls[1][1].parameters.choices;
    expect(second[0].effects).toEqual([{ type: 'incrementCounter', target: 'clues' }]);
    expect(second[1].conditions).toEqual([{ type: 'inventory', item: 'key' }]);
    expect(res[0].detail).toBe('Hall › "A": clues +1');
  });

  it('refuses unknown characters and writes to read-only counters', () => {
    const chars = [{ id: 'elena', counters: [{ name: 'trust', source: { kind: 'sentiment' } }] }];
    const c = ctx([{ id: 'b1', getParameters: () => ({ choices: [{ id: 'a' }] }) }], chars);
    const res = applyChangeProposals([
      { kind: 'setChoiceEffects', beatId: 'b1', choiceId: 'a', effects: [{ type: 'fireEmotion', target: 'marcus', emotion: 'fear', emotionDelta: 0.3 }] },
      { kind: 'setChoiceEffects', beatId: 'b1', choiceId: 'a', effects: [{ type: 'incrementCounter', target: 'trust', character: 'elena' }] },
    ], c);
    expect(res[0]).toMatchObject({ ok: false, detail: expect.stringContaining('no character "marcus"') });
    expect(res[1]).toMatchObject({ ok: false, detail: expect.stringContaining("can't be set") });
    expect(c.updateBeat).not.toHaveBeenCalled();
  });

  it('setRequirements writes the top-level gate and checks the fallback beat', () => {
    const c = ctx([{ id: 'b1', name: 'Vault' }, { id: 'b2' }]);
    const cond = { type: 'visitedBeat', beatId: 'b2' };
    const res = applyChangeProposals([
      { kind: 'setRequirements', beatId: 'b1', requires: [{ condition: cond, explanation: 'x', fallbackTarget: 'b2' }] },
      { kind: 'setRequirements', beatId: 'b1', requires: [{ condition: cond, explanation: 'x', fallbackTarget: 'nope' }] },
      { kind: 'setRequirements', beatId: 'b1', requires: [] },
    ], c);
    expect(c.updateBeat).toHaveBeenNthCalledWith(1, 'b1', { requires: [{ condition: cond, explanation: 'x', fallbackTarget: 'b2' }], requiresMode: 'all' });
    expect(res[1]).toMatchObject({ ok: false, detail: expect.stringContaining('"nope" not found') });
    expect(c.updateBeat).toHaveBeenNthCalledWith(2, 'b1', { requires: undefined, requiresMode: 'all' });
  });
});

describe('digest wiring', () => {
  it('shows options by id with conditions, effects and the entry gate', () => {
    const digest = buildStoryDigest({
      beats: [{
        id: 'b1', type: 'multiChoice',
        parameters: { text: 'Pick', choices: [
          { id: 'a', text: 'Open', target: 'b2', conditions: [{ type: 'inventory', item: 'key' }], effects: [{ type: 'incrementCounter', target: 'clues', value: 2 }] },
          { id: 'b', text: 'Wait' },
        ] },
        requires: [{ condition: { type: 'counter', variableName: 'clues', operator: '>=', value: 1 }, fallbackTarget: 'b0' }],
      }],
    });
    expect(digest).toContain('requires: clues >= 1 (else → b0)');
    expect(digest).toContain('choice a "Open" → b2 — if has key — does clues +2');
    expect(digest).toContain('choice b "Wait"');
  });
});
