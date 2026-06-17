/**
 * Tests for BatchCommand (composite undo step) + BatchCommandBuilder. A small
 * FakeCommand records execute/undo/redo order so we can assert ordering
 * (execute forward, undo reverse), rollback-on-failure (already-executed
 * children undo in reverse), serialization, and the builder's add/build/
 * buildOrNull/clear surface.
 */
import { describe, it, expect, vi } from 'vitest';
import { BatchCommand, BatchCommandBuilder } from '../BatchCommand';
import { Command } from '../Command';

class FakeCommand extends Command {
  readonly type = 'FAKE';
  description: string;
  constructor(
    public tag: string,
    private log: string[],
    private failOnExecute = false,
  ) {
    super();
    this.description = tag;
  }
  async execute() {
    if (this.failOnExecute) throw new Error(`execute failed: ${this.tag}`);
    this.log.push(`exec:${this.tag}`);
  }
  async undo() {
    this.log.push(`undo:${this.tag}`);
  }
  async redo() {
    this.log.push(`redo:${this.tag}`);
  }
  protected serializeData() {
    return { tag: this.tag };
  }
}

describe('BatchCommand', () => {
  it('executes children in order and undoes in reverse', async () => {
    const log: string[] = [];
    const batch = new BatchCommand([new FakeCommand('a', log), new FakeCommand('b', log), new FakeCommand('c', log)], 'three');
    await batch.execute();
    expect(log).toEqual(['exec:a', 'exec:b', 'exec:c']);
    await batch.undo();
    expect(log.slice(3)).toEqual(['undo:c', 'undo:b', 'undo:a']);
  });

  it('redoes children in forward order', async () => {
    const log: string[] = [];
    const batch = new BatchCommand([new FakeCommand('a', log), new FakeCommand('b', log)], 'two');
    await batch.redo();
    expect(log).toEqual(['redo:a', 'redo:b']);
  });

  it('rolls back already-executed children (reverse) when one fails, then rethrows', async () => {
    const log: string[] = [];
    const batch = new BatchCommand(
      [new FakeCommand('a', log), new FakeCommand('b', log), new FakeCommand('c', log, true), new FakeCommand('d', log)],
      'fails at c',
    );
    await expect(batch.execute()).rejects.toThrow(/execute failed: c/);
    // a and b executed, then rolled back in reverse; c failed; d never ran
    expect(log).toEqual(['exec:a', 'exec:b', 'undo:b', 'undo:a']);
  });

  it('exposes count, commands, description, type and never merges', () => {
    const log: string[] = [];
    const cmds = [new FakeCommand('a', log), new FakeCommand('b', log)];
    const batch = new BatchCommand(cmds, 'desc');
    expect(batch.commandCount).toBe(2);
    expect(batch.getCommands()).toHaveLength(2);
    expect(batch.description).toBe('desc');
    expect(batch.type).toBe('BATCH');
    expect(batch.canMergeWith(cmds[0])).toBe(false);
  });

  it('serializes its description and child commands', () => {
    const log: string[] = [];
    const batch = new BatchCommand([new FakeCommand('a', log)], 'my batch');
    const json = batch.toJSON();
    expect(json.type).toBe('BATCH');
    expect(json.data.description).toBe('my batch');
    expect(json.data.commands).toHaveLength(1);
    expect(json.data.commands[0]).toMatchObject({ type: 'FAKE', data: { tag: 'a' } });
  });
});

describe('BatchCommandBuilder', () => {
  const fc = (tag: string) => new FakeCommand(tag, []);

  it('builds a batch from added commands with a description', () => {
    const b = new BatchCommandBuilder().setDescription('built').add(fc('a')).addAll([fc('b'), fc('c')]);
    expect(b.count).toBe(3);
    expect(b.isEmpty()).toBe(false);
    const batch = b.build();
    expect(batch.commandCount).toBe(3);
    expect(batch.description).toBe('built');
  });

  it('throws when build() is called empty', () => {
    expect(() => new BatchCommandBuilder().build()).toThrow(/empty batch/i);
  });

  it('buildOrNull returns null when empty and a batch otherwise', () => {
    expect(new BatchCommandBuilder().buildOrNull()).toBeNull();
    expect(new BatchCommandBuilder().add(fc('a')).buildOrNull()).toBeInstanceOf(BatchCommand);
  });

  it('clear() empties the builder', () => {
    const b = new BatchCommandBuilder().add(fc('a')).add(fc('b'));
    expect(b.count).toBe(2);
    b.clear();
    expect(b.isEmpty()).toBe(true);
    expect(b.count).toBe(0);
  });

  it('snapshots commands at build time (later adds do not mutate a built batch)', () => {
    const b = new BatchCommandBuilder().add(fc('a'));
    const batch = b.build();
    b.add(fc('b'));
    expect(batch.commandCount).toBe(1); // build() copied the array
  });
});
