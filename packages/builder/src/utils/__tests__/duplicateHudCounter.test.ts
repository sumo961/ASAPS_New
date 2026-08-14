/**
 * duplicateHudCounterOwner — the authoring-time warning for a counter that
 * will be drawn twice on one beat.
 *
 * The rule is deliberately narrow. It fires only when a placed meter and a
 * SCREEN-docked frame would both show the same counter, because those are the
 * two that coexist on a screen regardless of what else is on stage. Anything
 * broader would nag about arrangements that are fine.
 */
import { describe, it, expect } from 'vitest';
import {
  duplicateHudCounterOwner,
  type DuplicateHudCheckCharacter,
} from '../duplicateHudCounter';

const ada = (over: Partial<DuplicateHudCheckCharacter> = {}): DuplicateHudCheckCharacter => ({
  id: 'char_ada',
  name: 'Ada',
  displayName: 'Ada',
  meterFrame: { dockMode: 'screen' },
  counters: [{ name: 'gold', visible: true }, { name: 'trust', visible: true }],
  ...over,
});

const placedTrust = { type: 'meter', characterId: 'char_ada', counterName: 'trust' };

describe('duplicateHudCounterOwner', () => {
  it('names the character whose HUD already shows the counter', () => {
    // The reported case: Ada's four-counter frame plus a placed trust meter.
    expect(duplicateHudCounterOwner(placedTrust, [ada()])).toBe('Ada');
  });

  it('stays quiet for a counter the frame does not show', () => {
    expect(duplicateHudCounterOwner({ ...placedTrust, counterName: 'fear' }, [ada()])).toBeNull();
  });

  it('stays quiet when the frame row is hidden', () => {
    // Nothing is drawn twice if the author already turned that row off.
    expect(duplicateHudCounterOwner(
      placedTrust, [ada({ counters: [{ name: 'trust', visible: false }] })],
    )).toBeNull();
  });

  it('treats an absent `visible` as visible', () => {
    expect(duplicateHudCounterOwner(placedTrust, [ada({ counters: [{ name: 'trust' }] })])).toBe('Ada');
  });

  it('ignores character-anchored frames', () => {
    // Those follow the character on stage rather than sitting in a corner, and
    // appear only when that character is placed — a different situation.
    expect(duplicateHudCounterOwner(placedTrust, [ada({ meterFrame: { dockMode: 'character' } })])).toBeNull();
    expect(duplicateHudCounterOwner(placedTrust, [ada({ meterFrame: null })])).toBeNull();
  });

  it('does not confuse two characters with the same counter name', () => {
    const bo: DuplicateHudCheckCharacter = {
      id: 'char_bo', name: 'Bo', meterFrame: { dockMode: 'screen' },
      counters: [{ name: 'trust', visible: true }],
    };
    // Bo's trust row says nothing about a meter placed for Ada.
    expect(duplicateHudCounterOwner(placedTrust, [bo])).toBeNull();
    expect(duplicateHudCounterOwner({ ...placedTrust, characterId: 'char_bo' }, [bo])).toBe('Bo');
  });

  it('matches a character referenced by name, as older projects do', () => {
    expect(duplicateHudCounterOwner({ ...placedTrust, characterId: 'Ada' }, [ada()])).toBe('Ada');
  });

  it('says nothing for elements that are not meters, or name no counter', () => {
    expect(duplicateHudCounterOwner({ ...placedTrust, type: 'text' }, [ada()])).toBeNull();
    expect(duplicateHudCounterOwner({ ...placedTrust, counterName: undefined }, [ada()])).toBeNull();
    expect(duplicateHudCounterOwner(null, [ada()])).toBeNull();
    expect(duplicateHudCounterOwner(placedTrust, [])).toBeNull();
    expect(duplicateHudCounterOwner(placedTrust, null)).toBeNull();
  });
});
