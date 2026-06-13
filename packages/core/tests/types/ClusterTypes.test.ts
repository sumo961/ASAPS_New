/**
 * Tests for the constants exported from ClusterTypes — the type
 * definitions themselves aren't testable (TypeScript erases at
 * runtime), but the default values + container type registry have
 * load-bearing values that the UI + flowchart rely on.
 *
 * Coverage focus:
 *   - DEFAULT_CONTAINER_ANIMATION durations and easings (cluster
 *     expand/collapse uses these directly)
 *   - DEFAULT_CONTAINER_DIMENSIONS values match the implicit
 *     contract used elsewhere (e.g. ClusterPositioning header band,
 *     beat-viewport sizing)
 *   - CLUSTER_CONTAINER_TYPES registry: keys are the canonical
 *     'spatial' | 'organizational' values used in Cluster.type
 *   - Each registered type has a non-empty icon + description
 *     (the editor's container-type dropdown shows these)
 *   - Capability flags are consistent (spatial supports map
 *     graphics; organizational does not)
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTAINER_ANIMATION,
  DEFAULT_CONTAINER_DIMENSIONS,
  CLUSTER_CONTAINER_TYPES,
} from '../../src/types/ClusterTypes';

describe('DEFAULT_CONTAINER_ANIMATION', () => {
  it('expand duration is 300ms', () => {
    // Animations under 200ms feel snappy but uncomfortable; over
    // 500ms feel sluggish. 300ms is the "click → expanded"
    // sweet spot. Pin so a future refactor is a deliberate edit.
    expect(DEFAULT_CONTAINER_ANIMATION.expand.duration).toBe(300);
  });

  it('collapse duration is 250ms (faster than expand)', () => {
    // Collapse should feel quicker — the user is removing UI,
    // they don't want to wait. ~250ms feels right.
    expect(DEFAULT_CONTAINER_ANIMATION.collapse.duration).toBe(250);
  });

  it('expand uses easeOut (settles gently)', () => {
    // easeOut decelerates as it ends — feels like "settling
    // into place".
    expect(DEFAULT_CONTAINER_ANIMATION.expand.easing).toBe('easeOut');
  });

  it('collapse uses easeIn (accelerates as it disappears)', () => {
    expect(DEFAULT_CONTAINER_ANIMATION.collapse.easing).toBe('easeIn');
  });

  it('every duration is positive', () => {
    expect(DEFAULT_CONTAINER_ANIMATION.expand.duration).toBeGreaterThan(0);
    expect(DEFAULT_CONTAINER_ANIMATION.collapse.duration).toBeGreaterThan(0);
  });

  it('every easing string is non-empty', () => {
    expect(DEFAULT_CONTAINER_ANIMATION.expand.easing.length).toBeGreaterThan(0);
    expect(DEFAULT_CONTAINER_ANIMATION.collapse.easing.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_CONTAINER_DIMENSIONS', () => {
  it('headerHeight is 40px (matches ClusterPositioning isPositionInContainer guard)', () => {
    // Critical implicit contract: ClusterPositioning uses
    // DEFAULT_CONTAINER_DIMENSIONS.headerHeight directly when
    // rejecting beat positions inside the header band. Changing
    // the value here without updating that consumer would
    // immediately let beats land inside the header.
    expect(DEFAULT_CONTAINER_DIMENSIONS.headerHeight).toBe(40);
  });

  it('mapArea defaults to 400×300', () => {
    // The 4:3 aspect ratio for the embedded map view.
    expect(DEFAULT_CONTAINER_DIMENSIONS.mapArea).toEqual({
      width: 400,
      height: 300,
    });
  });

  it('beatViewport defaults to 400×400 (square)', () => {
    // Square viewport for beat layout — gives the auto-distribute
    // algorithm a clean N×N grid to work with.
    expect(DEFAULT_CONTAINER_DIMENSIONS.beatViewport).toEqual({
      width: 400,
      height: 400,
    });
  });

  it('beatViewport is at least as wide as mapArea', () => {
    // The map area sits ABOVE the beat viewport; they share the
    // same width when stacked. Pin this invariant so a future
    // dimension change doesn't accidentally narrow the viewport
    // below the map width.
    expect(DEFAULT_CONTAINER_DIMENSIONS.beatViewport.width)
      .toBeGreaterThanOrEqual(DEFAULT_CONTAINER_DIMENSIONS.mapArea.width);
  });

  it('all dimensions are positive integers', () => {
    expect(DEFAULT_CONTAINER_DIMENSIONS.headerHeight).toBeGreaterThan(0);
    expect(DEFAULT_CONTAINER_DIMENSIONS.mapArea.width).toBeGreaterThan(0);
    expect(DEFAULT_CONTAINER_DIMENSIONS.mapArea.height).toBeGreaterThan(0);
    expect(DEFAULT_CONTAINER_DIMENSIONS.beatViewport.width).toBeGreaterThan(0);
    expect(DEFAULT_CONTAINER_DIMENSIONS.beatViewport.height).toBeGreaterThan(0);
  });
});

describe('CLUSTER_CONTAINER_TYPES', () => {
  it('has exactly the two canonical types: spatial + organizational', () => {
    // Cluster.type is typed as 'spatial' | 'organizational'.
    // Adding a key here without updating the type union would
    // silently desync the type system from the runtime registry.
    expect(Object.keys(CLUSTER_CONTAINER_TYPES).sort()).toEqual([
      'organizational', 'spatial',
    ]);
  });

  it('spatial supports map graphics (the type\'s defining capability)', () => {
    expect(CLUSTER_CONTAINER_TYPES.spatial.supportsMapGraphics).toBe(true);
  });

  it('organizational does NOT support map graphics', () => {
    // The whole point of the org/spatial distinction. Pin so a
    // future "all clusters can have maps" change is deliberate.
    expect(CLUSTER_CONTAINER_TYPES.organizational.supportsMapGraphics).toBe(false);
  });

  it('both types support expand/collapse + beat containment', () => {
    // These are universal cluster capabilities — every cluster
    // can hold beats and can be collapsed in the UI.
    for (const type of Object.values(CLUSTER_CONTAINER_TYPES)) {
      expect(type.supportsExpandCollapse).toBe(true);
      expect(type.supportsBeatContainment).toBe(true);
    }
  });

  it('every type has a non-empty icon (used in the type dropdown)', () => {
    // A missing icon would render as empty in the dropdown,
    // making the entry indistinguishable from neighbors.
    for (const [key, type] of Object.entries(CLUSTER_CONTAINER_TYPES)) {
      expect(type.icon.length, `icon for ${key}`).toBeGreaterThan(0);
    }
  });

  it('every type has a non-empty description', () => {
    for (const [key, type] of Object.entries(CLUSTER_CONTAINER_TYPES)) {
      expect(type.description.length, `description for ${key}`).toBeGreaterThan(0);
    }
  });
});
