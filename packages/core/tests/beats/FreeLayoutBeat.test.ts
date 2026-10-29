/**
 * Free Layout — a screen laid out by hand: text boxes, buttons, pictures and
 * characters as stage elements (locations); texts and choices name their
 * element by locationName. Buttons lead on like choices; an optional timer
 * goes on by itself; with neither, a click anywhere goes on.
 */
import { describe, it, expect, vi } from 'vitest';
import { FreeLayoutBeat } from '../../src/beats/FreeLayoutBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { FREE_LAYOUT_NEXT, FREE_LAYOUT_TIMEOUT, type FreeLayoutScreen, type IRenderer } from '../../src/types';
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

const make = (parameters: Record<string, any>, locations: any[] = []) =>
  new FreeLayoutBeat({ id: 'fl', name: 'Lobby', type: 'freeLayout', parameters, locations } as any);

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
  });

  it('the timer goes on by itself; with no buttons and no timer a click anywhere goes on', async () => {
    const timed = make({ duration: 5, timerTarget: 'later', nextTarget: 'unused' }, stage);
    const t = renderer(FREE_LAYOUT_TIMEOUT);
    await expect(timed.execute(new StoryContext(), t.r)).resolves.toBe('later');
    expect(t.shown[0]).toMatchObject({ duration: 5, clickAnywhere: false });

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

  it('its links: each button, the timer only with a timer, Next only with neither', () => {
    const withButtons = make({ choices: [{ id: 'b1', locationName: 'Door', text: 'Leave', target: 'x' }], nextTarget: 'n', timerTarget: 't' });
    expect(withButtons.getConnections().map((c) => [c.targetId, c.label])).toEqual([['x', 'Leave']]);
    const timed = make({ duration: 3, timerTarget: 't', nextTarget: 'n' });
    expect(timed.getConnections().map((c) => [c.targetId, c.label])).toEqual([['t', 'When time runs out']]);
    const plain = make({ nextTarget: 'n', timerTarget: 't' });
    expect(plain.getConnections().map((c) => [c.targetId, c.label])).toEqual([['n', 'Next']]);
    // The story-wide link walk agrees.
    expect(beatLinks(plain.toJSON()).map((l) => l.target)).toEqual(['n']);
    expect(beatLinks(withButtons.toJSON()).map((l) => l.target)).toEqual(['x']);
    expect(beatLinks(timed.toJSON()).map((l) => l.target)).toEqual(['t']);
  });

  it('keeps its settings through saving and loading', () => {
    const beat = make({ texts: [{ locationName: 'Sign', text: 'Hi' }], choices: [{ id: 'b1', locationName: 'Door', text: 'Go', target: 'x' }], duration: 4, timerTarget: 't', markVisited: true }, stage);
    const copy = new FreeLayoutBeat(beat.toJSON());
    expect(copy.getParameters()).toMatchObject({ texts: [{ locationName: 'Sign', text: 'Hi' }], choices: [{ id: 'b1', target: 'x' }], duration: 4, timerTarget: 't', markVisited: true });
    expect([...copy.locations.keys()]).toEqual(['Sign', 'Door', 'Lamp']);
  });

  it('a renderer without renderFreeLayout shows the buttons as choices', async () => {
    const beat = make({ texts: [{ locationName: 'Sign', text: 'Hi' }], choices: [{ id: 'b1', locationName: 'Door', text: 'Go', target: 'x' }] }, stage);
    const { r } = renderer('b1');
    delete (r as any).renderFreeLayout;
    await expect(beat.execute(new StoryContext(), r)).resolves.toBe('x');
    expect(r.renderChoices).toHaveBeenCalledWith([{ id: 'b1', text: 'Go' }]);
  });
});
