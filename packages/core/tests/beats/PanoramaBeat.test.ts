/**
 * Tests for PanoramaBeat - 360-degree panorama exploration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PanoramaBeat } from '../../src/beats/PanoramaBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';
import type { PanoramaHotspot } from '../../src/generated/beat-types';

// Mock renderer factory
function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn().mockResolvedValue(undefined),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    setVisitedChoiceIds: vi.fn(),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
    renderPanorama: vi.fn().mockResolvedValue(null),
  } as unknown as IRenderer;
}

function createHotspot(overrides?: Partial<PanoramaHotspot>): PanoramaHotspot {
  return {
    id: 'hs1',
    pitch: 0,
    yaw: 0,
    text: 'Hotspot 1',
    target: 'target1',
    ...overrides,
  };
}

describe('PanoramaBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test Pano',
        type: 'panorama',
      });

      const params = beat.getParameters();
      expect(params.panoramaAssetId).toBe('');
      expect(params.projectionType).toBe('equirectangular');
      expect(params.hotspots).toEqual([]);
      expect(params.initialPitch).toBe(0);
      expect(params.initialYaw).toBe(0);
      expect(params.hfov).toBe(75);
      expect(params.autoRotate).toBe(0);
      expect(params.prompt).toBe('');
      expect(params.promptDisplay).toBe('static');
    });

    it('should create with custom parameters', () => {
      const hotspots = [createHotspot()];
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Custom Pano',
        type: 'panorama',
        parameters: {
          panoramaAssetId: 'asset-123',
          projectionType: 'cylindrical',
          hotspots,
          initialPitch: 10,
          initialYaw: -45,
          hfov: 90,
          autoRotate: 2,
          prompt: 'Look around!',
          promptDisplay: 'pinned',
        },
      });

      expect(beat.panoramaAssetId).toBe('asset-123');
      expect(beat.projectionType).toBe('cylindrical');
      expect(beat.hotspots).toHaveLength(1);
      expect(beat.initialPitch).toBe(10);
      expect(beat.initialYaw).toBe(-45);
      expect(beat.hfov).toBe(90);
      expect(beat.autoRotate).toBe(2);
      expect(beat.prompt).toBe('Look around!');
      expect(beat.promptDisplay).toBe('pinned');
    });
  });

  // -------------------------------------------------------------------------
  // getParameters
  // -------------------------------------------------------------------------
  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test Pano',
        type: 'panorama',
        parameters: {
          panoramaAssetId: 'img-1',
          projectionType: 'cylindrical',
          hfov: 60,
          prompt: 'Explore the room',
        },
      });

      const params = beat.getParameters();
      expect(params.panoramaAssetId).toBe('img-1');
      expect(params.projectionType).toBe('cylindrical');
      expect(params.hfov).toBe(60);
      expect(params.prompt).toBe('Explore the room');
      expect(params.hotspots).toEqual([]);
      expect(params.initialPitch).toBe(0);
      expect(params.initialYaw).toBe(0);
    });

    it('should include node parameter', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
      });
      beat.node = 'bg_node';
      expect(beat.getParameters().node).toBe('bg_node');
    });
  });

  // -------------------------------------------------------------------------
  // updateParameters
  // -------------------------------------------------------------------------
  describe('updateParameters', () => {
    it('should update simple parameters', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
      });

      beat.updateParameters({
        panoramaAssetId: 'new-asset',
        projectionType: 'cylindrical',
        initialPitch: 15,
        initialYaw: -30,
        hfov: 100,
        autoRotate: 5,
        prompt: 'New prompt',
        promptDisplay: 'pinned',
        node: 'new_node',
      });

      expect(beat.panoramaAssetId).toBe('new-asset');
      expect(beat.projectionType).toBe('cylindrical');
      expect(beat.initialPitch).toBe(15);
      expect(beat.initialYaw).toBe(-30);
      expect(beat.hfov).toBe(100);
      expect(beat.autoRotate).toBe(5);
      expect(beat.prompt).toBe('New prompt');
      expect(beat.promptDisplay).toBe('pinned');
      expect(beat.node).toBe('new_node');
    });

    it('should rebuild connections when hotspots are updated', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [createHotspot({ id: 'old', target: 'old_target', text: 'Old' })],
        },
      });

      const newHotspots = [
        createHotspot({ id: 'a', target: 'target_a', text: 'Door A' }),
        createHotspot({ id: 'b', target: 'target_b', text: 'Door B' }),
      ];

      beat.updateParameters({ hotspots: newHotspots });

      expect(beat.hotspots).toHaveLength(2);
      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections.some(c => c.targetId === 'target_a')).toBe(true);
      expect(connections.some(c => c.targetId === 'target_b')).toBe(true);
      // Old connection should be gone
      expect(connections.some(c => c.targetId === 'old_target')).toBe(false);
    });

    it('should skip connections for hotspots without targets', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
      });

      beat.updateParameters({
        hotspots: [
          createHotspot({ id: 'has-target', target: 'target1', text: 'Go' }),
          createHotspot({ id: 'no-target', target: '', text: 'Info' }),
        ],
      });

      // getConnections from hotspots skips those with no target
      const connections = beat.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].targetId).toBe('target1');
    });

    it('should use text as label, falling back to id', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
      });

      beat.updateParameters({
        hotspots: [
          createHotspot({ id: 'with-text', target: 't1', text: 'Pretty Label' }),
          createHotspot({ id: 'no-text', target: 't2', text: '' }),
        ],
      });

      const connections = beat.getConnections();
      expect(connections[0].label).toBe('Pretty Label');
      expect(connections[1].label).toBe('no-text');
    });

    it('should increment version on update', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
      });

      const v1 = (beat as any)._version;
      beat.updateParameters({ prompt: 'changed' });
      expect((beat as any)._version).toBe(v1 + 1);
    });
  });

  // -------------------------------------------------------------------------
  // getConnections
  // -------------------------------------------------------------------------
  describe('getConnections', () => {
    it('should return connections from hotspots', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'door', target: 'beat_door', text: 'Front Door' }),
            createHotspot({ id: 'window', target: 'beat_window', text: 'Window' }),
          ],
        },
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections[0]).toEqual({
        targetId: 'beat_door',
        label: 'Front Door',
        condition: undefined,
      });
      expect(connections[1]).toEqual({
        targetId: 'beat_window',
        label: 'Window',
        condition: undefined,
      });
    });

    it('should skip hotspots without targets', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'valid', target: 'target1', text: 'Valid' }),
            createHotspot({ id: 'empty', target: '', text: 'Decorative' }),
          ],
        },
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].targetId).toBe('target1');
    });

    it('should include conditions from hotspots', () => {
      const conditions = [
        { type: 'inventory' as const, operator: 'contains' as const, item: 'key' },
      ];

      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({
              id: 'locked-door',
              target: 'beat_secret',
              text: 'Locked Door',
              conditions,
            }),
          ],
        },
      });

      const connections = beat.getConnections();
      expect(connections[0].condition).toEqual(conditions);
    });

    it('should use hotspot text as label, falling back to id', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'with-text', target: 't1', text: 'Nice Label' }),
            createHotspot({ id: 'fallback-id', target: 't2', text: '' }),
          ],
        },
      });

      const connections = beat.getConnections();
      expect(connections[0].label).toBe('Nice Label');
      expect(connections[1].label).toBe('fallback-id');
    });

    it('should deduplicate with base class connections', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'hs1', target: 'target1', text: 'Door' }),
          ],
        },
      });

      // Add the same connection via base class
      beat.addConnection({ targetId: 'target1', label: 'Door' });

      const connections = beat.getConnections();
      // Should not duplicate
      expect(connections.filter(c => c.targetId === 'target1')).toHaveLength(1);
    });

    it('should include base class connections not in hotspots', () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'hs1', target: 'hotspot_target', text: 'Hotspot' }),
          ],
        },
      });

      beat.addConnection({ targetId: 'extra_target', label: 'Extra' });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections.some(c => c.targetId === 'hotspot_target')).toBe(true);
      expect(connections.some(c => c.targetId === 'extra_target')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // performAction
  // -------------------------------------------------------------------------
  describe('performAction (via execute)', () => {
    it('should call renderPanorama on the renderer', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test Pano',
        type: 'panorama',
        parameters: {
          hotspots: [createHotspot({ id: 'hs1', target: 'next', text: 'Go' })],
          initialPitch: 10,
          initialYaw: -20,
          hfov: 90,
          projectionType: 'equirectangular',
          prompt: 'Look around',
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('hs1');

      await beat.execute(context, renderer);

      expect(renderer.renderPanorama).toHaveBeenCalledWith(
        '', // no panoramaUrl since no story/environment
        expect.objectContaining({
          initialPitch: 10,
          initialYaw: -20,
          hfov: 90,
          projectionType: 'equirectangular',
          prompt: 'Look around',
        })
      );
    });

    it('should return selected hotspot target', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'door', target: 'beat_door', text: 'Door' }),
            createHotspot({ id: 'window', target: 'beat_window', text: 'Window' }),
          ],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('window');

      const result = await beat.execute(context, renderer);
      expect(result).toBe('beat_window');
    });

    it('should filter hotspots based on conditions', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'visible', target: 'beat_a', text: 'Open Door' }),
            createHotspot({
              id: 'locked',
              target: 'beat_b',
              text: 'Locked Door',
              conditions: [{ type: 'inventory', operator: 'contains', item: 'master_key' }],
            }),
          ],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('visible');

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderPanorama as any).mock.calls[0];
      const options = callArgs[1];
      // Only the visible hotspot should be passed (locked one filtered out)
      expect(options.hotspots).toHaveLength(1);
      expect(options.hotspots[0].id).toBe('visible');
    });

    it('should show conditional hotspot when condition is met', async () => {
      context.addToInventory('master_key');

      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({ id: 'visible', target: 'beat_a', text: 'Open Door' }),
            createHotspot({
              id: 'locked',
              target: 'beat_b',
              text: 'Locked Door',
              conditions: [{ type: 'inventory', operator: 'contains', item: 'master_key' }],
            }),
          ],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('locked');

      const result = await beat.execute(context, renderer);

      const callArgs = (renderer.renderPanorama as any).mock.calls[0];
      expect(callArgs[1].hotspots).toHaveLength(2);
      expect(result).toBe('beat_b');
    });

    it('should still render panorama when no hotspots available after filtering', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({
              id: 'locked',
              target: 'beat_secret',
              text: 'Secret',
              conditions: [{ type: 'inventory', operator: 'contains', item: 'nonexistent' }],
            }),
          ],
        },
      });

      // Panorama renders with empty hotspots — user can still explore
      (renderer.renderPanorama as any).mockResolvedValue(null);

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
      expect(renderer.renderPanorama).toHaveBeenCalled();
      const callArgs = (renderer.renderPanorama as any).mock.calls[0];
      expect(callArgs[1].hotspots).toHaveLength(0);
    });

    it('should apply effects from selected hotspot', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({
              id: 'gem',
              target: 'beat_gem',
              text: 'Gem',
              effects: [{ type: 'incrementCounter', target: 'score', value: 10 }],
            }),
          ],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('gem');

      await beat.execute(context, renderer);

      expect(context.getCounter('score')).toBe(10);
    });

    it('should record choice for AI context', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Castle Courtyard',
        type: 'panorama',
        parameters: {
          prompt: 'Explore the courtyard',
          hotspots: [
            createHotspot({ id: 'gate', target: 'beat_gate', text: 'Main Gate' }),
          ],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('gate');

      await beat.execute(context, renderer);

      const history = context.getChoiceHistory();
      expect(history).toHaveLength(1);
      expect(history[0].beatType).toBe('panorama');
      expect(history[0].choiceText).toBe('Main Gate');
      expect(history[0].beatName).toBe('Castle Courtyard');
      expect(history[0].choiceContext).toBe('Explore the courtyard');
    });

    it('should use default choiceContext when no prompt', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [createHotspot({ id: 'hs1', target: 't1', text: 'Go' })],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('hs1');
      await beat.execute(context, renderer);

      const history = context.getChoiceHistory();
      expect(history[0].choiceContext).toContain('panorama');
    });

    it('should process prompt with variable interpolation', async () => {
      context.setVariable('location', 'Castle');

      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          prompt: 'Welcome to $location$',
          hotspots: [createHotspot({ id: 'hs1', target: 't1', text: 'Go' })],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('hs1');

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderPanorama as any).mock.calls[0];
      expect(callArgs[1].prompt).toBe('Welcome to Castle');
    });

    it('should process hotspot text with variable interpolation', async () => {
      context.setVariable('direction', 'North');

      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [
            createHotspot({
              id: 'hs1',
              target: 't1',
              text: 'Go $direction$',
              displayText: 'Head $direction$',
            }),
          ],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('hs1');
      await beat.execute(context, renderer);

      const callArgs = (renderer.renderPanorama as any).mock.calls[0];
      // displayText takes precedence when present, and is interpolated
      expect(callArgs[1].hotspots[0].text).toBe('Head North');
    });

    it('should set panoramaAssetId on renderer state', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          panoramaAssetId: 'pano-img-1',
          hotspots: [createHotspot({ id: 'hs1', target: 't1', text: 'Go' })],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('hs1');
      // performAction calls setState before getStory(), which throws
      // without a story set — catch the expected error
      try { await beat.execute(context, renderer); } catch { /* expected */ }

      expect(renderer.setState).toHaveBeenCalledWith('panoramaAssetId', 'pano-img-1');
    });

    it('should return null when renderer does not support renderPanorama', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [createHotspot({ id: 'hs1', target: 't1', text: 'Go' })],
        },
      });

      // Remove renderPanorama from mock
      delete (renderer as any).renderPanorama;

      const result = await beat.execute(context, renderer);
      expect(result).toBeNull();
    });

    it('should return null when no hotspot is selected', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [createHotspot({ id: 'hs1', target: 't1', text: 'Go' })],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue(null);

      const result = await beat.execute(context, renderer);
      expect(result).toBeNull();
    });

    it('should return null when selected id does not match any hotspot', async () => {
      const beat = new PanoramaBeat({
        id: 'pano1',
        name: 'Test',
        type: 'panorama',
        parameters: {
          hotspots: [createHotspot({ id: 'hs1', target: 't1', text: 'Go' })],
        },
      });

      (renderer.renderPanorama as any).mockResolvedValue('nonexistent');

      const result = await beat.execute(context, renderer);
      expect(result).toBeNull();
    });
  });
});
