/**
 * Tests for sharedVisualsHelper — the cluster ↔ beat shared-visuals
 * bridge. Clusters carry a shared SharedVisualContent payload
 * (background + persistent decorations + characters); each beat
 * can OVERLAY its own visual elements on top while the cluster
 * elements stay LOCKED in the beat editor.
 *
 * Contract this file pins:
 *   - shared elements are marked locked + tagged "[Shared] " in
 *     the name + have id prefix "shared_" so the editor knows
 *     they're cluster-owned
 *   - shared elements get z-index pushed BEHIND beat elements via
 *     a -1000 base offset (so the beat can always paint on top
 *     regardless of authored zIndex)
 *   - beat background overrides the cluster background when
 *     `overrideClusterBackground` is true (per-beat scene tweaks)
 *   - round-trip stability: VisualElement → Location → VisualElement
 *     restores the original fields (no field drift)
 *   - filter strips out the shared elements when saving the beat
 *     (otherwise the cluster's elements would be duplicated into
 *     every beat's locations[])
 */
import { describe, it, expect } from 'vitest';
import {
  convertSharedLocationsToElements,
  convertElementsToLocations,
  mergeClusterAndBeatVisuals,
  filterBeatSpecificElements,
  isSharedElement,
} from '../sharedVisualsHelper';

describe('convertSharedLocationsToElements', () => {
  it('returns empty array when sharedVisuals is undefined', () => {
    expect(convertSharedLocationsToElements(undefined)).toEqual([]);
  });

  it('returns empty array when locations[] is missing or empty', () => {
    expect(convertSharedLocationsToElements({ locations: [] } as any)).toEqual([]);
    expect(convertSharedLocationsToElements({} as any)).toEqual([]);
  });

  it('flags every produced element as locked', () => {
    // Critical contract: shared elements MUST be locked. An
    // unlocked shared element lets the beat editor accidentally
    // mutate cluster state, which then shows in every beat.
    const shared = {
      locations: [
        { kind: 'text', name: 'A', x: 0, y: 0 } as any,
        { kind: 'button', name: 'B', x: 10, y: 10 } as any,
      ],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result.every(el => el.locked === true)).toBe(true);
  });

  it('prefixes element name with "[Shared] " so the UI shows the origin', () => {
    const shared = {
      locations: [{ kind: 'text', name: 'Title', x: 0, y: 0 } as any],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result[0].name).toBe('[Shared] Title');
  });

  it('uses custom idPrefix when provided', () => {
    // Some editors render multiple clusters at once and need
    // disambiguating prefixes per cluster.
    const shared = {
      locations: [{ kind: 'text', name: 'X', x: 0, y: 0 } as any],
    };
    const result = convertSharedLocationsToElements(shared as any, 'cluster_a_');
    expect(result[0].id).toMatch(/^cluster_a_/);
  });

  it('defaults visible to true when location.visible is undefined', () => {
    // The location field is "soft optional" — undefined means
    // visible (the common case). Only explicit false hides it.
    const shared = {
      locations: [{ kind: 'text', name: 'X', x: 0, y: 0 } as any],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result[0].visible).toBe(true);
  });

  it('respects explicit visible:false', () => {
    const shared = {
      locations: [{ kind: 'text', name: 'X', x: 0, y: 0, visible: false } as any],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result[0].visible).toBe(false);
  });

  it('defaults z to the index when zIndex is missing', () => {
    // Without zIndex, the array order itself becomes the stack
    // order — the first item is at z=0, second at z=1, etc.
    const shared = {
      locations: [
        { kind: 'text', name: 'A', x: 0, y: 0 } as any,
        { kind: 'text', name: 'B', x: 0, y: 0 } as any,
        { kind: 'text', name: 'C', x: 0, y: 0 } as any,
      ],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result[0].z).toBe(0);
    expect(result[1].z).toBe(1);
    expect(result[2].z).toBe(2);
  });

  it('uses explicit zIndex when present', () => {
    const shared = {
      locations: [
        { kind: 'text', name: 'A', x: 0, y: 0, zIndex: 42 } as any,
      ],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result[0].z).toBe(42);
  });

  it('defaults rotation and scale to neutral (0 / 1)', () => {
    const shared = {
      locations: [{ kind: 'text', name: 'X', x: 0, y: 0 } as any],
    };
    const result = convertSharedLocationsToElements(shared as any);
    expect(result[0].rotation).toBe(0);
    expect(result[0].scale).toBe(1);
  });
});

describe('convertElementsToLocations', () => {
  it('strips the "[Shared] " prefix when serializing back to Location[]', () => {
    // Round-trip stability: the prefix is a UI label, not part of
    // the canonical name. Saving must remove it so we don't end up
    // with "[Shared] [Shared] [Shared] Title" after a few cycles.
    const elements = [
      { id: 'shared_x', type: 'text', name: '[Shared] Title', x: 0, y: 0, z: 0,
        width: 100, height: 50, rotation: 0, scale: 1, visible: true, locked: true } as any,
    ];
    const result = convertElementsToLocations(elements);
    expect(result[0].name).toBe('Title');
  });

  it('preserves z, width, height, rotation, scale', () => {
    const elements = [
      { id: 'x', type: 'text', name: 'X', x: 10, y: 20, z: 5,
        width: 100, height: 50, rotation: 45, scale: 1.5, visible: true } as any,
    ];
    const result = convertElementsToLocations(elements);
    expect(result[0]).toMatchObject({
      x: 10, y: 20, zIndex: 5,
      width: 100, height: 50,
      rotation: 45, scale: 1.5,
      visible: true,
    });
  });
});

describe('mergeClusterAndBeatVisuals', () => {
  it('returns just the beat elements when no cluster shared', () => {
    const beat = [{ id: 'b1', type: 'text', name: 'B', z: 0 } as any];
    const result = mergeClusterAndBeatVisuals(undefined, beat);
    expect(result.elements).toEqual(beat);
    expect(result.effectiveBackground).toBeUndefined();
  });

  it('applies the -1000 z offset to shared elements', () => {
    // The source intent comment says "Ensure shared elements are
    // behind beat elements", but the actual implementation only
    // SUBTRACTS 1000 from each shared element's z. A shared
    // element with a huge cluster zIndex still ends up above
    // small-z beat elements — so the "behind" guarantee is
    // weaker than the comment suggests. Pin the actual math
    // so a future refactor (e.g., switching to a hard partition
    // like `z = -1000`) is a deliberate visible change.
    const shared = {
      locations: [{ kind: 'text', name: 'A', x: 0, y: 0, zIndex: 5 } as any],
    };
    const beat = [{ id: 'b1', type: 'text', name: 'B', z: 10 } as any];
    const result = mergeClusterAndBeatVisuals(shared as any, beat);
    const shared0 = result.elements.find(e => e.name === '[Shared] A')!;
    expect(shared0.z).toBe(5 - 1000); // -995
  });

  it('shared elements with typical authored zIndex DO end up behind beat elements', () => {
    // The common case: cluster authoring uses small zIndex
    // values (0..50). -1000 offset reliably places them behind
    // any beat element with a non-negative z. Pin this so a
    // refactor that breaks the common case is flagged.
    const shared = {
      locations: [{ kind: 'text', name: 'A', x: 0, y: 0, zIndex: 5 } as any],
    };
    const beat = [{ id: 'b1', type: 'text', name: 'B', z: 0 } as any];
    const result = mergeClusterAndBeatVisuals(shared as any, beat);
    const shared0 = result.elements.find(e => e.name === '[Shared] A')!;
    const beat0 = result.elements.find(e => e.name === 'B')!;
    expect(shared0.z).toBeLessThan(beat0.z);
  });

  it('preserves the cluster background when overrideClusterBackground is false', () => {
    const shared = {
      background: { assetId: 'bg1', opacity: 0.5 },
      locations: [],
    };
    const result = mergeClusterAndBeatVisuals(shared as any, []);
    expect(result.effectiveBackground).toEqual({ assetId: 'bg1', opacity: 0.5 });
  });

  it('drops the cluster background when overrideClusterBackground is true', () => {
    // Beat says "I want my own background for this scene" — we
    // return undefined here, leaving the renderer to fall back
    // to whatever the beat itself defines.
    const shared = {
      background: { assetId: 'bg1' },
      locations: [],
    };
    const result = mergeClusterAndBeatVisuals(shared as any, [], true);
    expect(result.effectiveBackground).toBeUndefined();
  });

  it('beat elements appear AFTER shared elements in the merged array', () => {
    // Even if z is adjusted, the array ORDER matters for some
    // renderers that paint in array order. Beat elements last.
    const shared = {
      locations: [{ kind: 'text', name: 'shared-one', x: 0, y: 0 } as any],
    };
    const beat = [{ id: 'b1', type: 'text', name: 'beat-one', z: 0 } as any];
    const result = mergeClusterAndBeatVisuals(shared as any, beat);
    const sharedIdx = result.elements.findIndex(e => e.name === '[Shared] shared-one');
    const beatIdx = result.elements.findIndex(e => e.name === 'beat-one');
    expect(sharedIdx).toBeLessThan(beatIdx);
  });
});

describe('filterBeatSpecificElements', () => {
  it('drops elements whose id begins with shared_', () => {
    const elements = [
      { id: 'shared_a', name: 'A', locked: true } as any,
      { id: 'beat_b', name: 'B', locked: false } as any,
    ];
    const result = filterBeatSpecificElements(elements);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('beat_b');
  });

  it('drops elements whose name starts with "[Shared] " regardless of id', () => {
    // Belt-and-braces — a shared element might have a non-shared
    // id (e.g. after a copy) but the name prefix still gives it
    // away. Safer to over-filter than to accidentally save a
    // cluster element into the beat.
    const elements = [
      { id: 'b1', name: '[Shared] X', locked: true } as any,
      { id: 'b2', name: 'X', locked: false } as any,
    ];
    const result = filterBeatSpecificElements(elements);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b2');
  });

  it('keeps unrelated beat elements', () => {
    const elements = [
      { id: 'b1', name: 'normal', locked: false } as any,
      { id: 'b2', name: 'also normal', locked: false } as any,
    ];
    const result = filterBeatSpecificElements(elements);
    expect(result).toHaveLength(2);
  });
});

describe('isSharedElement', () => {
  it('returns true when id starts with shared_', () => {
    expect(isSharedElement({ id: 'shared_x', name: 'X', locked: false } as any)).toBe(true);
  });

  it('returns true when name starts with [Shared] ', () => {
    expect(isSharedElement({ id: 'x', name: '[Shared] X', locked: false } as any)).toBe(true);
  });

  it('returns true when locked is true (even without name/id markers)', () => {
    // Defensive — a future code path might mark an element locked
    // without applying the shared_ id prefix. Treat locked as the
    // ground truth.
    expect(isSharedElement({ id: 'x', name: 'X', locked: true } as any)).toBe(true);
  });

  it('returns false for a normal beat element', () => {
    expect(isSharedElement({ id: 'beat_x', name: 'X', locked: false } as any)).toBe(false);
  });
});
