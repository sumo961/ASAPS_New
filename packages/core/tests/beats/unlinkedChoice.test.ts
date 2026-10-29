/**
 * A choice the author hasn't linked to a beat yet (2026-10-29, class
 * feedback: "If you press a player choice that's not connected to a beat,
 * the program stops letting you click"). The run used to end with the
 * choices on screen, all dead; now the choices stay and the renderer is
 * told which one wasn't linked.
 */
import { describe, it, expect, vi } from 'vitest';
import { MultiChoiceBeat } from '../../src/beats/MultiChoiceBeat';
import { MovementChoiceBeat } from '../../src/beats/MovementChoiceBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

/** Picks the given choice ids in order, one per click. */
function rendererPicking(...picks: string[]): IRenderer {
  const queue = [...picks];
  const pick = vi.fn().mockImplementation(async () => queue.shift() ?? '');
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: pick,
    renderMovement: pick,
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

const unlinkedCalls = (r: IRenderer) =>
  (r.setState as ReturnType<typeof vi.fn>).mock.calls.filter(([k]) => k === 'unlinkedChoice').map(([, v]) => v);

describe('a choice not linked to a beat', () => {
  it('Multi Choice: stays on the beat, the other choices still work, and its effects do not run', async () => {
    const beat = new MultiChoiceBeat({
      id: 'mc', name: 'Hallway', type: 'multiChoice',
      choices: [
        { id: 'a', text: 'Hide', target: '', effects: [{ type: 'counter', name: 'fear', operation: 'add', value: 1 }] },
        { id: 'b', text: 'Run', target: 'beat_run' },
      ],
    } as any);
    const context = new StoryContext();
    const renderer = rendererPicking('a', 'b');
    await expect(beat.execute(context, renderer)).resolves.toBe('beat_run');
    expect(renderer.renderChoices).toHaveBeenCalledTimes(2);
    expect(unlinkedCalls(renderer)).toEqual([{ beatId: 'mc', beatName: 'Hallway', choiceText: 'Hide' }]);
    expect(context.getVisitedChoicesForBeat('mc')).toEqual(['b']);
  });

  it('Movement Choice: the same', async () => {
    const beat = new MovementChoiceBeat({
      id: 'mv', name: 'Crossroads', type: 'movementChoice',
      choices: [
        { id: 'left', text: 'Left' },
        { id: 'right', text: 'Right', target: 'beat_right' },
      ],
    } as any);
    const renderer = rendererPicking('left', 'right');
    await expect(beat.execute(new StoryContext(), renderer)).resolves.toBe('beat_right');
    expect(renderer.renderMovement).toHaveBeenCalledTimes(2);
    expect(unlinkedCalls(renderer)).toEqual([{ beatId: 'mv', beatName: 'Crossroads', choiceText: 'Left' }]);
  });

  it('"Return to initial choices" is a link, not a missing one', async () => {
    const beat = new MultiChoiceBeat({
      id: 'mc', name: 'Menu', type: 'multiChoice',
      choices: [{ id: 'a', text: 'Again', target: '__self__' }, { id: 'b', text: 'Go', target: 'next' }],
    } as any);
    const renderer = rendererPicking('a', 'b');
    await expect(beat.execute(new StoryContext(), renderer)).resolves.toBe('next');
    expect(unlinkedCalls(renderer)).toEqual([]);
  });
});
