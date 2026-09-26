import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { ReachabilityAnalyzer } from '../../src/analysis/ReachabilityAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

/** A returning-player branch: the "welcome back" beat needs playthrough >= 2. */
function story(extraSettings: any = {}) {
  const s = new Story({ title: 'Replay', author: 'T', firstBeatId: 'start' });
  s.setSettings({ variables: [{ name: 'hasKey', type: 'boolean', defaultValue: true }], ...extraSettings });
  s.addBeat(createTestBeat({ id: 'start', name: 'Start', type: 'conditionBeat', parameters: {
    condition: { type: 'variable', variable: 'playthrough', operator: '>=', value: 2 },
    trueConnection: { target: 'welcome_back', label: 'returning' },
    falseConnection: { target: 'gate', label: 'first run' },
  } }));
  s.addBeat(createTestBeat({ id: 'gate', name: 'Gate', type: 'conditionBeat', parameters: {
    condition: { type: 'variable', variable: 'hasKey', operator: '==', value: true },
    trueConnection: { target: 'door', label: 'has key' },
    falseConnection: { target: 'welcome_back', label: 'no key' },
  } }));
  s.addBeat(createTestBeat({ id: 'welcome_back', name: 'Welcome back', type: 'endScreen', parameters: { message: 'Again!' } }));
  s.addBeat(createTestBeat({ id: 'door', name: 'Door', type: 'endScreen', parameters: { message: 'In.' } }));
  return s;
}

describe('analyzers know the built-in playthrough and variable defaults', () => {
  it('the simulation explores a replay when the story tests playthrough', () => {
    const paths = new StateSimulationAnalyzer(story()).analyzeRaw();
    const reached = new Set(paths.flatMap((p: any) => p.steps.map((s: any) => s.beatId)));
    expect(reached.has('welcome_back')).toBe(true);
    expect(reached.has('door')).toBe(true); // default hasKey = true, no beat sets it
  });

  it('reachability does not call playthrough or a defaulted variable "never set"', () => {
    const analyzer = new ReachabilityAnalyzer(story()) as any;
    analyzer.analyzeStateModifications();
    // analyzeCondition reads the name from `left` / the value from `right`.
    expect(analyzer.analyzeCondition({ type: 'variable', left: 'playthrough', operator: '>=', right: 2 }).isSatisfiable).toBe(true);
    expect(analyzer.analyzeCondition({ type: 'variable', left: 'hasKey', operator: '==', right: true }).isSatisfiable).toBe(true);
    // Control: a variable nothing sets and nothing declares is still flagged.
    expect(analyzer.analyzeCondition({ type: 'variable', left: 'nobodySetsThis', operator: '==', right: true }).isSatisfiable).toBe(false);
  });
});
