/**
 * Tests for the visual-element undo/redo command classes. Each calls into an
 * ElementStateMutations bag (vi.fn()s here). Covers execute/undo wiring,
 * descriptions, the Update/Move merge windows, and the snapshot command.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AddElementCommand,
  DeleteElementCommand,
  UpdateElementCommand,
  MoveElementCommand,
  VisualElementsSnapshotCommand,
} from '../ElementCommands';

const mutations = () => ({ addElement: vi.fn(), updateElement: vi.fn(), deleteElement: vi.fn() });
const el = (over: any = {}) => ({ id: 'e1', type: 'character', ...over }) as any;

describe('AddElementCommand / DeleteElementCommand', () => {
  it('add executes addElement and undoes via deleteElement', () => {
    const m = mutations();
    const e = el();
    const cmd = new AddElementCommand(e, m);
    cmd.execute();
    expect(m.addElement).toHaveBeenCalledWith(e);
    cmd.undo();
    expect(m.deleteElement).toHaveBeenCalledWith('e1');
    expect(cmd.description).toBe('Add character element');
  });

  it('delete executes deleteElement and undoes via addElement', () => {
    const m = mutations();
    const e = el();
    const cmd = new DeleteElementCommand(e, m);
    cmd.execute();
    expect(m.deleteElement).toHaveBeenCalledWith('e1');
    cmd.undo();
    expect(m.addElement).toHaveBeenCalledWith(e);
  });
});

describe('UpdateElementCommand', () => {
  it('applies newValues, restores oldValues', () => {
    const m = mutations();
    const cmd = new UpdateElementCommand('e1', { scale: 1 } as any, { scale: 2 } as any, m);
    cmd.execute();
    expect(m.updateElement).toHaveBeenCalledWith('e1', { scale: 2 });
    cmd.undo();
    expect(m.updateElement).toHaveBeenCalledWith('e1', { scale: 1 });
  });

  it('merges same-element updates within 2s, rejects others', () => {
    const m = mutations();
    const a = new UpdateElementCommand('e1', {}, { scale: 2 } as any, m);
    const b = new UpdateElementCommand('e1', {}, { opacity: 0.5 } as any, m);
    expect(a.canMergeWith(b)).toBe(true);
    expect(a.canMergeWith(new UpdateElementCommand('e2', {}, {} as any, m))).toBe(false);
    a.mergeWith(b);
    a.execute();
    expect(m.updateElement).toHaveBeenLastCalledWith('e1', expect.objectContaining({ scale: 2, opacity: 0.5 }));
  });
});

describe('MoveElementCommand', () => {
  it('moves via updateElement and undoes to the old position', () => {
    const m = mutations();
    const cmd = new MoveElementCommand('e1', { x: 0, y: 0 }, { x: 7, y: 8 }, m);
    cmd.execute();
    expect(m.updateElement).toHaveBeenCalledWith('e1', { x: 7, y: 8 });
    cmd.undo();
    expect(m.updateElement).toHaveBeenCalledWith('e1', { x: 0, y: 0 });
  });

  it('merges rapid drags (≤500ms) and rejects slower ones', () => {
    const m = mutations();
    const a = new MoveElementCommand('e1', { x: 0, y: 0 }, { x: 3, y: 3 }, m);
    const b = new MoveElementCommand('e1', { x: 3, y: 3 }, { x: 9, y: 9 }, m);
    expect(a.canMergeWith(b)).toBe(true);
    a.mergeWith(b);
    a.execute();
    expect(m.updateElement).toHaveBeenLastCalledWith('e1', { x: 9, y: 9 });

    const slow = new MoveElementCommand('e1', { x: 0, y: 0 }, { x: 1, y: 1 }, m);
    (slow as any).timestamp = new Date(a.timestamp.getTime() + 900);
    expect(a.canMergeWith(slow)).toBe(false);
  });
});

describe('VisualElementsSnapshotCommand', () => {
  it('applies the new snapshot on execute and the old one on undo', () => {
    const apply = vi.fn();
    const oldEls = [{ id: 'a' }];
    const newEls = [{ id: 'a' }, { id: 'b' }];
    const cmd = new VisualElementsSnapshotCommand(oldEls, newEls, apply, 'Align elements');
    cmd.execute();
    expect(apply).toHaveBeenCalledWith(newEls);
    cmd.undo();
    expect(apply).toHaveBeenCalledWith(oldEls);
    expect(cmd.description).toBe('Align elements');
    expect(cmd.type).toBe('UPDATE_VISUAL_ELEMENTS');
  });
});
