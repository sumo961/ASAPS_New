/**
 * Mood tokens, compact (author's request, 2026-11-21):
 *  - never the initial and the name together;
 *  - a token on its own character needs neither;
 *  - "shown on click": only the coloured square until it is clicked;
 *  - docked at the character's feet, clear of speech bubbles;
 *  - tokens of characters who stand close step aside for each other.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CharacterMoodToken, MoodRail, chipParts, stepAside } from '../../src/components/CharacterMoodToken';
import { calculateCharacterAnchorPosition } from '../../src/components/CharacterMoodFrame';

const base = { enabled: true, dockMode: 'character', anchor: 'top-right', offset: { x: 0, y: 0 }, size: 140, showQualitativeLabel: true } as any;
const token = (config: any) => render(
  <CharacterMoodToken valence={-0.6} arousal={0.6} config={{ ...base, ...config }} characterName="Tomas"
    characterPosition={{ x: 280, y: 310 }} characterDimensions={{ width: 220, height: 440 }} containerDimensions={{ width: 1024, height: 768 }} />,
);

describe('what a mood token shows', () => {
  it('never the initial and the name together', () => {
    for (const own of [true, false]) for (const collapsible of [true, false]) for (const open of [true, false]) {
      const p = chipParts({ hasName: true, showLabel: true, own, collapsible, open });
      expect(p.mark && p.name).toBe(false);
    }
  });

  it('beside its character: the name and the mood word, no initial', () => {
    const { container } = token({});
    expect(container.textContent).toBe('Tomashostile');
  });

  it('on its own character: the mood word alone', () => {
    const { container } = token({ anchor: 'base' });
    expect(container.textContent).toBe('hostile');
  });

  it('in the row at a screen corner: the name and the mood word, no initial', () => {
    const { container } = render(<MoodRail entries={[{ key: 't', valence: 0, arousal: 0, characterName: 'Tomas', showLabel: true }]} screenPosition="screen-top-right" containerDimensions={{ width: 1024, height: 768 }} />);
    expect(container.textContent).toBe('Tomasneutral');
  });
});

describe('a token whose name and mood show on click', () => {
  it('is the square and the initial until clicked, then the name and the word', () => {
    const { container } = token({ labelMode: 'onClick' });
    const chip = container.querySelector('button')!;
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toBe('T');
    expect(chip.getAttribute('aria-label')).toBe('Tomas, hostile');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toBe('Tomashostile');
    fireEvent.click(chip);
    expect(container.textContent).toBe('T');
  });

  it('on its own character is the square alone, and names the character when opened', () => {
    const { container } = token({ labelMode: 'onClick', anchor: 'base' });
    expect(container.textContent).toBe('');
    fireEvent.click(container.querySelector('button')!);
    expect(container.textContent).toBe('Tomashostile');
  });

  it('keeps its click to itself (the stage would take it as Continue)', () => {
    const onStage = vi.fn();
    const { container } = render(<div onClick={onStage}><CharacterMoodToken valence={0} arousal={0} config={{ ...base, labelMode: 'onClick' }} characterName="Tomas"
      characterPosition={{ x: 280, y: 310 }} characterDimensions={{ width: 220, height: 440 }} /></div>);
    fireEvent.click(container.querySelector('button')!);
    expect(onStage).not.toHaveBeenCalled();
  });

  it('in the row at a screen corner too', () => {
    const { container } = render(<MoodRail entries={[{ key: 't', valence: 0, arousal: 0, characterName: 'Tomas', showLabel: true, collapsible: true }]} screenPosition="screen-top-right" containerDimensions={{ width: 1024, height: 768 }} />);
    expect(container.textContent).toBe('T');
  });
});

describe("docked at the character's feet", () => {
  it('sits on the character, centred, just above the foot of their picture', () => {
    const at = calculateCharacterAnchorPosition('base', { x: 280, y: 310 }, { width: 220, height: 440 }, { x: 0, y: 0 }, 100, 38);
    expect(at.x).toBe(280 + 110 - 50);
    expect(at.y + 38).toBeLessThanOrEqual(310 + 440);
    expect(at.y).toBeGreaterThan(310 + 440 - 38 - 20);
  });

  it('stays on the stage when the picture runs off its bottom edge', () => {
    const { container } = render(<CharacterMoodToken valence={0} arousal={0} config={{ ...base, anchor: 'base' }} characterName="Tomas"
      characterPosition={{ x: 280, y: 310 }} characterDimensions={{ width: 220, height: 600 }} containerDimensions={{ width: 1024, height: 768 }} />);
    const el = container.firstElementChild as HTMLElement;
    expect(parseFloat(el.style.top)).toBeLessThan(768);
  });
});

describe('tokens of characters who stand close', () => {
  const stage = { left: 0, top: 0, right: 1024, bottom: 768 };
  it('stays where it is when nothing is in the way', () => {
    expect(stepAside({ left: 500, top: 272, right: 670, bottom: 310 }, [{ left: 100, top: 272, right: 270, bottom: 310 }], stage)).toBe(0);
  });

  it('moves above the token it would lie on', () => {
    const dy = stepAside({ left: 800, top: 272, right: 970, bottom: 310 }, [{ left: 750, top: 272, right: 920, bottom: 310 }], stage);
    expect(dy).toBe(-(38 + 4));
  });

  it('moves below where there is no room above', () => {
    const dy = stepAside({ left: 800, top: 10, right: 970, bottom: 48 }, [{ left: 750, top: 10, right: 920, bottom: 48 }], stage);
    expect(dy).toBe(38 + 4);
  });

  it('works on boxes whose sides are getters, as those of a DOMRect are', () => {
    const rect = (l: number, t: number, r: number, b: number) => Object.create({ get left() { return l; }, get top() { return t; }, get right() { return r; }, get bottom() { return b; } });
    expect(stepAside(rect(800, 272, 970, 310), [rect(750, 272, 920, 310)], stage)).toBe(-(38 + 4));
  });

  it('goes below when a panel is in the way above', () => {
    const neighbour = { left: 750, top: 272, right: 920, bottom: 310 };
    const panel = { left: 860, top: 80, right: 1010, bottom: 270 };
    const dy = stepAside({ left: 800, top: 272, right: 970, bottom: 310 }, [neighbour, panel], stage);
    expect(dy).toBe(38 + 4);
  });

  it('clears a second one that is in the way of the first move', () => {
    const others = [{ left: 750, top: 272, right: 920, bottom: 310 }, { left: 760, top: 230, right: 930, bottom: 268 }];
    const mine = { left: 800, top: 272, right: 970, bottom: 310 };
    const dy = stepAside(mine, others, stage);
    const at = { ...mine, top: mine.top + dy, bottom: mine.bottom + dy };
    for (const o of others) expect(at.top >= o.bottom || at.bottom <= o.top).toBe(true);
    expect(Math.abs(dy)).toBeLessThanOrEqual(38 + 4);   // the short way: below, not past both above
  });
});
