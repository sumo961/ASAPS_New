import { describe, it, expect } from 'vitest';
import { dimFilter, showsSpeaker, silentCharacterFilters } from '../../src/utils/speakerDimming';

// Speaker Display → "Dim characters who aren't speaking" (Group 2's request:
// "add shadow to characters not currently talking").
describe('dimming the characters who are not speaking', () => {
  const stan = { kind: 'character', characterId: 'char_stan', characterName: 'Stan' };
  const billie = { kind: 'character', characterId: 'char_billie', characterName: 'Billie' };
  const text = { kind: 'text' };
  const on = { dimSilentCharacters: true };

  it('dims every other character on the stage while one of them speaks', () => {
    const f = silentCharacterFilters([stan, billie, text], 'char_stan', on);
    expect([...f.keys()]).toEqual([1]);
    expect(f.get(1)).toBe(dimFilter(50));
  });

  it('matches by the name a character was placed with when no id is known', () => {
    expect(showsSpeaker(stan, 'stan')).toBe(true);
    expect([...silentCharacterFilters([stan, billie], 'Billie', on).keys()]).toEqual([0]);
  });

  it('dims nobody during narration, for a speaker not on the stage, or with the option off', () => {
    expect(silentCharacterFilters([stan, billie], undefined, on).size).toBe(0);
    expect(silentCharacterFilters([stan, billie], 'Narrator', on).size).toBe(0);
    expect(silentCharacterFilters([stan, billie], 'char_stan', { dimSilentCharacters: false }).size).toBe(0);
    expect(silentCharacterFilters([stan, billie], 'char_stan', undefined).size).toBe(0);
  });

  it('dims more as the strength grows, within 0–100', () => {
    expect(dimFilter(0)).toBe('brightness(1) saturate(1)');
    expect(dimFilter(50)).toBe('brightness(0.7) saturate(0.65)');
    expect(dimFilter(100)).toBe('brightness(0.4) saturate(0.3)');
    expect(dimFilter(250)).toBe(dimFilter(100));
  });
});
