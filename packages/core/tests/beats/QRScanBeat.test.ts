/**
 * Tests for QRScanBeat — the camera-based QR scan beat with optional
 * asaps:// URI auto-routing. Experimental beat (EXP pill in palette);
 * runtime needs a real camera + printed QR which can't be exercised
 * in vitest, but the routing + state-update logic is pure and lives
 * in performAction.
 *
 * Coverage focus:
 *   - renderer-missing fallthrough (clean skip when renderQRScan is
 *     undefined — older players + tests stay working)
 *   - cancel / permission_denied sentinels route via getNextBeat and
 *     record a timeline event
 *   - asaps:// URI verbs all route correctly (beat / variable /
 *     inventory add / inventory remove / event)
 *   - plain-string payload saves to the configured variable
 *   - interpretAsapsUri:false ignores the parser even for asaps://
 *     payloads (saves the raw URI to the variable instead)
 *   - constructor parameter resolution from both `parameters: {}` and
 *     top-level config — the migration-tolerant path
 */
import { describe, it, expect, vi } from 'vitest';
import { QRScanBeat } from '../../src/beats/QRScanBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('QRScanBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults reasonable values when none are provided', () => {
      const beat = new QRScanBeat({ id: 'b1' } as any);
      expect(beat.prompt).toBe('Point your camera at the QR code');
      expect(beat.saveTo).toBe('scannedCode');
      expect(beat.interpretAsapsUri).toBe(true);
      expect(beat.facing).toBe('rear');
      expect(beat.matchPatterns).toEqual([]);
      expect(beat.cancelButtonText).toBe('Skip');
    });

    it('reads from nested parameters object', () => {
      const beat = new QRScanBeat({
        id: 'b1',
        parameters: {
          prompt: 'Scan a code',
          saveTo: 'myVar',
          facing: 'front',
          matchPatterns: ['^ABC\\d+$'],
          helperText: 'Hint',
          cancelButtonText: 'Cancel scan',
        },
      } as any);
      expect(beat.prompt).toBe('Scan a code');
      expect(beat.saveTo).toBe('myVar');
      expect(beat.facing).toBe('front');
      expect(beat.matchPatterns).toEqual(['^ABC\\d+$']);
      expect(beat.helperText).toBe('Hint');
      expect(beat.cancelButtonText).toBe('Cancel scan');
    });

    it('top-level config wins over nested parameters', () => {
      // Migration-tolerant path: legacy projects sometimes had
      // top-level fields, AI emissions put them in parameters.
      // The beat must read both.
      const beat = new QRScanBeat({
        id: 'b1',
        prompt: 'top-level prompt',
        parameters: { prompt: 'nested prompt' },
      } as any);
      expect(beat.prompt).toBe('top-level prompt');
    });

    it('coerces facing to "rear" for any value except "front"', () => {
      // Defensive — AI emissions occasionally produce "back" or
      // "outward". Only the two valid sentinels are accepted.
      expect(new QRScanBeat({ id: 'b1', facing: 'rear' } as any).facing).toBe('rear');
      expect(new QRScanBeat({ id: 'b1', facing: 'front' } as any).facing).toBe('front');
      expect(new QRScanBeat({ id: 'b1', facing: 'back' } as any).facing).toBe('rear');
      expect(new QRScanBeat({ id: 'b1', facing: undefined } as any).facing).toBe('rear');
    });

    it('coerces matchPatterns to an empty array when not array-shaped', () => {
      const beat = new QRScanBeat({
        id: 'b1',
        parameters: { matchPatterns: 'not-an-array' as any },
      } as any);
      expect(beat.matchPatterns).toEqual([]);
    });

    it('respects interpretAsapsUri:false', () => {
      const beat = new QRScanBeat({
        id: 'b1',
        interpretAsapsUri: false,
      } as any);
      expect(beat.interpretAsapsUri).toBe(false);
    });

    it('treats undefined interpretAsapsUri as true (the default)', () => {
      const beat = new QRScanBeat({ id: 'b1' } as any);
      expect(beat.interpretAsapsUri).toBe(true);
    });
  });

  describe('renderer-missing fallthrough', () => {
    it('skips the scan and advances to next beat when renderQRScan is unavailable', async () => {
      // Use a renderer that doesn't have renderQRScan — simulates an
      // older player without camera support. Critical guarantee from
      // the docstring: such players don't hang on an unavailable
      // surface; they just advance.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer, methods } = makeRenderer();
      // Force renderQRScan unavailable.
      (renderer as any).renderQRScan = undefined;
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next-beat' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(methods.renderQRScan).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('cancel / permission_denied sentinels', () => {
    it('routes to next beat on "cancelled"', async () => {
      const { renderer, methods } = makeRenderer({ renderQRScan: 'cancelled' });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'after-scan' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('after-scan');
      // Renderer was called with the prompt + options + locations.
      expect(methods.renderQRScan).toHaveBeenCalledOnce();
    });

    it('routes to next beat on "permission_denied"', async () => {
      const { renderer } = makeRenderer({ renderQRScan: 'permission_denied' });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'fallback' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('fallback');
    });

    it('records a timeline event for the cancelled outcome', async () => {
      const { renderer } = makeRenderer({ renderQRScan: 'cancelled' });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      // Beat.execute may push enter/exit events too; we just need to
      // see the qrScan-specific one in the trail.
      const timeline = ctx.getTimeline();
      const qrEvent = timeline.find((e: any) => e.beatType === 'qrScan');
      expect(qrEvent).toBeDefined();
      expect(qrEvent!.beatId).toBe('b1');
      expect((qrEvent as any).text).toContain('Cancelled');
    });
  });

  describe('asaps:// URI routing', () => {
    it('asaps://beat/<id> overrides the next-beat target', async () => {
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://beat/secret-room',
      });
      const beat = new QRScanBeat({
        id: 'b1',
        defaultTarget: 'normal-next', // ignored — asaps://beat overrides
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('secret-room');
    });

    it('asaps://variable/<n>/<v> sets the variable and falls through to next beat', async () => {
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://variable/health/100',
      });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(ctx.getVariable('health')).toBe('100');
    });

    it('asaps://inventory/add adds the item', async () => {
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://inventory/add/key',
      });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(ctx.getInventory()).toContain('key');
    });

    it('asaps://inventory/remove removes the item', async () => {
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://inventory/remove/key',
      });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext(c => c.addToInventory('key'));
      expect(ctx.getInventory()).toContain('key');

      await beat.execute(ctx, renderer);

      expect(ctx.getInventory()).not.toContain('key');
    });

    it('asaps://event/<name> routes to next-beat without state mutation', async () => {
      // Event verb is "log it and continue" per the docstring —
      // recordTimelineEvent already happens, runtime dispatch isn't
      // wired yet.
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://event/door_opened',
      });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      // No variable / inventory side effect.
      expect(ctx.getVariable('door_opened')).toBeUndefined();
    });

    it('does NOT interpret asaps:// when interpretAsapsUri is false', async () => {
      // Author chose to treat all QR payloads as raw strings — even
      // a valid asaps:// must go through the saveTo path, not the
      // parser. This is the "I want to inspect the URI in a
      // ConditionBeat" workflow.
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://beat/somewhere',
      });
      const beat = new QRScanBeat({
        id: 'b1',
        defaultTarget: 'next',
        interpretAsapsUri: false,
        saveTo: 'raw',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      // Next beat is the configured next-beat, NOT 'somewhere'.
      expect(next).toBe('next');
      // Raw URI got saved to the variable.
      expect(ctx.getVariable('raw')).toBe('asaps://beat/somewhere');
    });
  });

  describe('plain-string payload', () => {
    it('saves the decoded string to the configured variable', async () => {
      const { renderer } = makeRenderer({ renderQRScan: 'WORLD42' });
      const beat = new QRScanBeat({
        id: 'b1',
        defaultTarget: 'next',
        saveTo: 'scanned',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(ctx.getVariable('scanned')).toBe('WORLD42');
    });

    it('falls through to plain-string path when the asaps parser returns null', async () => {
      // Unknown asaps verb — `asaps://teleport/foo` — the parser
      // returns null and the beat continues to the save-to path.
      const { renderer } = makeRenderer({
        renderQRScan: 'asaps://teleport/foo',
      });
      const beat = new QRScanBeat({
        id: 'b1',
        defaultTarget: 'next',
        saveTo: 'raw',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(ctx.getVariable('raw')).toBe('asaps://teleport/foo');
    });
  });

  describe('render options pass-through', () => {
    it('passes facing, matchPatterns, cancelButtonText, helperText to the renderer', async () => {
      const { renderer, methods } = makeRenderer({ renderQRScan: 'WORLD42' });
      const beat = new QRScanBeat({
        id: 'b1',
        defaultTarget: 'next',
        facing: 'front',
        matchPatterns: ['^WORLD\\d+$'],
        cancelButtonText: 'Done',
        helperText: 'Try again',
        prompt: 'Scan now',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(methods.renderQRScan).toHaveBeenCalledOnce();
      const [prompt, options] = methods.renderQRScan.mock.calls[0];
      expect(prompt).toBe('Scan now');
      expect(options).toMatchObject({
        facing: 'front',
        matchPatterns: ['^WORLD\\d+$'],
        cancelButtonText: 'Done',
        helperText: 'Try again',
      });
    });

    it('omits matchPatterns from options when empty', async () => {
      // The renderer interprets "missing" as "no filtering" and
      // "empty array" the same way, but the contract explicitly
      // omits the field to be clear about intent.
      const { renderer, methods } = makeRenderer({ renderQRScan: 'WORLD42' });
      const beat = new QRScanBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [, options] = methods.renderQRScan.mock.calls[0];
      expect(options.matchPatterns).toBeUndefined();
    });
  });

  describe('getParameters round-trip', () => {
    it('serializes all configured fields', () => {
      // `node` here is the QRScanBeat's `node` parameter (asset /
      // background id slot), separate from `defaultTarget` which is
      // a Beat-level routing field that doesn't round-trip via
      // getParameters.
      const beat = new QRScanBeat({
        id: 'b1',
        prompt: 'Scan',
        saveTo: 'code',
        facing: 'front',
        matchPatterns: ['^A$'],
        cancelButtonText: 'X',
        helperText: 'H',
        interpretAsapsUri: false,
        node: 'bg-asset',
      } as any);
      const params = beat.getParameters();
      expect(params).toMatchObject({
        prompt: 'Scan',
        saveTo: 'code',
        facing: 'front',
        matchPatterns: ['^A$'],
        cancelButtonText: 'X',
        helperText: 'H',
        interpretAsapsUri: false,
        node: 'bg-asset',
      });
    });

    it('updateParameters mutates in place', () => {
      const beat = new QRScanBeat({ id: 'b1' } as any);
      beat.updateParameters({
        prompt: 'New prompt',
        facing: 'front',
        matchPatterns: ['^X$'],
      });
      expect(beat.prompt).toBe('New prompt');
      expect(beat.facing).toBe('front');
      expect(beat.matchPatterns).toEqual(['^X$']);
    });

    it('round-trips qrJumpTargets (flowchart metadata) through get/updateParameters', () => {
      // qrJumpTargets is authoring-only — the flowchart draws these as dashed
      // edges. It must survive get/updateParameters or the inspector edit is
      // dropped when the beat is reconstructed.
      const beat = new QRScanBeat({ id: 'b1', parameters: { qrJumpTargets: ['beat_2', 'beat_3'] } } as any);
      expect(beat.qrJumpTargets).toEqual(['beat_2', 'beat_3']);
      expect(beat.getParameters().qrJumpTargets).toEqual(['beat_2', 'beat_3']);

      beat.updateParameters({ qrJumpTargets: ['beat_9'] });
      expect(beat.getParameters().qrJumpTargets).toEqual(['beat_9']);

      // defaults to [] when unset; non-array is coerced to []
      expect(new QRScanBeat({ id: 'b2' } as any).getParameters().qrJumpTargets).toEqual([]);
      beat.updateParameters({ qrJumpTargets: 'nope' as any });
      expect(beat.qrJumpTargets).toEqual([]);
    });
  });
});
