import { describe, it, expect } from 'vitest';
import { withClickable, isClickable, syncFreeLayoutParams, wordsFor, withWords } from '../freeLayoutElements';

const lamp = { id: 'el_lamp', type: 'prop', name: 'Lamp' };
const door = { id: 'el_door', type: 'button', name: 'Door' };

describe('freeLayoutElements', () => {
  it('a picture made clickable is a button; unticked, its link waits for it to be clickable again', () => {
    let p: Record<string, any> = withClickable({}, lamp, true);
    expect(isClickable(p, lamp)).toBe(true);
    p = { ...p, choices: p.choices.map((c: any) => ({ ...c, target: 'cellar', effects: [{ type: 'setVariable', target: 'lit', value: true }] })) };
    p = withClickable(p, lamp, false);
    expect(isClickable(p, lamp)).toBe(false);
    expect(p.choices).toEqual([]);
    p = withClickable(p, lamp, true);
    expect(p.choices).toMatchObject([{ locationName: 'Lamp', target: 'cellar', effects: [{ target: 'lit' }] }]);
    expect(p.parkedButtons).toEqual([]);
  });

  it('a new button gets its entry, and its words follow the element', () => {
    const p = syncFreeLayoutParams({}, [door])!;
    expect(p.choices).toMatchObject([{ locationName: 'Door', elementId: 'el_door', text: 'Button', target: '' }]);
    const worded = withWords(p, door, 'Leave');
    expect(wordsFor(worded, door)).toBe('Leave');
    // Renamed, the words and link stay with the element (by its id).
    const renamed = syncFreeLayoutParams(worded, [{ ...door, name: 'Exit' }])!;
    expect(renamed.choices).toMatchObject([{ locationName: 'Exit', text: 'Leave' }]);
  });
});
