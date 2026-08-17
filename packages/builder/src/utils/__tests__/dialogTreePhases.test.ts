/**
 * Phase counting for the graph's multi-phase dialogTree rendering — the count
 * must see every wild shape a nested exchange arrives in (dialogNode, object
 * target, object next, entries[]), and must not be fooled by cycles or by
 * container objects that present nothing.
 */
import { describe, it, expect } from 'vitest';
import { dialogTreePhaseCount } from '../dialogTreePhases';

describe('dialogTreePhaseCount', () => {
  it('a flat one-exchange dialog is one phase', () => {
    expect(dialogTreePhaseCount({
      text: 'Hello.',
      choices: [{ text: 'Bye', target: 'beat_next' }],
    })).toBe(1);
  });

  it('counts nested exchanges through every wild shape at once', () => {
    const tree = {
      text: 'root',
      choices: [
        // modern nesting
        { text: 'Ask', dialogNode: { text: 'level 2', choices: [{ text: 'Go', target: 'exit' }] } },
        // OLD format: target is an object node
        { text: 'Old', target: { text: 'old-style level 2', choices: [] } },
      ],
      // node-level next as an object
      next: { text: 'follow-up', choices: [] },
    };
    expect(dialogTreePhaseCount(tree)).toBe(4);
  });

  it('counts entries[] members as phases', () => {
    expect(dialogTreePhaseCount({
      entries: [
        { text: 'a', choices: [] },
        { text: 'b', choices: [] },
      ],
    })).toBe(2);
  });

  it('survives a cycle without hanging', () => {
    const a: any = { text: 'a', choices: [] };
    const b: any = { text: 'b', choices: [{ text: 'back', dialogNode: a }] };
    a.choices.push({ text: 'on', dialogNode: b });
    expect(dialogTreePhaseCount(a)).toBe(2);
  });

  it('string targets are beat exits, not phases', () => {
    expect(dialogTreePhaseCount({
      text: 'root',
      choices: [
        { text: 'leave', target: 'beat_out' },
        { text: 'stay', target: 'beat_in' },
      ],
    })).toBe(1);
  });

  it('junk input counts zero', () => {
    expect(dialogTreePhaseCount(null)).toBe(0);
    expect(dialogTreePhaseCount(undefined)).toBe(0);
    expect(dialogTreePhaseCount('not a tree')).toBe(0);
    expect(dialogTreePhaseCount({})).toBe(0);
  });
});
