/**
 * A mood token docked beside a character who stands at the edge of the
 * stage has no room there. It used to be slid back onto the stage, onto the
 * token of the character next to them; it goes above its own character now.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CharacterMoodToken } from '../../src/components/CharacterMoodToken';

const config = { enabled: true, dockMode: 'character', anchor: 'top-right', offset: { x: 0, y: 0 }, size: 140, showQualitativeLabel: true } as any;
const stage = { width: 1024, height: 768 };
const leftOf = (x: number, anchor = 'top-right') => {
  const { container } = render(
    <CharacterMoodToken valence={0} arousal={0} config={{ ...config, anchor }} characterName="Doctor"
      characterPosition={{ x, y: 310 }} characterDimensions={{ width: 220, height: 440 }} containerDimensions={stage} />,
  );
  return parseFloat((container.firstElementChild as HTMLElement).style.left);
};

describe('a mood token beside a character at the edge of the stage', () => {
  it('stays beside a character with room to their right', () => {
    expect(leftOf(280)).toBe(280 + 220);
  });

  it('goes above the character when there is none', () => {
    const left = leftOf(780);
    expect(left).toBeGreaterThan(780);          // not slid left, onto the neighbour's
    expect(left).toBeLessThan(780 + 220 / 2);   // centred over its own character
  });

  it('and the same at the left edge', () => {
    const left = leftOf(30, 'top-left');
    expect(left).toBeGreaterThan(30);
  });
});
