/**
 * Co-Designer structure edits: reword one option, add one option, and a new
 * side-by-side version of a whole beat (incoming links move, old one kept).
 */
import { describe, it, expect, vi } from 'vitest';
import { applyChangeProposals, type ApplyContext } from '../applyChangeProposals';
import { extractProposalsFromReply } from '../../components/ai/codesigner/proposalParsing';
import { addOption, ensureDialogIds } from '../choiceWiring';
import { redirectIncoming } from '../redirectIncoming';
import { storyLinks } from '../storyLinks';

const reply = (proposals: unknown[]) =>
  `ok\n\`\`\`asaps-proposals\n${JSON.stringify({ title: 't', proposals })}\n\`\`\``;

const tree = () => ({
  dialogTree: {
    id: 'n0', text: 'Well?',
    choices: [
      { id: 'c1', text: 'Trust me', effects: [{ type: 'incrementCounter', target: 'Tension', value: 1 }], dialogNode: { id: 'n1', text: 'Fine.', choices: [{ id: 'c1a', text: 'Go', target: 'b9' }] } },
      { id: 'c2', text: 'Leave', target: 'b8' },
    ],
  },
});

function beat(id: string, extra: Record<string, any> = {}, params: Record<string, any> = {}) {
  return { id, name: id.toUpperCase(), type: 'dialogTree', x: 0, y: 0, getParameters: () => params, toJSON: () => ({ id, parameters: params, ...extra }), ...extra };
}

function ctx(beats: any[]): ApplyContext & { updateBeat: ReturnType<typeof vi.fn>; addBeat: ReturnType<typeof vi.fn> } {
  return {
    beats,
    characters: [],
    updateBeat: vi.fn(),
    addBeat: vi.fn(() => ({ id: 'b_new' })),
    connectBeats: vi.fn(),
  };
}

describe('editChoiceText', () => {
  it('rewords one nested option in its own label field and keeps its wiring', () => {
    const params = tree();
    const c = ctx([beat('b1', {}, params)]);
    const res = applyChangeProposals([{ kind: 'editChoiceText', beatId: 'b1', choiceId: 'c1', text: 'Call now' }], c);
    expect(res[0].ok).toBe(true);
    const t = c.updateBeat.mock.calls[0][1].parameters.dialogTree;
    expect(t.choices[0]).toMatchObject({ text: 'Call now', effects: [{ type: 'incrementCounter', target: 'Tension', value: 1 }] });
    expect(t.choices[0].dialogNode).toBe(params.dialogTree.choices[0].dialogNode);
  });
});

describe('addChoice', () => {
  it('appends to the root, to a named node, or after a continuing choice', () => {
    const p = tree();
    const root = addOption(p, { text: 'New', target: 'b8' });
    expect(root.ok && (root.parametersPatch as any).dialogTree.choices).toHaveLength(3);
    const viaChoice = addOption(p, { id: 'x', text: 'Deeper', target: 'b9' }, 'c1');
    expect(viaChoice.ok && (viaChoice.parametersPatch as any).dialogTree.choices[0].dialogNode.choices.map((c: any) => c.id)).toEqual(['c1a', 'x']);
    expect(addOption(p, { text: 'x', target: 'b8' }, 'c2')).toMatchObject({ ok: false });
    expect(addOption({ props: [] }, { text: 'x', target: 'b8' })).toMatchObject({ ok: false, problem: expect.stringContaining('Visual Editor') });
  });

  it('refuses a missing target and needs target or dialogNode when parsed', () => {
    const out = extractProposalsFromReply(reply([
      { kind: 'addChoice', beatId: 'b1', choice: { text: 'Dangling' } },
      { kind: 'addChoice', beatId: 'b1', choice: { text: 'Go', target: 'ghost' } },
    ]));
    expect(out.problems?.[0]).toMatch(/needs a target beat or a dialogNode/);
    const c = ctx([beat('b1', {}, tree())]);
    const res = applyChangeProposals(out.proposalSet!.proposals, c);
    expect(res[0]).toMatchObject({ ok: false, detail: expect.stringContaining('"ghost" not found') });
  });
});

describe('replaceBeat', () => {
  it('parses a whole tree, fills missing ids and validates its wiring', () => {
    const ok = extractProposalsFromReply(reply([{ kind: 'replaceBeat', beatId: 'b1', parameters: { dialogTree: { text: 'Hi', choices: [{ text: 'A', target: 'b8' }] } } }]));
    const t = (ok.proposalSet!.proposals[0] as any).parameters.dialogTree;
    expect(t.id).toBeTruthy();
    expect(t.choices[0].id).toBeTruthy();
    const bad = extractProposalsFromReply(reply([{ kind: 'replaceBeat', beatId: 'b1', parameters: { dialogTree: { id: 'n', text: 'Hi', choices: [{ id: 'a', text: 'A', target: 'b8', effects: [{ type: 'fireEmotion', target: 'x', emotion: 'fear', emotionDelta: 0 }] }] } } }]));
    expect(bad.problems?.[0]).toMatch(/choice a: effects #1: fireEmotion needs a non-zero/);
  });

  it('adds the new version, moves every incoming link, keeps and marks the old one', () => {
    const start = beat('b0', { type: 'titleScreen', connections: [{ targetId: 'b1', label: 'Start' }] }, {});
    const menu = beat('b2', { type: 'multiChoice' }, { choices: [{ id: 'm1', text: 'Talk', target: 'b1' }, { id: 'm2', text: 'Skip', target: 'b8' }] });
    const gate = beat('b3', { type: 'conditionBeat', requires: [{ condition: { type: 'visitedBeat', beatId: 'b8' }, explanation: 'x', fallbackTarget: 'b1' }] }, { trueTarget: 'b1', falseTarget: 'b8' });
    const old = beat('b1', { requires: [{ condition: { type: 'visitedBeat', beatId: 'b0' }, explanation: 'g' }] }, tree());
    const c = ctx([start, old, menu, gate, beat('b8'), beat('b9')]);
    const res = applyChangeProposals([{
      kind: 'replaceBeat', beatId: 'b1',
      parameters: { dialogTree: { id: 'n0', text: 'Better', choices: [{ id: 'a', text: 'Again', target: 'b1' }, { id: 'b', text: 'Out', target: 'b9' }] } },
    }], c);
    expect(res[0].ok).toBe(true);
    expect(res[0].detail).toMatch(/4 links from 3 beats/);
    expect(c.addBeat).toHaveBeenCalledWith('dialogTree', { x: 0, y: 220 }, 'B1');

    const byBeat = new Map<string, any[]>();
    for (const [id, u] of c.updateBeat.mock.calls) byBeat.set(id, [...(byBeat.get(id) ?? []), u]);
    // New version: self-loop follows it, gate carried over.
    const created = byBeat.get('b_new')![0];
    expect(created.parameters.dialogTree.choices[0].target).toBe('b_new');
    expect(created.requires).toHaveLength(1);
    // Incoming links moved; unrelated ones untouched.
    expect(byBeat.get('b0')![0].connections[0].targetId).toBe('b_new');
    expect(byBeat.get('b2')![0].parameters.choices.map((x: any) => x.target)).toEqual(['b_new', 'b8']);
    expect(byBeat.get('b3')![0]).toMatchObject({ parameters: { trueTarget: 'b_new' }, requires: [{ fallbackTarget: 'b_new' }] });
    expect(byBeat.get('b1')).toEqual([{ name: 'B1 (replaced)' }]);
  });

  it('refuses the start beat and new versions linking to missing beats', () => {
    const c = ctx([beat('b1', {}, tree()), beat('b2', {}, tree())]);
    const res = applyChangeProposals([
      { kind: 'replaceBeat', beatId: 'b1', parameters: tree() },
      { kind: 'replaceBeat', beatId: 'b2', parameters: { dialogTree: { id: 'n', text: 'x', choices: [{ id: 'a', text: 'a', target: 'nowhere' }] } } },
    ], c);
    expect(res[0]).toMatchObject({ ok: false, detail: expect.stringContaining('where the story starts') });
    expect(res[1]).toMatchObject({ ok: false, detail: expect.stringContaining('nowhere') });
    expect(c.addBeat).not.toHaveBeenCalled();
  });
});

describe('redirectIncoming', () => {
  it('leaves no link storyLinks can see into the old beat', () => {
    const beats = [
      { id: 's', parameters: { dialogTree: { id: 'n', choices: [{ id: 'c', target: 'old', dialogNode: { id: 'm', next: 'old', choices: [] } }] }, hyperlinks: [{ word: 'w', targetBeatId: 'old' }], qrJumpTargets: ['old'], directions: [{ action: { exitTarget: 'old' } }] }, defaultTarget: 'old' },
      { id: 'r', parameters: { choices: ['old', 'x'], timerTarget: 'old', connection: { target: 'old' } } },
      { id: 'old', parameters: {} },
    ];
    const moved = redirectIncoming(beats, 'old', 'new');
    expect(moved.leftovers).toEqual([]);
    const after = beats.map((b) => {
      const u = moved.updates.find((x) => x.beatId === b.id)?.updates ?? {};
      return { ...b, ...u, parameters: { ...b.parameters, ...(u.parameters ?? {}) } };
    });
    expect(storyLinks({ beats: after }).filter((l) => l.target === 'old')).toEqual([]);
    expect(storyLinks({ beats: after }).filter((l) => l.target === 'new').length).toBe(moved.links);
  });

  it('ensureDialogIds keeps existing ids unique', () => {
    const t = ensureDialogIds({ id: 'n0', choices: [{ text: 'a' }, { id: 'c', text: 'b', dialogNode: { choices: [{ text: 'c' }] } }] });
    const ids = [t.id, t.choices[0].id, t.choices[1].id, t.choices[1].dialogNode.id, t.choices[1].dialogNode.choices[0].id];
    expect(new Set(ids).size).toBe(5);
  });
});
