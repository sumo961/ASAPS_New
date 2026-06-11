/**
 * Tests for AIConditionBeat — invisible AI-driven branching beat.
 *
 * Routes the player to one of N author-defined categories based on
 * AI evaluation of player state (variables / inventory / counters /
 * choice history). Critical safety contracts:
 *   - missing AI service → fallback target, never hang
 *   - timeout → fallback target, never hang
 *   - AI returns unknown category → fallback target, never crash
 *   - error in AI call → fallback target, never propagate
 *
 * The PlayerContextBuilder is exercised end-to-end (it doesn't need
 * mocking — it operates on the real StoryContext we pass in), so
 * the AI prompt assembly is part of the test surface.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIConditionBeat } from '../../src/beats/AIConditionBeat';
import { makeRenderer, makeContext, makeAIService } from '../helpers/beatHarness';

describe('AIConditionBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults all evaluate flags to true', () => {
      const beat = new AIConditionBeat({ id: 'b1' } as any);
      expect(beat.evaluateVariables).toBe(true);
      expect(beat.evaluateInventory).toBe(true);
      expect(beat.evaluateHistory).toBe(true);
      expect(beat.evaluateCounters).toBe(true);
      expect(beat.evaluateChoiceHistory).toBe(true);
    });

    it('defaults timeout to 30 seconds', () => {
      // The async race uses this — too short and slow AI providers
      // fail; too long and the player waits forever for a denied
      // call. 30s is the deliberate default.
      const beat = new AIConditionBeat({ id: 'b1' } as any);
      expect(beat.timeout).toBe(30000);
    });

    it('reads parameters from nested + top-level config', () => {
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'Evaluate the player',
          categories: [
            { name: 'happy', description: '...', targetId: 'happy-beat' },
            { name: 'sad', description: '...', targetId: 'sad-beat' },
          ],
          evaluateVariables: false,
          timeout: 5000,
          fallbackTarget: 'fallback-beat',
        },
      } as any);
      expect(beat.prompt).toBe('Evaluate the player');
      expect(beat.categories).toHaveLength(2);
      expect(beat.evaluateVariables).toBe(false);
      expect(beat.timeout).toBe(5000);
      expect(beat.aiDefaultTarget).toBe('fallback-beat');
    });

    it('falls back fallbackTarget → defaultTarget chain', () => {
      // Source precedence: parameters.fallbackTarget > config.fallbackTarget
      // > parameters.defaultTarget > config.defaultTarget.
      const beat = new AIConditionBeat({
        id: 'b1',
        defaultTarget: 'cfg-default',
        parameters: { fallbackTarget: 'p-fallback' },
      } as any);
      expect(beat.aiDefaultTarget).toBe('p-fallback');
    });

    it('respects explicit evaluate flags set to false (?? guard)', () => {
      // False-vs-undefined trap regression: an author wanting to
      // exclude inventory from evaluation passes false. A `||` guard
      // would silently flip it back to true.
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: { evaluateInventory: false },
      } as any);
      expect(beat.evaluateInventory).toBe(false);
    });
  });

  describe('configuration guards', () => {
    it('falls back when prompt is empty', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ai = makeAIService();
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: '',
          categories: [{ name: 'x', description: 'x', targetId: 't1' }],
          fallbackTarget: 'no-prompt-fallback',
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('no-prompt-fallback');
      expect(ai.classifyContent).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('falls back when no categories are configured', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ai = makeAIService();
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: { prompt: 'P', categories: [], fallbackTarget: 'fb' },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('fb');
      expect(ai.classifyContent).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe('AI service unavailable', () => {
    it('falls back when getState("aiService") returns undefined', async () => {
      // No aiService injected — the most common case at the start
      // of the project lifecycle (no AI key yet). Critical that
      // the beat advances cleanly, never hangs.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer } = makeRenderer();
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'x', description: 'd', targetId: 't' }],
          fallbackTarget: 'no-ai-fallback',
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('no-ai-fallback');
      warn.mockRestore();
    });

    it('falls back when aiService has no classifyContent method', async () => {
      // Defensive against a partial implementation (the AI service
      // might support generateContent but not classifyContent on
      // some provider).
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const partialAI = { generateContent: vi.fn() };
      const { renderer } = makeRenderer({}, { aiService: partialAI });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'x', description: 'd', targetId: 't' }],
          fallbackTarget: 'partial-ai-fallback',
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('partial-ai-fallback');
      warn.mockRestore();
    });
  });

  describe('successful classification', () => {
    it('routes to the category whose name the AI returns', async () => {
      const ai = makeAIService({ classifyContent: 'sad' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'How does the player feel?',
          categories: [
            { name: 'happy', description: 'positive', targetId: 'happy-beat' },
            { name: 'sad', description: 'negative', targetId: 'sad-beat' },
          ],
          fallbackTarget: 'fb',
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('sad-beat');
      expect(ai.classifyContent).toHaveBeenCalledOnce();
    });

    it('matches category names case-insensitively', async () => {
      // The AI returns whatever case it wants; the matcher
      // lowercases both sides. Crucial — a strict-equality check
      // would route most responses to the fallback path.
      const ai = makeAIService({ classifyContent: 'HAPPY' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [
            { name: 'happy', description: 'd', targetId: 'happy-beat' },
            { name: 'sad', description: 'd', targetId: 'sad-beat' },
          ],
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('happy-beat');
    });

    it('passes category names list to the AI service', async () => {
      const ai = makeAIService({ classifyContent: 'a' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [
            { name: 'a', description: 'd', targetId: 't1' },
            { name: 'b', description: 'd', targetId: 't2' },
          ],
        },
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [, categoryNames] = ai.classifyContent.mock.calls[0];
      expect(categoryNames).toEqual(['a', 'b']);
    });

    it('records a branch event in the timeline on a successful match', async () => {
      const ai = makeAIService({ classifyContent: 'happy' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'happy', description: 'positive', targetId: 'happy-beat' }],
        },
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const events = ctx.getTimeline();
      const branchEvent = events.find((e: any) => e.beatType === 'aiCondition');
      expect(branchEvent).toBeDefined();
      expect((branchEvent as any).targetBeatId).toBe('happy-beat');
      expect((branchEvent as any).reason).toContain('AI chose');
    });
  });

  describe('unknown category response', () => {
    it('falls back when the AI returns a name that matches no category', async () => {
      // Critical defensive path — the AI sometimes returns "the
      // player is somewhere between these two options" instead of
      // picking one. The beat must not crash; falls through to
      // the fallback.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ai = makeAIService({ classifyContent: 'undecided' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [
            { name: 'happy', description: 'd', targetId: 'happy-beat' },
            { name: 'sad', description: 'd', targetId: 'sad-beat' },
          ],
          fallbackTarget: 'unknown-fallback',
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('unknown-fallback');
      warn.mockRestore();
    });

    it('records a branch event explaining the unknown-category fallback', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ai = makeAIService({ classifyContent: 'mystery' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'a', description: 'd', targetId: 't' }],
          fallbackTarget: 'fb',
        },
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const events = ctx.getTimeline();
      const branchEvent = events.find((e: any) => e.beatType === 'aiCondition');
      expect((branchEvent as any).reason).toContain('unknown');
      warn.mockRestore();
    });
  });

  describe('AI call errors', () => {
    it('falls back when classifyContent throws', async () => {
      // Network error, malformed response, provider outage — all
      // surface as a thrown promise. The beat catches and falls
      // through to fallback.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ai = makeAIService();
      ai.classifyContent.mockRejectedValue(new Error('network down'));
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'x', description: 'd', targetId: 't' }],
          fallbackTarget: 'error-fallback',
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('error-fallback');
      errSpy.mockRestore();
    });

    it('times out and falls back when classifyContent never resolves', async () => {
      // The Promise.race against a setTimeout is the guard against
      // a hanging provider. We test it by handing classifyContent
      // a never-resolving promise and a very short timeout.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ai = makeAIService();
      ai.classifyContent.mockImplementation(() => new Promise(() => {})); // never resolves
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'x', description: 'd', targetId: 't' }],
          fallbackTarget: 'timeout-fallback',
          timeout: 20, // short — the test must finish quickly
        },
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('timeout-fallback');
      errSpy.mockRestore();
    });
  });

  describe('prompt construction', () => {
    it('includes the configured prompt and category descriptions in the AI call', async () => {
      const ai = makeAIService({ classifyContent: 'a' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'Pick a flavor',
          categories: [
            { name: 'sweet', description: 'sugary stuff', targetId: 't1' },
            { name: 'sour', description: 'tart stuff', targetId: 't2' },
          ],
        },
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      const [fullPrompt] = ai.classifyContent.mock.calls[0];
      // Configured prompt is at the top.
      expect(fullPrompt).toContain('Pick a flavor');
      // Each category name + description is included.
      expect(fullPrompt).toContain('sweet');
      expect(fullPrompt).toContain('sugary stuff');
      expect(fullPrompt).toContain('sour');
      expect(fullPrompt).toContain('tart stuff');
    });

    it('includes player variables in the prompt when evaluateVariables is true', async () => {
      const ai = makeAIService({ classifyContent: 'a' });
      const { renderer } = makeRenderer({}, { aiService: ai.service });
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          prompt: 'P',
          categories: [{ name: 'a', description: 'd', targetId: 't' }],
          evaluateVariables: true,
          evaluateInventory: false,
          evaluateHistory: false,
          evaluateCounters: false,
          evaluateChoiceHistory: false,
        },
      } as any);
      const ctx = makeContext(c => {
        c.setVariable('playerName', 'Alice');
        c.setVariable('mood', 'curious');
      });

      await beat.execute(ctx, renderer);

      const [fullPrompt] = ai.classifyContent.mock.calls[0];
      // The PlayerContextBuilder includes the variables — we don't
      // pin exact format, but the variable names should appear.
      expect(fullPrompt).toMatch(/playerName|Alice/);
    });
  });

  describe('getConnections() derives from categories', () => {
    it('returns a connection per category plus a fallback connection', () => {
      // Used by the analyzer / editor — connections are dynamic
      // based on the categories, not stored explicitly.
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          categories: [
            { name: 'happy', description: '', targetId: 'happy-beat' },
            { name: 'sad', description: '', targetId: 'sad-beat' },
          ],
          fallbackTarget: 'fb-beat',
        },
      } as any);

      const conns = beat.getConnections();
      const targetIds = conns.map(c => c.targetId);
      expect(targetIds).toContain('happy-beat');
      expect(targetIds).toContain('sad-beat');
      expect(targetIds).toContain('fb-beat');
    });

    it('skips categories with no targetId (incomplete authoring)', () => {
      const beat = new AIConditionBeat({
        id: 'b1',
        parameters: {
          categories: [
            { name: 'a', description: '', targetId: 'good' },
            { name: 'b', description: '', targetId: '' as any },
          ],
        },
      } as any);
      const conns = beat.getConnections();
      const targetIds = conns.map(c => c.targetId);
      expect(targetIds).toContain('good');
      expect(targetIds).not.toContain('');
    });
  });
});
