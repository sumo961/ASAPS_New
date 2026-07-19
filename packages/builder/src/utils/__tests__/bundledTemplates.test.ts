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
