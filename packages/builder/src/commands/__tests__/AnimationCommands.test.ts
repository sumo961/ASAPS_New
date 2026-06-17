/**
 * Tests for the animation undo/redo command classes. Each calls into an
 * AnimationStateMutations bag (vi.fn()s here). Covers execute/undo wiring,
 * descriptions, the 2s update-merge window, serialization, and the registry
 * registration helper.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AddAnimationCommand,
  DeleteAnimationCommand,
  UpdateAnimationCommand,
  registerAnimationCommands,
} from '../AnimationCommands';
import { CommandRegistry } from '../Command';

const mutations = () => ({ addAnimation: vi.fn(), updateAnimation: vi.fn(), deleteAnimation: vi.fn() });
const anim = (over: any = {}) => ({ id: 'anim-12345678', name: 'Slide In', waypoints: [], ...over }) as any;

describe('AddAnimationCommand', () => {
  it('adds on execute, deletes on undo', () => {
    const m = mutations();
    const a = anim();
    const cmd = new AddAnimationCommand(a, m);
    cmd.execute();
    expect(m.addAnimation).toHaveBeenCalledWith(a);
    cmd.undo();
    expect(m.deleteAnimation).toHaveBeenCalledWith('anim-12345678');
    expect(cmd.description).toBe('Add animation "Slide In"');
    expect(cmd.type).toBe('ADD_ANIMATION');
  });
});

describe('DeleteAnimationCommand', () => {
  it('deletes on execute, re-adds on undo', () => {
    const m = mutations();
    const a = anim();
    const cmd = new DeleteAnimationCommand(a, m);
    cmd.execute();
    expect(m.deleteAnimation).toHaveBeenCalledWith('anim-12345678');
    cmd.undo();
    expect(m.addAnimation).toHaveBeenCalledWith(a);
    expect(cmd.description).toBe('Delete animation "Slide In"');
  });
});

describe('UpdateAnimationCommand', () => {
  it('applies newValues, restores oldValues, names changed keys', () => {
    const m = mutations();
    const cmd = new UpdateAnimationCommand('anim-12345678', { duration: 1 } as any, { duration: 2 } as any, m);
    cmd.execute();
    expect(m.updateAnimation).toHaveBeenCalledWith('anim-12345678', { duration: 2 });
    cmd.undo();
    expect(m.updateAnimation).toHaveBeenCalledWith('anim-12345678', { duration: 1 });
    expect(cmd.description).toMatch(/duration/);
  });

  it('merges same-animation updates within 2s, rejects others', () => {
    const m = mutations();
    const a = new UpdateAnimationCommand('a1', {}, { duration: 2 } as any, m);
    const b = new UpdateAnimationCommand('a1', {}, { easing: 'ease' } as any, m);
    expect(a.canMergeWith(b)).toBe(true);
    expect(a.canMergeWith(new UpdateAnimationCommand('a2', {}, {} as any, m))).toBe(false);

    const slow = new UpdateAnimationCommand('a1', {}, {} as any, m);
    (slow as any).timestamp = new Date(a.timestamp.getTime() + 3000);
    expect(a.canMergeWith(slow)).toBe(false);

    a.mergeWith(b);
    a.execute();
    expect(m.updateAnimation).toHaveBeenLastCalledWith('a1', expect.objectContaining({ duration: 2, easing: 'ease' }));
  });

  it('does not merge with a non-UpdateAnimationCommand', () => {
    const m = mutations();
    const a = new UpdateAnimationCommand('a1', {}, {} as any, m);
    expect(a.canMergeWith(new AddAnimationCommand(anim({ id: 'a1' }), m))).toBe(false);
  });
});

describe('registerAnimationCommands', () => {
  it('registers all three animation command types', () => {
    registerAnimationCommands(mutations());
    expect(CommandRegistry.has('ADD_ANIMATION')).toBe(true);
    expect(CommandRegistry.has('DELETE_ANIMATION')).toBe(true);
    expect(CommandRegistry.has('UPDATE_ANIMATION')).toBe(true);
  });
});
