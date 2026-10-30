/**
 * Free Layout — a screen laid out by hand: text boxes, buttons, pictures and
 * characters as stage elements (locations); texts and choices name their
 * element by locationName. Buttons lead on like choices; the beat's
 * auto-advance timer goes on by itself; with neither, a click anywhere goes on.
 */
import { describe, it, expect, vi } from 'vitest';
import { FreeLayoutBeat } from '../../src/beats/FreeLayoutBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { FREE_LAYOUT_NEXT, type FreeLayoutScreen, type IRenderer } from '../../src/types';
import { beatLinks } from '../../src/utils/storyLinks';

function renderer(...answers: string[]) {
  const shown: FreeLayoutScreen[] = [];
  const queue = [...answers];
  const r = {
    setState: vi.fn(), getState: vi.fn().mockReturnValue(null),
    renderFreeLayout: vi.fn(async (screen: FreeLayoutScreen) => { shown.push(screen); return queue.shift() ?? ''; }),
    renderChoices: vi.fn(async () => queue.shift() ?? ''),
    renderDialog: vi.fn(async () => {}), renderText: vi.fn(async () => {}),
    playSound: vi.fn(),
  } as unknown as IRenderer;
  return { r, shown };
}

const make = (parameters: Record<string, any>, locations: any[] = [], extra: Record<string, any> = {}) =>
  new FreeLayoutBeat({ id: 'fl', name: 'Lobby', type: 'freeLayout', parameters, locations, ...extra } as any);
const timer = { defaultTarget: 'later', defaultTargetDelay: 5 };

const stage = [
  { name: 'Sign', kind: 'text', x: 10, y: 10, width: 300, height: 60 },
  { name: 'Door', kind: 'button', x: 10, y: 100, width: 120, height: 40 },
  { name: 'Lamp', kind: 'prop', x: 200, y: 100, width: 80, height: 80, assetId: 'asset_lamp' },
];

describe('FreeLayoutBeat', () => {
  it('shows its elements with their words, and a button leads where it points', async () => {
    const beat = make({
      texts: [{ locationName: 'Sign', text: 'Welcome, ${name}' }],
      choices: [
        { id: 'b1', locationName: 'Door', text: 'Leave', target: 'outside', effects: [{ type: 'incrementCounter', target: 'courage', value: 1 }] },
        { id: 'b2', locationName: 'Lamp', text: '', target: 'lamp_closeup' },
      ],
    }, stage);
    const context = new StoryContext();
    context.setVariable('name', 'Ana');
    const { r, shown } = renderer('b1');
    await expect(beat.execute(context, r)).resolves.toBe('outside');
    expect(shown[0].texts).toEqual({ Sign: 'Welcome, Ana', Door: 'Leave', Lamp: '' });
    expect(shown[0].buttons).toEqual([{ id: 'b1', locationName: 'Door' }, { id: 'b2', locationName: 'Lamp' }]);
    expect(shown[0].locations.map((l) => l.name)).toEqual(['Sign', 'Door', 'Lamp']);
    expect(shown[0].clickAnywhere).toBe(false);
    expect(context.getCounter('courage')).toBe(1);
  });

  it('a button whose conditions are not met is not on show', async () => {
    const beat = make({ choices: [
      { id: 'b1', locationName: 'Door', text: 'Leave', target: 'x' },
      { id: 'b2', locationName: 'Lamp', text: '', target: 'y', conditions: [{ type: 'variable', variable: 'lit', operator: '==', value: true }] },
    ] }, stage);
    const { r, shown } = renderer('b1');
    await beat.execute(new StoryContext(), r);
    expect(shown[0].buttons.map((b) => b.id)).toEqual(['b1']);
    expect(shown[0].hidden).toEqual(['Lamp']);
  });

  it('the auto-advance timer goes on by itself; with no buttons and no timer a click anywhere goes on', async () => {
    const timed = make({ nextTarget: 'unused' }, stage, timer);
    const t = renderer('__timer_interrupt__');
    // The shared auto-advance timer (Beat.onEnter) — its clock is the browser's.
    const context = new StoryContext();
    const timers = { startTimer: vi.fn(), stopTimer: vi.fn() };
    vi.spyOn(context, 'getTimerManager').mockReturnValue(timers as any);
    await expect(timed.execute(context, t.r)).resolves.toBe('later');
    expect(timers.startTimer).toHaveBeenCalledWith('defaultTarget_fl', 5, 'later');
    expect(t.shown[0]).toMatchObject({ clickAnywhere: false });

    const plain = make({ nextTarget: 'onward' }, stage);
    const n = renderer(FREE_LAYOUT_NEXT);
    await expect(plain.execute(new StoryContext(), n.r)).resolves.toBe('onward');
    expect(n.shown[0].clickAnywhere).toBe(true);
  });

  it('a button not linked yet keeps the screen up and says which one', async () => {
    const beat = make({ choices: [
      { id: 'b1', locationName: 'Door', text: 'Leave', target: '' },
      { id: 'b2', locationName: 'Lamp', text: '', target: 'y' },
    ] }, stage);
    const { r, shown } = renderer('b1', 'b2');
    await expect(beat.execute(new StoryContext(), r)).resolves.toBe('y');
    expect(shown).toHaveLength(2);
    expect((r.setState as any).mock.calls.some(([k, v]: any) => k === 'unlinkedChoice' && v?.choiceText === 'Leave')).toBe(true);
  });

  it('its links: each button, the auto-advance as every beat has it, Next only with neither', () => {
    const withButtons = make({ choices: [{ id: 'b1', locationName: 'Door', text: 'Leave', target: 'x' }], nextTarget: 'n' }, stage);
    expect(withButtons.getConnections().map((c) => [c.targetId, c.label])).toEqual([['x', 'Leave']]);
    const timed = make({ nextTarget: 'n' }, [], timer);
    expect(timed.getConnections()).toEqual([]);
    const plain = make({ nextTarget: 'n' });
    expect(plain.getConnections().map((c) => [c.targetId, c.label])).toEqual([['n', 'Next']]);
    // The story-wide link walk agrees.
    expect(beatLinks(plain.toJSON()).map((l) => l.target)).toEqual(['n']);
    expect(beatLinks(withButtons.toJSON()).map((l) => l.target)).toEqual(['x']);
    expect(beatLinks(timed.toJSON()).map((l) => l.target)).toEqual(['later']);
  });

  it('a button whose element was deleted stays, unused, so Undo can bring back its link', async () => {
    const beat = make({ choices: [{ id: 'gone', locationName: 'Old Door', text: 'Leave', target: 'x' }], nextTarget: 'n' }, stage);
    expect(beat.liveChoices).toEqual([]);
    expect(beat.clickAnywhere).toBe(true);
    expect(beat.getConnections().map((c) => c.targetId)).toEqual(['n']);
    expect(beatLinks(beat.toJSON()).map((l) => l.target)).toEqual(['n']);
    const { r, shown } = renderer(FREE_LAYOUT_NEXT);
    await expect(beat.execute(new StoryContext(), r)).resolves.toBe('n');
    expect(shown[0].buttons).toEqual([]);
    expect(beat.getParameters().choices).toHaveLength(1);
  });

  it('finds its elements by name even when the locations are keyed by element id', async () => {
    const beat = make({ choices: [{ id: 'b1', locationName: 'Door', text: 'Leave', target: 'x' }] }, stage);
    beat.locations.clear();
    stage.forEach((l, i) => beat.locations.set(`element_${i}`, l as any));
    expect(beat.liveChoices.map((c) => c.id)).toEqual(['b1']);
    const { r, shown } = renderer('b1');
    await beat.execute(new StoryContext(), r);
    expect(shown[0].texts.Door).toBe('Leave');
  });

  it('keeps its settings through saving and loading', () => {
    const beat = make({ texts: [{ locationName: 'Sign', text: 'Hi' }], choices: [{ id: 'b1', locationName: 'Door', text: 'Go', target: 'x' }], markVisited: true }, stage, timer);
    const copy = new FreeLayoutBeat(beat.toJSON());
    expect(copy.getParameters()).toMatchObject({ texts: [{ locationName: 'Sign', text: 'Hi' }], choices: [{ id: 'b1', target: 'x' }], markVisited: true });
    expect([copy.defaultTarget, copy.defaultTargetDelay]).toEqual(['later', 5]);
    expect([...copy.locations.keys()]).toEqual(['Sign', 'Door', 'Lamp']);
  });

  it('a link set to nowhere is cleared', () => {
    const beat = make({ nextTarget: 'n' });
    beat.updateParameters({ ...beat.getParameters(), nextTarget: undefined });
    expect(beat.getParameters()).toMatchObject({ nextTarget: undefined });
    expect(beat.getConnections()).toEqual([]);
  });

  it('a renderer without renderFreeLayout shows the buttons as choices', async () => {
    const beat = make({ texts: [{ locationName: 'Sign', text: 'Hi' }], choices: [{ id: 'b1', locationName: 'Door', text: 'Go', target: 'x' }] }, stage);
    const { r } = renderer('b1');
    delete (r as any).renderFreeLayout;
    await expect(beat.execute(new StoryContext(), r)).resolves.toBe('x');
    expect(r.renderChoices).toHaveBeenCalledWith([{ id: 'b1', text: 'Go' }]);
  });
});
