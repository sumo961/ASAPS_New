/**
 * Tests for ExplanationBeat — the standalone half of the HUD explanation
 * system (the other half is the cross-cutting Beat.explainHuds overlay flag).
 *
 * The beat deliberately renders as a plain text screen so it inherits theme,
 * layout, speaker and translation handling; what makes it an explanation is
 * that the host draws callouts over the live HUDs while it's up. So the
 * contract worth pinning here is: it declares its own beat type (that's the
 * signal the host keys off), it renders through renderText, and its caption /
 * skip data round-trips so an author's overrides survive save-load.
 */
import { describe, it, expect } from 'vitest';
import { ExplanationBeat } from '../../src/beats/ExplanationBeat';
import { Beat } from '../../src/beats/Beat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('ExplanationBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('reads fields from top-level config', () => {
      const beat = new ExplanationBeat({
        id: 'e1', text: 'Your screen', buttonText: 'Ready',
        captions: { timer: 'Story time' }, skipKinds: ['mood'],
      } as any);
      expect(beat.text).toBe('Your screen');
      expect(beat.buttonText).toBe('Ready');
      expect(beat.captions).toEqual({ timer: 'Story time' });
      expect(beat.skipKinds).toEqual(['mood']);
    });

    it('reads the same fields from nested parameters', () => {
      const beat = new ExplanationBeat({
        id: 'e1',
        parameters: { text: 'Nested', buttonText: 'Go', captions: { mood: 'Feelings' } },
      } as any);
      expect(beat.text).toBe('Nested');
      expect(beat.buttonText).toBe('Go');
      expect(beat.captions).toEqual({ mood: 'Feelings' });
    });
  });

  describe('execution', () => {
    it('declares its own beat type so the host knows to draw callouts', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new ExplanationBeat({ id: 'e1', text: 'Hi' } as any);
      await beat.execute(makeContext(), renderer);
      expect(methods.setState).toHaveBeenCalledWith('currentBeatType', 'explanation');
    });

    it('renders through renderText (inherits theme / layout / translation)', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new ExplanationBeat({ id: 'e1', text: 'Your screen', buttonText: 'Ready' } as any);
      await beat.execute(makeContext(), renderer);
      expect(methods.renderText).toHaveBeenCalledOnce();
      expect(methods.renderText.mock.calls[0][0]).toBe('Your screen');
      expect(methods.renderText.mock.calls[0][1]).toBe('Ready');
    });

    it('defaults the button to "Got it"', async () => {
      const { renderer, methods } = makeRenderer();
      const beat = new ExplanationBeat({ id: 'e1', text: 'Hi' } as any);
      await beat.execute(makeContext(), renderer);
      expect(methods.renderText.mock.calls[0][1]).toBe('Got it');
    });
  });

  describe('getParameters round-trip', () => {
    it('omits empty captions / skipKinds to keep saved JSON clean', () => {
      const beat = new ExplanationBeat({ id: 'e1', text: 'Hi' } as any);
      const p = beat.getParameters();
      expect(p).not.toHaveProperty('captions');
      expect(p).not.toHaveProperty('skipKinds');
    });

    it('preserves author caption overrides', () => {
      const beat = new ExplanationBeat({
        id: 'e1', text: 'Hi', captions: { inventory: 'Your pack' }, skipKinds: ['countdown'],
      } as any);
      const p = beat.getParameters();
      expect(p.captions).toEqual({ inventory: 'Your pack' });
      expect(p.skipKinds).toEqual(['countdown']);

      const round = new ExplanationBeat({ id: 'e1', parameters: p } as any);
      expect(round.captions).toEqual({ inventory: 'Your pack' });
      expect(round.skipKinds).toEqual(['countdown']);
    });

    it('updateParameters applies overrides', () => {
      const beat = new ExplanationBeat({ id: 'e1', text: 'Hi' } as any);
      beat.updateParameters({ text: 'Changed', captions: { meter: 'Values' } });
      expect(beat.text).toBe('Changed');
      expect(beat.captions).toEqual({ meter: 'Values' });
    });
  });

  describe('explainHuds overlay flag (cross-cutting, on the base class)', () => {
    it('any beat type can carry it, from top level or parameters', () => {
      const a = new ExplanationBeat({ id: 'a', explainHuds: true } as any);
      const b = new ExplanationBeat({ id: 'b', parameters: { explainHuds: true } } as any);
      expect(a.explainHuds).toBe(true);
      expect(b.explainHuds).toBe(true);
    });

    it('defaults to undefined so existing beats are untouched', () => {
      const beat = new ExplanationBeat({ id: 'a' } as any);
      expect(beat.explainHuds).toBeUndefined();
    });

    it('persists through toJSON so the host can read it at runtime', () => {
      const beat = new ExplanationBeat({ id: 'a', explainHuds: true } as any);
      expect((beat as Beat).toJSON().explainHuds).toBe(true);
    });
  });
});
