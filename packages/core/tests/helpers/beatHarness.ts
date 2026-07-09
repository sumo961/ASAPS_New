/**
 * Beat-execution test harness.
 *
 * Replaces the per-test `createMockRenderer()` factories that have
 * been drifting across the beat test files. Centralizing the stub
 * means: (1) one place to update when IRenderer gets a new method,
 * (2) typed assertions on every method, (3) sensible default return
 * values so tests only need to override the ones they care about.
 *
 * Usage:
 *   const { renderer, methods } = makeRenderer({
 *     renderQRScan: 'asaps://beat/door',  // sets the resolved value
 *   });
 *   const context = makeContext();
 *   const beat = new QRScanBeat({ id: 'b1', ... });
 *
 *   const next = await beat.execute(context, renderer);
 *
 *   expect(methods.renderQRScan).toHaveBeenCalledOnce();
 *   expect(methods.renderQRScan.mock.calls[0][0]).toBe('Scan a code');
 *   expect(next).toBe('door');
 */
import { vi, type Mock } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import type { IAIService, IRenderer } from '../../src/types';

/**
 * The IRenderer methods we stub. Every method on the interface is
 * here — additions to IRenderer should land here too so tests pick
 * them up without a manual edit per file.
 */
const RENDER_METHODS = [
  // Synchronous lifecycle / state
  'clear',
  'setState',
  'getState',

  // Rendering — required surface
  'renderTitleScreen',
  'renderText',
  'renderDialog',
  'renderChoices',
  'renderMovement',
  'renderPropSelection',
  'renderVideo',
  'renderEndScreen',
  'renderDurScreen',
  'renderInputText',
  'renderHyperText',

  // Optional surface (every render* method past the required core).
  // Defining these unconditionally is fine — IRenderer marks them
  // optional with `?` so beats null-check before calling, but the
  // harness exposing them lets tests assert "this beat called the
  // optional method" easily.
  'renderAISummary',
  'renderCreditsPage',
  'renderPanorama',
  'renderKeypad',
  'renderQRScan',
  'renderInputImage',
  'renderWebView',
  'renderAR',
  'renderMap',
  'renderIndoorMap',
  'renderConversationInput',
  'renderLoading',
  'hideLoading',
  'showChoices',

  // Beat lifecycle helpers
  'applyTransition',
  'prepareTransition',
  'playSound',
  'playClusterSound',
  'stopBeatSound',
  'clearChatHistory',
  'setVisitedChoiceIds',
  'waitForUserInput',
] as const;

type RenderMethodName = typeof RENDER_METHODS[number];

/** Map of method name → its vi.fn() mock — typed so tests get IDE help. */
export type RendererMocks = Record<RenderMethodName, Mock>;

export interface MakeRendererResult {
  /** Pass this to beat.execute(...). */
  renderer: IRenderer;
  /** Direct access to every stub for assertions + mock overrides. */
  methods: RendererMocks;
}

/**
 * Build a fully-stubbed IRenderer.
 *
 * @param resolvedValues  Optional map of `methodName → value`. Each
 *                        entry installs `mockResolvedValue(value)` for
 *                        async methods or `mockReturnValue(value)` for
 *                        sync methods like getState. Tests that don't
 *                        need a specific resolution can omit this and
 *                        rely on the defaults: async methods resolve
 *                        with the empty string (the most common
 *                        "no input" sentinel for choices-style beats),
 *                        sync methods return undefined.
 * @param state           Optional renderer-state map. AI beats and a
 *                        few others read `renderer.getState('aiService')`
 *                        or similar registry keys; tests inject them
 *                        here. getState's mock is configured to return
 *                        state[key] when present and undefined
 *                        otherwise. setState calls still record in
 *                        methods.setState's call history.
 */
export function makeRenderer(
  resolvedValues: Partial<Record<RenderMethodName, unknown>> = {},
  state: Record<string, unknown> = {}
): MakeRendererResult {
  const methods = {} as RendererMocks;
  const renderer = {} as Record<string, Mock>;

  const SYNC = new Set<RenderMethodName>([
    'clear', 'setState', 'getState', 'prepareTransition', 'stopBeatSound',
    'clearChatHistory', 'setVisitedChoiceIds', 'renderLoading', 'hideLoading',
  ]);

  for (const name of RENDER_METHODS) {
    const override = resolvedValues[name];
    const mock = vi.fn();
    if (override !== undefined) {
      if (SYNC.has(name)) {
        mock.mockReturnValue(override);
      } else {
        mock.mockResolvedValue(override);
      }
    } else if (!SYNC.has(name)) {
      // Async methods default to resolving with '' so beats that look
      // at the returned string don't accidentally see undefined.
      mock.mockResolvedValue('');
    }
    methods[name] = mock;
    renderer[name] = mock;
  }

  // Wire getState to the state map (if provided). Lets AI beats
  // resolve renderer.getState('aiService') to the test's mock AI
  // service without each test reaching into methods.getState.
  if (Object.keys(state).length > 0) {
    methods.getState.mockImplementation((key: string) =>
      Object.prototype.hasOwnProperty.call(state, key) ? state[key] : undefined
    );
  }

  return { renderer: renderer as unknown as IRenderer, methods };
}

/**
 * AI-service mock for the AI-using beats (AIConditionBeat,
 * AISummaryBeat, AIDialogTreeBeat, OnlineContentBeat, AIConversationBeat).
 *
 * Returns the stub plus typed mocks for each method so tests can
 * inspect calls and override responses per-test:
 *
 *   const ai = makeAIService({ classifyContent: 'pick_a' });
 *   const { renderer } = makeRenderer({}, { aiService: ai.service });
 *   ...
 *   expect(ai.classifyContent).toHaveBeenCalledWith(prompt, ['pick_a', 'pick_b']);
 *
 * The `responses` arg installs `mockResolvedValue(value)` per method;
 * methods not listed default to resolving with the empty string (for
 * generateContent / classifyContent) or an empty object (for the
 * structured ones — generateDialog / generateConversationTurn).
 */
export interface MakeAIServiceResult {
  service: IAIService;
  generateContent: Mock;
  generateDialog: Mock;
  classifyContent: Mock;
  generateConversationTurn: Mock;
  analyzeImage: Mock;
}

export function makeAIService(
  responses: Partial<{
    generateContent: unknown;
    generateDialog: unknown;
    classifyContent: unknown;
    generateConversationTurn: unknown;
    analyzeImage: unknown;
  }> = {}
): MakeAIServiceResult {
  const generateContent = vi.fn().mockResolvedValue(
    responses.generateContent !== undefined ? responses.generateContent : ''
  );
  const generateDialog = vi.fn().mockResolvedValue(
    responses.generateDialog !== undefined ? responses.generateDialog : {}
  );
  const classifyContent = vi.fn().mockResolvedValue(
    responses.classifyContent !== undefined ? responses.classifyContent : ''
  );
  const generateConversationTurn = vi.fn().mockResolvedValue(
    responses.generateConversationTurn !== undefined
      ? responses.generateConversationTurn
      : { text: '' }
  );

  const analyzeImage = vi.fn().mockResolvedValue(
    responses.analyzeImage !== undefined ? responses.analyzeImage : ''
  );

  const service: IAIService = {
    generateContent,
    generateDialog,
    classifyContent,
    generateConversationTurn,
    analyzeImage,
  };

  return { service, generateContent, generateDialog, classifyContent, generateConversationTurn, analyzeImage };
}

/**
 * Shorthand for the common cases — most tests construct a fresh
 * StoryContext. Accepts a seeder callback for tests that need to
 * pre-fill variables or inventory.
 *
 * A minimal Story is attached by default because Beat.execute calls
 * context.getStory() during its requirements-gate check and would
 * throw "Story not set in context" otherwise. Tests that need a
 * specific Story can pass one as the second arg.
 *
 *   const ctx = makeContext(c => {
 *     c.setVariable('health', '100');
 *     c.addToInventory('key');
 *   });
 */
export function makeContext(
  seed?: (ctx: StoryContext) => void,
  story?: Story
): StoryContext {
  const ctx = new StoryContext();
  ctx.setStory(story ?? new Story({ title: 'Test', author: 'Test', firstBeatId: '' }));
  if (seed) seed(ctx);
  return ctx;
}
