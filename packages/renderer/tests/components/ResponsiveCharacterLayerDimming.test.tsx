/**
 * Speaker Display → "Dim characters who aren't speaking" in responsive
 * layouts: the character layer (slot and spatial views) dims the stage
 * characters who aren't the speaker.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ResponsiveCharacterLayer } from '../../src/components/ResponsiveCharacterLayer';

beforeEach(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const pic = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const locations = [
  { id: 'e1', name: 'Stan', kind: 'character', characterId: 'char_stan', characterName: 'Stan', imageUrl: pic, x: 0, y: 0, width: 300, height: 600 },
  { id: 'e2', name: 'Billie', kind: 'character', characterId: 'char_billie', characterName: 'Billie', imageUrl: pic, x: 600, y: 0, width: 300, height: 600 },
] as any[];
const filterOf = (c: HTMLElement, name: string) => (c.querySelector(`[data-character-name="${name}"]`) as HTMLElement | null)?.style.filter ?? null;

describe('ResponsiveCharacterLayer dims the characters who are not speaking', () => {
  it('dims Billie while Stan speaks', () => {
    const { container } = render(<ResponsiveCharacterLayer locations={locations} speakingCharacter="char_stan" dimSettings={{ dimSilentCharacters: true }} />);
    expect(filterOf(container, 'Billie')).toContain('brightness(0.7)');
    expect(filterOf(container, 'Stan')).toBe('');
  });

  it('dims nobody with the option off or during narration', () => {
    const off = render(<ResponsiveCharacterLayer locations={locations} speakingCharacter="char_stan" />);
    expect(filterOf(off.container, 'Billie')).toBe('');
    const narration = render(<ResponsiveCharacterLayer locations={locations} speakingCharacter="Narrator" dimSettings={{ dimSilentCharacters: true }} />);
    expect(filterOf(narration.container, 'Billie')).toBe('');
  });
});
