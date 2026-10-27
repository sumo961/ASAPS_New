/**
 * Recently deleted beats (Birka group, 2026-10-27: ten dialog trees gone,
 * nothing kept them).
 */
import { describe, it, expect } from 'vitest';
import { DeletionWatch, recordDeletedBeats, listDeletedBeats, forgetDeletedBeats, purgeOldDeletedBeats, noteDeletion } from '../deletedBeats';
import { describeManyBeatsDelete } from '../confirmBeatDelete';

const tree = (id: string, name: string, text = 'Hello') => ({ id, type: 'dialogTree', name, parameters: { dialogTree: { text } }, connections: [] });

describe('DeletionWatch', () => {
  it('reports the beats a save no longer has, as they were last saved', () => {
    const watch = new DeletionWatch();
    watch.reset('p1', { beats: [tree('a', 'Q1'), tree('b', 'Free her now.')] });
    const edited = tree('b', 'Free her now.', 'Idun looks at you.');
    expect(watch.saved('p1', { beats: [tree('a', 'Q1'), edited] })).toEqual([]);
    edited.parameters.dialogTree.text = 'changed on screen after the save';
    const gone = watch.saved('p1', { beats: [tree('a', 'Q1')] });
    expect(gone.map((b) => b.id)).toEqual(['b']);
    expect(gone[0].parameters.dialogTree.text).toBe('Idun looks at you.');
  });

  it('another project is a new baseline, not a deletion', () => {
    const watch = new DeletionWatch();
    watch.reset('p1', { beats: [tree('a', 'Q1')] });
    expect(watch.saved('p2', { beats: [] })).toEqual([]);
  });
});

describe('the store', () => {
  it('keeps deleted beats with what removed them, newest first, and forgets them', async () => {
    noteDeletion(['t1', 't2'], 'Backspace key in the flowchart: 2 selected beats');
    await recordDeletedBeats({ id: 'birka', name: 'Birka' }, [tree('t1', 'Stay in Birka.'), tree('t2', 'Sail at dawn.')]);
    await recordDeletedBeats({ id: 'birka', name: 'Birka' }, [tree('t3', 'Q7')]);
    await recordDeletedBeats({ id: 'other', name: 'Other' }, [tree('x', 'X')]);
    const rows = await listDeletedBeats('birka');
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(['Stay in Birka.', 'Sail at dawn.', 'Q7']));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.beatId === 't1')?.cause).toBe('Backspace key in the flowchart: 2 selected beats');
    expect(rows.find((r) => r.beatId === 't3')?.cause).toBe('No longer in the project when it was saved');
    expect(rows[0].deletedAt).toBeGreaterThanOrEqual(rows[rows.length - 1].deletedAt);
    await forgetDeletedBeats(rows.filter((r) => r.beatId !== 't3').map((r) => r.key!));
    expect((await listDeletedBeats('birka')).map((r) => r.beatId)).toEqual(['t3']);
  });

  it('drops what is older than 30 days', async () => {
    await recordDeletedBeats({ id: 'old', name: 'Old' }, [tree('o', 'Old one')]);
    await purgeOldDeletedBeats(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await listDeletedBeats('old')).toEqual([]);
  });

  it('a more precise cause is not overwritten by the fallback', async () => {
    noteDeletion(['k'], 'Inspector ▸ Delete Beat');
    noteDeletion(['k'], 'Deleted', true);
    await recordDeletedBeats({ id: 'causes', name: 'C' }, [tree('k', 'K')]);
    expect((await listDeletedBeats('causes'))[0].cause).toBe('Inspector ▸ Delete Beat');
  });
});

describe('describeManyBeatsDelete', () => {
  it('names the kinds, the beats, and those out of view', () => {
    const beats = [...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, type: 'dialogTree', name: `Tree ${i}` })), { id: 'm', type: 'multiChoice', name: 'MultiChoice 339' }];
    const text = describeManyBeatsDelete(beats, 9, '2 links in 1 other beat point here and will break.');
    expect(text).toContain('10 Dialog Trees, 1 Multi Choice');
    expect(text).toContain('“Tree 0”');
    expect(text).toContain('and 3 more');
    expect(text).toContain('9 of them are outside the part of the flowchart you can see.');
    expect(text).toContain('will break');
  });
});
