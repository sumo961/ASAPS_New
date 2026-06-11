import { describe, it, expect } from 'vitest';
import { detectStoryWarnings } from '../../src/analysis/StoryWarnings';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';
import hollowStarFixture from '../fixtures/hollowstar.json';

function loadFixtureStory(fixture: any): Story {
  const src = fixture.story ?? fixture;
  const story = new Story({
    title: src.metadata?.title || 'fixture',
    author: src.metadata?.author || 'fixture',
    firstBeatId: src.beats?.[0]?.id || 'beat_0',
  });
  for (const b of src.beats || []) {
    const parameters = { ...(b.parameters || {}) };
    if (b.type === 'conditionBeat') {
      if (parameters.trueConnection?.target) parameters.trueTarget = parameters.trueConnection.target;
      if (parameters.falseConnection?.target) parameters.falseTarget = parameters.falseConnection.target;
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

describe('StoryWarnings', () => {
  it('detects the Hollow Star keypad soft-lock', { timeout: 180_000 }, () => {
    const story = loadFixtureStory(hollowStarFixture);
    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const warnings = detectStoryWarnings({ paths, story });

    // The crypt keypad's failTarget loops: Wrong Code → Increase Dread → keypad.
    // Dread accumulates but doesn't help the player escape the keypad itself
    // (the only way out is entering correctCode), and the story has no upstream
    // gate forcing the player to have the code. This should be flagged.
    const keypadWarning = warnings.find(w =>
      (w.code === 'keypad-softlock-loop' || w.code === 'keypad-softlock-unlimited') &&
      w.beatName.includes('False Stone')
    );
    expect(keypadWarning).toBeDefined();
    expect(keypadWarning?.severity).toBe('error');
  });

  it('detects an obvious keypad with no recovery', () => {
    const story = new Story({ title: 'stuck', author: 't', firstBeatId: 'title' });
    story.addBeat(createTestBeat({ id: 'title', name: 'Title', type: 'titleScreen', parameters: { title: 'x' }, connections: [{ targetId: 'kp' }] }));
    story.addBeat(createTestBeat({
      id: 'kp', name: 'Keypad', type: 'keypad',
      parameters: { prompt: 'Code?', correctCode: '1234', maxAttempts: 3, failTarget: 'wrong' },
    }));
    // Fail target only leads to noise and back to the keypad, mutating nothing that any condition reads.
    story.addBeat(createTestBeat({
      id: 'wrong', name: 'Wrong', type: 'infoText',
      parameters: { text: 'Wrong!' },
      connections: [{ targetId: 'kp' }],
    }));

    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const warnings = detectStoryWarnings({ paths, story });
    expect(warnings.some(w => w.code === 'keypad-softlock-loop')).toBe(true);
  });

  it('flags an ungated keypad as a warning', () => {
    const story = new Story({ title: 'ungated', author: 't', firstBeatId: 'title' });
    story.addBeat(createTestBeat({ id: 'title', name: 'Title', type: 'titleScreen', parameters: { title: 'x' }, connections: [{ targetId: 'kp' }] }));
    story.addBeat(createTestBeat({
      id: 'kp', name: 'Keypad', type: 'keypad',
      parameters: { prompt: 'Code?', correctCode: '42', maxAttempts: 1 },
      connections: [{ targetId: 'end' }],
    }));
    story.addBeat(createTestBeat({ id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'done' } }));

    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const warnings = detectStoryWarnings({ paths, story });
    expect(warnings.some(w => w.code === 'keypad-ungated')).toBe(true);
  });

  it('detects unfulfillable requires', () => {
    const story = new Story({ title: 'req', author: 't', firstBeatId: 'title' });
    story.addBeat(createTestBeat({ id: 'title', name: 'Title', type: 'titleScreen', parameters: { title: 'x' }, connections: [{ targetId: 'gated' }] }));
    story.addBeat(createTestBeat({
      id: 'gated', name: 'Gated', type: 'infoText',
      parameters: {
        text: 'hello',
        requires: [{
          condition: { type: 'variable', operator: '==', variableName: 'knowsCode', value: true },
          explanation: 'Player must have learned the code.',
        }],
      },
      connections: [{ targetId: 'end' }],
    }));
    story.addBeat(createTestBeat({ id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'done' } }));

    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const warnings = detectStoryWarnings({ paths, story });
    const w = warnings.find(w => w.code === 'requires-unfulfillable');
    expect(w).toBeDefined();
    expect(w?.detail?.requirement?.condition?.variableName).toBe('knowsCode');
  });

  it('is satisfied when a prior beat provides the required state', () => {
    const story = new Story({ title: 'req-ok', author: 't', firstBeatId: 'title' });
    story.addBeat(createTestBeat({ id: 'title', name: 'Title', type: 'titleScreen', parameters: { title: 'x' }, connections: [{ targetId: 'set' }] }));
    story.addBeat(createTestBeat({
      id: 'set', name: 'Learn Code', type: 'setVariable',
      parameters: { type: 'variable', name: 'knowsCode', value: true, operation: 'set' },
      connections: [{ targetId: 'gated' }],
    }));
    story.addBeat(createTestBeat({
      id: 'gated', name: 'Gated', type: 'infoText',
      parameters: {
        text: 'hello',
        requires: [{
          condition: { type: 'variable', operator: '==', variableName: 'knowsCode', value: true },
          explanation: 'Player must have learned the code.',
        }],
      },
      connections: [{ targetId: 'end' }],
    }));
    story.addBeat(createTestBeat({ id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'done' } }));

    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const warnings = detectStoryWarnings({ paths, story });
    expect(warnings.some(w => w.code === 'requires-unfulfillable')).toBe(false);
  });
});
