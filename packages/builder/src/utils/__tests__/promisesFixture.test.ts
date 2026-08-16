/**
 * Validity guard for the bundled counter-binding example
 * (public/examples/someone-made-her-promises.asaps.zip).
 *
 * This is the story the v0.9.89 verification plan generated in Round 1 and
 * played in Round 2 — kept, per the plan's "What we keep": a throwaway that
 * proved something once is worth much less than a fixture that fails when the
 * thing regresses. It is evidence of three things at once, and each assertion
 * below maps to a measured Round-2 result:
 *
 *  - a counter can be a DISPLAY of affect (Mara's trust meter is bound to a
 *    sentiment and never written by an effect);
 *  - a words-only counter is legitimate (Marek's respect: band phrase, no bar);
 *  - choices move meters exclusively through affect effects — not one effect
 *    in the story names a counter.
 *
 * It is also the story that dead-ended: three dialogTree exits pointed at
 * `beat_intake`, which did not exist, and the validator's report went to a
 * console nobody read. The link-integrity check here pins the REPAIRED state,
 * so the fixture can never again ship with a dead end.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import { storyLinks } from '../storyLinks';
import { validateAIStory } from '../aiStoryValidator';

const ZIP = join(__dirname, '../../../public/examples/someone-made-her-promises.asaps.zip');

let story: any;

beforeAll(async () => {
  const zip = await JSZip.loadAsync(readFileSync(ZIP));
  const projectJson = await zip.file('project.json')!.async('string');
  story = JSON.parse(projectJson).project.story;
});

describe('Someone Made Her Promises fixture', () => {
  it('has no link pointing at a beat that does not exist', () => {
    const ids = new Set(story.beats.map((b: any) => b.id));
    const dangling = storyLinks(story).filter((l) => !ids.has(l.target));
    // The Round-2 bug was exactly this list being non-empty ('beat_intake').
    expect(dangling).toEqual([]);
  });

  it('passes the same validation an import runs', () => {
    const r = validateAIStory(story);
    expect(r.errors.filter((e) => e.category === 'missing_beat')).toEqual([]);
  });

  it("Mara's trust is a bound meter: sentiment-derived, banded, bipolar", () => {
    const mara = story.characters.find((c: any) => /mara/i.test(c.name));
    const trust = mara.counters.find((k: any) => k.name === 'trust');
    expect(trust.source).toEqual({ kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' });
    expect(trust.min).toBe(-100);          // bipolar — the bar grows out from zero
    expect(trust.numericFormat).toBe('band');
    expect(trust.bands.length).toBeGreaterThanOrEqual(4);
    // Seeded off-neutral, so the story opens at "Wary" rather than a lie of
    // neutrality — the Round-2 measurement started at −29.5%.
    expect(mara.initialSentiments).toContainEqual(
      expect.objectContaining({ emotion: 'trust', strength: -0.3 }),
    );
  });

  it("Marek's respect is words-only: a band phrase with no bar", () => {
    const marek = story.characters.find((c: any) => /marek/i.test(c.name));
    const respect = marek.counters.find((k: any) => k.name === 'respect');
    expect(respect.showLevelMeter).toBe(false);
    expect(respect.numericFormat).toBe('band');
    expect(respect.source?.kind).toBe('sentiment');
  });

  it('no choice effect anywhere names a counter — meters move through affect only', () => {
    const effects: any[] = [];
    const walk = (node: any) => {
      for (const c of node?.choices || []) {
        effects.push(...(c.effects || []));
        if (c.dialogNode) walk(c.dialogNode);
      }
    };
    for (const b of story.beats) walk(b.parameters?.dialogTree);
    expect(effects.length).toBeGreaterThan(0);
    const counterEffects = effects.filter((e) => /counter/i.test(e.type || e.kind || ''));
    expect(counterEffects).toEqual([]);
    // And the affect kinds Round 2 exercised are all present.
    const kinds = new Set(effects.map((e) => e.type || e.kind));
    for (const k of ['nudgeMood', 'fireEmotion', 'addSentiment']) {
      expect(kinds).toContain(k);
    }
  });
});
