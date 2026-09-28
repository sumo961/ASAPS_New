import { describe, it, expect } from 'vitest';
import { unreachableReasonText } from '../ReachabilityReport';

describe('unreachableReasonText', () => {
  it('shows the analyzer\'s sentence, never its reason code', () => {
    expect(unreachableReasonText({ reason: 'orphaned', details: 'This beat has no incoming connections' }))
      .toBe('This beat has no incoming connections');
    for (const reason of ['orphaned', 'impossibleCondition', 'unreachableParent', 'unreachableConditionTarget', 'noIncoming'] as const) {
      const text = unreachableReasonText({ reason, details: '' });
      expect(text).not.toBe(reason);
      expect(text).toMatch(/ /);
    }
  });
});
