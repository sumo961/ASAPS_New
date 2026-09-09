import { describe, it, expect } from 'vitest';
import { appendAIEdits, coDesignerAppliedEntries, coDesignerDeclinedEntries, reviewProposalEntry, aiFixRejectedEntries, beatIdsOfProposal } from '../aiEditsLedger';

describe('aiEditsLedger', () => {
  it('appends stamped entries, keeping older ones', () => {
    const l1 = appendAIEdits(null, [{ source: 'co-designer', decision: 'accepted', summary: 'a', beatIds: ['b1'] }]);
    const l2 = appendAIEdits(l1, [{ source: 'ask-ai', decision: 'rejected', summary: 'b', beatIds: [] }]);
    expect(l2.entries.map(e => e.summary)).toEqual(['a', 'b']);
    expect(l2.entries[0].id).not.toBe(l2.entries[1].id);
    expect(l2.entries[1].at).toMatch(/^\d{4}-/);
    expect(l1.entries).toHaveLength(1); // immutable
  });
  it('maps Co-Designer proposals to entries with apply outcomes, and declined ones as rejected', () => {
    const proposals: any[] = [
      { kind: 'updateParams', beatId: 'beat_p1_con1', params: { question: 'x' } },
      { kind: 'addBeat', beatType: 'infoText', name: 'Intro', connectFrom: 'beat_0', connectTo: 'beat_1' },
      { kind: 'updateCharacter', characterId: 'lumi', updates: { description: 'y' } },
    ];
    const results = [{ index: 0, ok: true, detail: 'Updated question' }, { index: 1, ok: false, detail: 'Unknown beat type' }];
    const e = coDesignerAppliedEntries(proposals, results, 'Intros');
    expect(e.map(x => x.decision)).toEqual(['accepted', 'failed', 'accepted']);
    expect(e[0]).toMatchObject({ source: 'co-designer', batch: 'Intros', beatIds: ['beat_p1_con1'], detail: 'Updated question' });
    expect(beatIdsOfProposal(proposals[1])).toEqual(['beat_0', 'beat_1']);
    expect(beatIdsOfProposal(proposals[2])).toEqual([]);
    expect(coDesignerDeclinedEntries([proposals[0]], 'Intros')[0]).toMatchObject({ decision: 'rejected', detail: 'Not selected by the author' });
  });
  it('maps review proposals by their source, and rejected Ask-AI suggestions per edit', () => {
    const det: any = { id: 'fix:1', findingId: 'f1', kind: 'retarget', beatId: 'b2', path: 'choices[1].target', value: 'b9', description: 'Point at b9', confidence: 'safe' };
    const ai: any = { ...det, id: 'ai:f2:0', findingId: 'f2', kind: 'ai-edit', source: 'ai' };
    expect(reviewProposalEntry(det, 'accepted')).toMatchObject({ source: 'generator-review', batch: 'f1', beatIds: ['b2'] });
    expect(reviewProposalEntry(ai, 'skipped')).toMatchObject({ source: 'ask-ai', decision: 'skipped' });
    expect(aiFixRejectedEntries({ findingId: 'f2', rationale: 'r', edits: [ai], preview: [] })[0]).toMatchObject({ source: 'ask-ai', decision: 'rejected', batch: 'f2' });
  });
});
