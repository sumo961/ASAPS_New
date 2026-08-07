import { describe, it, expect } from 'vitest';
import { beatSuppressesScreenHuds, HUD_FREE_BEAT_TYPES } from '../../src/utils/hudVisibility';

describe('beatSuppressesScreenHuds', () => {
  it('suppresses HUDs on the title screen by default', () => {
    expect(beatSuppressesScreenHuds('titleScreen')).toBe(true);
  });

  it('leaves every other beat type alone', () => {
    for (const t of ['infoText', 'dialogTree', 'durScreen', 'endScreen', 'aiConversation']) {
      expect(beatSuppressesScreenHuds(t)).toBe(false);
    }
  });

  it('honours the author opt-in (never locks the author out)', () => {
    expect(beatSuppressesScreenHuds('titleScreen', { showOnTitleScreen: true })).toBe(false);
    expect(beatSuppressesScreenHuds('titleScreen', { showOnTitleScreen: false })).toBe(true);
  });

  it('treats a missing/unknown beat type as "show" (fail open, never hide chrome by accident)', () => {
    expect(beatSuppressesScreenHuds(undefined)).toBe(false);
    expect(beatSuppressesScreenHuds(null)).toBe(false);
    expect(beatSuppressesScreenHuds('')).toBe(false);
    expect(beatSuppressesScreenHuds('someFutureBeat')).toBe(false);
  });

  it('exposes titleScreen as the chrome-free set', () => {
    expect([...HUD_FREE_BEAT_TYPES]).toEqual(['titleScreen']);
  });
});
