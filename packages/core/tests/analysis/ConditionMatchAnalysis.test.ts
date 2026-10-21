/**
 * Path analysis of a Condition Check with several conditions
 * (moreConditions + conditionsMatch): AND needs all to hold together, OR
 * any one of them.
 */
import { describe, it, expect } from 'vitest';
import { ConstraintPathAnalyzer } from '../../src/analysis/ConstraintPathAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

function storyWith(match: 'all' | 'any'): Story {
  const story = new Story({ title: 't', author: 't', firstBeatId: 'title' });
  story.addBeat(createTestBeat({ id: 'title', name: 'Title', type: 'titleScreen', parameters: { title: 'T' }, connections: [{ targetId: 'check' }] }));
  story.addBeat(createTestBeat({
    id: 'check',
    name: 'Check',
    type: 'conditionBeat',
    parameters: {
      condition: { type: 'variable', variableName: 'door', operator: '==', value: 'open' },
      moreConditions: [{ type: 'variable', variableName: 'door', operator: '==', value: 'shut' }],
      conditionsMatch: match,
      trueTarget: 'end_yes',
      falseTarget: 'end_no',
    },
  } as any));
  story.addBeat(createTestBeat({ id: 'end_yes', name: 'Yes', type: 'endScreen', parameters: { text: 'yes' } }));
  story.addBeat(createTestBeat({ id: 'end_no', name: 'No', type: 'endScreen', parameters: { text: 'no' } }));
  return story;
}

function endings(story: Story): string[] {
  return new ConstraintPathAnalyzer(story).analyze().outcomes
    .filter((o) => o.endType === 'ending')
    .map((o) => o.endingBeatId as string);
}

describe('ConstraintPathAnalyzer — Condition Check with several conditions', () => {
  it('AND of contradicting conditions never takes the true branch', () => {
    const found = endings(storyWith('all'));
    expect(found).toContain('end_no');
    expect(found).not.toContain('end_yes');
  });

  it('OR of the same conditions can take either branch', () => {
    const found = endings(storyWith('any'));
    expect(found).toContain('end_yes');
    expect(found).toContain('end_no');
  });
});
