/**
 * Tests for the main-window proposal executor: validation against live
 * state, correct routing into the undoable update/add/connect callbacks,
 * and per-proposal error isolation (one bad proposal never blocks the rest).
 */
import { describe, it, expect, vi } from 'vitest';
import { applyChangeProposals, type ApplyContext } from '../applyChangeProposals';

function ctx(beats: any[] = []): ApplyContext & {
  updateBeat: ReturnType<typeof vi.fn>;
  addBeat: ReturnType<typeof vi.fn>;
  connectBeats: ReturnType<typeof vi.fn>;
} {
  return {
    beats,
    updateBeat: vi.fn(),
    addBeat: vi.fn((_type: string, _pos: any, _name: string) => ({ id: 'new_1' })),
    connectBeats: vi.fn(),
  };
}

describe('applyChangeProposals', () => {
  it('editText routes into a parameters patch', () => {
    const c = ctx([{ id: 'b1', name: 'Opening' }]);
    const results = applyChangeProposals(
      [{ kind: 'editText', beatId: 'b1', param: 'text', newValue: 'New line.' }], c);
    expect(c.updateBeat).toHaveBeenCalledWith('b1', { parameters: { text: 'New line.' } });
    expect(results).toEqual([{ index: 0, ok: true, detail: 'Set text on Opening' }]);
  });

  it('reports missing beats without applying', () => {
    const c = ctx([]);
    const results = applyChangeProposals(
      [{ kind: 'editText', beatId: 'ghost', param: 'text', newValue: 'x' }], c);
    expect(c.updateBeat).not.toHaveBeenCalled();
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toMatch(/not found/);
  });

  it('addBeat: positions near connectFrom, sets params, wires both directions', () => {
    const c = ctx([{ id: 'b2', name: 'Anchor', x: 100, y: 200 }, { id: 'b9' }]);
    const results = applyChangeProposals([
      {
        kind: 'addBeat', beatType: 'infoText', name: 'Twist',
        parameters: { text: 'Surprise!' },
        connectFrom: 'b2', connectTo: 'b9', connectLabel: 'Onward',
      },
    ], c);
    expect(c.addBeat).toHaveBeenCalledWith('infoText', { x: 400, y: 240 }, 'Twist');
    expect(c.updateBeat).toHaveBeenCalledWith('new_1', { parameters: { text: 'Surprise!' } });
    expect(c.connectBeats).toHaveBeenCalledWith('b2', 'new_1', 'Onward');
    expect(c.connectBeats).toHaveBeenCalledWith('new_1', 'b9');
    expect(results[0].ok).toBe(true);
  });

  it('addBeat rejects unknown beat types (schema-derived)', () => {
    const c = ctx();
    const results = applyChangeProposals(
      [{ kind: 'addBeat', beatType: 'flibbertigibbet', name: 'X' }], c);
    expect(c.addBeat).not.toHaveBeenCalled();
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toMatch(/Unknown beat type/);
  });

  it('addNote appends with the Co-Designer stamp, preserving existing notes', () => {
    const c = ctx([{ id: 'b1', name: 'Scene', notes: 'existing note' }]);
    applyChangeProposals([{ kind: 'addNote', beatId: 'b1', note: 'Rework tone' }], c);
    expect(c.updateBeat).toHaveBeenCalledWith('b1', {
      notes: 'existing note\n\n[Co-Designer] Rework tone',
    });
  });

  it('updateCharacter resolves by id/name/displayName and applies via the callback', () => {
    const c = ctx();
    (c as any).characters = [{ id: 'ch1', name: 'elena', displayName: 'Elena' }];
    (c as any).updateCharacter = vi.fn();
    const results = applyChangeProposals(
      [{ kind: 'updateCharacter', characterId: 'Elena', updates: { description: 'darker' } }], c as any);
    expect((c as any).updateCharacter).toHaveBeenCalledWith('ch1', { description: 'darker' });
    expect(results[0].ok).toBe(true);
    expect(results[0].detail).toMatch(/Updated description on character Elena/);
  });

  it('updateCharacter derives a stance-bearing variant\'s E/A from the base traits', () => {
    const c = ctx();
    // a shy base character (low extraversion)
    (c as any).characters = [{ id: 'ch1', name: 'karin', displayName: 'Karin', traits: { extraversion: 0.2, agreeableness: 0.6 } }];
    const applied: any[] = [];
    (c as any).updateCharacter = vi.fn((_id: string, updates: any) => applied.push(updates));
    const results = applyChangeProposals([{
      kind: 'updateCharacter', characterId: 'karin',
      updates: { variantSelectionPolicy: 'random', variants: [
        { id: 'hostile', name: 'Hostile', stance: { warmth: -0.7, dominance: 0.5 } },
      ] } as any,
    }], c as any);
    expect(results[0].ok).toBe(true);
    const v = applied[0].variants[0];
    expect(v.stance).toEqual({ warmth: -0.7, dominance: 0.5 });
    // hostile stance lowers agreeableness; shy base keeps extraversion low
    expect(v.traits.agreeableness).toBeLessThan(0.6);
    expect(v.traits.extraversion).toBeLessThan(0.35);
    expect(results[0].detail).toMatch(/1 variants/);
  });

  it('updateCharacter reports unknown characters', () => {
    const c = ctx();
    (c as any).characters = [];
    (c as any).updateCharacter = vi.fn();
    const results = applyChangeProposals(
      [{ kind: 'updateCharacter', characterId: 'ghost', updates: { color: '#fff' } }], c as any);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toMatch(/not found/);
  });

  it('one throwing proposal does not block the rest', () => {
    const c = ctx([{ id: 'b1' }, { id: 'b2', name: 'Ok' }]);
    c.updateBeat
      .mockImplementationOnce(() => { throw new Error('boom'); })
      .mockImplementationOnce(() => undefined);
    const results = applyChangeProposals([
      { kind: 'editText', beatId: 'b1', param: 'text', newValue: 'a' },
      { kind: 'editText', beatId: 'b2', param: 'text', newValue: 'b' },
    ], c);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toMatch(/boom/);
    expect(results[1].ok).toBe(true);
  });
});
