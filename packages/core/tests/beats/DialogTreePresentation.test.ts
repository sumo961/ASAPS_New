/**
 * The render path a Dialog Tree tells the renderer comes from layoutTemplate
 * (authoritative since v0.9.62), never from a stale legacy presentationMode.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function run(parameters: Record<string, unknown>) {
  const state: Record<string, unknown> = {};
  const renderer = {
    initialize: vi.fn(), clear: vi.fn(), playSound: vi.fn(), stopSound: vi.fn(),
    setState: vi.fn((k: string, v: unknown) => { state[k] = v; }),
    getState: vi.fn((k: string) => state[k] ?? null),
    renderDialog: vi.fn(async () => {}),
    renderChoices: vi.fn(async () => 'root_c1'),
  } as unknown as IRenderer;
  const beat = new DialogTreeBeat({
    id: 'b', name: 'B', type: 'dialogTree',
    parameters: {
      dialogTree: { id: 'root', speaker: 'A', text: 'Hi', choices: [{ id: 'c1', text: 'Bye', target: 'next' }] },
      ...parameters,
    },
  } as any);
  return beat.execute(new StoryContext(), renderer).then(() => state);
}

describe('DialogTree presentation state', () => {
  it('follows layoutTemplate over a stale presentationMode', async () => {
    expect((await run({ layoutTemplate: 'chat-scroll', presentationMode: 'positioned' })).presentationMode).toBe('chat-scroll');
    expect((await run({ layoutTemplate: 'stacked', presentationMode: 'chat-bubble' })).presentationMode).toBe('positioned');
  });

  it('a legacy beat without layoutTemplate keeps its chat mode', async () => {
    const state = await run({ presentationMode: 'chat-bubble' });
    expect(state.presentationMode).toBe('chat-bubble');
    expect(state.responseDelay).toBe(1.5);
  });

  it('an explicit 0 response delay stays 0', async () => {
    expect((await run({ layoutTemplate: 'chat-scroll', responseDelay: 0 })).responseDelay).toBe(0);
  });
});
