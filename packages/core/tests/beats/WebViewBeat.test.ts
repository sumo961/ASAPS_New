/**
 * Tests for WebViewBeat — embedded external page beat. Experimental.
 *
 * Coverage focus:
 *   - renderer-missing fallthrough (older players without renderWebView)
 *   - passContext encoding into a URL hash (the page's only way to
 *     read story state without an API)
 *   - 'done' result vs custom-value result (custom values get saved
 *     to the configured variable, 'done' does not)
 *   - render-options pass-through (url / prompt / exitUrlPattern /
 *     doneButtonText)
 *   - constructor parameter resolution
 */
import { describe, it, expect, vi } from 'vitest';
import { WebViewBeat } from '../../src/beats/WebViewBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('WebViewBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults reasonable values', () => {
      const beat = new WebViewBeat({ id: 'b1' } as any);
      expect(beat.url).toBe('https://example.com');
      expect(beat.doneButtonText).toBe('Done');
      expect(beat.passContext).toEqual([]);
    });

    it('reads from nested parameters', () => {
      const beat = new WebViewBeat({
        id: 'b1',
        parameters: {
          url: 'https://test.dev',
          prompt: 'Tap when done',
          exitUrlPattern: 'example.com/done',
          passContext: ['playerName', 'score'],
          saveTo: 'finalUrl',
          doneButtonText: 'Close',
        },
      } as any);
      expect(beat.url).toBe('https://test.dev');
      expect(beat.prompt).toBe('Tap when done');
      expect(beat.exitUrlPattern).toBe('example.com/done');
      expect(beat.passContext).toEqual(['playerName', 'score']);
      expect(beat.saveTo).toBe('finalUrl');
      expect(beat.doneButtonText).toBe('Close');
    });

    it('top-level config wins over nested parameters', () => {
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://top.dev',
        parameters: { url: 'https://nested.dev' },
      } as any);
      expect(beat.url).toBe('https://top.dev');
    });

    it('coerces passContext to an empty array when not array-shaped', () => {
      const beat = new WebViewBeat({
        id: 'b1',
        parameters: { passContext: 'playerName' as any },
      } as any);
      expect(beat.passContext).toEqual([]);
    });
  });

  describe('renderer-missing fallthrough', () => {
    it('skips and advances to next beat when renderWebView is unavailable', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer, methods } = makeRenderer();
      (renderer as any).renderWebView = undefined;
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(methods.renderWebView).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('passContext encoding', () => {
    it('builds a key=value&key=value hash from configured variable names', async () => {
      const { renderer, methods } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        passContext: ['playerName', 'score'],
      } as any);
      const ctx = makeContext(c => {
        c.setVariable('playerName', 'Alice');
        c.setVariable('score', '42');
      });

      await beat.execute(ctx, renderer);

      const [options] = methods.renderWebView.mock.calls[0];
      expect(options.contextHash).toBe('playerName=Alice&score=42');
    });

    it('url-encodes reserved characters in names and values', async () => {
      const { renderer, methods } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        passContext: ['last word'],
      } as any);
      const ctx = makeContext(c => {
        c.setVariable('last word', 'the end');
      });

      await beat.execute(ctx, renderer);

      const [options] = methods.renderWebView.mock.calls[0];
      // %20 for spaces in both key and value.
      expect(options.contextHash).toBe('last%20word=the%20end');
    });

    it('skips variables that are undefined or null (no "key=undefined" garbage)', async () => {
      // Critical safety from the docstring: the embedded page must
      // never see "key=undefined" or "key=null" strings — they look
      // like real values but encode missing state.
      const { renderer, methods } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        passContext: ['definedVar', 'missingVar'],
      } as any);
      const ctx = makeContext(c => {
        c.setVariable('definedVar', 'value');
        // 'missingVar' deliberately not set.
      });

      await beat.execute(ctx, renderer);

      const [options] = methods.renderWebView.mock.calls[0];
      expect(options.contextHash).toBe('definedVar=value');
      expect(options.contextHash).not.toContain('missingVar');
      expect(options.contextHash).not.toContain('undefined');
    });

    it('contextHash is undefined when passContext is empty', async () => {
      const { renderer, methods } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({ id: 'b1', url: 'https://example.com' } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [options] = methods.renderWebView.mock.calls[0];
      expect(options.contextHash).toBeUndefined();
    });

    it('contextHash is undefined when all variables are missing', async () => {
      // Edge: passContext lists variables but none resolve. The hash
      // is undefined (not empty string) so the renderer can skip the
      // # entirely.
      const { renderer, methods } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        passContext: ['nope1', 'nope2'],
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [options] = methods.renderWebView.mock.calls[0];
      expect(options.contextHash).toBeUndefined();
    });
  });

  describe('result handling', () => {
    it('"done" result does NOT save anything to the variable', async () => {
      // The docstring is explicit: 'done' is the done-button exit
      // sentinel and should not pollute saveTo.
      const { renderer } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        saveTo: 'result',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      expect(ctx.getVariable('result')).toBeUndefined();
    });

    it('non-"done" result saves to the configured variable', async () => {
      const { renderer } = makeRenderer({ renderWebView: 'page-returned-value' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        saveTo: 'result',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(ctx.getVariable('result')).toBe('page-returned-value');
    });

    it('non-"done" result with no saveTo just records and advances', async () => {
      const { renderer } = makeRenderer({ renderWebView: 'oops-no-handler' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next');
      // Nothing crashed; no variable touched (saveTo was undefined).
    });
  });

  describe('render-options pass-through', () => {
    it('passes url / prompt / exitUrlPattern / doneButtonText', async () => {
      const { renderer, methods } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        prompt: 'Tap when finished',
        exitUrlPattern: 'example.com/done',
        doneButtonText: 'Finish',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(methods.renderWebView).toHaveBeenCalledOnce();
      const [options] = methods.renderWebView.mock.calls[0];
      expect(options).toMatchObject({
        url: 'https://example.com',
        prompt: 'Tap when finished',
        exitUrlPattern: 'example.com/done',
        doneButtonText: 'Finish',
      });
    });
  });

  describe('timeline event', () => {
    it('records "Closed the web view" for the done result', async () => {
      const { renderer } = makeRenderer({ renderWebView: 'done' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const ev = ctx.getTimeline().find((e: any) => e.beatType === 'webView');
      expect(ev).toBeDefined();
      expect((ev as any).choiceText).toContain('Closed');
    });

    it('records the returned value for a non-done result', async () => {
      const { renderer } = makeRenderer({ renderWebView: 'value-from-page' });
      const beat = new WebViewBeat({
        id: 'b1',
        url: 'https://example.com',
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const ev = ctx.getTimeline().find((e: any) => e.beatType === 'webView');
      expect((ev as any).choiceText).toContain('value-from-page');
    });
  });
});
