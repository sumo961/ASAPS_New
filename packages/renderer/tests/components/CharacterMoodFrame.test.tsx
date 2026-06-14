/**
 * Tests for CharacterMoodFrame — the read-only mood-pad HUD (Russell's
 * circumplex). Pure presentational. Covers the enabled gate, the qualitative
 * valence/arousal descriptor ladder, unit clamping, the optional header, the
 * qualitative-label toggle, and screen-corner docking.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CharacterMoodFrame,
  DEFAULT_MOOD_FRAME_CONFIG,
  type MoodFrameConfig,
  type CharacterMoodFrameProps,
} from '../../src/components/CharacterMoodFrame';

const config = (over: Partial<MoodFrameConfig> = {}): MoodFrameConfig => ({
  ...DEFAULT_MOOD_FRAME_CONFIG,
  enabled: true,
  ...over,
});

function renderMood(over: Partial<CharacterMoodFrameProps> = {}) {
  return render(
    <CharacterMoodFrame
      valence={0.8}
      arousal={0.3}
      config={config()}
      characterName="Red"
      characterPosition={{ x: 100, y: 100 }}
      characterDimensions={{ width: 80, height: 120 }}
      containerDimensions={{ width: 1024, height: 768 }}
      {...over}
    />,
  );
}

describe('enabled gate', () => {
  it('renders nothing when config.enabled is false', () => {
    const { container } = renderMood({ config: config({ enabled: false }) });
    expect(container.firstChild).toBeNull();
  });
});

describe('qualitative descriptor', () => {
  const cases: Array<[number, number, string]> = [
    [0.8, 0.8, 'happy, energetic'],
    [0.3, 0.3, 'pleased, alert'],
    [0, 0, 'even, steady'],
    [-0.3, -0.3, 'displeased, subdued'],
    [-0.8, -0.8, 'sad, lethargic'],
  ];
  it.each(cases)('valence %s / arousal %s → "%s"', (v, a, label) => {
    renderMood({ valence: v, arousal: a });
    expect(screen.getByText(label)).toBeDefined();
  });

  it('clamps out-of-range valence/arousal to the unit square', () => {
    renderMood({ valence: 5, arousal: 0 });
    expect(screen.getByText('happy, steady')).toBeDefined();
  });

  it('hides the qualitative label when disabled', () => {
    renderMood({ valence: 0.8, arousal: 0.3, config: config({ showQualitativeLabel: false }) });
    expect(screen.queryByText('happy, alert')).toBeNull();
  });
});

describe('header', () => {
  it('shows the character name in the header when provided', () => {
    renderMood({ characterName: 'Granny' });
    expect(screen.getByText('Granny')).toBeDefined();
  });

  it('renders without a header when no name is given', () => {
    // still renders (the qualitative label proves it mounted)
    renderMood({ characterName: undefined, valence: 0.3, arousal: 0.3 });
    expect(screen.getByText('pleased, alert')).toBeDefined();
    expect(screen.queryByText('Red')).toBeNull();
  });
});

describe('screen docking', () => {
  it('docks to the top-left corner at the 10px margin', () => {
    const { container } = renderMood({
      config: config({ dockMode: 'screen', screenPosition: 'screen-top-left' }),
    });
    const root = container.firstChild as HTMLElement;
    expect(root.style.left).toBe('10px');
    expect(root.style.top).toBe('10px');
  });
});
