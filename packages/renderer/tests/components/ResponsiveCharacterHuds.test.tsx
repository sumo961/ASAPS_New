import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { ResponsiveCharacterLayer } from '../../src/components/ResponsiveCharacterLayer';
import { CharacterHudContext, type CharacterHudLookups } from '../../src/components/CharacterHudContext';

/**
 * A mood token (or meters, or an inventory) set to sit at its character was
 * drawn on the fixed canvas only: in the responsive layout it was missing.
 */
beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

const locations: any[] = [
  { id: 'a', name: 'Tomas', kind: 'character', characterId: 'char_tomas', x: 100, y: 200, width: 120, height: 300, imageUrl: 'tomas.png' },
  { id: 'b', name: 'Lamp', kind: 'prop', x: 400, y: 200, width: 60, height: 60, imageUrl: 'lamp.png' },
];
const mood = (displayStyle: 'token' | 'disc') => ({
  valence: -0.6, arousal: 0.5, characterName: 'Tomas',
  config: { enabled: true, dockMode: 'character', anchor: 'base', displayStyle, size: 120, showQualitativeLabel: true, offset: { x: 0, y: 0 }, backgroundOpacity: 0.9 } as any,
});
const meters = {
  characterName: 'Tomas',
  counters: [{ name: 'trust', label: 'Trust', value: 1, min: -5, max: 5 } as any],
  config: { dockMode: 'character', anchor: 'top', width: 140, showLabels: true, meterHeight: 10, meterSpacing: 4, offset: { x: 0, y: 0 }, style: { padding: 6 } } as any,
};

const draw = (huds: CharacterHudLookups | null) => render(
  <CharacterHudContext.Provider value={huds}>
    <div style={{ position: 'relative', width: 800, height: 600 }}>
      <ResponsiveCharacterLayer locations={locations} />
    </div>
  </CharacterHudContext.Provider>,
);

describe('what a character carries, in the responsive layout', () => {
  it('nothing without the lookups (as before)', () => {
    const { container } = draw(null);
    expect(container.querySelectorAll('[data-character-name]').length).toBe(2);
    expect(container.querySelector('[data-mood-token]')).toBeNull();
  });

  it('its mood token, once, and none for a prop', () => {
    const asked: string[] = [];
    const { container } = draw({ mood: (id) => { asked.push(id); return id === 'char_tomas' ? mood('token') : null; } });
    expect(container.querySelectorAll('[data-mood-token="Tomas"]').length).toBe(1);
    expect([...new Set(asked)]).toEqual(['char_tomas']);
  });

  it('its mood as a disc when set so', () => {
    const { container } = draw({ mood: () => mood('disc') });
    expect(container.querySelector('[data-hud-frame="mood"]')).toBeTruthy();
    expect(container.querySelector('[data-mood-token]')).toBeNull();
  });

  it('its meters', () => {
    const { container } = draw({ meters: () => meters });
    expect(container.querySelector('[data-hud-frame="meters"]')).toBeTruthy();
  });

  it('a mood HUD that is switched off stays off', () => {
    const off = mood('token'); off.config.enabled = false;
    const { container } = draw({ mood: () => off });
    expect(container.querySelector('[data-mood-token]')).toBeNull();
  });
});
