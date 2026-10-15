/**
 * Continue steps: several characters speak in a row before the player
 * answers (NPC 1 → NPC 2 → player choices), without a fake player reply.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function mockRenderer(clicks: string[]) {
  const dialogs: string[] = [];
  const choiceCalls: any[][] = [];
  const renderer = {
    initialize: vi.fn(), clear: vi.fn(), playSound: vi.fn(), stopSound: vi.fn(),
    setState: vi.fn(), getState: vi.fn().mockReturnValue(null),
    renderDialog: vi.fn().mockImplementation(async (speaker: string, text: string) => { dialogs.push(`${speaker}: ${text}`); }),
    renderChoices: vi.fn().mockImplementation(async (choices: any[]) => {
      choiceCalls.push(choices);
      const id = clicks.shift();
      if (!id) return new Promise<string>(() => { /* nobody clicks */ });
      return id;
    }),
  } as unknown as IRenderer;
  return { renderer, dialogs, choiceCalls };
}

const scene = (extra: Record<string, unknown> = {}) => new DialogTreeBeat({
  id: 'scene', name: 'Scene', type: 'dialogTree',
  dialogTree: {
    id: 'n0', speaker: 'Mara', text: "We can't stay here.",
    choices: [{
      id: 'c_next', text: '', continue: true,
      effects: [{ type: 'setVariable', target: 'heardJonas', value: true }],
      dialogNode: {
        id: 'n1', speaker: 'Jonas', text: 'And go where?',
        choices: [
          { id: 'c1', text: 'We take the ferry.', target: 'beat_ferry' },
          { id: 'c2', text: 'We wait.', target: 'beat_wait' },
        ],
      },
    }],
  },
  ...extra,
} as any);

describe('DialogTree continue step', () => {
  it('plays the next speaker without a player reply, then offers the choices', async () => {
    const context = new StoryContext();
    // Nobody clicks Continue: the reading time moves the scene on.
    const { renderer, dialogs, choiceCalls } = mockRenderer([]);
    (renderer.renderChoices as any).mockImplementationOnce(async (choices: any[]) => {
      choiceCalls.push(choices);
      return new Promise<string>(() => {});
    }).mockImplementationOnce(async (choices: any[]) => {
      choiceCalls.push(choices);
      return 'root.c_next_c1';
    });

    const result = await scene().execute(context, renderer);

    expect(dialogs).toEqual(["Mara: We can't stay here.", 'Jonas: And go where?']);
    // First: a Continue button that is not a player line; then the replies.
    expect(choiceCalls[0]).toHaveLength(1);
    expect(choiceCalls[0][0]).toMatchObject({ text: 'Continue', isContinue: true });
    expect(choiceCalls[1].map((c: any) => c.text)).toEqual(['We take the ferry.', 'We wait.']);
    expect(result).toBe('beat_ferry');
    expect(context.getVariable('heardJonas')).toBe(true);
    // The player said nothing at the continue step: only the reply is recorded.
    expect(context.getChoiceHistory().map(c => c.choiceText)).toEqual(['We take the ferry.']);
  });

  it('a click on Continue moves on at once', async () => {
    const context = new StoryContext();
    const { renderer, dialogs } = mockRenderer(['root___continue', 'root.c_next_c2']);
    const result = await scene().execute(context, renderer);
    expect(dialogs).toHaveLength(2);
    expect(result).toBe('beat_wait');
  });

  it('with skipping off, the line shows no Continue button and the scene waits its turn', async () => {
    const context = new StoryContext();
    const { renderer, dialogs, choiceCalls } = mockRenderer([]);
    (renderer.renderChoices as any).mockImplementationOnce(async (choices: any[]) => {
      choiceCalls.push(choices);
      return new Promise<string>(() => {});
    }).mockImplementationOnce(async (choices: any[]) => {
      choiceCalls.push(choices);
      return 'root.c_next_c2';
    });

    const result = await scene({ parameters: { allowSkipAhead: false } }).execute(context, renderer);

    expect(dialogs).toEqual(["Mara: We can't stay here.", 'Jonas: And go where?']);
    // The line is drawn with no button; then the player's replies.
    expect(choiceCalls[0]).toEqual([]);
    expect(choiceCalls[1].map((c: any) => c.text)).toEqual(['We take the ferry.', 'We wait.']);
    expect(result).toBe('beat_wait');
    expect(context.getVariable('heardJonas')).toBe(true);
  });

  it('with skipping off, a farewell line moves on by itself without a button', async () => {
    const beat = new DialogTreeBeat({
      id: 'bye', name: 'Bye', type: 'dialogTree',
      dialogTree: { id: 'n0', speaker: 'Guard', text: 'Go away!', choices: [], target: 'beat_out' },
      parameters: { allowSkipAhead: false },
    } as any);
    const { renderer, choiceCalls } = mockRenderer([]);
    expect(await beat.execute(new StoryContext(), renderer)).toBe('beat_out');
    expect(choiceCalls).toEqual([[]]);
  });

  it('keeps allowSkipAhead through a parameter update; unset means skippable', () => {
    const beat = scene();
    expect(beat.getParameters().allowSkipAhead).toBeUndefined();
    beat.updateParameters({ allowSkipAhead: false });
    const copy = new DialogTreeBeat({ id: 'c', name: 'C', type: 'dialogTree', parameters: beat.getParameters() } as any);
    expect(copy.getParameters().allowSkipAhead).toBe(false);
  });

  it('takes the first continue step whose conditions match', async () => {
    const beat = new DialogTreeBeat({
      id: 'cond', name: 'Cond', type: 'dialogTree',
      dialogTree: {
        id: 'n0', speaker: 'Mara', text: 'Well?',
        choices: [
          { id: 'k1', text: '', continue: true, conditions: [{ type: 'variable', variable: 'angry', operator: '==', value: true }],
            dialogNode: { id: 'a', speaker: 'Jonas', text: 'Leave me alone.', choices: [], target: 'beat_a' } },
          { id: 'k2', text: '', continue: true,
            dialogNode: { id: 'b', speaker: 'Jonas', text: 'Fine by me.', choices: [], target: 'beat_b' } },
        ],
      },
    } as any);
    const { renderer, dialogs } = mockRenderer([]);
    expect(await beat.execute(new StoryContext(), renderer)).toBe('beat_b');
    expect(dialogs[1]).toBe('Jonas: Fine by me.');
  });

  it('a conditional line steps in before the replies; with no match the player answers', async () => {
    const make = () => new DialogTreeBeat({
      id: 'bully', name: 'Bully', type: 'dialogTree',
      dialogTree: {
        id: 'n0', speaker: 'Bully', text: 'Nice shoes.',
        choices: [
          { id: 'zoe', text: '', continue: true,
            conditions: [{ type: 'variable', variable: 'defended', operator: '==', value: true }],
            effects: [{ type: 'setVariable', target: 'witnessed', value: true }],
            dialogNode: { id: 'z', speaker: 'Zoe', text: 'Leave him alone.', choices: [], target: 'beat_zoe' } },
          { id: 'r', text: 'Stop it.', target: 'beat_reply' },
        ],
      },
    } as any);

    const plain = mockRenderer(['root_r']);
    const quiet = new StoryContext();
    expect(await make().execute(quiet, plain.renderer)).toBe('beat_reply');
    expect(plain.choiceCalls[0].map((c: any) => c.text)).toEqual(['Stop it.']);
    expect(quiet.getVariable('witnessed')).toBeUndefined();

    const helped = new StoryContext();
    helped.setVariable('defended', true);
    const step = mockRenderer([]);
    expect(await make().execute(helped, step.renderer)).toBe('beat_zoe');
    expect(step.dialogs[1]).toBe('Zoe: Leave him alone.');
    expect(helped.getVariable('witnessed')).toBe(true);
  });

  it('keeps the continue flag through a parameter update', () => {
    const beat = scene();
    beat.updateParameters({ ...beat.getParameters() });
    const choice = (beat.getParameters() as any).dialogTree.choices[0];
    expect(choice.continue).toBe(true);
  });

  it('reads a lone legacy "[Continue]" choice as a continue step', () => {
    const beat = new DialogTreeBeat({
      id: 'legacy', name: 'Legacy', type: 'dialogTree',
      dialogTree: {
        id: 'n0', speaker: 'Mara', text: 'Listen.',
        choices: [{ id: 'auto_continue', text: '[Continue]', dialogNode: { id: 'n1', speaker: 'Jonas', text: 'I am.', choices: [] } }],
      },
    } as any);
    const choice = (beat.getParameters() as any).dialogTree.choices[0];
    expect(choice).toMatchObject({ continue: true, text: '' });
  });

  it('leaves a "[Continue]" choice next to real replies alone', () => {
    const beat = new DialogTreeBeat({
      id: 'mixed', name: 'Mixed', type: 'dialogTree',
      dialogTree: {
        id: 'n0', speaker: 'Mara', text: 'Listen.',
        choices: [
          { id: 'a', text: '[Continue]', target: 'beat_x' },
          { id: 'b', text: 'No.', target: 'beat_y' },
        ],
      },
    } as any);
    const choices = (beat.getParameters() as any).dialogTree.choices;
    expect(choices[0].continue).toBeUndefined();
  });
});
