/**
 * Tests for KeypadBeat — numeric keypad input (PIN, safe lock, phone keypad).
 *
 * The runtime delegates the "did the player type the correct code"
 * loop to the renderer (it has the input event stream), and the
 * renderer surfaces ONE of two outcomes:
 *   - the entered code as a string, or
 *   - the literal '__keypad_fail__' sentinel after maxAttempts.
 *
 * Coverage focus:
 *   - constructor parameter resolution + defaults
 *   - render-options pass-through (every keypad option)
 *   - '__keypad_fail__' with failTarget routes there
 *   - '__keypad_fail__' without failTarget falls through to next beat
 *   - save-to-variable (the default storage mode)
 *   - save-to-counter, both 'set' and 'change' operations
 *   - numeric parsing for counter mode (NaN entries silently no-op)
 */
import { describe, it, expect } from 'vitest';
import { KeypadBeat } from '../../src/beats/KeypadBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('KeypadBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults reasonable values when parameters are empty', () => {
      const beat = new KeypadBeat({ id: 'b1' } as any);
      expect(beat.prompt).toBe('Enter the code:');
      expect(beat.layout).toBe('numeric');
      expect(beat.maxDigits).toBe(4);
      expect(beat.minDigits).toBe(1);
      expect(beat.maxAttempts).toBe(0);
      expect(beat.maskInput).toBe(true);
      expect(beat.saveToType).toBe('variable');
      expect(beat.variable).toBe('keypadInput');
      expect(beat.counterOperation).toBe('set');
      expect(beat.buttonText).toBe('Enter');
      expect(beat.clearButtonText).toBe('Clear');
      expect(beat.showDisplay).toBe(true);
    });

    it('reads from the parameters object', () => {
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          prompt: 'Enter PIN',
          layout: 'pin',
          maxDigits: 6,
          minDigits: 4,
          correctCode: '1234',
          failTarget: 'fail-beat',
          maxAttempts: 3,
          maskInput: false,
          buttonText: 'Submit',
          clearButtonText: 'Reset',
          showDisplay: false,
        },
      } as any);
      expect(beat.prompt).toBe('Enter PIN');
      expect(beat.layout).toBe('pin');
      expect(beat.maxDigits).toBe(6);
      expect(beat.minDigits).toBe(4);
      expect(beat.correctCode).toBe('1234');
      expect(beat.failTarget).toBe('fail-beat');
      expect(beat.maxAttempts).toBe(3);
      expect(beat.maskInput).toBe(false);
      expect(beat.buttonText).toBe('Submit');
      expect(beat.clearButtonText).toBe('Reset');
      expect(beat.showDisplay).toBe(false);
    });

    it('respects maskInput:false explicitly (?? not || guard)', () => {
      // Using `??` not `||` is critical here: maskInput defaults to
      // true, and the author wanting "show what I'm typing" passes
      // false. A `|| true` would silently flip the false back to
      // true on every load.
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: { maskInput: false },
      } as any);
      expect(beat.maskInput).toBe(false);
    });

    it('respects showDisplay:false explicitly (?? not || guard)', () => {
      // Same false-vs-undefined trap as maskInput.
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: { showDisplay: false },
      } as any);
      expect(beat.showDisplay).toBe(false);
    });

    it('counter mode picks up counter and operation', () => {
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          saveToType: 'counter',
          counter: 'attempts',
          counterOperation: 'change',
        },
      } as any);
      expect(beat.saveToType).toBe('counter');
      expect(beat.counter).toBe('attempts');
      expect(beat.counterOperation).toBe('change');
    });
  });

  describe('failure path (__keypad_fail__)', () => {
    it('routes to failTarget when configured', async () => {
      const { renderer } = makeRenderer({ renderKeypad: '__keypad_fail__' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: { failTarget: 'wrong-pin-beat' },
        defaultTarget: 'default-next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      // failTarget wins over defaultTarget.
      expect(next).toBe('wrong-pin-beat');
    });

    it('falls through to next beat when no failTarget', async () => {
      // Without a failTarget, the beat is effectively saying
      // "they got it wrong, that's not a game-changing event" —
      // continues forward.
      const { renderer } = makeRenderer({ renderKeypad: '__keypad_fail__' });
      const beat = new KeypadBeat({
        id: 'b1',
        defaultTarget: 'default-next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('default-next');
    });

    it('does NOT save the sentinel to the variable', async () => {
      // The sentinel is internal — the variable should be untouched
      // on a failure path, so downstream condition checks can rely on
      // "if keypadInput is empty, the player never solved it".
      const { renderer } = makeRenderer({ renderKeypad: '__keypad_fail__' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          variable: 'theirGuess',
          failTarget: 'fail',
        },
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(ctx.getVariable('theirGuess')).toBeUndefined();
    });
  });

  describe('save-to-variable (default)', () => {
    it('writes the entered code to the configured variable', async () => {
      const { renderer } = makeRenderer({ renderKeypad: '1234' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: { variable: 'enteredPin' },
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(ctx.getVariable('enteredPin')).toBe('1234');
    });

    it('writes to the default variable "keypadInput" when none configured', async () => {
      const { renderer } = makeRenderer({ renderKeypad: '4567' });
      const beat = new KeypadBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(ctx.getVariable('keypadInput')).toBe('4567');
    });
  });

  describe('save-to-counter', () => {
    it('counter mode with "set" replaces the counter value', async () => {
      const { renderer } = makeRenderer({ renderKeypad: '42' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          saveToType: 'counter',
          counter: 'score',
          counterOperation: 'set',
        },
      } as any);
      const ctx = makeContext(c => c.setCounter('score', 100));
      expect(ctx.getCounter('score')).toBe(100);

      await beat.execute(ctx, renderer);

      // 'set' overwrote the previous 100 with the entered 42.
      expect(ctx.getCounter('score')).toBe(42);
    });

    it('counter mode with "change" adds to the existing counter', async () => {
      // The 'change' operation is the "this keypad is a vending
      // machine — typing 50 adds 50 to your tab" workflow.
      const { renderer } = makeRenderer({ renderKeypad: '50' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          saveToType: 'counter',
          counter: 'tab',
          counterOperation: 'change',
        },
      } as any);
      const ctx = makeContext(c => c.setCounter('tab', 25));

      await beat.execute(ctx, renderer);

      expect(ctx.getCounter('tab')).toBe(75);
    });

    it('counter mode with "change" treats missing counter as 0', async () => {
      const { renderer } = makeRenderer({ renderKeypad: '10' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          saveToType: 'counter',
          counter: 'new_counter',
          counterOperation: 'change',
        },
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      // Missing counter coerces to 0 → 0 + 10 = 10.
      expect(ctx.getCounter('new_counter')).toBe(10);
    });

    it('counter mode silently no-ops when input is not numeric', async () => {
      // Defensive — a misconfigured keypad (e.g. a future "phone"
      // layout that emits *#) shouldn't poison the counter. The
      // beat advances to next without mutating state.
      const { renderer } = makeRenderer({ renderKeypad: 'NaN-not-a-number' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          saveToType: 'counter',
          counter: 'score',
        },
      } as any);
      const ctx = makeContext(c => c.setCounter('score', 50));

      await beat.execute(ctx, renderer);

      // Counter untouched.
      expect(ctx.getCounter('score')).toBe(50);
    });

    it('counter mode no-ops when counter field is missing', async () => {
      // saveToType:counter without a counter name is a config error
      // — silently nothing happens rather than throwing.
      const { renderer } = makeRenderer({ renderKeypad: '5' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: { saveToType: 'counter' /* no counter */ },
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
    });
  });

  describe('render-options pass-through', () => {
    it('passes every keypad option to the renderer', async () => {
      const { renderer, methods } = makeRenderer({ renderKeypad: '1234' });
      const beat = new KeypadBeat({
        id: 'b1',
        parameters: {
          prompt: 'Enter the safe code',
          layout: 'numeric',
          maxDigits: 6,
          minDigits: 4,
          correctCode: '1234',
          failTarget: 'fail',
          maxAttempts: 3,
          maskInput: false,
          buttonText: 'Submit',
          clearButtonText: 'Clear',
          showDisplay: true,
          skinId: 'safe-skin',
        },
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(methods.renderKeypad).toHaveBeenCalledOnce();
      const [prompt, options] = methods.renderKeypad.mock.calls[0];
      expect(prompt).toBe('Enter the safe code');
      expect(options).toMatchObject({
        layout: 'numeric',
        maxDigits: 6,
        minDigits: 4,
        correctCode: '1234',
        failTarget: 'fail',
        maxAttempts: 3,
        maskInput: false,
        buttonText: 'Submit',
        clearButtonText: 'Clear',
        showDisplay: true,
        skinId: 'safe-skin',
      });
    });

    it('omits empty correctCode / failTarget (so renderer sees "no validation")', async () => {
      // Display-only mode — no validation, just collect input. The
      // renderer interprets correctCode:undefined as "accept anything".
      const { renderer, methods } = makeRenderer({ renderKeypad: '99' });
      const beat = new KeypadBeat({ id: 'b1', defaultTarget: 'next' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [, options] = methods.renderKeypad.mock.calls[0];
      expect(options.correctCode).toBeUndefined();
      expect(options.failTarget).toBeUndefined();
    });
  });
});
