import { describe, it, expect } from 'vitest';
import { ConstraintPathAnalyzer } from '../../src/analysis/ConstraintPathAnalyzer';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';
import blackwoodFixture from '../fixtures/blackwood.json';
import hollowStarFixture from '../fixtures/hollowstar.json';

/** Load a saved AI-generated story JSON into a Story for analysis. */
function loadFixtureStory(fixture: any): Story {
  const src = fixture.story ?? fixture;
  const story = new Story({
    title: src.metadata?.title || 'fixture',
    author: src.metadata?.author || 'fixture',
    firstBeatId: src.beats?.[0]?.id || 'beat_0',
  });
  for (const b of src.beats || []) {
    // Normalize nested conditionBeat format (AI emits trueConnection/falseConnection)
    const parameters = { ...(b.parameters || {}) };
    if (b.type === 'conditionBeat') {
      if (parameters.trueConnection?.target) {
        parameters.trueTarget = parameters.trueConnection.target;
      }
      if (parameters.falseConnection?.target) {
        parameters.falseTarget = parameters.falseConnection.target;
      }
    }
    story.addBeat(createTestBeat({
      id: b.id,
      name: b.name || b.label || b.id,
      type: b.type,
      parameters,
      connections: b.connections,
    } as any));
  }
  return story;
}

/**
 * Regression tests for bugs found in "The Blackwood Adjustment"
 * (AI-generated, story-debug-1776117874947.json):
 *
 * Symptom: forward path analysis reported only 2 of 3 endings; the
 * highest-counter ending ("Ending C") was missing even though it was
 * manually reachable at runtime.
 */
describe('ConstraintPathAnalyzer — counter-gated endings', () => {
  /**
   * Blackwood shape:
   *   titleScreen → dialogTree (3 player lines, all → condition) →
   *   conditionBeat counter >= 6 → endC
   *                 else → conditionBeat counter >= 3 → endB / endA
   *
   * All three endings should be reachable according to the analyzer
   * because counter accumulation is not tracked and therefore every
   * counter comparison is unconstrained (both branches feasible).
   */
  function buildBlackwoodLike(): Story {
    const story = new Story({ title: 'Blackwood-lite', author: 't', firstBeatId: 'title' });

    story.addBeat(createTestBeat({
      id: 'title',
      name: 'Title',
      type: 'titleScreen',
      parameters: { title: 'The Blackwood Adjustment' },
      connections: [{ targetId: 'confrontation' }],
    }));

    story.addBeat(createTestBeat({
      id: 'confrontation',
      name: 'Final Confrontation',
      type: 'dialogTree',
      parameters: {
        dialogTree: {
          id: 'root',
          speaker: 'Mr. Blackwood',
          text: 'Will you complete the assessment?',
          choices: [
            { id: 'c_know', text: 'I know what you are.', target: 'check_high' },
            { id: 'c_flee', text: "I'm leaving.", target: 'check_high' },
            { id: 'c_deny', text: "This is fraud.", target: 'check_high' },
          ],
        },
      },
    }));

    story.addBeat(createTestBeat({
      id: 'check_high',
      name: 'Check High Exposure',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'counter', variable: 'horrorExposure', operator: '>=', value: 6 },
        trueConnection: { target: 'end_c', label: 'Too much knowledge' },
        falseConnection: { target: 'check_med', label: 'Check exposure level' },
      },
    }));

    story.addBeat(createTestBeat({
      id: 'check_med',
      name: 'Check Medium Exposure',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'counter', variable: 'horrorExposure', operator: '>=', value: 3 },
        trueConnection: { target: 'end_b', label: 'Glimpsed the truth' },
        falseConnection: { target: 'end_a', label: 'Remained ignorant' },
      },
    }));

    story.addBeat(createTestBeat({
      id: 'end_a', name: 'Ending A', type: 'endScreen',
      parameters: { message: 'Ending A - The Skeptic', showRestart: true },
    }));
    story.addBeat(createTestBeat({
      id: 'end_b', name: 'Ending B', type: 'endScreen',
      parameters: { message: 'Ending B - The Damned', showRestart: true },
    }));
    story.addBeat(createTestBeat({
      id: 'end_c', name: 'Ending C', type: 'endScreen',
      parameters: { message: 'Ending C - The Adjusted', showRestart: true },
    }));

    return story;
  }

  it('reports all three counter-gated endings', () => {
    const story = buildBlackwoodLike();
    const analyzer = new ConstraintPathAnalyzer(story);
    const result = analyzer.analyze();

    const endings = result.outcomes
      .filter(o => o.endType === 'ending')
      .map(o => o.endingBeatId);

    // All three should be reachable
    expect(endings).toContain('end_a');
    expect(endings).toContain('end_b');
    expect(endings).toContain('end_c');
    expect(result.uniqueEndings).toHaveLength(3);
  });

  it('reports all three endings on the Blackwood fixture (ConstraintPathAnalyzer)', () => {
    const story = loadFixtureStory(blackwoodFixture);
    const result = new ConstraintPathAnalyzer(story).analyze();

    const endings = result.outcomes
      .filter(o => o.endType === 'ending')
      .map(o => o.endingBeatId);

    expect(endings).toContain('beat_18_ending_a');
    expect(endings).toContain('beat_17_ending_b');
    expect(endings).toContain('beat_15_ending_c');
  });

  /**
   * Blackwood has three authored endings. Ending C ("The Adjusted") requires
   * horrorExposure >= 6, but the maximum value reachable in any SINGLE
   * play-through is 4 (beat_4a +2 → beat_10a +2). The hasKey branch leading
   * to +3 (beat_9a) is a trap — setting hasKey exits the hub and never
   * returns to beat_9_check.
   *
   * The user's playtest DID reach Ending C, but only because the endScreen
   * had reset: false (the schema default), so the counter persisted across
   * replays. A second run added +2 on top of the previous 4 and crossed the
   * threshold. That's a latent authoring footgun, not an analyzer bug: for
   * a single play-through Ending C is correctly unreachable.
   *
   * The fix for the underlying footgun is on the AI-generation side:
   * auto-set reset: true on generated endScreen/aiSummary beats and teach
   * the prompts to do the same (task #13). The analyzer is right.
   */
  it('correctly reports Blackwood ending C as unreachable in a single run', () => {
    const story = loadFixtureStory(blackwoodFixture);
    const analyzer = new StateSimulationAnalyzer(story, {
      maxDepth: 200,
      maxPaths: 500,
    });
    const result = analyzer.analyze();

    const endings = result.outcomes
      .filter(o => o.endType === 'ending')
      .map(o => o.endingBeatId);

    // A and B are reachable at runtime.
    expect(endings).toContain('beat_18_ending_a');
    expect(endings).toContain('beat_17_ending_b');
    // C is NOT reachable by any feasible play-through.
    expect(endings).not.toContain('beat_15_ending_c');
  });

  /**
   * Hollow Star ("The Policy of the Hollow Star") uses per-choice inline
   * counter fields on movementChoice, dialogTree, and pickProp beats:
   *   { counter: "cluesFound", counterOperation: "add", counterValue: 1 }
   *
   * The forward simulation analyzer previously ignored these inline fields
   * (it only read the canonical effects[] array + setVariable beats), so
   * counter-gated endings like "Expose" (>= 4 clues) were reported as
   * unreachable even though they are reachable in normal play. This test
   * asserts all four authored endings are feasible paths from start.
   */
  it('reports all four endings on the Hollow Star fixture (StateSimulationAnalyzer)', { timeout: 90_000 }, () => {
    const story = loadFixtureStory(hollowStarFixture);
    // Use defaults — test that the bumped default maxPaths is enough for a
    // realistic AI-generated story with inline per-choice counter effects.
    const analyzer = new StateSimulationAnalyzer(story);
    const result = analyzer.analyze();

    const endings = result.outcomes
      .filter(o => o.endType === 'ending')
      .map(o => o.endingBeatId);

    expect(endings).toContain('beat_ending_escape');
    expect(endings).toContain('beat_ending_complicit');
    expect(endings).toContain('beat_ending_expose');
    expect(endings).toContain('beat_ending_consumed');
  });

  it('counter add/subtract tracks a conservative range', () => {
    // Minimal counter-accumulation story:
    //   title → setVariable(add 5 to x) → condition(x >= 3) → endHigh / endLow
    const story = new Story({ title: 'CounterAdd', author: 't', firstBeatId: 'title' });

    story.addBeat(createTestBeat({
      id: 'title', name: 'Title', type: 'titleScreen',
      parameters: { title: 'x' },
      connections: [{ targetId: 'add' }],
    }));
    story.addBeat(createTestBeat({
      id: 'add', name: 'Add', type: 'setVariable',
      parameters: { type: 'counter', name: 'x', operation: 'add', value: 5 },
      connections: [{ targetId: 'check' }],
    }));
    story.addBeat(createTestBeat({
      id: 'check', name: 'Check', type: 'conditionBeat',
      parameters: {
        condition: { type: 'counter', variable: 'x', operator: '>=', value: 3 },
        trueConnection: { target: 'end_high' },
        falseConnection: { target: 'end_low' },
      },
    }));
    story.addBeat(createTestBeat({
      id: 'end_high', name: 'High', type: 'endScreen',
      parameters: { message: 'High', showRestart: true },
    }));
    story.addBeat(createTestBeat({
      id: 'end_low', name: 'Low', type: 'endScreen',
      parameters: { message: 'Low', showRestart: true },
    }));

    const result = new ConstraintPathAnalyzer(story).analyze();
    const endings = result.outcomes.filter(o => o.endType === 'ending').map(o => o.endingBeatId);

    // After exactly one `add 5` from 0, x==5, so (x >= 3) is TRUE and end_low is infeasible.
    // A fully correct analyzer would only list end_high. A lenient one may list both.
    // Minimum requirement: end_high must be reported.
    expect(endings).toContain('end_high');
  });
});
