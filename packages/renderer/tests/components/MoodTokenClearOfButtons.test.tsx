import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { CharacterMoodToken } from '../../src/components/CharacterMoodToken';

/**
 * On a phone in the responsive layout the Continue button and the replies
 * lie across the characters, right where a token at a character's feet is:
 * the token sat on the button.
 */
const config: any = { enabled: true, dockMode: 'character', anchor: 'base', displayStyle: 'token', size: 120, showQualitativeLabel: true, offset: { x: 0, y: 0 }, backgroundOpacity: 0.9 };

function mount(button: [number, number, number, number] | null, hidden = false) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let r: [number, number, number, number] = [0, 0, 0, 0];
    if (this.id === 'stage' || this.getAttribute('data-layer') === 'characters') r = [0, 0, 800, 600];
    else if (this.hasAttribute('data-mood-chip') || this.hasAttribute('data-mood-token')) r = [300, 540, 90, 38];
    else if (this.id === 'go' && button) r = button;
    const [x, y, w, h] = r;
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) } as DOMRect;
  });
  const view = render(
    <div id="stage">
      <div data-layer="characters">
        <CharacterMoodToken valence={-0.6} arousal={0.5} config={config} characterName="Tomas"
          characterPosition={{ x: 280, y: 200 }} characterDimensions={{ width: 130, height: 380 }} containerDimensions={{ width: 800, height: 600 }} />
      </div>
      {button && <button id="go" style={hidden ? { visibility: 'hidden' } : undefined}>Continue</button>}
    </div>,
  );
  return view.container.querySelector<HTMLElement>('[data-mood-token]')!;
}

describe('a mood token and the buttons of the story', () => {
  it('stays with its character when the only way off the button is onto the text', () => {
    // Text fills the stage above the button; below the button the stage ends.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      let r: [number, number, number, number] = [0, 0, 0, 0];
      if (this.id === 'stage' || this.getAttribute('data-layer') === 'characters') r = [0, 0, 800, 600];
      else if (this.hasAttribute('data-mood-chip') || this.hasAttribute('data-mood-token')) r = [300, 540, 90, 38];
      else if (this.id === 'go') r = [250, 520, 300, 78];
      else if (this.hasAttribute('data-speech-line')) r = [100, 20, 600, 498];
      const [x, y, w, h] = r;
      return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) } as DOMRect;
    });
    const view = render(
      <div id="stage">
        <div data-layer="characters">
          <CharacterMoodToken valence={-0.6} arousal={0.5} config={config} characterName="Tomas"
            characterPosition={{ x: 280, y: 200 }} characterDimensions={{ width: 130, height: 380 }} containerDimensions={{ width: 800, height: 600 }} />
        </div>
        <div data-speech-line="">A long line.</div>
        <button id="go">Continue</button>
      </div>,
    );
    expect(view.container.querySelector<HTMLElement>('[data-mood-token]')!.style.transform).toBe('');
  });

  afterEach(() => vi.restoreAllMocks());

  it('stays put when no button is near', () => {
    expect(mount([250, 100, 300, 60]).style.transform).toBe('');
  });

  it('moves clear of a button it would lie on (up, the shorter way)', () => {
    // Button 520–580, token 540–578: above the button, with a gap of 4.
    expect(mount([250, 520, 300, 60]).style.transform).toBe('translateY(-62px)');
  });

  it('does not go far from its character to get clear (a tall stack of replies)', () => {
    // Clear of this one only 240 px up: more than two and a half of its own heights.
    expect(mount([250, 300, 300, 290]).style.transform).toBe('');
  });

  it('takes no notice of a button that is not shown', () => {
    expect(mount([250, 520, 300, 60], true).style.transform).toBe('');
  });
});
