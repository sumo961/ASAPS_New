/**
 * Inner voices (dialogExchange): characters marked innerVoice speak in the
 * player's head. The Dialog Tree tells the renderer, per line, which lines of
 * this exchange came before, whether this line is a thought, and whom the
 * replies answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import type { IRenderer } from '../../src/types';

function mockRenderer(clicks: string[]) {
  const state: Record<string, unknown> = {};
  const shown: Array<{ speaker: string; exchange: any }> = [];
  const renderer = {
    initialize: vi.fn(), clear: vi.fn(), playSound: vi.fn(), stopSound: vi.fn(),
    setState: vi.fn((k: string, v: unknown) => { state[k] = v; }),
    getState: vi.fn((k: string) => state[k]),
    renderDialog: vi.fn(async (speaker: string) => { shown.push({ speaker, exchange: state.dialogExchange }); }),
    renderChoices: vi.fn(async () => clicks.shift() ?? new Promise<string>(() => {})),
  } as unknown as IRenderer;
  return { renderer, shown, state };
}

const cast = [
  { id: 'char_danny', name: 'Danny', displayName: 'Danny', color: '#3366ff' },
  { id: 'char_old', name: 'The Old Story', displayName: 'The Old Story', innerVoice: true, color: '#cc3333' },
  { id: 'char_quiet', name: 'The Quiet Voice', displayName: 'The Quiet Voice', innerVoice: true },
];

const call = () => new DialogTreeBeat({
  id: 'call', name: 'The Call', type: 'dialogTree',
  parameters: { lineAdvance: 'click' },
  dialogTree: {
    id: 'root', speaker: 'Danny', characterRef: 'char_danny', text: 'Can you come over?',
    choices: [{ id: 'n1', text: '', continue: true, dialogNode: {
      id: 'old', speaker: 'The Old Story', characterRef: 'char_old', text: "What if tonight's the night?",
      choices: [{ id: 'n2', text: '', continue: true, dialogNode: {
        id: 'quiet', speaker: 'The Quiet Voice', characterRef: 'char_quiet', text: 'You could stay home and still care.',
        choices: [
          { id: 'stay', text: "I can't come over tonight.", target: 'beat_next' },
          { id: 'go', text: "I'm coming.", target: 'beat_drive' },
        ],
      } }],
    } }],
  },
} as any);

describe('Dialog Tree inner voices', () => {
  let context: StoryContext;
  beforeEach(() => {
    context = new StoryContext();
    const story = new Story({ title: 'T', firstBeatId: 'call' });
    story.setCharacters(cast as any);
    context.setStory(story);
  });

  it('stacks inner voices under the line being answered and names whom the replies go to', async () => {
    const { renderer, shown, state } = mockRenderer(['root___continue', 'root.n1___continue', 'root.n1.n2_stay']);
    expect(await call().execute(context, renderer)).toBe('beat_next');

    expect(shown.map((s) => s.speaker)).toEqual(['Danny', 'The Old Story', 'The Quiet Voice']);
    // Danny speaks out loud: nothing to stack.
    expect(shown[0].exchange).toBeUndefined();
    // The Old Story: a thought under Danny's line, in its Theme Color.
    expect(shown[1].exchange).toMatchObject({ inner: true, color: '#cc3333', replyTo: 'Danny' });
    expect(shown[1].exchange.earlier).toEqual([{ speaker: 'Danny', text: 'Can you come over?', color: '#3366ff' }]);
    // The Quiet Voice: both earlier lines stay.
    expect(shown[2].exchange.earlier.map((l: any) => [l.speaker, !!l.inner])).toEqual([['Danny', false], ['The Old Story', true]]);
    expect(shown[2].exchange.replyTo).toBe('Danny');
    // Cleared when the beat ends.
    expect(state.dialogExchange).toBeUndefined();
  });

  it('a line spoken out loud starts a new exchange', async () => {
    const beat = new DialogTreeBeat({
      id: 'b', name: 'B', type: 'dialogTree', parameters: { lineAdvance: 'click' },
      dialogTree: {
        id: 'root', speaker: 'The Old Story', characterRef: 'char_old', text: 'Go.',
        choices: [{ id: 'n', text: '', continue: true, dialogNode: {
          id: 'd', speaker: 'Danny', characterRef: 'char_danny', text: 'Please.',
          choices: [{ id: 'x', text: 'OK', target: 'end' }],
        } }],
      },
    } as any);
    const { renderer, shown } = mockRenderer(['root___continue', 'root.n_x']);
    await beat.execute(context, renderer);
    expect(shown[1].exchange).toBeUndefined();
  });

  it('an inner voice opening the next beat still answers the conversation just before', async () => {
    const { renderer } = mockRenderer(['root___continue', 'root.n1___continue', 'root.n1.n2_stay']);
    context.markBeatVisited('call');
    await call().execute(context, renderer);

    const next = new DialogTreeBeat({
      id: 'beat_next', name: 'Someone Else', type: 'dialogTree', parameters: { lineAdvance: 'click' },
      dialogTree: { id: 'root', speaker: 'The Quiet Voice', characterRef: 'char_quiet', text: 'He has a sister.', choices: [{ id: 'tess', text: "I'm texting Tess.", target: 'end' }] },
    } as any);
    context.markBeatVisited('beat_next');
    const second = mockRenderer(['root_tess']);
    await next.execute(context, second.renderer);
    // The player already answered Danny: his line isn't repeated, but the
    // replies still go to him.
    expect(second.shown[0].exchange).toMatchObject({ inner: true, earlier: [], replyTo: 'Danny' });
  });

  it('carries the unanswered out-loud line over, and nothing across an unrelated beat', async () => {
    const intro = new DialogTreeBeat({
      id: 'intro', name: 'Intro', type: 'dialogTree', parameters: { lineAdvance: 'click' },
      dialogTree: { id: 'root', speaker: 'Danny', characterRef: 'char_danny', text: 'Are you there?', choices: [], target: 'thought' },
    } as any);
    const thought = () => new DialogTreeBeat({
      id: 'thought', name: 'Thought', type: 'dialogTree', parameters: { lineAdvance: 'click' },
      dialogTree: { id: 'root', speaker: 'The Old Story', characterRef: 'char_old', text: 'Answer him.', choices: [{ id: 'a', text: 'Yes.', target: 'end' }] },
    } as any);
    context.markBeatVisited('intro');
    await intro.execute(context, mockRenderer(['root___npc_exit']).renderer);
    context.markBeatVisited('thought');
    const r = mockRenderer(['root_a']);
    await thought().execute(context, r.renderer);
    expect(r.shown[0].exchange.earlier).toEqual([{ speaker: 'Danny', text: 'Are you there?', color: '#3366ff' }]);

    // An info screen in between: no carry-over.
    const story = (context as any).getStory();
    story.addBeat?.({ id: 'info', type: 'infoText', name: 'Info' } as any);
    context.markBeatVisited('info');
    context.markBeatVisited('thought');
    const r2 = mockRenderer(['root_a']);
    await thought().execute(context, r2.renderer);
    expect(r2.shown[0].exchange).toEqual({ earlier: [], inner: true, color: '#cc3333' });
  });
});
