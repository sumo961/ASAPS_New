import { describe, it, expect } from 'vitest';
import {
  bubbleLineKey,
  bubbleSpeakerFor,
  earlierLineFor,
  thoughtPath,
  thoughtTrail,
  bubblePath,
  bubbleSize,
  bubbleTextMaxWidth,
  HEAVY,
  placeSpeechBubble,
  speakerLocation,
  speakPoint,
} from '../../src/utils/speechBubble';
import { applyBeatLook } from '../../src/utils/beatLook';
import { DEFAULT_THEME } from '../../src/components/PositionedBeatView';

const stage = { width: 1024, height: 768 };
const inside = (r: { x: number; y: number; width: number; height: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= stage.width && r.y + r.height <= stage.height;
const covers = (r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

describe('speakPoint', () => {
  const rect = { x: 100, y: 200, width: 200, height: 400 };
  it('defaults to the middle of the picture near its top', () => {
    expect(speakPoint(rect)).toEqual({ x: 200, y: 260 });
  });
  it('uses the point set on the picture', () => {
    expect(speakPoint(rect, { x: 0.75, y: 0.25 })).toEqual({ x: 250, y: 300 });
  });
  it('mirrors the point with the picture', () => {
    expect(speakPoint(rect, { x: 0.75, y: 0.25 }, true)).toEqual({ x: 150, y: 300 });
  });
});

describe('bubbleSize', () => {
  it('leaves room around the text inside the oval', () => {
    const s = bubbleSize(300, 24, 18, 2);
    expect(s.width).toBeGreaterThan(300 + 2 * 18 * 0.7);
    expect(s.height).toBeGreaterThan(24);
    // The text's corners sit inside the oval.
    expect((150 / s.rx) ** 2 + (12 / s.ry) ** 2).toBeLessThan(1);
  });
  it('wraps at about a quarter of the stage, within bounds', () => {
    expect(bubbleTextMaxWidth(1024)).toBe(266);
    expect(bubbleTextMaxWidth(320)).toBe(140);
    expect(bubbleTextMaxWidth(3000)).toBe(300);
  });
});

describe('placeSpeechBubble', () => {
  const size = { width: 300, height: 100 };

  it('goes above the speaker, on the stage, leaning away from the middle', () => {
    // A speaker on the left half of the stage.
    const mouth = { x: 300, y: 400 };
    const p = placeSpeechBubble({ stage, size, mouth })!;
    expect(p).not.toBeNull();
    expect(inside(p.rect)).toBe(true);
    expect(p.rect.y + p.rect.height).toBeLessThan(mouth.y);
    expect(p.rect.x + p.rect.width / 2).toBeLessThanOrEqual(mouth.x);
    // A speaker on the right half leans right.
    const q = placeSpeechBubble({ stage, size, mouth: { x: 750, y: 400 } })!;
    expect(q.rect.x + q.rect.width / 2).toBeGreaterThanOrEqual(750);
  });

  it('never covers the point it points at, and the tail ends next to it', () => {
    const mouth = { x: 512, y: 60 }; // a head at the very top: no room above
    const p = placeSpeechBubble({ stage, size, mouth })!;
    expect(p).not.toBeNull();
    expect(covers(p.rect, mouth)).toBe(false);
    expect(inside(p.rect)).toBe(true);
    expect(Math.hypot(p.tip.x - mouth.x, p.tip.y - mouth.y)).toBeLessThanOrEqual(6.01);
  });

  it('keeps clear of buttons and HUDs', () => {
    const mouth = { x: 300, y: 400 };
    const free = placeSpeechBubble({ stage, size, mouth })!;
    const hud = { x: free.rect.x - 10, y: free.rect.y - 10, width: free.rect.width + 20, height: free.rect.height + 20 };
    const p = placeSpeechBubble({ stage, size, mouth, obstacles: [{ rect: hud, weight: HEAVY }] })!;
    expect(p).not.toBeNull();
    const ox = Math.min(p.rect.x + p.rect.width, hud.x + hud.width) - Math.max(p.rect.x, hud.x);
    const oy = Math.min(p.rect.y + p.rect.height, hud.y + hud.height) - Math.max(p.rect.y, hud.y);
    expect(ox > 0 && oy > 0 ? ox * oy : 0).toBeLessThan(p.rect.width * p.rect.height * 0.25);
  });

  it("keeps clear of the speaker's face, even on a close-up", () => {
    // A character filling most of the stage, speaking from the mouth.
    const speaker = { x: 100, y: 100, width: 700, height: 1200 };
    const mouth = { x: 450, y: 420 };
    const p = placeSpeechBubble({ stage, size, mouth, speaker })!;
    expect(p).not.toBeNull();
    const face = { x: 450 - 122.5, y: 420 - 216 * 0.8, width: 245, height: 216 };
    const ox = Math.min(p.rect.x + p.rect.width, face.x + face.width) - Math.max(p.rect.x, face.x);
    const oy = Math.min(p.rect.y + p.rect.height, face.y + face.height) - Math.max(p.rect.y, face.y);
    expect(ox > 0 && oy > 0 ? ox * oy : 0).toBeLessThan(face.width * face.height * 0.1);
  });

  it('keeps clear of the face below the default point at the top of the head', () => {
    // Measured in the Preview: a picture as tall as the stage, its head at
    // the top, cut off at the right edge (Group 2's Vic).
    const big = { width: 1920, height: 1080 };
    const speaker = { x: 1085, y: 0, width: 1000, height: 1080 };
    const mouth = speakPoint(speaker); // top middle: the hair
    const p = placeSpeechBubble({ stage: big, size: { width: 398, height: 104 }, mouth, speaker })!;
    expect(p).not.toBeNull();
    const face = { x: mouth.x - 120, y: 230, width: 240, height: 170 }; // eyes to mouth
    const ox = Math.min(p.rect.x + p.rect.width, face.x + face.width) - Math.max(p.rect.x, face.x);
    const oy = Math.min(p.rect.y + p.rect.height, face.y + face.height) - Math.max(p.rect.y, face.y);
    expect(ox > 0 && oy > 0 ? ox * oy : 0).toBeLessThan(face.width * face.height * 0.1);
  });

  it('gives up (the text box shows) when the bubble does not fit', () => {
    expect(placeSpeechBubble({ stage: { width: 320, height: 568 }, size: { width: 310, height: 80 }, mouth: { x: 160, y: 300 } })).toBeNull();
    expect(placeSpeechBubble({ stage, size: { width: 300, height: 500 }, mouth: { x: 300, y: 400 } })).toBeNull();
    // The speaker's head is off the stage (a phone cuts them off).
    expect(placeSpeechBubble({ stage, size, mouth: { x: -40, y: 300 } })).toBeNull();
    // Buttons everywhere: nowhere left to go.
    const wall = { rect: { x: 0, y: 0, width: stage.width, height: stage.height }, weight: HEAVY };
    expect(placeSpeechBubble({ stage, size, mouth: { x: 300, y: 400 }, obstacles: [wall] })).toBeNull();
  });
});

describe('bubblePath', () => {
  it('draws a closed oval without a tail', () => {
    const d = bubblePath(200, 100);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toContain('L');
  });
  it('runs the outline out to the tip and back', () => {
    const d = bubblePath(200, 100, { x: 260, y: 160 });
    expect(d).toContain('L 260 160');
    expect(d.match(/ A /g)).toHaveLength(1);
  });
  it('drops the tail when the tip is inside the oval', () => {
    expect(bubblePath(200, 100, { x: 100, y: 50 })).not.toContain('L');
  });
});

describe('speakerLocation', () => {
  const locs = [
    { kind: 'text', name: 'text' },
    { kind: 'character', name: 'Wolf 1', characterId: 'c-wolf' },
    { kind: 'character', name: 'Red', characterName: 'Red' },
  ];
  it('finds the speaker by id or by placed name', () => {
    expect(speakerLocation(locs, 'c-wolf')?.name).toBe('Wolf 1');
    expect(speakerLocation(locs, 'red')?.name).toBe('Red');
  });
  it('finds nobody for narration or someone off the stage', () => {
    expect(speakerLocation(locs, undefined)).toBeUndefined();
    expect(speakerLocation(locs, 'Grandmother')).toBeUndefined();
  });
});

describe("a beat's own look", () => {
  it('turns speech bubbles on or off for the beat', () => {
    const on = applyBeatLook(DEFAULT_THEME, { speechBubbles: 'on' });
    expect(on.speakerDisplay?.lineStyle).toBe('bubble');
    const off = applyBeatLook({ ...DEFAULT_THEME, speakerDisplay: { ...DEFAULT_THEME.speakerDisplay!, lineStyle: 'bubble' } }, { speechBubbles: 'off' });
    expect(off.speakerDisplay?.lineStyle).toBe('box');
    expect(applyBeatLook(DEFAULT_THEME, {}).speakerDisplay).toBe(DEFAULT_THEME.speakerDisplay);
  });
});

describe('thought bubbles', () => {
  it('draws a closed cloud of bumps', () => {
    const d = thoughtPath(240, 120);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/ A /g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
  it('trails shrinking circles from the cloud toward the point', () => {
    const trail = thoughtTrail(240, 120, { x: 120, y: 200 });
    expect(trail).toHaveLength(3);
    expect(trail[0].r).toBeGreaterThan(trail[1].r);
    expect(trail[1].r).toBeGreaterThan(trail[2].r);
    expect(trail.every((c) => c.cy > 120 && c.cy < 200)).toBe(true);
    expect(thoughtTrail(240, 120, { x: 120, y: 60 })).toEqual([]);
  });
});

describe('the line before', () => {
  const stan = { speaker: 'c-stan', text: 'You okay?' };
  const billie = { speaker: 'c-billie', text: 'Leave me alone.' };
  it('shows with the line that came next, and not after', () => {
    expect(earlierLineFor({ earlier: stan }, billie)).toBe(stan);
    expect(earlierLineFor({ earlier: stan, earlierAnchor: bubbleLineKey(billie) }, billie)).toBe(stan);
    expect(earlierLineFor({ earlier: stan, earlierAnchor: bubbleLineKey(billie) }, { speaker: 'c-billie', text: 'Go away.' })).toBeUndefined();
    expect(earlierLineFor(undefined, billie)).toBeUndefined();
  });
  it("points a thought at the player's character when the inner voice isn't on the stage", () => {
    const locs = [
      { kind: 'character', name: 'You', characterId: 'c-you' },
      { kind: 'character', name: 'Stan', characterId: 'c-stan' },
    ];
    expect(bubbleSpeakerFor(locs, 'c-doubt', true, { player: 'c-you' })?.name).toBe('You');
    expect(bubbleSpeakerFor(locs, 'c-doubt', false, { player: 'c-you' })).toBeUndefined();
    expect(bubbleSpeakerFor(locs, 'c-stan', true, { player: 'c-you' })?.name).toBe('Stan');
  });
});
