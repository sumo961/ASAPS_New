/**
 * Tests for the beat undo/redo command classes. Each command calls back into
 * a BeatStateMutations bag to apply/revert; we pass vi.fn() mutations and
 * assert the execute/undo wiring, descriptions, serialization, and the
 * time-windowed merge behavior on Update/Move.
 */
import { describe, it, expect, vi } from 'vitest';
import { AddBeatCommand, DeleteBeatCommand, UpdateBeatCommand, MoveBeatCommand } from '../BeatCommands';

const mutations = () => ({
  addBeat: vi.fn(),
  updateBeat: vi.fn(),
  deleteBeat: vi.fn(),
  moveBeat: vi.fn(),
});
const beat = (over: any = {}) => ({ id: 'b1', type: 'infoText', toJSON: () => ({ id: 'b1', type: 'infoText' }), ...over }) as any;

describe('AddBeatCommand', () => {
  it('execute adds the beat, undo deletes it', () => {
    const m = mutations();
    const b = beat();
    const cmd = new AddBeatCommand(b, m);
    cmd.execute();
    expect(m.addBeat).toHaveBeenCalledWith(b);
    cmd.undo();
    expect(m.deleteBeat).toHaveBeenCalledWith('b1');
    expect(cmd.description).toBe('Add infoText beat');
    expect(cmd.type).toBe('ADD_BEAT');
    expect(cmd.toJSON()).toMatchObject({ type: 'ADD_BEAT', data: { beat: { id: 'b1' } } });
  });
});

describe('DeleteBeatCommand', () => {
  it('execute deletes the beat, undo re-adds it', () => {
    const m = mutations();
    const b = beat();
    const cmd = new DeleteBeatCommand(b, m);
    cmd.execute();
    expect(m.deleteBeat).toHaveBeenCalledWith('b1');
    cmd.undo();
    expect(m.addBeat).toHaveBeenCalledWith(b);
  });
});

describe('UpdateBeatCommand', () => {
  it('execute applies newValues, undo restores oldValues', () => {
    const m = mutations();
    const cmd = new UpdateBeatCommand('b1', { name: 'Old' }, { name: 'New' }, m);
    cmd.execute();
    expect(m.updateBeat).toHaveBeenCalledWith('b1', { name: 'New' });
    cmd.undo();
    expect(m.updateBeat).toHaveBeenCalledWith('b1', { name: 'Old' });
    expect(cmd.description).toMatch(/name/);
  });

  it('merges consecutive updates to the same beat within 2s', () => {
    const m = mutations();
    const a = new UpdateBeatCommand('b1', { x: 1 } as any, { x: 2 } as any, m);
    const b = new UpdateBeatCommand('b1', { x: 2 } as any, { x: 3 } as any, m);
    expect(a.canMergeWith(b)).toBe(true);
    a.mergeWith(b);
    a.execute(); // merged newValues should now carry x:3
    expect(m.updateBeat).toHaveBeenLastCalledWith('b1', expect.objectContaining({ x: 3 }));
  });

  it('does not merge a different beat or an update >2s later', () => {
    const m = mutations();
    const a = new UpdateBeatCommand('b1', {}, { x: 1 } as any, m);
    expect(a.canMergeWith(new UpdateBeatCommand('b2', {}, { x: 1 } as any, m))).toBe(false);
    const later = new UpdateBeatCommand('b1', {}, { x: 1 } as any, m);
    (later as any).timestamp = new Date(a.timestamp.getTime() + 3000);
    expect(a.canMergeWith(later)).toBe(false);
  });
});

describe('MoveBeatCommand', () => {
  it('execute moves to newPosition, undo restores oldPosition', () => {
    const m = mutations();
    const cmd = new MoveBeatCommand('b1', { x: 0, y: 0 }, { x: 10, y: 20 }, m);
    cmd.execute();
    expect(m.moveBeat).toHaveBeenCalledWith('b1', { x: 10, y: 20 });
    cmd.undo();
    expect(m.moveBeat).toHaveBeenCalledWith('b1', { x: 0, y: 0 });
  });

  it('merges rapid moves (≤500ms) by taking the latest position', () => {
    const m = mutations();
    const a = new MoveBeatCommand('b1', { x: 0, y: 0 }, { x: 5, y: 5 }, m);
    const b = new MoveBeatCommand('b1', { x: 5, y: 5 }, { x: 9, y: 9 }, m);
    expect(a.canMergeWith(b)).toBe(true);
    a.mergeWith(b);
    a.execute();
    expect(m.moveBeat).toHaveBeenLastCalledWith('b1', { x: 9, y: 9 });
  });

  it('does not merge moves >500ms apart', () => {
    const m = mutations();
    const a = new MoveBeatCommand('b1', { x: 0, y: 0 }, { x: 5, y: 5 }, m);
    const b = new MoveBeatCommand('b1', { x: 5, y: 5 }, { x: 9, y: 9 }, m);
    (b as any).timestamp = new Date(a.timestamp.getTime() + 800);
    expect(a.canMergeWith(b)).toBe(false);
  });
});
