/**
 * Co-Designer on random branches and link effects: branches are addressable
 * (branch_1…), a linear beat's link can be given effects, and wiring inside
 * an updateParams patch is checked like any other wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import { listWiringSites, setSiteField, addOption } from '../choiceWiring';
import { applyChangeProposals } from '../applyChangeProposals';
import { extractProposalsFromReply } from '../../components/ai/codesigner/proposalParsing';
import { buildStoryDigest } from '../storyDigest';

const reply = (proposals: unknown[]) => 'x\n```asaps-proposals\n' + JSON.stringify({ title: 't', proposals }) + '\n```';

describe('random branches as wiring sites', () => {
  it('lists bare ids and branch objects as branch_N and sets their effects', () => {
    const params = { choices: ['caseA', { target: 'caseB', weight: 2 }] };
    expect(listWiringSites(params).map((s) => `${s.id}→${s.target}`)).toEqual(['branch_1→caseA', 'branch_2→caseB']);
    const r = setSiteField(params, 'branch_1', 'effects', [{ type: 'setVariable', target: 'caseVariant', value: 'A' }]);
    expect(r.ok && (r.parametersPatch as any).choices).toEqual([
      { target: 'caseA', effects: [{ type: 'setVariable', target: 'caseVariant', value: 'A' }] },
      { target: 'caseB', weight: 2 },
    ]);
    expect(setSiteField(params, 'branch_1', 'conditions', [])).toMatchObject({ ok: false });
    expect(setSiteField(params, 'branch_1', 'text', 'x')).toMatchObject({ ok: false });
    expect(addOption(params, { text: 'x', target: 'y' })).toMatchObject({ ok: false, problem: expect.stringContaining('random branch list') });
  });

  it('shows branches and link effects in the digest', () => {
    const digest = buildStoryDigest({ beats: [
      { id: 'r', type: 'randomTarget', parameters: { choices: [{ target: 'caseA', effects: [{ type: 'setVariable', target: 'caseVariant', value: 'A' }] }, { target: 'caseB', weight: 3 }] } },
      { id: 'i', type: 'infoText', parameters: { text: 'Brief' }, getConnections: () => [{ targetId: 'r', effects: [{ type: 'setCounter', target: 'Clock', value: 240 }] }] as any },
    ] });
    expect(digest).toContain('random branch_1 → caseA — does set caseVariant = "A"');
    expect(digest).toContain('random branch_2 "weight 3" → caseB');
    expect(digest).toContain('continue → r — does Clock = 240');
  });
});

describe('setLinkEffects', () => {
  const linear = (connections: any[]) => ({ id: 'i', type: 'infoText', name: 'Briefing', getParameters: () => ({ text: 'x' }), toJSON: () => ({ id: 'i', connections }) });

  it('sets effects on the only link, through the undoable update', () => {
    const ctx = { beats: [linear([{ targetId: 'n', label: '' }]), { id: 'n' }], updateBeat: vi.fn(), addBeat: vi.fn(), connectBeats: vi.fn() };
    const res = applyChangeProposals([{ kind: 'setLinkEffects', beatId: 'i', effects: [{ type: 'setCounter', target: 'Clock', value: 240 }] }], ctx as any);
    expect(res[0]).toMatchObject({ ok: true, detail: 'Leaving Briefing → n now does: Clock = 240' });
    expect(ctx.updateBeat).toHaveBeenCalledWith('i', { connections: [{ targetId: 'n', label: '', effects: [{ type: 'setCounter', target: 'Clock', value: 240 }] }] });
  });

  it('asks which link when there are several, and refuses beats whose exits are options', () => {
    const multi = { beats: [linear([{ targetId: 'a' }, { targetId: 'b' }])], updateBeat: vi.fn(), addBeat: vi.fn(), connectBeats: vi.fn() };
    expect(applyChangeProposals([{ kind: 'setLinkEffects', beatId: 'i', effects: [] }], multi as any)[0].detail).toMatch(/say which with targetId \(a, b\)/);
    const dialog = { beats: [{ id: 'd', type: 'dialogTree', getParameters: () => ({ dialogTree: { id: 'n0', choices: [{ id: 'c', text: 'x', target: 'a' }] } }), toJSON: () => ({ connections: [{ targetId: 'a' }] }) }], updateBeat: vi.fn(), addBeat: vi.fn(), connectBeats: vi.fn() };
    expect(applyChangeProposals([{ kind: 'setLinkEffects', beatId: 'd', effects: [] }], dialog as any)[0]).toMatchObject({ ok: false, detail: expect.stringContaining('use setChoiceEffects') });
  });
});

describe('updateParams wiring checks', () => {
  it('refuses a random branch effect the engine would ignore', () => {
    const out = extractProposalsFromReply(reply([
      { kind: 'updateParams', beatId: 'r', params: { choices: ['a', { target: 'b', effects: [{ type: 'addSentiment', target: 'karin', strengthDelta: 0.2 }] }] } },
    ]));
    expect(out.proposalSet).toBeNull();
    expect(out.problems?.[0]).toMatch(/addSentiment needs sentimentTarget/);
  });
});
