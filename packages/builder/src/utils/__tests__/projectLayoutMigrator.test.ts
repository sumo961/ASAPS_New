/**
 * Tests for projectLayoutMigrator — the bidirectional fixed⇄responsive layout
 * migration. Both migrators are pure and duck-typed (they read beat.type,
 * .locations as Map|Array, .getParameters()/.parameters, and the real
 * core-beats.json schema), so we drive them with plain fake beats. The
 * responsive→fixed path takes its default-location generator as a parameter,
 * which we stub.
 */
import { describe, it, expect, vi } from 'vitest';
import { migrateFixedToResponsive, migrateResponsiveToFixed } from '../projectLayoutMigrator';

// A duck-typed beat: type + locations + params accessors the migrator reads.
const beat = (over: any = {}) => {
  const params = over.parameters ?? {};
  return {
    id: over.id ?? 'b1',
    name: over.name ?? 'Beat',
    type: over.type ?? 'titleScreen',
    locations: over.locations ?? new Map(),
    parameters: params,
    getParameters: () => params,
    ...(over.slotIntent ? { slotIntent: over.slotIntent } : {}),
  } as any;
};

const locMap = (entries: Record<string, any>) => {
  const m = new Map<string, any>();
  for (const [k, v] of Object.entries(entries)) m.set(k, { name: k, ...v });
  return m;
};

describe('migrateFixedToResponsive', () => {
  it('leaves non-visible beats untouched (same reference)', () => {
    const b = beat({ type: 'setVariable' });
    const { applied } = migrateFixedToResponsive([b]);
    expect(applied[0]).toBe(b);
  });

  it('infers slot anchors + preferredLines and clears slot locations', () => {
    const b = beat({
      type: 'titleScreen',
      parameters: { title: 'Hi' }, // short → preferredLines 1
      locations: locMap({ title: { x: 50, y: 30, width: 100, height: 40 } }),
    });
    const { applied, summary } = migrateFixedToResponsive([b], 1024, 768);
    const out: any = applied[0];

    // top-left of a 1024x768 stage → { h: 'left', v: 'top' }
    expect(out.slotIntent.title.anchor).toEqual({ h: 'left', v: 'top' });
    expect(out.slotIntent.title.preferredLines).toBe(1);
    // the 'title' slot location was cleared (not a character/prop)
    expect(out.locations.has('title')).toBe(false);
    expect(summary[0].detail).toMatch(/cleared 1 baked position/);
  });

  it('preserves character/prop locations and adds percent fields', () => {
    const b = beat({
      type: 'titleScreen',
      parameters: { title: 'A Longer Title That Wraps To Two Lines Maybe' },
      locations: locMap({
        title: { x: 50, y: 30, width: 100, height: 40 },
        hero: { x: 400, y: 400, width: 80, height: 80, kind: 'character' },
      }),
    });
    const { applied, summary } = migrateFixedToResponsive([b], 1024, 768);
    const out: any = applied[0];

    expect(out.locations.has('hero')).toBe(true);
    const hero = out.locations.get('hero');
    expect(hero.xPercent).toBeCloseTo((400 / 1024) * 100);
    expect(hero.yPercent).toBeCloseTo((400 / 768) * 100);
    expect(summary[0].detail).toMatch(/kept 1 character\/prop location/);
  });

  it('bakes a location scale into the preserved percent rect', () => {
    const b = beat({
      type: 'titleScreen',
      parameters: {},
      // 100x100 prop drawn at scale 0.5 → visible 50x50 centered at (150,150)
      locations: locMap({ chest: { x: 100, y: 100, width: 100, height: 100, kind: 'prop', scale: 0.5 } }),
    });
    const out: any = migrateFixedToResponsive([b], 1024, 768).applied[0];
    const chest = out.locations.get('chest');
    expect(chest.width).toBeCloseTo(50);
    expect(chest.height).toBeCloseTo(50);
    expect(chest.x).toBeCloseTo(125); // center 150 - 25
    expect(chest.scale).toBeUndefined(); // scale dropped so it isn't double-applied
  });

  it('normalizes a choice hotspot from a baked hotspot location (0..1)', () => {
    const b = beat({
      type: 'movementChoice',
      parameters: { question: 'Where?', choices: [{ text: 'Go north', locationName: 'north' }] },
      locations: locMap({ north: { x: 100, y: 100, width: 200, height: 100, kind: 'hotspot' } }),
    });
    const out: any = migrateFixedToResponsive([b], 1024, 768).applied[0];
    const hs = out.parameters.choices[0].hotspot;
    expect(hs.x).toBeCloseTo(100 / 1024);
    expect(hs.y).toBeCloseTo(100 / 768);
    expect(hs.width).toBeCloseTo(200 / 1024);
    expect(hs.height).toBeCloseTo(100 / 768);
  });

  it('handles locations supplied as an array (post-serialization)', () => {
    const b = beat({
      type: 'titleScreen',
      parameters: { title: 'Hi' },
      locations: [{ name: 'title', x: 50, y: 30, width: 100, height: 40 }],
    });
    const out: any = migrateFixedToResponsive([b], 1024, 768).applied[0];
    expect(out.slotIntent.title.anchor).toEqual({ h: 'left', v: 'top' });
  });
});

describe('migrateResponsiveToFixed', () => {
  const gen = (els: any[]) => vi.fn().mockReturnValue(els);

  it('leaves non-visible beats untouched', () => {
    const b = beat({ type: 'setVariable' });
    const g = gen([{ name: 'x' }]);
    expect(migrateResponsiveToFixed([b], g).applied[0]).toBe(b);
    expect(g).not.toHaveBeenCalled();
  });

  it('does not re-bake a beat that already has locations', () => {
    const b = beat({ type: 'infoText', locations: locMap({ text: { x: 0, y: 0 } }) });
    const g = gen([{ name: 'other' }]);
    expect(migrateResponsiveToFixed([b], g).applied[0]).toBe(b);
    expect(g).not.toHaveBeenCalled();
  });

  it('bakes schema-default locations for an empty visible beat', () => {
    const b = beat({ type: 'infoText', locations: new Map() });
    const g = gen([{ name: 'text', x: 10, y: 20 }, { name: 'actions', x: 30, y: 40 }]);
    const { applied, summary } = migrateResponsiveToFixed([b], g, 800, 600);
    const out: any = applied[0];
    expect(g).toHaveBeenCalledWith(b, b.parameters, { width: 800, height: 600 });
    expect(out.locations.get('text')).toMatchObject({ x: 10, y: 20 });
    expect(out.locations.size).toBe(2);
    expect(summary[0].detail).toMatch(/baked 2 schema-default positions/);
  });

  it('bakes canonical locations: generator `type` elements gain `kind` so the corruption detector stays quiet', async () => {
    const b = beat({ type: 'infoText', locations: new Map() });
    const g = gen([
      { name: 'text', type: 'dialog', x: 10, y: 20 },
      { name: 'continueButton', type: 'button', x: 30, y: 40 },
    ]);
    const { applied } = migrateResponsiveToFixed([b], g, 800, 600);
    const out: any = applied[0];
    expect(out.locations.get('text').kind).toBe('dialog');
    expect(out.locations.get('continueButton').kind).toBe('button');
    // builder `type` stays for the VE; renderer `kind` added alongside
    expect(out.locations.get('text').type).toBe('dialog');

    // End-to-end guard: a just-converted project must NOT read as corrupted
    // (regression: the "legacy format — upgraded" alert after every
    // responsive→fixed conversion)
    const { detectProjectCorruption } = await import('../projectRepair');
    const report = detectProjectCorruption({
      globalSettings: { colors: {}, fonts: {}, textbox: {}, textEffects: {}, hotspots: {} },
      beats: [{ ...out, locations: Array.from(out.locations.values()) }],
    });
    expect(report.corrupted).toBe(false);
  });

  it('respects an element that already carries a kind', () => {
    const b = beat({ type: 'infoText', locations: new Map() });
    const g = gen([{ name: 'text', type: 'dialog', kind: 'text', x: 0, y: 0 }]);
    const out: any = migrateResponsiveToFixed([b], g).applied[0];
    expect(out.locations.get('text').kind).toBe('text');
  });

  it('leaves the beat unchanged when the generator throws', () => {
    const b = beat({ type: 'infoText', locations: new Map() });
    const g = vi.fn(() => {
      throw new Error('no schema');
    });
    expect(migrateResponsiveToFixed([b], g).applied[0]).toBe(b);
  });

  it('leaves the beat unchanged when the generator returns nothing', () => {
    const b = beat({ type: 'infoText', locations: new Map() });
    const { applied, summary } = migrateResponsiveToFixed([b], gen([]));
    expect(applied[0]).toBe(b);
    expect(summary).toHaveLength(0);
  });

  // AI Conversation is now a recognized visible type. In dialog mode the real
  // generator (SchemaLocationInitializer) yields text/input positions; in chat
  // mode it yields [] so the beat is left untouched (verified there).
  it('bakes positions for a dialog-mode aiConversation', () => {
    const b = beat({ type: 'aiConversation', locations: new Map(), parameters: { presentation: 'dialog' } });
    const g = gen([{ name: 'text', type: 'dialog', x: 60, y: 440 }, { name: 'input', type: 'text', x: 60, y: 640 }]);
    const out: any = migrateResponsiveToFixed([b], g, 1024, 768).applied[0];
    expect(g).toHaveBeenCalled();
    expect(out.locations.get('text')).toMatchObject({ x: 60, y: 440 });
    expect(out.locations.get('input')).toMatchObject({ x: 60, y: 640 });
  });

  it('leaves a chat-mode aiConversation untouched (generator returns nothing)', () => {
    const b = beat({ type: 'aiConversation', locations: new Map(), parameters: { presentation: 'chat' } });
    // mirrors SchemaLocationInitializer returning [] for chat mode
    const { applied } = migrateResponsiveToFixed([b], gen([]));
    expect(applied[0]).toBe(b);
  });
});
