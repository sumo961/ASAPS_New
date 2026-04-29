/**
 * Tests for the `characterRef` field on Beat and DialogNode (Step 1.c of the
 * rich-character roadmap).
 *
 * Validates:
 *   - The optional characterRef field round-trips through toJSON/constructor.
 *   - getResolvedSpeaker prefers characterRef when set, falls back to matching
 *     the free-text speaker, and finally falls back to the speaker string itself.
 *   - DialogTreeBeat preserves characterRef on root and nested DialogNodes
 *     across the migration walk.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Beat } from '../../src/beats/Beat';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import type { BeatConfig } from '../../src/types';

class TestBeat extends Beat {
  protected async performAction(): Promise<string | null> { return null; }
  getParameters(): Record<string, any> { return {}; }
  updateParameters(): void { /* noop */ }
}

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

describe('Beat — characterRef field', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to undefined when not provided', () => {
    const beat = new TestBeat({ id: 'b1', name: 'Test', type: 'test' } as BeatConfig);
    expect(beat.characterRef).toBeUndefined();
  });

  it('reads characterRef from the top-level config', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      characterRef: 'char_1',
    } as any);
    expect(beat.characterRef).toBe('char_1');
  });

  it('reads characterRef from nested parameters as a fallback', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      parameters: { characterRef: 'char_2' },
    } as any);
    expect(beat.characterRef).toBe('char_2');
  });

  it('round-trips characterRef through toJSON', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      characterRef: 'char_1',
      speaker: 'Granny',
    } as any);
    const json = beat.toJSON();
    expect(json.characterRef).toBe('char_1');
    expect(json.speaker).toBe('Granny');
  });

  it('omits characterRef from JSON when unset (keep payload clean)', () => {
    const beat = new TestBeat({ id: 'b1', name: 'Test', type: 'test' } as BeatConfig);
    const json = beat.toJSON();
    expect(json.characterRef).toBeUndefined();
  });
});

describe('Beat.getResolvedSpeaker', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers characterRef when set and resolvable', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      characterRef: 'char_1',
      speaker: 'this gets ignored',
    } as any);
    const r = beat.getResolvedSpeaker([granny, wolf]);
    expect(r.id).toBe('char_1');
    expect(r.name).toBe('Grandma'); // displayName preferred
    expect(r.character).toEqual(granny);
  });

  it('falls back to matching the free-text speaker by name', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      speaker: 'wolf',
    } as any);
    const r = beat.getResolvedSpeaker([granny, wolf]);
    expect(r.id).toBe('char_2');
    expect(r.character).toEqual(wolf);
  });

  it('returns the free-text speaker unchanged when nothing matches', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      speaker: 'Random Stranger',
    } as any);
    const r = beat.getResolvedSpeaker([granny, wolf]);
    expect(r.id).toBeNull();
    expect(r.name).toBe('Random Stranger');
    expect(r.character).toBeNull();
  });

  it('returns empty name + null id when speaker and characterRef are both empty', () => {
    const beat = new TestBeat({ id: 'b1', name: 'Test', type: 'test' } as BeatConfig);
    const r = beat.getResolvedSpeaker([granny, wolf]);
    expect(r.id).toBeNull();
    expect(r.name).toBe('');
    expect(r.character).toBeNull();
  });

  it('returns sensible result when characters list is empty/null', () => {
    const beat = new TestBeat({
      id: 'b1', name: 'Test', type: 'test',
      characterRef: 'char_1',
      speaker: 'fallback name',
    } as any);
    const r = beat.getResolvedSpeaker(null);
    expect(r.id).toBeNull();
    expect(r.name).toBe('fallback name');
  });
});

describe('DialogTreeBeat — characterRef on dialog nodes', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves characterRef on the root DialogNode through migration', () => {
    const beat = new DialogTreeBeat({
      id: 'b1', name: 'Test', type: 'dialogTree',
      parameters: {
        dialogTree: {
          id: 'root',
          speaker: 'Granny',
          characterRef: 'char_1',
          text: 'Hello child!',
          choices: [],
        },
      },
    } as any);
    expect(beat.dialogTree.characterRef).toBe('char_1');
  });

  it('preserves characterRef on nested DialogNodes (choices[].dialogNode)', () => {
    const beat = new DialogTreeBeat({
      id: 'b1', name: 'Test', type: 'dialogTree',
      parameters: {
        dialogTree: {
          id: 'root',
          speaker: 'Granny',
          characterRef: 'char_1',
          text: 'Want a treat?',
          choices: [{
            id: 'c1',
            text: 'Yes please',
            dialogNode: {
              id: 'n1',
              speaker: 'Wolf',
              characterRef: 'char_2',
              text: 'I want it too!',
              choices: [],
            },
          }],
        },
      },
    } as any);
    expect(beat.dialogTree.choices[0].dialogNode?.characterRef).toBe('char_2');
  });

  it('keeps the field absent when not provided (no spurious undefined entries)', () => {
    const beat = new DialogTreeBeat({
      id: 'b1', name: 'Test', type: 'dialogTree',
      parameters: {
        dialogTree: { id: 'root', speaker: 'Anonymous', text: '...', choices: [] },
      },
    } as any);
    expect('characterRef' in beat.dialogTree).toBe(false);
  });
});
