// "Is there a way to fade music?" (2026-10-20): the setVolume effect.
import { describe, it, expect } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';

describe('setVolume effect', () => {
  it('signals the hosts with a 0–1 level, the target and the fade in ms', () => {
    const ctx = new StoryContext();
    const seen: any[] = [];
    ctx.on('setVolume', (e: any) => seen.push(e));
    ctx.applyEffect({ type: 'setVolume', target: 'music', value: 20, fadeSeconds: 3 } as any);
    ctx.applyEffect({ type: 'setVolume', target: 'all', value: 150 } as any);
    ctx.applyEffect({ type: 'setVolume', target: 'whatever', value: 'x' } as any);
    expect(seen).toEqual([
      { target: 'music', volume: 0.2, fadeMs: 3000 },
      { target: 'all', volume: 1, fadeMs: 0 },
      { target: 'music', volume: 1, fadeMs: 0 },
    ]);
  });
});

describe('Dialog Tree chat window and frame', () => {
  it('keeps a valid chat window and frame picture, drops a broken window', () => {
    const beat = new DialogTreeBeat({ id: 'b', name: 'Chat', type: 'dialogTree', parameters: {
      layoutTemplate: 'chat-scroll', chatWindow: { x: 300, y: 80, width: 420, height: 600 }, chatFrameImage: 'asset_phone',
      dialogTree: { id: 'n0', speaker: 'Vic', text: 'Hi', choices: [] },
    } } as any);
    expect(beat.getParameters()).toMatchObject({ chatWindow: { x: 300, y: 80, width: 420, height: 600 }, chatFrameImage: 'asset_phone' });
    beat.updateParameters({ chatWindow: { x: 1, y: 2, width: 0, height: 5 } });
    expect(beat.getParameters().chatWindow).toBeUndefined();
  });
});
