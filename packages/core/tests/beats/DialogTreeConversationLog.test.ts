/**
 * The message history: every dialog tree played is kept as a conversation
 * (NPC lines and the player's replies, as shown), most recent first.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function renderer(pick: (choices: any[]) => string) {
  const state: Record<string, any> = {};
  return {
    initialize: vi.fn(), clear: vi.fn(), playSound: vi.fn(), stopSound: vi.fn(),
    setState: vi.fn((k: string, v: any) => { state[k] = v; }),
    getState: vi.fn((k: string) => state[k]),
    renderDialog: vi.fn(async () => {}),
    renderChoices: vi.fn(async (choices: any[]) => pick(choices)),
  } as unknown as IRenderer;
}

const scene = () => new DialogTreeBeat({
  id: 'scene', name: 'Scene', type: 'dialogTree',
  dialogTree: {
    id: 'n0', speaker: 'Mara', text: "We can't stay here, ${who}.",
    choices: [{
      id: 'c_next', text: '', continue: true,
      dialogNode: {
        id: 'n1', speaker: 'Jonas', text: 'And go where?', speakerState: 'angry',
        choices: [{ id: 'c1', text: 'We take the ferry.', target: 'beat_ferry' }],
      },
    }],
  },
} as any);

describe('conversation history', () => {
  it('keeps the lines and the reply as shown, and marks a later visit', async () => {
    const context = new StoryContext();
    context.setVariable('who', 'Ana');
    context.setVariable('playerName', 'Ana');
    const r = renderer((choices) => (choices[0]?.isContinue ? 'root___continue' : 'root.c_next_c1'));

    await scene().execute(context, r);
    let [chat] = context.getConversations();
    expect(chat.beatId).toBe('scene');
    expect(chat.lines).toEqual([
      { speaker: 'Mara', text: "We can't stay here, Ana." },
      { speaker: 'Jonas', text: 'And go where?', speakerState: 'angry' },
      { speaker: 'Ana', text: 'We take the ferry.', fromPlayer: true },
    ]);

    await scene().execute(context, r);
    [chat] = context.getConversations();
    expect(chat.lines).toHaveLength(6);
    expect(chat.lines[3]).toMatchObject({ speaker: 'Mara', newVisit: true });
    expect(chat.lines[4].newVisit).toBeUndefined();
  });

  it('travels with saved games and clears on restart', async () => {
    const context = new StoryContext();
    await scene().execute(context, renderer((c) => (c[0]?.isContinue ? 'root___continue' : 'root.c_next_c1')));
    const saved = context.serialize();
    const loaded = new StoryContext();
    loaded.loadFromSerialized(saved);
    expect(loaded.getConversations()[0].lines).toHaveLength(3);
    loaded.reset();
    expect(loaded.getConversations()).toEqual([]);
  });
});
