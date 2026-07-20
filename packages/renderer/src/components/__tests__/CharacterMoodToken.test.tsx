/**
 * MoodToken / rail tests — the glance-tier mood display (v0.9.81).
 * Focus: the mood-word vocabulary and that the glyph places its blob in the
 * correct circumplex quadrant (position encodes the mood, not just colour).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { MoodToken, MoodRail, moodWord } from '../CharacterMoodToken';

afterEach(() => cleanup());

describe('moodWord', () => {
  it('names the neutral centre and the four dispositions by strength', () => {
    expect(moodWord(0, 0)).toBe('neutral');
    expect(moodWord(0.05, -0.05)).toBe('neutral');
    // warm + activated → upbeat / elated
    expect(moodWord(0.4, 0.3)).toBe('upbeat');
    expect(moodWord(0.7, 0.6)).toBe('elated');
    // cold + activated → tense / hostile
    expect(moodWord(-0.4, 0.3)).toBe('tense');
    expect(moodWord(-0.7, 0.5)).toBe('hostile');
    // cold + calm → withdrawn / despairing
    expect(moodWord(-0.4, -0.4)).toBe('withdrawn');
    expect(moodWord(-0.6, -0.6)).toBe('despairing');
    // warm + calm → content / serene
    expect(moodWord(0.4, -0.3)).toBe('content');
    expect(moodWord(0.7, -0.7)).toBe('serene');
  });

  it('clamps and tolerates out-of-range / non-finite input', () => {
    expect(moodWord(5, -5)).toBe('serene');       // clamps to (1,-1)
    expect(moodWord(NaN, NaN)).toBe('neutral');
  });
});

describe('MoodToken glyph', () => {
  const blobCenter = (v: number, a: number) => {
    const { container } = render(<MoodToken valence={v} arousal={a} size={40} />);
    const grad = container.querySelector('radialGradient')!;
    return { cx: parseFloat(grad.getAttribute('cx')!), cy: parseFloat(grad.getAttribute('cy')!) };
  };

  it('places the blob toward the mood quadrant (position encodes mood)', () => {
    // hostile: cold (v<0 → cx<50) + activated (a>0 → cy<50) → upper-left
    const hostile = blobCenter(-0.7, 0.5);
    expect(hostile.cx).toBeLessThan(50);
    expect(hostile.cy).toBeLessThan(50);
    // content: warm (cx>50) + calm (cy>50) → lower-right
    const content = blobCenter(0.6, -0.4);
    expect(content.cx).toBeGreaterThan(50);
    expect(content.cy).toBeGreaterThan(50);
  });

  it('centres the blob for a neutral mood', () => {
    const n = blobCenter(0, 0);
    expect(n.cx).toBe(50);
    expect(n.cy).toBe(50);
  });

  it('always draws the four-corner quadrant compass', () => {
    const { container } = render(<MoodToken valence={0} arousal={0} size={40} />);
    // ground + gradient rect + 4 corner ticks (+ border rect outside the clip)
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(6);
  });

  it('honours the requested pixel size', () => {
    const { container } = render(<MoodToken valence={0.3} arousal={0.3} size={64} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('64');
  });
});

describe('MoodRail', () => {
  const entries = [
    { key: 'a', valence: -0.7, arousal: 0.5, characterName: 'Iris', showLabel: true },
    { key: 'b', valence: 0.05, arousal: -0.05, characterName: 'Elena', showLabel: true },
    { key: 'c', valence: -0.3, arousal: -0.35, characterName: 'Marcus', showLabel: true },
  ];

  it('renders one chip per entry with its name and mood word', () => {
    const { container, getByText } = render(
      <MoodRail entries={entries} screenPosition="screen-top-right"
        containerDimensions={{ width: 1024, height: 768 }} />,
    );
    expect(container.querySelectorAll('svg').length).toBe(3); // one token each
    getByText('Iris'); getByText('Elena'); getByText('Marcus');
    getByText('hostile'); getByText('neutral'); getByText('withdrawn');
  });

  it('docks and wraps (no absolute per-chip positioning → no overlap)', () => {
    const { container } = render(
      <MoodRail entries={entries} screenPosition="screen-bottom-left"
        containerDimensions={{ width: 400, height: 300 }} />,
    );
    const rail = container.firstChild as HTMLElement;
    expect(rail.style.flexWrap).toBe('wrap');
    expect(rail.style.bottom).not.toBe('');
    expect(rail.style.left).not.toBe('');
  });

  it('renders nothing when empty', () => {
    const { container } = render(
      <MoodRail entries={[]} screenPosition="screen-top-right"
        containerDimensions={{ width: 1024, height: 768 }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
