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

// ---------------------------------------------------------------------------
// Cluster commands (unification follow-ups)
// ---------------------------------------------------------------------------
import { MoveBeatInContainerCommand, ResizeClusterCommand, ReparentBeatCommand, ApplyFixProposalCommand } from '../BeatCommands';

const clusterMutations = () => ({
  ...mutations(),
  moveBeatInContainer: vi.fn(),
  resizeCluster: vi.fn(),
  moveBeatToCluster: vi.fn(),
  removeBeatFromCluster: vi.fn(),
});

describe('MoveBeatInContainerCommand', () => {
  it('execute stores the new content-relative position, undo restores the old', () => {
    const m = clusterMutations();
    const cmd = new MoveBeatInContainerCommand('b1', 'c1', { x: 20, y: 20 }, { x: 200, y: 40 }, m);
    cmd.execute();
    expect(m.moveBeatInContainer).toHaveBeenLastCalledWith('b1', 'c1', 200, 40);
    cmd.undo();
    expect(m.moveBeatInContainer).toHaveBeenLastCalledWith('b1', 'c1', 20, 20);
    expect(cmd.type).toBe('MOVE_BEAT_IN_CONTAINER');
    expect(cmd.toJSON()).toMatchObject({ data: { beatId: 'b1', clusterId: 'c1', newPosition: { x: 200, y: 40 } } });
  });
  it('merges rapid moves of the same beat in the same cluster only', () => {
    const m = clusterMutations();
    const a = new MoveBeatInContainerCommand('b1', 'c1', { x: 0, y: 0 }, { x: 20, y: 0 }, m);
    const b = new MoveBeatInContainerCommand('b1', 'c1', { x: 20, y: 0 }, { x: 60, y: 0 }, m);
    const other = new MoveBeatInContainerCommand('b1', 'c2', { x: 20, y: 0 }, { x: 60, y: 0 }, m);
    expect(a.canMergeWith(b)).toBe(true);
    expect(a.canMergeWith(other)).toBe(false);
    a.mergeWith(b); a.execute();
    expect(m.moveBeatInContainer).toHaveBeenLastCalledWith('b1', 'c1', 60, 0);
  });
});

describe('ResizeClusterCommand', () => {
  it('execute applies the new bounds, undo the old', () => {
    const m = clusterMutations();
    const cmd = new ResizeClusterCommand('c1', { width: 400, height: 300 }, { width: 800, height: 500 }, m);
    cmd.execute();
    expect(m.resizeCluster).toHaveBeenLastCalledWith('c1', 800, 500);
    cmd.undo();
    expect(m.resizeCluster).toHaveBeenLastCalledWith('c1', 400, 300);
    expect(cmd.type).toBe('RESIZE_CLUSTER');
  });
});

describe('ReparentBeatCommand', () => {
  it('drag-in: execute joins the cluster at the drop point, undo puts it back on the canvas', () => {
    const m = clusterMutations();
    const cmd = new ReparentBeatCommand('b1', { clusterId: null, x: 40, y: 60 }, { clusterId: 'c1', x: 80, y: 20 }, m);
    cmd.execute();
    expect(m.moveBeatToCluster).toHaveBeenCalledWith('b1', 'c1');
    expect(m.moveBeatInContainer).toHaveBeenCalledWith('b1', 'c1', 80, 20);
    expect(m.removeBeatFromCluster).not.toHaveBeenCalled();
    cmd.undo();
    expect(m.removeBeatFromCluster).toHaveBeenCalledWith('b1');
    expect(m.moveBeat).toHaveBeenLastCalledWith('b1', { x: 40, y: 60 });
    expect(cmd.description).toBe('Move beat into cluster');
  });
  it('drag-out / ⏏: execute leaves the cluster AND places the beat, undo rejoins at the old slot', () => {
    const m = clusterMutations();
    const cmd = new ReparentBeatCommand('b1', { clusterId: 'c1', x: 20, y: 130 }, { clusterId: null, x: 740, y: 280 }, m);
    cmd.execute();
    expect(m.removeBeatFromCluster).toHaveBeenCalledWith('b1');
    expect(m.moveBeat).toHaveBeenLastCalledWith('b1', { x: 740, y: 280 });
    cmd.undo();
    expect(m.moveBeatToCluster).toHaveBeenLastCalledWith('b1', 'c1');
    expect(m.moveBeatInContainer).toHaveBeenLastCalledWith('b1', 'c1', 20, 130);
    expect(cmd.description).toBe('Take beat out of cluster');
  });
  it('between clusters: one entry, both directions', () => {
    const m = clusterMutations();
    const cmd = new ReparentBeatCommand('b1', { clusterId: 'c1', x: 20, y: 20 }, { clusterId: 'c2', x: 100, y: 20 }, m);
    cmd.execute();
    expect(m.moveBeatToCluster).toHaveBeenLastCalledWith('b1', 'c2');
    cmd.undo();
    expect(m.moveBeatToCluster).toHaveBeenLastCalledWith('b1', 'c1');
    expect(cmd.description).toBe('Move beat to another cluster');
    expect(cmd.toJSON()).toMatchObject({ type: 'REPARENT_BEAT', data: { beatId: 'b1', to: { clusterId: 'c2' } } });
  });
});

describe('ApplyFixProposalCommand', () => {
  it('applies the patch, undoes to the previous parameters, and hands out fresh clones each time', () => {
    const m = mutations();
    const cmd = new ApplyFixProposalCommand('fix:1', 'b1', { value: 3 }, { value: 1 }, 'Change the check', m);
    cmd.execute();
    const first = m.updateBeat.mock.calls[0][1];
    expect(first).toEqual({ parameters: { value: 1 } });
    delete (first as any).parameters; // what useStoryBuilder.updateBeat does to the object it is handed
    cmd.redo();
    expect(m.updateBeat.mock.calls[1][1]).toEqual({ parameters: { value: 1 } }); // not a no-op
    cmd.undo();
    expect(m.updateBeat).toHaveBeenLastCalledWith('b1', { parameters: { value: 3 } });
    expect(cmd.canMergeWith()).toBe(false);
    expect(cmd.toJSON()).toMatchObject({ type: 'APPLY_FIX_PROPOSAL', data: { proposalId: 'fix:1', beatId: 'b1' } });
  });
});
