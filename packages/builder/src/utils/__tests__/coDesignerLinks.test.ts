/**
 * A single-exit beat's link via the Co-Designer. Reproduces 2026-09-25: the
 * model wrote updateParams { connection: { target } } on infoText beats,
 * which landed in parameters (read by nothing) and reported "Updated
 * connection" — beat_4 kept a stray second link, the briefings stayed
 * dead ends. And addBeat connectFrom appended a link instead of replacing.
 */
import { describe, it, expect, vi } from 'vitest';
import { applyChangeProposals } from '../applyChangeProposals';

const beat = (id: string, type: string, connections: any[] = [], params: Record<string, unknown> = {}) =>
  ({ id, type, name: id, getParameters: () => params, toJSON: () => ({ id, type, parameters: params, connections }) });

function ctx(beats: any[]) {
  return { beats, updateBeat: vi.fn(), addBeat: vi.fn(() => ({ id: 'beat_new' })), connectBeats: vi.fn() };
}

describe('Co-Designer: single-exit links', () => {
  it('updateParams connection replaces the beat\'s exits instead of writing a dead parameter', () => {
    const c = ctx([beat('beat_4', 'infoText', [{ targetId: 'beat_3' }, { targetId: 'beat_73', label: 'Continue' }], { text: 'x' }), beat('beat_73', 'randomTarget'), beat('beat_3', 'dialogTree')]);
    const res = applyChangeProposals([{ kind: 'updateParams', beatId: 'beat_4', params: { connection: { target: 'beat_73', label: 'Continue' } } }], c as any);
    expect(res[0]).toMatchObject({ ok: true, detail: expect.stringContaining('exit → beat_73 (replaces its previous exit)') });
    expect(c.updateBeat).toHaveBeenCalledWith('beat_4', { connections: [{ targetId: 'beat_73', label: 'Continue' }] });
  });

  it('keeps other parameters, accepts a bare id, refuses missing targets and multi-exit beats', () => {
    const c = ctx([beat('b1', 'infoText'), beat('b2', 'infoText'), beat('d', 'dialogTree')]);
    const res = applyChangeProposals([
      { kind: 'updateParams', beatId: 'b1', params: { text: 'New', connection: 'b2' } },
      { kind: 'updateParams', beatId: 'b1', params: { connection: { target: 'ghost' } } },
      { kind: 'updateParams', beatId: 'd', params: { connection: { target: 'b1' } } },
    ], c as any);
    expect(c.updateBeat).toHaveBeenNthCalledWith(1, 'b1', { parameters: { text: 'New' }, connections: [{ targetId: 'b2' }] });
    expect(res[1]).toMatchObject({ ok: false, detail: expect.stringContaining('"ghost" not found') });
    expect(res[2]).toMatchObject({ ok: false, detail: expect.stringContaining('no parameter "connection"') });
  });

  it('addBeat with a connection gets a real exit; connectFrom replaces a single-exit source\'s link', () => {
    const c = ctx([beat('beat_4', 'infoText', [{ targetId: 'beat_3' }]), beat('beat_3', 'dialogTree')]);
    applyChangeProposals([{ kind: 'addBeat', beatType: 'infoText', name: 'Briefing A', parameters: { text: 'A', connection: { target: 'beat_3' } }, connectFrom: 'beat_4', connectLabel: 'Continue' }], c as any);
    expect(c.updateBeat).toHaveBeenCalledWith('beat_new', { parameters: { text: 'A' }, connections: [{ targetId: 'beat_3' }] });
    expect(c.updateBeat).toHaveBeenCalledWith('beat_4', { connections: [{ targetId: 'beat_new', label: 'Continue' }] });
    expect(c.connectBeats).not.toHaveBeenCalled();
  });

  it('connectFrom a choice beat still adds a link', () => {
    const c = ctx([beat('m', 'multiChoice')]);
    applyChangeProposals([{ kind: 'addBeat', beatType: 'infoText', name: 'X', parameters: { text: 'x' }, connectFrom: 'm' }], c as any);
    expect(c.connectBeats).toHaveBeenCalledWith('m', 'beat_new', undefined);
  });
});
