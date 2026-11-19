import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { setUIStrings, UI_STRING_DEFAULTS } from '@asaps/core';
import { moodLabel } from '../../src/utils/moodWords';
import { moodWord, MoodRail } from '../../src/components/CharacterMoodToken';

describe('mood panel words', () => {
  afterEach(() => setUIStrings(null));

  it('every word the panel can show is in the catalog of runtime words', () => {
    const shown = new Set<string>();
    for (let v = -1; v <= 1; v += 0.1) for (let a = -1; a <= 1; a += 0.1) shown.add(moodWord(v, a));
    for (const word of [...shown, 'happy', 'sad', 'excited', 'calm', 'pleased', 'displeased', 'even', 'energetic', 'alert', 'lethargic', 'subdued', 'steady']) {
      setUIStrings(null);
      expect(moodLabel(word)).toBe(word);
      const translated = Object.fromEntries(Object.entries(UI_STRING_DEFAULTS).map(([k, val]) => [k, `DE ${val}`]));
      setUIStrings(translated);
      expect(moodLabel(word)).toBe(`DE ${word}`);
    }
  });

  it('the mood rail shows the translated word', () => {
    setUIStrings({ moodElated: 'begeistert' });
    const { container } = render(
      <MoodRail
        entries={[{ key: 'red', valence: 0.9, arousal: 0.9, characterName: 'Rotkäppchen', showLabel: true }]}
        screenPosition="top-left"
        containerDimensions={{ width: 1024, height: 768 }}
      />,
    );
    expect(container.textContent).toContain('begeistert');
    expect(container.textContent).not.toContain('elated');
  });
});
