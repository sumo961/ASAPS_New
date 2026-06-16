/**
 * Tests for the Command base class + CommandRegistry. A tiny concrete subclass
 * exercises the shared id/timestamp/redo/serialize/merge surface; the registry
 * tests cover register/has/deserialize and the unknown-type guard. We avoid
 * CommandRegistry.clear() so the module-level 'BATCH' registration survives for
 * the BatchCommand suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { Command, CommandRegistry } from '../Command';

class FakeCommand extends Command {
  readonly type = 'FAKE';
  description = 'fake';
  executed = 0;
  constructor(id?: string) {
    super(id);
  }
  execute() {
    this.executed++;
  }
  undo() {
    this.executed--;
  }
  protected serializeData() {
    return { foo: 'bar' };
  }
}

describe('Command base', () => {
  it('generates a uuid id and a timestamp when none supplied', () => {
    const c = new FakeCommand();
    expect(c.id).toMatch(/[0-9a-f-]{36}/);
    expect(c.timestamp).toBeInstanceOf(Date);
  });

  it('uses an explicit id when given', () => {
    expect(new FakeCommand('cmd-1').id).toBe('cmd-1');
  });

  it('redo() defaults to calling execute() again', () => {
    const c = new FakeCommand();
    c.execute();
    c.redo();
    expect(c.executed).toBe(2);
  });

  it('toJSON wraps serializeData with id/type/timestamp', () => {
    const c = new FakeCommand('cmd-2');
    expect(c.toJSON()).toMatchObject({ id: 'cmd-2', type: 'FAKE', data: { foo: 'bar' } });
  });

  it('does not merge by default', () => {
    const a = new FakeCommand();
    expect(a.canMergeWith(new FakeCommand())).toBe(false);
    expect(() => a.mergeWith(new FakeCommand())).not.toThrow();
  });
});

describe('CommandRegistry', () => {
  it('registers, reports, and deserializes a command type', () => {
    const factory = vi.fn((data: any) => new FakeCommand(data.id));
    CommandRegistry.register('FAKE_REG', factory);
    expect(CommandRegistry.has('FAKE_REG')).toBe(true);

    const cmd = CommandRegistry.deserialize({ id: 'x', type: 'FAKE_REG', timestamp: new Date(), data: {} } as any);
    expect(cmd).toBeInstanceOf(FakeCommand);
    expect(factory).toHaveBeenCalled();
  });

  it('returns null for an unknown type', () => {
    expect(CommandRegistry.deserialize({ id: 'x', type: 'NOPE', timestamp: new Date(), data: {} } as any)).toBeNull();
  });

  it('returns null and swallows when the factory throws', () => {
    CommandRegistry.register('BOOM', () => {
      throw new Error('bad');
    });
    expect(CommandRegistry.deserialize({ id: 'x', type: 'BOOM', timestamp: new Date(), data: {} } as any)).toBeNull();
  });
});
