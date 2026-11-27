import { describe, it, expect } from 'vitest';
import { beatAtDrop, beatIdOfNode, beatBoxesOnScreen, NEAR, type BeatBox } from '../linkDropTarget';

const box = (id: string, left: number, top: number, w = 160, h = 80): BeatBox => ({ id, left, top, right: left + w, bottom: top + h });
const boxes = [box('from', 0, 100), box('a', 300, 100), box('b', 300, 300)];

describe('beatAtDrop (where a drawn link lands)', () => {
  it('anywhere on a beat lands on it', () => {
    expect(beatAtDrop(boxes, 301, 101, 'from')).toBe('a');
    expect(beatAtDrop(boxes, 459, 179, 'from')).toBe('a');
  });

  it('just beside a beat still lands on it', () => {
    expect(beatAtDrop(boxes, 300 - NEAR + 1, 140, 'from')).toBe('a');
    expect(beatAtDrop(boxes, 380, 180 + NEAR - 1, 'from')).toBe('a');
  });

  it('further away is empty space', () => {
    expect(beatAtDrop(boxes, 300 - NEAR - 2, 140, 'from')).toBeNull();
    expect(beatAtDrop(boxes, 700, 700, 'from')).toBeNull();
  });

  it('between two beats, the nearer one', () => {
    const close = [box('a', 300, 100), box('b', 300, 200)]; // 20 px apart
    expect(beatAtDrop(close, 380, 186, 'from')).toBe('a');
    expect(beatAtDrop(close, 380, 195, 'from')).toBe('b');
  });

  it('the beat it starts from takes a drop only on its own box', () => {
    expect(beatAtDrop(boxes, 80, 140, 'from')).toBe('from');
    // just beside it (where its handle is): empty space, not "on itself"
    expect(beatAtDrop(boxes, 170, 140, 'from')).toBeNull();
  });

  it('near the beat it starts from but also near another: the other', () => {
    const tight = [box('from', 0, 100), box('a', 180, 100)];
    expect(beatAtDrop(tight, 170, 140, 'from')).toBe('a');
  });

  it('a card inside an expanded dialog and its frame are one beat; a beat on top of the starting beat wins', () => {
    const dialog = [{ id: 'd', left: 0, top: 0, right: 600, bottom: 300 }, box('d', 40, 60)];
    expect(beatAtDrop(dialog, 60, 80, 'from')).toBe('d');
    const over = [{ id: 'from', left: 0, top: 0, right: 600, bottom: 300 }, box('a', 40, 60)];
    expect(beatAtDrop(over, 60, 80, 'from')).toBe('a');
  });
});

describe('reading the beats on screen', () => {
  it('a dialog card is its beat', () => {
    expect(beatIdOfNode('dlg:beat_7:root.c0')).toBe('beat_7');
    expect(beatIdOfNode('beat_7')).toBe('beat_7');
  });

  it('takes beats, leaves cluster frames and hidden beats out', () => {
    const root = document.createElement('div');
    const mk = (id: string, w: number) => {
      const el = document.createElement('div'); el.className = 'react-flow__node'; el.setAttribute('data-id', id);
      el.getBoundingClientRect = () => ({ left: 10, top: 20, right: 10 + w, bottom: 100, width: w, height: w ? 80 : 0, x: 10, y: 20, toJSON: () => ({}) });
      root.appendChild(el);
    };
    mk('a', 160); mk('Shed', 600); mk('hidden', 0); mk('dlg:a:root', 100);
    const found = beatBoxesOnScreen((id) => id === 'a' || id === 'hidden', root);
    expect(found.map((b) => b.id)).toEqual(['a', 'a']);
  });
});
