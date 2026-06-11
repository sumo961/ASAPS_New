/**
 * Tests for ARBeat — augmented-reality scene with anchor overlays.
 * Experimental beat (EXP pill in palette).
 *
 * The anchor.onTap routing is the same asaps:// surface as qrScan,
 * which already has its own dedicated test file. The unique-to-AR
 * paths we exercise here:
 *   - bare beat id from an anchor onTap (no asaps:// prefix) is
 *     returned directly as the next-beat target
 *   - fallbackTarget overrides the default-target on cancel /
 *     permission denied (the cancel-safety contract)
 *   - anchors are mapped to the renderer's shape (including label
 *     processing through processText)
 *   - markerAssetId + trackingMode are passed through verbatim
 */
import { describe, it, expect, vi } from 'vitest';
import { ARBeat } from '../../src/beats/ARBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('ARBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults reasonable values', () => {
      const beat = new ARBeat({ id: 'b1' } as any);
      expect(beat.trackingMode).toBe('marker');
      expect(beat.anchors).toEqual([]);
      expect(beat.cancelButtonText).toBe('Skip');
    });

    it('reads anchors as an array from parameters', () => {
      const anchors = [
        { id: 'a1', label: 'Treasure', onTap: 'asaps://beat/found' },
        { id: 'a2', onTap: 'asaps://variable/found_treasure/true' },
      ];
      const beat = new ARBeat({
        id: 'b1',
        parameters: {
          prompt: 'Look around',
          trackingMode: 'marker',
          markerAssetId: 'marker-asset',
          anchors,
        },
      } as any);
      expect(beat.prompt).toBe('Look around');
      expect(beat.markerAssetId).toBe('marker-asset');
      expect(beat.anchors).toEqual(anchors);
    });

    it('coerces anchors to empty array when not array-shaped', () => {
      const beat = new ARBeat({
        id: 'b1',
        parameters: { anchors: 'oops' as any },
      } as any);
      expect(beat.anchors).toEqual([]);
    });
  });

  describe('renderer-missing fallthrough', () => {
    it('routes to fallbackTarget when renderAR is unavailable', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer, methods } = makeRenderer();
      (renderer as any).renderAR = undefined;
      const beat = new ARBeat({
        id: 'b1',
        fallbackTarget: 'no-ar-beat',
        defaultTarget: 'default-next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      // fallbackTarget wins over defaultTarget when present.
      expect(next).toBe('no-ar-beat');
      expect(methods.renderAR).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('routes to defaultTarget when renderAR is unavailable and no fallback', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer } = makeRenderer();
      (renderer as any).renderAR = undefined;
      const beat = new ARBeat({ id: 'b1', defaultTarget: 'default-next' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('default-next');
      warn.mockRestore();
    });
  });

  describe('cancel / permission_denied', () => {
    it('"cancelled" routes via fallbackTarget when configured', async () => {
      const { renderer } = makeRenderer({ renderAR: 'cancelled' });
      const beat = new ARBeat({
        id: 'b1',
        fallbackTarget: 'on-cancel',
        defaultTarget: 'default-next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('on-cancel');
    });

    it('"cancelled" falls through to defaultTarget when no fallback', async () => {
      const { renderer } = makeRenderer({ renderAR: 'cancelled' });
      const beat = new ARBeat({ id: 'b1', defaultTarget: 'default-next' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('default-next');
    });

    it('"permission_denied" follows the same fallback rule', async () => {
      const { renderer } = makeRenderer({ renderAR: 'permission_denied' });
      const beat = new ARBeat({
        id: 'b1',
        fallbackTarget: 'no-camera',
        defaultTarget: 'default-next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('no-camera');
    });

    it('records a timeline event for cancelled', async () => {
      const { renderer } = makeRenderer({ renderAR: 'cancelled' });
      const beat = new ARBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const ev = ctx.getTimeline().find((e: any) => e.beatType === 'arBeat');
      expect(ev).toBeDefined();
      expect((ev as any).text).toContain('Skipped');
    });
  });

  describe('anchor tap routing', () => {
    it('asaps://beat/<id> jumps to the target', async () => {
      const { renderer } = makeRenderer({ renderAR: 'asaps://beat/secret-room' });
      const beat = new ARBeat({
        id: 'b1',
        defaultTarget: 'default-next', // ignored
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('secret-room');
    });

    it('asaps://variable mutates and continues', async () => {
      const { renderer } = makeRenderer({
        renderAR: 'asaps://variable/found_door/true',
      });
      const beat = new ARBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(ctx.getVariable('found_door')).toBe('true');
    });

    it('asaps://inventory/add adds the item', async () => {
      const { renderer } = makeRenderer({ renderAR: 'asaps://inventory/add/key' });
      const beat = new ARBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(ctx.getInventory()).toContain('key');
    });

    it('asaps://event records and continues', async () => {
      const { renderer } = makeRenderer({ renderAR: 'asaps://event/door_opened' });
      const beat = new ARBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
    });

    it('a BARE beat id from anchor onTap is returned directly', async () => {
      // ARBeat anchors accept either asaps:// URIs OR a bare beat id
      // — the latter is just an immediate jump without state changes.
      // This is the "treasure hunt — tap the chest to go to the
      // chest beat" pattern.
      const { renderer } = makeRenderer({ renderAR: 'treasure_room_beat' });
      const beat = new ARBeat({
        id: 'b1',
        defaultTarget: 'default-next', // ignored
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('treasure_room_beat');
    });
  });

  describe('renderer payload', () => {
    it('passes trackingMode, markerAssetId, anchors, cancelButtonText', async () => {
      const { renderer, methods } = makeRenderer({ renderAR: 'cancelled' });
      const beat = new ARBeat({
        id: 'b1',
        prompt: 'Aim at marker',
        trackingMode: 'marker',
        markerAssetId: 'compiled-mind-file',
        anchors: [
          { id: 'a1', label: 'Door', onTap: 'asaps://beat/inside' },
        ],
        cancelButtonText: 'Quit',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(methods.renderAR).toHaveBeenCalledOnce();
      const [options] = methods.renderAR.mock.calls[0];
      expect(options).toMatchObject({
        prompt: 'Aim at marker',
        trackingMode: 'marker',
        markerAssetId: 'compiled-mind-file',
        cancelButtonText: 'Quit',
      });
      // Anchors are mapped, keeping the schema shape.
      expect(options.anchors).toHaveLength(1);
      expect(options.anchors[0]).toMatchObject({
        id: 'a1',
        label: 'Door',
        onTap: 'asaps://beat/inside',
      });
    });

    it('omits an anchor label when it was undefined (no empty-string leak)', async () => {
      const { renderer, methods } = makeRenderer({ renderAR: 'cancelled' });
      const beat = new ARBeat({
        id: 'b1',
        anchors: [
          { id: 'a1', onTap: 'asaps://beat/x' }, // no label
        ],
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [options] = methods.renderAR.mock.calls[0];
      expect(options.anchors[0].label).toBeUndefined();
    });
  });
});
