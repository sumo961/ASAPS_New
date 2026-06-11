/**
 * Tests for InfoTextBeat — the basic "show some text, advance on
 * button click" beat. Foundational: tons of authored projects use
 * it for narration / scene-setting / transitions, so a regression
 * here breaks essentially every story.
 *
 * Coverage focus:
 *   - constructor parameter resolution (text / textVariations /
 *     buttonText / locs / backgroundSound)
 *   - text-variation random selection (main text + variations all
 *     reachable, no accidental exclusion of the main text)
 *   - variable interpolation through processText
 *   - default "Continue" button text when none is configured
 *   - renderer state setup (currentBeatType + slotAnimations)
 *   - getParameters round-trip including the "omit empty arrays"
 *     contract for locs and textVariations
 */
import { describe, it, expect, vi } from 'vitest';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('InfoTextBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('reads text from top-level config', () => {
      const beat = new InfoTextBeat({ id: 'b1', text: 'Hello' } as any);
      expect(beat.text).toBe('Hello');
    });

    it('reads text from nested parameters', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        parameters: { text: 'From params' },
      } as any);
      expect(beat.text).toBe('From params');
    });

    it('top-level wins over nested parameters', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Top',
        parameters: { text: 'Nested' },
      } as any);
      expect(beat.text).toBe('Top');
    });

    it('defaults text to empty string when missing', () => {
      // Defensive — a malformed import shouldn't crash. The beat
      // still mounts; rendering shows blank text.
      const beat = new InfoTextBeat({ id: 'b1' } as any);
      expect(beat.text).toBe('');
    });

    it('reads optional fields (buttonText, locs, backgroundSound)', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        buttonText: 'Next',
        locs: [{ kind: 'text', name: 'main', x: 100, y: 100 }],
        backgroundSound: 'ambient.mp3',
      } as any);
      expect(beat.buttonText).toBe('Next');
      expect(beat.locs).toHaveLength(1);
      expect(beat.backgroundSound).toBe('ambient.mp3');
    });

    it('defaults locs to an empty array when absent', () => {
      const beat = new InfoTextBeat({ id: 'b1', text: 'x' } as any);
      expect(beat.locs).toEqual([]);
    });

    it('reads textVariations when present', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Base',
        textVariations: ['Variant 1', 'Variant 2'],
      } as any);
      expect(beat.textVariations).toEqual(['Variant 1', 'Variant 2']);
    });
  });

  describe('text rendering', () => {
    it('calls renderText with the processed text and button label', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Story text',
        buttonText: 'Continue',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(methods.renderText).toHaveBeenCalledOnce();
      const [text, buttonText] = methods.renderText.mock.calls[0];
      expect(text).toBe('Story text');
      expect(buttonText).toBe('Continue');
    });

    it('defaults buttonText to "Continue" when not configured', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [, buttonText] = methods.renderText.mock.calls[0];
      expect(buttonText).toBe('Continue');
    });

    it('interpolates variables into the text via processText', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Hello {playerName}!',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext(c => {
        c.setVariable('playerName', 'Alice');
      });

      await beat.execute(ctx, renderer);

      const [text] = methods.renderText.mock.calls[0];
      expect(text).toBe('Hello Alice!');
    });

    it('interpolates variables into the button text too', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        buttonText: 'Hi {name}',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext(c => c.setVariable('name', 'Bob'));

      await beat.execute(ctx, renderer);

      const [, buttonText] = methods.renderText.mock.calls[0];
      expect(buttonText).toBe('Hi Bob');
    });
  });

  describe('renderer state setup', () => {
    it('declares currentBeatType so schema-driven routing fires for THIS beat', async () => {
      // The setState is required from v0.9 onward — without it,
      // the slot-mode router on the renderer falls back to whatever
      // the previous beat left set, which is a known regression
      // path documented in the source comment.
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const calls = methods.setState.mock.calls;
      const beatTypeCall = calls.find(c => c[0] === 'currentBeatType');
      expect(beatTypeCall).toBeDefined();
      expect(beatTypeCall![1]).toBe('infoText');
    });

    it('forwards slotAnimations via setState (P3-anim-1)', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        defaultTarget: 'next',
      } as any);
      // slotAnimations defaults to undefined on a fresh beat —
      // the call still fires (renderer receives undefined and
      // falls back to defaults). That's the zero-regression path.
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const calls = methods.setState.mock.calls;
      const slotAnimCall = calls.find(c => c[0] === 'slotAnimations');
      expect(slotAnimCall).toBeDefined();
    });
  });

  describe('text variations', () => {
    it('with no variations, always returns the main text', async () => {
      // Determinism: no random anything when the author hasn't
      // configured variations.
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'The only text',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [text] = methods.renderText.mock.calls[0];
      expect(text).toBe('The only text');
    });

    it('with variations, picks from the main text + variations pool', async () => {
      // The implementation builds [main, ...variations] and picks
      // randomly — so the main text is one of the candidates, not
      // excluded. Pin Math.random so the test is deterministic.
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // → index 0 → main
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Main',
        textVariations: ['V1', 'V2'],
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [text] = methods.renderText.mock.calls[0];
      expect(text).toBe('Main');
      randomSpy.mockRestore();
    });

    it('picks a variation when the random index lands on it', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Main',
        textVariations: ['V1', 'V2'],
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      // 0 → Main, 0.34 → V1, 0.67 → V2. (Math.floor of × 3.)
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
      await beat.execute(ctx, renderer);
      const [text] = methods.renderText.mock.calls[0];
      expect(text).toBe('V1');
      randomSpy.mockRestore();
    });

    it('ignores empty textVariations array (returns main text)', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'Main',
        textVariations: [],
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [text] = methods.renderText.mock.calls[0];
      expect(text).toBe('Main');
    });
  });

  describe('getParameters round-trip', () => {
    it('serializes core fields', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        buttonText: 'Next',
      } as any);
      const params = beat.getParameters();
      expect(params).toMatchObject({
        text: 'x',
        buttonText: 'Next',
      });
    });

    it('omits empty locs from the serialized parameters', () => {
      // Contract from the source comment: locs is an internal
      // visual field, only included when non-empty.
      const beat = new InfoTextBeat({ id: 'b1', text: 'x' } as any);
      const params = beat.getParameters();
      expect(params.locs).toBeUndefined();
    });

    it('includes non-empty locs', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        locs: [{ kind: 'text', name: 'main' }],
      } as any);
      expect(beat.getParameters().locs).toEqual([{ kind: 'text', name: 'main' }]);
    });

    it('omits empty textVariations array', () => {
      const beat = new InfoTextBeat({
        id: 'b1',
        text: 'x',
        textVariations: [],
      } as any);
      expect(beat.getParameters().textVariations).toBeUndefined();
    });

    it('updateParameters mutates in place', () => {
      const beat = new InfoTextBeat({ id: 'b1', text: 'Initial' } as any);
      beat.updateParameters({
        text: 'Updated',
        buttonText: 'New label',
        textVariations: ['v1'],
      });
      expect(beat.text).toBe('Updated');
      expect(beat.buttonText).toBe('New label');
      expect(beat.textVariations).toEqual(['v1']);
    });
  });
});
