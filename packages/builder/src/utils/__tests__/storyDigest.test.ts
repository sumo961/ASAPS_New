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
    expect(digest).toContain('- Elena (id: c1; ref: elena; 3 traits; counters: trust)');
    expect(digest).toContain('VARIABLES: score');
    expect(digest).toContain('- b1 [infoText] "Opening" — It was a dark and stormy night. → b2 ("Continue")');
    expect(digest).toContain('- b2 [endScreen] "The End" — Fin');
  });

  it('names variants with their stances + selection policy so affect is visible', () => {
    const digest = buildStoryDigest({
      beats: [beat({})],
      characters: [{
        id: 'karin', name: 'karin', displayName: 'Karin',
        traits: { openness: 0.5, extraversion: 0.3 },
        variantSelectionPolicy: 'random',
        variants: [
          { id: 'hostile', name: 'Hostile', stance: { warmth: -0.7, dominance: 0.5 } },
          { id: 'cooperative', name: 'Cooperative', stance: { warmth: 0.7, dominance: -0.2 } },
        ],
      }],
    });
    expect(digest).toContain('2 traits');
    expect(digest).toContain('variants: Hostile [stance w-0.7 d+0.5], Cooperative [stance w+0.7 d-0.2]');
    expect(digest).toContain('selection: random each playthrough');
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

  it('carries FULL beat text by default (recommendations must not rest on truncated snippets)', () => {
    const longText = 'A'.repeat(3000);
    const digest = buildStoryDigest({
      beats: [beat({ parameters: { text: longText } })],
    });
    expect(digest).toContain(longText);
  });

  it('degrades to tiered snippets only when the overall budget overflows', () => {
    const longText = 'B'.repeat(3000);
    const beats = Array.from({ length: 100 }, (_, i) =>
      beat({ id: `b${i}`, parameters: { text: longText } })
    );
    const digest = buildStoryDigest({ beats }, { maxChars: 60000 });
    expect(digest.length).toBeLessThanOrEqual(60000);
    expect(digest).not.toContain(longText);
    expect(digest).toContain('…'); // truncation is marked for the model
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

describe('bound counters in the digest', () => {
  it('marks a bound counter read-only so the Co-Designer will not write to it', () => {
    // The name alone doesn't reveal that a setCounter against it is discarded
    // by the next appraisal.
    const digest = buildStoryDigest({
      title: 'T',
      beats: [],
      characters: [{
        id: 'ada', name: 'ada', displayName: 'Ada',
        counters: [
          { name: 'gold', displayName: 'Gold' },
          { name: 'trust', displayName: 'Trust', source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' } },
        ],
      }],
    } as any);
    expect(digest).toContain('Gold');
    expect(digest).toContain('Trust [reads sentiment, read-only]');
  });
});
