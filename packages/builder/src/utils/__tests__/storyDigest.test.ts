/**
 * Tests for the story digest — the Co-Designer's grounding context.
 * It must surface structure (beats, connections, characters, state) in
 * compact text, tolerate both Beat instances and serialized beats, and
 * respect the character budget without dropping the header sections.
 */
import { describe, it, expect } from 'vitest';
import { buildStoryDigest } from '../storyDigest';

const beat = (over: any = {}) => ({
  id: 'b1',
  type: 'infoText',
  name: 'Opening',
  parameters: { text: 'It was a dark and stormy night.' },
  ...over,
});

describe('buildStoryDigest', () => {
  it('includes title, counts, beat lines with text snippets and connections', () => {
    const digest = buildStoryDigest({
      title: 'Test Story',
      beats: [
        beat({
          getConnections: () => [{ targetId: 'b2', label: 'Continue' }],
        }),
        beat({ id: 'b2', type: 'endScreen', name: 'The End', parameters: { title: 'Fin' } }),
      ],
      characters: [
        { id: 'c1', name: 'elena', displayName: 'Elena', traits: [1, 2, 3], counters: [{ name: 'trust' }] },
      ],
      variables: [{ name: 'score' }],
    });

    expect(digest).toContain('STORY: "Test Story"');
    expect(digest).toContain('2 beats, 1 characters');
    expect(digest).toContain('- Elena (ref: elena; 3 traits; counters: trust)');
    expect(digest).toContain('VARIABLES: score');
    expect(digest).toContain('- b1 [infoText] "Opening" — It was a dark and stormy night. → b2 ("Continue")');
    expect(digest).toContain('- b2 [endScreen] "The End" — Fin');
  });

  it('reads text from getParameters() on live Beat instances', () => {
    const digest = buildStoryDigest({
      beats: [beat({ parameters: undefined, getParameters: () => ({ text: 'live text' }) })],
    });
    expect(digest).toContain('live text');
  });

  it('surfaces the dialog tree root line and the default target', () => {
    const digest = buildStoryDigest({
      beats: [
        beat({
          id: 'd1', type: 'dialogTree', name: 'Talk',
          parameters: { dialogTree: { text: 'Well well well.' } },
          defaultTarget: 'b9',
        }),
      ],
    });
    expect(digest).toContain('Well well well.');
    expect(digest).toContain('→ b9 (default)');
  });

  it('respects the character budget by shrinking snippets, then truncating beats', () => {
    const beats = Array.from({ length: 400 }, (_, i) =>
      beat({ id: `b${i}`, name: `Beat ${i}`, parameters: { text: 'x'.repeat(500) } })
    );
    const digest = buildStoryDigest({ title: 'Big', beats }, { maxChars: 8000 });
    expect(digest.length).toBeLessThanOrEqual(8000);
    expect(digest).toContain('STORY: "Big"'); // header survives
    expect(digest).toMatch(/\+\d+ more beats omitted/);
  });

  it('never throws on hostile beats', () => {
    const digest = buildStoryDigest({
      beats: [
        beat({ getParameters: () => { throw new Error('boom'); }, parameters: undefined }),
        beat({ id: 'b2', getConnections: () => { throw new Error('boom'); } }),
      ],
    });
    expect(digest).toContain('- b1 [infoText]');
    expect(digest).toContain('- b2 [infoText]');
  });
});
