// @vitest-environment jsdom
/**
 * A restart while a beat waits (2026-10-29: the Preview's Restart in the
 * middle of a story left the old run going next to the new one — the Debug
 * label followed one, the stage the other). stop() only cleared `running`
 * and the next start() set it again, so the old loop, woken when its wait
 * ended, carried on.
 */
import { describe, it, expect, vi } from 'vitest';
import { StoryEngine } from '../../src/engine/StoryEngine';
import { Story } from '../../src/engine/Story';
import { makeRenderer } from '../helpers/beatHarness';
import { createTestBeat } from '../test-utils';

describe('StoryEngine restart', () => {
  it('a run replaced by a new start() stops when its beat returns', async () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'title' });
    const executed: string[] = [];
    let releaseIntro: (next: string) => void = () => {};
    const beat = (id: string, run: () => Promise<string | null>) => {
      const b = createTestBeat({ id, name: id, type: 'infoText', parameters: { text: id } }) as any;
      b.execute = vi.fn(async () => { executed.push(id); return run(); });
      story.addBeat(b);
    };
    let titleCalls = 0;
    // The title waits for the player the second time (the new run); the
    // first time it goes straight on to the intro.
    beat('title', () => (++titleCalls === 1 ? Promise.resolve('intro') : new Promise(() => {})));
    beat('intro', () => new Promise((resolve) => { releaseIntro = resolve; }));
    beat('choice', async () => null);

    const engine = new StoryEngine(makeRenderer() as any);
    await engine.loadStory(story);
    const ended = vi.fn();
    engine.on('storyEnded', ended);

    const firstRun = engine.start();
    await vi.waitFor(() => expect(executed).toEqual(['title', 'intro']));

    // Restart: stop, start again from the title (which now waits).
    engine.stop();
    void engine.start();
    await vi.waitFor(() => expect(executed).toEqual(['title', 'intro', 'title']));

    // The old intro's wait ends, as clearing the stage ends it.
    releaseIntro('choice');
    await firstRun;

    expect(executed).toEqual(['title', 'intro', 'title']);
    expect(engine.getContext().getCurrentBeatId()).toBe('title');
    expect(ended).not.toHaveBeenCalled();
  });
});
