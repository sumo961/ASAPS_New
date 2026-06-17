/**
 * Tests for the whole-slice state-replacement commands (Character Editor /
 * Global Settings Inspector undo). These snapshot old+new via structuredClone
 * on construct and pass fresh clones on execute/undo, so the key behaviors are
 * the clone isolation (external mutation can't leak in or out) plus the usual
 * execute/undo/description/serialize surface. Deserialize is intentionally
 * unimplemented (throws).
 */
import { describe, it, expect, vi } from 'vitest';
import { UpdateCharactersCommand, UpdateGlobalSettingsCommand } from '../ProjectStateCommands';

describe('UpdateCharactersCommand', () => {
  it('sets new on execute and old on undo', () => {
    const setCharacters = vi.fn();
    const oldC = [{ id: 'c1', name: 'Eve' }] as any;
    const newC = [{ id: 'c1', name: 'Eve' }, { id: 'c2', name: 'Bob' }] as any;
    const cmd = new UpdateCharactersCommand(oldC, newC, { setCharacters });

    cmd.execute();
    expect(setCharacters).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'c2' })]));
    cmd.undo();
    expect(setCharacters).toHaveBeenLastCalledWith([{ id: 'c1', name: 'Eve' }]);
    expect(cmd.description).toBe('Edit characters');
    expect(cmd.type).toBe('UPDATE_CHARACTERS');
  });

  it('uses a custom description when given', () => {
    const cmd = new UpdateCharactersCommand([], [], { setCharacters: vi.fn() }, 'Rename Eve');
    expect(cmd.description).toBe('Rename Eve');
  });

  it('clones inputs on construct (later external mutation does not leak in)', () => {
    const setCharacters = vi.fn();
    const newC = [{ id: 'c1', name: 'Eve' }] as any;
    const cmd = new UpdateCharactersCommand([], newC, { setCharacters });
    newC[0].name = 'MUTATED'; // mutate after construction
    cmd.execute();
    expect(setCharacters.mock.calls[0][0][0].name).toBe('Eve'); // snapshot unaffected
  });

  it('passes a fresh clone on execute (caller cannot mutate the stored snapshot)', () => {
    const setCharacters = vi.fn();
    const cmd = new UpdateCharactersCommand([], [{ id: 'c1', name: 'Eve' }] as any, { setCharacters });
    cmd.execute();
    const handed = setCharacters.mock.calls[0][0];
    handed[0].name = 'CHANGED';
    cmd.execute(); // execute again; should hand a fresh untouched clone
    expect(setCharacters.mock.calls[1][0][0].name).toBe('Eve');
  });

  it('serializes old + new snapshots', () => {
    const cmd = new UpdateCharactersCommand([{ id: 'a' }] as any, [{ id: 'b' }] as any, { setCharacters: vi.fn() });
    expect(cmd.toJSON().data).toMatchObject({ oldCharacters: [{ id: 'a' }], newCharacters: [{ id: 'b' }] });
  });

  it('deserialize throws (not implemented)', () => {
    expect(() => UpdateCharactersCommand.deserialize({} as any, { setCharacters: vi.fn() })).toThrow(/not yet implemented/i);
  });
});

describe('UpdateGlobalSettingsCommand', () => {
  it('sets new on execute and old on undo, default + custom description', () => {
    const setGlobalSettings = vi.fn();
    const oldS = { theme: 'light' } as any;
    const newS = { theme: 'dark' } as any;
    const cmd = new UpdateGlobalSettingsCommand(oldS, newS, { setGlobalSettings });

    cmd.execute();
    expect(setGlobalSettings).toHaveBeenLastCalledWith({ theme: 'dark' });
    cmd.undo();
    expect(setGlobalSettings).toHaveBeenLastCalledWith({ theme: 'light' });
    expect(cmd.description).toBe('Update global settings');
    expect(cmd.type).toBe('UPDATE_GLOBAL_SETTINGS');

    expect(new UpdateGlobalSettingsCommand(oldS, newS, { setGlobalSettings }, 'Change colors').description).toBe('Change colors');
  });

  it('clones the settings snapshot (external mutation does not leak)', () => {
    const setGlobalSettings = vi.fn();
    const newS = { colors: { bg: '#000' } } as any;
    const cmd = new UpdateGlobalSettingsCommand({} as any, newS, { setGlobalSettings });
    newS.colors.bg = '#fff';
    cmd.execute();
    expect(setGlobalSettings.mock.calls[0][0].colors.bg).toBe('#000');
  });

  it('deserialize throws (not implemented)', () => {
    expect(() => UpdateGlobalSettingsCommand.deserialize({} as any, { setGlobalSettings: vi.fn() })).toThrow(/not yet implemented/i);
  });
});
