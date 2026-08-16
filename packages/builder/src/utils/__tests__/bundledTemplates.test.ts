/**
 * Bundled-template consistency tests — keep the shipped templates and the
 * gallery registry from drifting apart or silently breaking. These read
 * the actual files under public/templates so a template edit that breaks
 * structure (dangling connection, bad variant, missing flag) fails CI
 * instead of failing a student.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const templatesDir = join(__dirname, '../../../public/templates');
const registry = JSON.parse(readFileSync(join(templatesDir, 'index.json'), 'utf-8'));

describe('template registry', () => {
  it('lists at least the rehearsal template with complete metadata', () => {
    expect(registry.templates.length).toBeGreaterThanOrEqual(1);
    for (const t of registry.templates) {
      expect(t.id).toBeTruthy();
      expect(t.file).toMatch(/\.asapst$/);
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.whatItShows).toBeTruthy();
      expect(Array.isArray(t.tags)).toBe(true);
    }
  });

  it('every registry entry has its .asapst file and source JSON on disk', () => {
    for (const t of registry.templates) {
      expect(existsSync(join(templatesDir, t.file)), `${t.file} missing`).toBe(true);
      expect(
        existsSync(join(templatesDir, 'src', t.file.replace(/\.asapst$/, '.project.json'))),
        `source for ${t.file} missing`,
      ).toBe(true);
    }
  });
});

describe('rehearsal template content', () => {
  const data = JSON.parse(
    readFileSync(join(templatesDir, 'src/rehearsal-difficult-client.project.json'), 'utf-8'),
  );
  const story = data.project.story;

  it('carries the template flag', () => {
    expect(data.project.projectType).toBe('template');
  });

  it('has a valid beat graph (firstBeatId exists, no dangling connections)', () => {
    const ids = new Set(story.beats.map((b: any) => b.id));
    expect(ids.has(story.metadata.firstBeatId)).toBe(true);
    for (const beat of story.beats) {
      for (const conn of beat.connections) {
        expect(ids.has(conn.targetId), `${beat.id} → ${conn.targetId} dangles`).toBe(true);
      }
    }
  });

  it('the AI conversation beat references the defined client character', () => {
    const conv = story.beats.find((b: any) => b.type === 'aiConversation');
    expect(conv).toBeTruthy();
    expect(conv.parameters.scenario).toBeTruthy();
    const charIds = new Set(story.characters.map((c: any) => c.id));
    expect(charIds.has(conv.parameters.npcName)).toBe(true);
  });

  it('the client has 4 disposition variants on random policy, each complete', () => {
    const karin = story.characters[0];
    expect(karin.variantSelectionPolicy).toBe('random');
    expect(karin.variants).toHaveLength(4);
    const seen = new Set<string>();
    for (const v of karin.variants) {
      expect(seen.has(v.id)).toBe(false);
      seen.add(v.id);
      expect(v.characterDescription.length).toBeGreaterThan(100); // self-contained
      expect(v.stance.warmth).toBeGreaterThanOrEqual(-1);
      expect(v.stance.warmth).toBeLessThanOrEqual(1);
      expect(v.stance.dominance).toBeGreaterThanOrEqual(-1);
      expect(v.stance.dominance).toBeLessThanOrEqual(1);
      for (const trait of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
        expect(v.traits[trait]).toBeGreaterThanOrEqual(0);
        expect(v.traits[trait]).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(v.initialMood.valence)).toBeLessThanOrEqual(1);
      expect(Math.abs(v.initialMood.arousal)).toBeLessThanOrEqual(1);
    }
  });

  it("variant agreeableness/extraversion match the circumplex derivation from neutral base (weight 0.35)", () => {
    const karin = story.characters[0];
    for (const v of karin.variants) {
      const dE = (v.stance.dominance + v.stance.warmth) / Math.SQRT2;
      const dA = (v.stance.warmth - v.stance.dominance) / Math.SQRT2;
      expect(v.traits.extraversion).toBeCloseTo(Math.min(1, Math.max(0, 0.5 + 0.35 * dE)), 1);
      expect(v.traits.agreeableness).toBeCloseTo(Math.min(1, Math.max(0, 0.5 + 0.35 * dA)), 1);
    }
  });

  it('the .asapst zip matches the source JSON', async () => {
    const JSZip = (await import('jszip')).default;
    const zipBytes = readFileSync(join(templatesDir, 'rehearsal-difficult-client.asapst'));
    const zip = await JSZip.loadAsync(zipBytes);
    const inner = JSON.parse(await zip.file('project.json')!.async('text'));
    expect(inner).toEqual(data);
  });
});

describe('counter-displays template content', () => {
  const data = JSON.parse(
    readFileSync(join(templatesDir, 'src/counter-displays.project.json'), 'utf-8'),
  );
  const story = data.project.story;
  const ada = story.characters.find((c: any) => c.id === 'char_ada');

  it('carries the template flag and a valid beat graph', () => {
    expect(data.project.projectType).toBe('template');
    const ids = new Set(story.beats.map((b: any) => b.id));
    expect(ids.has(story.metadata.firstBeatId)).toBe(true);
    for (const beat of story.beats) {
      for (const conn of beat.connections) {
        expect(ids.has(conn.targetId), `${beat.id} → ${conn.targetId} dangles`).toBe(true);
      }
    }
  });

  it('shows one counter of every kind — the point of the template', () => {
    const kinds = ada.counters.map((c: any) => c.source?.kind ?? 'authored');
    expect(new Set(kinds)).toEqual(new Set(['authored', 'sentiment', 'emotion', 'mood']));
  });

  it('declares polarity correctly per source', () => {
    const by = Object.fromEntries(ada.counters.map((c: any) => [c.name, c]));
    // A sentiment has an opposite; an emotion level does not.
    expect(by.trust.min).toBeLessThan(0);
    expect(by.fear.min).toBe(0);
    expect(by.spirits.min).toBeLessThan(0);
  });

  it('gives every bipolar ladder a band covering zero', () => {
    // Sentiments start near zero, so a ladder without one opens the story
    // by calling someone wary before they have met anyone.
    for (const c of ada.counters) {
      if (!c.bands?.length || (c.min ?? 0) >= 0) continue;
      const sorted = [...c.bands].sort((a: any, b: any) => a.from - b.from);
      let atZero = sorted[0];
      for (const b of sorted) if (0 >= b.from) atZero = b;
      expect(atZero.label, `${c.name} labels zero "${atZero.label}"`).toBe('neutral');
    }
  });

  it('moves the meters only through affect effects, never by writing a counter', () => {
    // This is what the template demonstrates: no setCounter anywhere, yet
    // three of the four meters move.
    const choices = story.beats.flatMap((b: any) => b.parameters?.choices ?? []);
    const effects = choices.flatMap((c: any) => c.effects ?? []);
    expect(effects.length).toBeGreaterThan(0);
    const kinds = new Set(effects.map((e: any) => e.type));
    expect(kinds.has('addSentiment')).toBe(true);
    expect(kinds.has('fireEmotion')).toBe(true);
    expect(kinds.has('nudgeMood')).toBe(true);
    for (const e of effects) {
      expect(['setCounter', 'incrementCounter']).not.toContain(e.type);
    }
  });

  it('points every choice at a beat that exists', () => {
    const ids = new Set(story.beats.map((b: any) => b.id));
    for (const beat of story.beats) {
      for (const choice of beat.parameters?.choices ?? []) {
        expect(choice.id, 'choice needs a stable id').toBeTruthy();
        expect(ids.has(choice.target), `choice ${choice.id} → ${choice.target} dangles`).toBe(true);
      }
    }
  });
});

describe('ordinary-wonders template content (the GPS walk)', () => {
  const data = JSON.parse(
    readFileSync(join(templatesDir, 'src/ordinary-wonders.project.json'), 'utf-8'),
  );
  const story = data.project.story;
  const beats = story.beats;

  it('carries the template flag and the Playful theme', () => {
    expect(data.project.projectType).toBe('template');
    expect(data.project.themeId).toBe('builtin-playful');
  });

  it('is a connected graph including geofence and default targets', () => {
    const ids = new Set(beats.map((b: any) => b.id));
    for (const b of beats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
      if (b.type === 'gpsLocation') {
        expect(ids.has(b.parameters.defaultTarget), `${b.id} defaultTarget dangles`).toBe(true);
        for (const e of b.parameters.xrLocations || []) {
          if (e.target) expect(ids.has(e.target), `${b.id} geofence → ${e.target} dangles`).toBe(true);
        }
      }
    }
  });

  it('contains NO authored coordinates — the walk works anywhere', () => {
    // Same rule as the GPS field kit: capture + scatter around the live
    // player, never a lat/lng someone typed in for their own street.
    const flat = JSON.stringify(beats);
    expect(flat).not.toMatch(/"lat"|"lng"|"fallbackLat"/);
    const modes = beats.filter((b: any) => b.type === 'setGpsLocation').map((b: any) => b.parameters.mode);
    expect(modes).toEqual(['capture', 'scatter']);
    const scatter = beats.find((b: any) => b.type === 'setGpsLocation' && b.parameters.mode === 'scatter');
    expect(scatter.parameters.centerSource).toBe('current');
    expect(scatter.parameters.placement).toBe('walkable');
  });

  it('every geofence binds to a point set some setGpsLocation writes', () => {
    const written = new Set(
      beats.filter((b: any) => b.type === 'setGpsLocation').map((b: any) => b.parameters.pointName),
    );
    const bound = beats
      .filter((b: any) => b.type === 'gpsLocation')
      .flatMap((b: any) => (b.parameters.xrLocations || []).map((e: any) => e.pointName));
    expect(bound.length).toBeGreaterThan(0);
    for (const name of bound) expect(written.has(name), `no setGpsLocation writes '${name}'`).toBe(true);
  });

  it("orders the walk beat's honest skip exit FIRST in connections", () => {
    // getNextBeat() takes the first unconditional connection — the AR-fixture
    // field failure. Skipping the walk must never masquerade as arrival.
    const walk = beats.find((b: any) => b.id === 'beat_walk');
    expect(walk.connections[0].targetId).toBe('beat_desk');
    expect(walk.parameters.defaultTarget).toBe('beat_desk');
  });

  it('echoes the named wonder only on the path where it was named', () => {
    // ${wonderName} may appear only in beats reachable AFTER beat_name —
    // the skip path never sets it and would render the literal placeholder.
    const users = beats.filter((b: any) => JSON.stringify(b.parameters).includes('${wonderName}'));
    expect(users.map((b: any) => b.id)).toEqual(['beat_entry']);
    const input = beats.find((b: any) => b.type === 'inputText');
    expect(input.parameters.variable).toBe('wonderName');
    expect(input.parameters.saveToType).toBe('variable');
  });

  it('its GPS beats construct from the stored params without throwing', async () => {
    const { SetGpsLocationBeat, GpsLocationBeat } = await import('@asaps/core');
    for (const b of beats.filter((b: any) => b.type === 'setGpsLocation')) {
      const beat = new SetGpsLocationBeat({ id: b.id, type: 'setGpsLocation', parameters: b.parameters });
      expect(beat.getParameters().pointName).toBe(b.parameters.pointName);
    }
    for (const b of beats.filter((b: any) => b.type === 'gpsLocation')) {
      const beat = new GpsLocationBeat({ id: b.id, type: 'gpsLocation', parameters: b.parameters } as any);
      expect(beat.getParameters().mode).toBe(b.parameters.mode);
    }
  });

  it('the .asapst zip matches the source JSON', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(readFileSync(join(templatesDir, 'ordinary-wonders.asapst')));
    const inner = JSON.parse(await zip.file('project.json')!.async('text'));
    expect(inner).toEqual(data);
  });
});
