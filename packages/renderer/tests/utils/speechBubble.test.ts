import { describe, it, expect } from 'vitest';
import {
  bubbleLineKey,
  bubbleReadingMs,
  bubbleSpeakerFor,
  earlierLineFor,
  thoughtPath,
  thoughtTrail,
  bubblePath,
  boxBubblePath,
  replyBubbleSize,
  drawnPictureRect,
  headPointFromAlpha,
  bubbleSize,
  bubbleTextMaxWidth,
  bubbleTextShareFor,
  replyTextMaxWidth,
  replyTextShareFor,
  HEAVY,
  LIGHT,
  OVAL_CLEAR,
  placeSpeechBubble,
  placeOffstageBubble,
  OFFSTAGE_TAIL,
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
  it("uses the beat's own width, within its limits", () => {
    expect(bubbleTextMaxWidth(1000, 0.4)).toBe(400);
    expect(bubbleTextMaxWidth(1000, 0.01)).toBe(100);
    expect(bubbleTextMaxWidth(1000, 0.95)).toBe(600);
    expect(bubbleTextMaxWidth(1024, undefined)).toBe(266);
  });
  it('finds the width for a bubble dragged to a size (bubbleSize backwards)', () => {
    // A bubble whose text is 400 wide on a 1000 stage…
    const bubble = bubbleSize(400, 60, 18, 2);
    expect(bubbleTextShareFor(bubble.width, 1000, 18, 2)).toBeCloseTo(0.4, 2);
    // …and a thought's cloud, wider by its bumps.
    expect(bubbleTextShareFor(bubble.width + 24, 1000, 18, 2, true)).toBeCloseTo(0.4, 2);
    // Dragged past the limits
    expect(bubbleTextShareFor(20, 1000, 18)).toBe(0.1);
    expect(bubbleTextShareFor(5000, 1000, 18)).toBe(0.6);
  });
  it('the reply bubble has its own width, with the same round trip', () => {
    expect(replyTextMaxWidth(1024)).toBe(348);
    expect(replyTextMaxWidth(1000, 0.5)).toBe(500);
    expect(replyTextMaxWidth(1000, 0.99)).toBe(700);
    const box = replyBubbleSize(500, 90, 18, 2);
    expect(replyTextShareFor(box.width, 1000, 18, 2)).toBeCloseTo(0.5, 2);
    expect(applyBeatLook(DEFAULT_THEME, { replyBubbleWidth: 0.5 }).speakerDisplay?.replyBubbleWidth).toBe(0.5);
  });
  it("a beat's bubble width reaches the theme", () => {
    expect(applyBeatLook(DEFAULT_THEME, { speechBubbleWidth: 0.35 }).speakerDisplay?.bubbleWidth).toBe(0.35);
    expect(applyBeatLook(DEFAULT_THEME, { stageColor: '#000000' }).speakerDisplay?.bubbleWidth).toBeUndefined();
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

describe('finding the head on a cut-out picture', () => {
  // A 100 × 200 picture, see-through around a figure: a head 30 wide at
  // x 60–89 (drawn right of the middle) from y 20, a body below it 60 wide.
  const W = 100, H = 200;
  const figure = () => {
    const a = new Uint8ClampedArray(W * H);
    for (let y = 20; y < 50; y++) for (let x = 60; x < 90; x++) a[y * W + x] = 255;
    for (let y = 50; y < 200; y++) for (let x = 40; x < 100; x++) a[y * W + x] = 255;
    return a;
  };
  it('aims at the head, wherever it is drawn, down to about the eyes', () => {
    const p = headPointFromAlpha(figure(), W, H)!;
    expect(p.x).toBeCloseTo(0.75, 2);
    expect(p.y * H).toBeGreaterThan(25);
    expect(p.y * H).toBeLessThan(45);
    expect(p.r).toBeCloseTo(0.15, 2);
  });
  it('gives up on a picture without a see-through background, or an empty one', () => {
    expect(headPointFromAlpha(new Uint8ClampedArray(W * H).fill(255), W, H)).toBeNull();
    expect(headPointFromAlpha(new Uint8ClampedArray(W * H), W, H)).toBeNull();
  });
  it('maps the picture into its box as drawn', () => {
    const box = { x: 0, y: 0, width: 1000, height: 1080 };
    expect(drawnPictureRect(box, { width: 500, height: 1080 }, 'contain')).toEqual({ x: 250, y: 0, width: 500, height: 1080 });
    expect(drawnPictureRect(box, { width: 500, height: 1080 }, 'fill')).toEqual(box);
  });
  it('ends the tail at the head, not across the face', () => {
    const mouth = { x: 300, y: 400 };
    const p = placeSpeechBubble({ stage, size: { width: 300, height: 100 }, mouth, stopShort: 40 })!;
    const d = Math.hypot(p.tip.x - mouth.x, p.tip.y - mouth.y);
    expect(d).toBeGreaterThan(35);
    expect(d).toBeLessThan(41);
  });
});

describe("the player's replies in one bubble", () => {
  it('draws a rounded box with its tail leaving the side facing the player', () => {
    const below = boxBubblePath(200, 100, { x: 150, y: 160 });
    expect(below).toContain('L 150 160');
    // The tail's base sits on the bottom edge (y = height - stroke/2).
    expect(below).toMatch(/L [\d.]+ 99 L 150 160 L [\d.]+ 99/);
    const left = boxBubblePath(200, 100, { x: -60, y: 50 });
    expect(left).toMatch(/L 1 [\d.]+ L -60 50 L 1 [\d.]+/);
    expect(boxBubblePath(200, 100)).not.toContain('NaN');
  });

  it('sizes the box to the list with padding, not an oval around it', () => {
    const box = replyBubbleSize(200, 90, 18, 2);
    expect(box.width).toBeLessThan(250);
    expect(box.height).toBeLessThan(120);
  });

  it('places a box so its tail has room past the corners', () => {
    const p = placeSpeechBubble({
      stage: { width: 1024, height: 768 },
      size: { width: 260, height: 120 },
      mouth: { x: 700, y: 300 },
      speaker: { x: 620, y: 260, width: 160, height: 480 },
      shape: 'box',
    });
    expect(p).not.toBeNull();
    const { rect, tip } = p!;
    const outside = tip.x < rect.x || tip.x > rect.x + rect.width || tip.y < rect.y || tip.y > rect.y + rect.height;
    expect(outside).toBe(true);
  });

  it('a beat can turn the reply bubble on or off over the project', () => {
    const on = applyBeatLook(DEFAULT_THEME, { replyBubble: 'on' });
    expect(on.speakerDisplay?.replyStyle).toBe('bubble');
    const off = applyBeatLook({ ...DEFAULT_THEME, speakerDisplay: { ...(DEFAULT_THEME.speakerDisplay as any), replyStyle: 'bubble', lineStyle: 'bubble' } }, { replyBubble: 'off' });
    expect(off.speakerDisplay?.replyStyle).toBe('buttons');
    expect(off.speakerDisplay?.lineStyle).toBe('bubble');
  });
});

describe('bubbleReadingMs: the replies wait while the line is read', () => {
  it('gives 300 ms a word plus 1.5 s, between 2.5 and 10 s', () => {
    expect(bubbleReadingMs("Well I've been told they're my finest feature.")).toBe(3900);
    expect(bubbleReadingMs('Hi.')).toBe(2500);
    expect(bubbleReadingMs('word '.repeat(80))).toBe(10000);
    expect(bubbleReadingMs('  ')).toBe(0);
  });
});

describe('placeOffstageBubble: replies when the player is not on the stage', () => {
  const stage = { width: 1024, height: 768 };
  const size = { width: 360, height: 90 };

  it('sits along the bottom, in the middle, with its tail pointing out of the picture', () => {
    const p = placeOffstageBubble({ stage, size })!;
    expect(p.rect.x + p.rect.width / 2).toBeCloseTo(512, 0);
    expect(p.rect.y + p.rect.height + OFFSTAGE_TAIL).toBeLessThanOrEqual(stage.height);
    expect(p.rect.y + p.rect.height).toBeGreaterThan(stage.height * 0.8);
    expect(p.tip).toEqual({ x: p.rect.x + p.rect.width / 2, y: p.rect.y + p.rect.height + OFFSTAGE_TAIL });
  });

  it('moves aside for the line being answered and for panels', () => {
    const line = { rect: { x: 380, y: 600, width: 300, height: 150 }, weight: HEAVY };
    const p = placeOffstageBubble({ stage, size, obstacles: [line] })!;
    const hits = !(p.rect.x + p.rect.width <= line.rect.x || line.rect.x + line.rect.width <= p.rect.x);
    expect(hits).toBe(false);
  });

  it('gives up when the replies are too big to be a bubble', () => {
    expect(placeOffstageBubble({ stage, size: { width: 1100, height: 90 } })).toBeNull();
    expect(placeOffstageBubble({ stage, size: { width: 360, height: 500 } })).toBeNull();
  });
});


describe('a bubble that would sit on a button or panel', () => {
  // A phone held upright: the replies fill the width under the speaker's head.
  const stage = { width: 390, height: 740 };
  const size = { width: 196, height: 276 };
  const mouth = { x: 60, y: 330 };
  const speaker = { x: 20, y: 300, width: 91, height: 440 };

  it('is not placed when every place reaches into a button', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ rect: { x: 0, y: i * 95, width: 390, height: 80 }, weight: HEAVY }));
    expect(placeSpeechBubble({ stage, size, mouth, speaker, obstacles: rows })).toBeNull();
  });

  it('takes a place clear of the button when there is one', () => {
    const button = { rect: { x: 24, y: 400, width: 341, height: 88 }, weight: HEAVY };
    const placed = placeSpeechBubble({ stage, size, mouth, speaker, obstacles: [button] });
    expect(placed).not.toBeNull();
    const r = placed!.rect;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const px = Math.min(365, Math.max(24, cx)), py = Math.min(488, Math.max(400, cy));
    expect(((px - cx) / (r.width / 2)) ** 2 + ((py - cy) / (r.height / 2)) ** 2).toBeGreaterThanOrEqual(OVAL_CLEAR * OVAL_CLEAR);
  });

  it('may have a button under a free corner of its box', () => {
    const wide = { width: 1024, height: 768 };
    const corner = { rect: { x: 0, y: 0, width: 1024, height: 768 }, weight: 0 };
    const free = placeSpeechBubble({ stage: wide, size: { width: 300, height: 160 }, mouth: { x: 500, y: 400 }, obstacles: [corner] })!;
    // A small button just inside the box's corner, outside the oval.
    const tucked = { rect: { x: free.rect.x, y: free.rect.y, width: 20, height: 12 }, weight: HEAVY };
    const again = placeSpeechBubble({ stage: wide, size: { width: 300, height: 160 }, mouth: { x: 500, y: 400 }, obstacles: [tucked] });
    expect(again).not.toBeNull();
  });
});

describe("the player's replies beside corner panels", () => {
  // Four characters in a row, the player's at the right under a meter and a
  // mood panel; the line being answered is in its bubble at the left.
  const panels = [[866, 87, 148, 188], [868, 10, 146, 69]].map(([x, y, width, height]) => ({ rect: { x, y, width, height }, weight: HEAVY }));
  const line = { rect: { x: 127, y: 177, width: 354, height: 136 }, weight: HEAVY };
  const place = (stopShort: number) => placeSpeechBubble({
    stage: { width: 1024, height: 768 }, size: { width: 381, height: 296 }, mouth: { x: 930, y: 330 },
    speaker: { x: 780, y: 310, width: 300, height: 600 }, obstacles: [...panels, line], stopShort, shape: 'box',
  });

  it('go in a bubble moved clear of the panels', () => {
    const r = place(0)!.rect;
    expect(r.x + r.width).toBeLessThanOrEqual(866 + 6);
    expect(r.x).toBeGreaterThanOrEqual(481 - 6);
  });

  it('and still do when that leaves the tail short', () => {
    const placed = place(110);
    expect(placed).not.toBeNull();
    expect(placed!.rect.x + placed!.rect.width).toBeLessThanOrEqual(866 + 6);
  });
});

describe("the player's replies and the other characters' faces", () => {
  it('take the free space above the heads rather than cover a face', () => {
    const heavy = [[866, 87, 148, 188], [868, 10, 146, 69], [127, 177, 354, 136]].map(([x, y, width, height]) => ({ rect: { x, y, width, height }, weight: HEAVY }));
    const others = [30, 280, 530].map((x) => ({ rect: { x, y: 310, width: 300, height: 600 }, weight: LIGHT }));
    for (const [stopShort, mouthY] of [[0, 330], [60, 330], [110, 330], [78, 408], [0, 408]]) {
      const placed = placeSpeechBubble({
        stage: { width: 1024, height: 768 }, size: { width: 368, height: 286 }, mouth: { x: 930, y: mouthY },
        speaker: { x: 780, y: 310, width: 300, height: 600 }, obstacles: [...heavy, ...others], stopShort, shape: 'box',
      });
      expect(placed, `stopShort ${stopShort}, mouth ${mouthY}`).not.toBeNull();
      expect(placed!.rect.y + placed!.rect.height, `stopShort ${stopShort}, mouth ${mouthY}`).toBeLessThanOrEqual(312);
    }
  });

  // Four characters across the stage, mood tokens at their feet, a long
  // line's bubble above them and four long replies: the only places left
  // for the reply bubble were on the tokens, or on the face of whoever had
  // just spoken.
  const crowded = (maxFaceCover?: number) => {
    const heavy = [[866, 87, 148, 188], [868, 10, 146, 69], [10, 10, 146, 69], [379, 98, 354, 210], [330, 704, 95, 41], [620, 704, 41, 41], [830, 704, 95, 41]]
      .map(([x, y, width, height]) => ({ rect: { x, y, width, height }, weight: HEAVY }));
    const others = [30, 280, 530].map((x) => ({ rect: { x, y: 310, width: 300, height: 600 }, weight: LIGHT }));
    return { others, placed: placeSpeechBubble({
      stage: { width: 1024, height: 768 }, size: { width: 381, height: 314 }, mouth: { x: 930, y: 408 },
      speaker: { x: 780, y: 310, width: 300, height: 600 }, obstacles: [...heavy, ...others], stopShort: 78, shape: 'box', maxFaceCover,
    }) };
  };
  // The face: the lower 60% of the head, which is the top 28% of the picture.
  const faceCover = (rect: { x: number; y: number; width: number; height: number }, o: { x: number; y: number; width: number; height: number }) => {
    const top = o.y + o.height * 0.28 * 0.4;
    const bottom = o.y + o.height * 0.28;
    const left = o.x + o.width * 0.2;
    const right = o.x + o.width * 0.8;
    const w = Math.min(rect.x + rect.width, right) - Math.max(rect.x, left);
    const h = Math.min(rect.y + rect.height, bottom) - Math.max(rect.y, top);
    return w > 0 && h > 0 ? (w * h) / ((right - left) * (bottom - top)) : 0;
  };

  it('on a full stage would land on a face', () => {
    const { placed, others } = crowded();
    expect(placed).not.toBeNull();
    expect(Math.max(...others.map((o) => faceCover(placed!.rect, o.rect)))).toBeGreaterThan(0.3);
  });

  it('so stay buttons there when asked to leave faces alone', () => {
    expect(crowded(0.3).placed).toBeNull();
  });

  it('a little of a head (the hair) is no reason to give up the bubble', () => {
    // The same stage without the line's bubble in the way: room above the heads but for a few pixels.
    const others = [30, 280, 530].map((x) => ({ rect: { x, y: 310, width: 300, height: 600 }, weight: LIGHT }));
    const placed = placeSpeechBubble({
      stage: { width: 1024, height: 768 }, size: { width: 381, height: 330 }, mouth: { x: 930, y: 408 },
      speaker: { x: 780, y: 310, width: 300, height: 600 }, obstacles: others, stopShort: 78, shape: 'box', maxFaceCover: 0.3,
    });
    expect(placed).not.toBeNull();
    expect(Math.max(...others.map((o) => faceCover(placed!.rect, o.rect)))).toBeLessThanOrEqual(0.3);
    // It does come down over the hair.
    expect(placed!.rect.y + placed!.rect.height).toBeGreaterThan(310);
  });
});

describe('the line before, on a full stage', () => {
  // Responsive layout, four characters side by side: Ingrid (left) spoke
  // before, Tomas (next to her) speaks now and his bubble has the room above
  // them. The only place left for Ingrid's earlier line was over Tomas.
  const scene = (maxFaceCover?: number) => {
    const others = [330, 590, 850].map((x) => ({ rect: { x, y: 310, width: 200, height: 460 }, weight: LIGHT }));
    const heavy = [[174, 8, 357, 334], [10, 10, 146, 69], [868, 10, 146, 69], [866, 87, 148, 188], [648, 42, 148, 44]]
      .map(([x, y, width, height]) => ({ rect: { x, y, width, height }, weight: HEAVY }));
    return placeSpeechBubble({
      stage: { width: 1024, height: 768 }, size: { width: 357, height: 334 }, mouth: { x: 170, y: 420 },
      speaker: { x: 70, y: 310, width: 200, height: 460 }, obstacles: [...heavy, ...others], stopShort: 60, maxFaceCover,
    });
  };

  it('would be put over the face of the one speaking now', () => {
    const placed = scene();
    expect(placed).not.toBeNull();
    const face = { top: 310 + 460 * 0.28 * 0.4, bottom: 310 + 460 * 0.28 };
    expect(placed!.rect.x + placed!.rect.width).toBeGreaterThan(330);
    expect(placed!.rect.y).toBeLessThan(face.bottom);
    expect(placed!.rect.y + placed!.rect.height).toBeGreaterThan(face.top);
  });

  it('goes where it covers no face (or nowhere)', () => {
    const placed = scene(0.3);
    if (!placed) return;
    const top = 310 + 460 * 0.28 * 0.4;
    const bottom = 310 + 460 * 0.28;
    for (const x of [330, 590, 850]) {
      const w = Math.min(placed.rect.x + placed.rect.width, x + 160) - Math.max(placed.rect.x, x + 40);
      const h = Math.min(placed.rect.y + placed.rect.height, bottom) - Math.max(placed.rect.y, top);
      expect(w > 0 && h > 0 ? (w * h) / (120 * (bottom - top)) : 0, `face at ${x}`).toBeLessThanOrEqual(0.3);
    }
  });
});
