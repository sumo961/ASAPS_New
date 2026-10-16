/**
 * A dialog line can put its speaker in one of their character states
 * ("angry"): published to the renderer as 'speakerStates' from that line on.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function statefulRenderer() {
  const state: Record<string, any> = {};
  const seenAtLine: Array<{ line: string; states: any }> = [];
  const renderer = {
    initialize: vi.fn(), clear: vi.fn(), playSound: vi.fn(), stopSound: vi.fn(),
    setState: vi.fn((k: string, v: any) => { state[k] = v; }),
    getState: vi.fn((k: string) => state[k]),
    renderDialog: vi.fn(async (speaker: string, text: string) => {
      seenAtLine.push({ line: `${speaker}: ${text}`, states: state.speakerStates });
    }),
    renderChoices: vi.fn(async (choices: any[]) => (choices[0]?.isContinue ? 'root___continue' : 'root.c_next_c1')),
  } as unknown as IRenderer;
  return { renderer, state, seenAtLine };
}

describe('DialogTree speaker state per line', () => {
  it('publishes the line state from that line on and clears it for the next beat', async () => {
    const beat = new DialogTreeBeat({
      id: 'scene', name: 'Scene', type: 'dialogTree',
      dialogTree: {
        id: 'n0', speaker: 'Mara', text: 'Calm down.',
        choices: [{
          id: 'c_next', text: '', continue: true,
          dialogNode: {
            id: 'n1', speaker: 'Jonas', text: 'I AM calm!', speakerState: 'angry',
            choices: [{ id: 'c1', text: 'Fine.', target: 'beat_next' }],
          },
        }],
      },
    } as any);
    const { renderer, state, seenAtLine } = statefulRenderer();

    const result = await beat.execute(new StoryContext(), renderer);

    expect(result).toBe('beat_next');
    expect(seenAtLine[0].states).toBeUndefined();
    expect(seenAtLine[1].states).toEqual({ jonas: 'angry' });

    // The next beat starts from the authored looks.
    const next = new DialogTreeBeat({ id: 'b2', name: 'B2', type: 'dialogTree', dialogTree: { id: 'r', speaker: 'Jonas', text: 'Hi.', choices: [{ id: 'c1', text: 'Bye', target: 'end' }] } } as any);
    (renderer.renderChoices as any).mockImplementation(async () => 'root.c1');
    await next.execute(new StoryContext(), renderer);
    expect(state.speakerStates).toBeUndefined();
  });
});
