import { describe, it, expect } from 'vitest';
import { salvageBeatLocations, detectProjectCorruption } from '../projectRepair';

describe('salvageBeatLocations', () => {
  it('keeps already-canonical (kind) locations untouched', () => {
    const locs = [{ kind: 'text', name: 'Title', x: 1 }, { kind: 'button', name: 'Start' }];
    const r = salvageBeatLocations(locs);
    expect(r.locations).toHaveLength(2);
    expect(r.normalized).toBe(0);
    expect(r.deleted).toBe(0);
  });

  it('upgrades legacy `type` to `kind`, preserving geometry (regression: baked titleScreen)', () => {
    const locs = [
      { type: 'text', name: 'Title', text: 'Hi', x: 128, y: 60, width: 768 },
      { type: 'button', name: 'Start Button', text: 'Start' },
    ];
    const r = salvageBeatLocations(locs);
    expect(r.normalized).toBe(2);
    expect(r.deleted).toBe(0);
    expect(r.locations[0]).toMatchObject({ kind: 'text', text: 'Hi', x: 128, width: 768 });
    expect(r.locations[1]).toMatchObject({ kind: 'button', text: 'Start' });
  });

  it('deletes corrupted (no valid kind or type) elements', () => {
    const locs = [
      { kind: 'text', name: 'ok' },
      { type: 'bogus', name: 'bad' },
      null,
      { name: 'no-kind-no-type' },
    ];
    const r = salvageBeatLocations(locs as any);
    expect(r.locations).toHaveLength(1);
    expect(r.deleted).toBe(3);
  });

  it('handles a non-array gracefully', () => {
    expect(salvageBeatLocations(undefined).locations).toEqual([]);
    expect(salvageBeatLocations({} as any).locations).toEqual([]);
  });
});

describe('detectProjectCorruption', () => {
  it('flags a partial globalSettings + legacy locations (the imported-project case)', () => {
    const project = {
      id: 'p1',
      globalSettings: { project: {}, debug: {} }, // no colors/fonts/…
      story: { beats: [{ id: 'b1', type: 'titleScreen', locations: [{ type: 'text', name: 'Title' }] }] },
    };
    const rep = detectProjectCorruption(project);
    expect(rep.corrupted).toBe(true);
    expect(rep.issues.some((i) => /settings/i.test(i))).toBe(true);
    expect(rep.issues.some((i) => /legacy/i.test(i))).toBe(true);
  });

  it('reports a clean project as not corrupted', () => {
    const project = {
      id: 'p2',
      globalSettings: { colors: {}, fonts: {}, textbox: {}, textEffects: {}, hotspots: {} },
      story: { beats: [{ id: 'b1', type: 'titleScreen', locations: [{ kind: 'text', name: 'Title' }] }] },
    };
    expect(detectProjectCorruption(project).corrupted).toBe(false);
  });
});
