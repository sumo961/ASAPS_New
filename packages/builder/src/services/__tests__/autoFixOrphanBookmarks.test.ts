/**
 * Tests for the v0.9.46+ orphan-bookmark auto-fixer in AIService.
 *
 * The AI consistently authors `baseline: { bookmark: "X" }` references
 * without an upstream `bookmarkAffectState` Effect. Three rounds of
 * progressively stronger prompt fixes didn't close the gap, so we patch
 * deterministically: convert orphan refs to `baseline: 'initial'`.
 *
 * These tests exercise the validator in isolation by reflecting into
 * the private method (matching the pattern used elsewhere for testing
 * private auto-fixers).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../AIService';

// Helper to invoke the private autoFixOrphanBookmarkReferences method
// without going through the full generation pipeline.
function runFix(response: any): void {
  const svc = new AIService({} as any);
  // @ts-expect-error - reaching into private for unit-test purposes.
  svc.autoFixOrphanBookmarkReferences(response);
}

describe('autoFixOrphanBookmarkReferences', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('leaves a bookmark ref alone when a matching upstream Effect exists', () => {
    const response = {
      beats: [
        {
          id: 'beat_act_break',
          type: 'updateAffect',
          parameters: {
            effects: [
              { type: 'bookmarkAffectState', target: '', bookmarkName: 'act1_end', scope: 'all' },
            ],
          },
        },
        {
          id: 'beat_check',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'sentiment',
              character: 'mara',
              sentimentTarget: 'player',
              sentimentEmotion: 'trust',
              operator: '>=',
              value: 0.2,
              baseline: { bookmark: 'act1_end' },
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[1].parameters.condition.baseline).toEqual({ bookmark: 'act1_end' });
  });

  it('converts orphan bookmark ref to baseline:initial', () => {
    const response = {
      beats: [
        {
          id: 'beat_check',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'sentiment',
              character: 'mara',
              sentimentTarget: 'player',
              sentimentEmotion: 'trust',
              operator: '>=',
              value: 0.2,
              baseline: { bookmark: 'act1_end' },
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[0].parameters.condition.baseline).toBe('initial');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('finds upstream bookmarks taken inline on a dialogTree choice effect', () => {
    const response = {
      beats: [
        {
          id: 'beat_dialog',
          type: 'dialogTree',
          parameters: {
            dialogTree: {
              choices: [
                {
                  text: 'Walk away',
                  target: 'beat_next',
                  effects: [
                    { type: 'nudgeMood', target: 'mara', valenceDelta: -0.1 },
                    { type: 'bookmarkAffectState', target: '', bookmarkName: 'act1_end' },
                  ],
                },
              ],
            },
          },
        },
        {
          id: 'beat_check',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'mood',
              character: 'mara',
              moodAxis: 'valence',
              operator: '>=',
              value: 0.2,
              baseline: { bookmark: 'act1_end' },
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[1].parameters.condition.baseline).toEqual({ bookmark: 'act1_end' });
  });

  it('finds bookmarks nested in dialogNode.choices.effects', () => {
    const response = {
      beats: [
        {
          id: 'beat_dialog',
          type: 'dialogTree',
          parameters: {
            dialogTree: {
              choices: [
                {
                  text: 'Open conversation',
                  dialogNode: {
                    choices: [
                      {
                        text: 'Confess',
                        target: 'beat_next',
                        effects: [
                          { type: 'bookmarkAffectState', target: '', bookmarkName: 'confession_moment' },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
        {
          id: 'beat_check',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'sentiment',
              character: 'mara',
              sentimentTarget: 'player',
              sentimentEmotion: 'trust',
              operator: '>=',
              value: 0.2,
              baseline: { bookmark: 'confession_moment' },
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[1].parameters.condition.baseline).toEqual({ bookmark: 'confession_moment' });
  });

  it('does not touch baseline:initial conditions', () => {
    const response = {
      beats: [
        {
          id: 'beat_check',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'sentiment',
              character: 'mara',
              sentimentTarget: 'player',
              sentimentEmotion: 'trust',
              operator: '>=',
              value: 0.3,
              baseline: 'initial',
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[0].parameters.condition.baseline).toBe('initial');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not touch literal-baseline conditions', () => {
    const response = {
      beats: [
        {
          id: 'beat_check',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'sentiment',
              character: 'mara',
              sentimentTarget: 'player',
              sentimentEmotion: 'trust',
              operator: '>=',
              value: 0.3,
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[0].parameters.condition.baseline).toBeUndefined();
  });

  it('handles multiple orphan refs independently', () => {
    const response = {
      beats: [
        // Only one of two referenced bookmarks is taken upstream.
        {
          id: 'beat_break',
          type: 'updateAffect',
          parameters: {
            effects: [
              { type: 'bookmarkAffectState', target: '', bookmarkName: 'act1_end' },
            ],
          },
        },
        {
          id: 'beat_check_a',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'sentiment', character: 'mara',
              sentimentTarget: 'player', sentimentEmotion: 'trust',
              operator: '>=', value: 0.2,
              baseline: { bookmark: 'act1_end' },  // valid
            },
          },
        },
        {
          id: 'beat_check_b',
          type: 'conditionBeat',
          parameters: {
            condition: {
              type: 'mood', character: 'mara', moodAxis: 'valence',
              operator: '>=', value: 0.2,
              baseline: { bookmark: 'act2_end' },  // orphan
            },
          },
        },
      ],
    };
    runFix(response);
    expect(response.beats[1].parameters.condition.baseline).toEqual({ bookmark: 'act1_end' });
    expect(response.beats[2].parameters.condition.baseline).toBe('initial');
  });

  it('handles a story with no conditionBeats at all', () => {
    const response = { beats: [{ id: 'b1', type: 'titleScreen', parameters: {} }] };
    expect(() => runFix(response)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('handles a missing beats array gracefully', () => {
    const response = {} as any;
    expect(() => runFix(response)).not.toThrow();
  });
});
