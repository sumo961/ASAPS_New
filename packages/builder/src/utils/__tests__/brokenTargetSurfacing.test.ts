/**
 * The validator's broken-link findings must be shaped so the UI can show them.
 *
 * `aiStoryValidator` has always detected a choice pointing at a beat that does
 * not exist. The finding then went to `console.warn` and nowhere else, and a
 * generated story with three dead links passed a whole verification round —
 * it imported looking complete and stopped dead at its first decision.
 *
 * The banner needs more than a message string: it needs the beat the link
 * starts from (to name it, and to mark it in the graph) and the id it points
 * at. These assert that shape survives, since a message-only error would
 * silently reduce the banner to an unclickable sentence.
 */
import { describe, it, expect } from 'vitest';
import { validateAIStory } from '../aiStoryValidator';

const storyWithDeadDialogLink = {
  beats: [
    { id: 'beat_0', type: 'titleScreen', name: 'Title', parameters: {} },
    {
      id: 'beat_3', type: 'dialogTree', name: 'Decision 1 — How you open',
      parameters: {
        dialogTree: {
          text: 'The last one who sat where you are...',
          choices: [
            { id: 'apology', text: 'You should not have been left hanging.',
              dialogNode: { text: 'Huh.', choices: [
                { id: 'apology_exit', text: 'Can we do that?', target: 'beat_intake' },
              ] } },
          ],
        },
      },
    },
  ],
  connections: [],
};

describe('broken dialogTree targets reach the UI', () => {
  it('reports a leaf choice pointing at a beat that does not exist', () => {
    const r = validateAIStory(storyWithDeadDialogLink as never);
    const missing = r.errors.filter(e => e.category === 'missing_beat');
    expect(missing.length).toBe(1);
    expect(r.valid).toBe(false);
  });

  it('names the beat the broken link starts from, so the graph can mark it', () => {
    // Without beatId the banner cannot offer "show me", and the ⚠ mark has no
    // node to attach to — the finding degrades to an unactionable sentence.
    const [e] = validateAIStory(storyWithDeadDialogLink as never).errors
      .filter(x => x.category === 'missing_beat');
    expect(e.beatId).toBe('beat_3');
    expect(e.targetId).toBe('beat_intake');
  });

  it('lists the missing id separately, for a summary that does not repeat itself', () => {
    const r = validateAIStory(storyWithDeadDialogLink as never);
    expect(r.missingBeatIds).toContain('beat_intake');
  });

  it('says nothing when every target resolves', () => {
    const ok = {
      beats: [
        { id: 'beat_0', type: 'titleScreen', name: 'Title', parameters: {} },
        { id: 'beat_1', type: 'infoText', name: 'Next', parameters: {} },
      ],
      connections: [{ from: 'beat_0', to: 'beat_1' }],
    };
    const r = validateAIStory(ok as never);
    expect(r.errors.filter(e => e.category === 'missing_beat')).toHaveLength(0);
  });
});
