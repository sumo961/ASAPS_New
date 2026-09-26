/**
 * Path simulation understands feelings (2026-09-26): feeling effects run
 * through the runtime (StoryContext) and feelings conditions are evaluated
 * by it — gates on sentiment / mood were always "false" before, so every
 * branch behind them read as unreachable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const nathan = { id: 'char_nathan', name: 'nathan', displayName: 'Nathan', role: 'npc',
  initialSentiments: [{ toEntityRef: 'player', emotion: 'trust', strength: 0.1 }] };

function build(extraCharacter?: any) {
  const story = new Story({ title: 'Feelings', author: 'T', firstBeatId: 'talk' });
  story.setCharacters([extraCharacter ?? nathan] as any);
  story.addBeat(createTestBeat({ id: 'talk', name: 'Talk', type: 'multiChoice', parameters: { question: 'q', choices: [
    { id: 'warm', text: 'Warm', target: 'gate', effects: [{ type: 'addSentiment', target: 'char_nathan', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.5 }] },
    { id: 'cold', text: 'Cold', target: 'gate', effects: [] },
  ] } } as any));
  story.addBeat(createTestBeat({ id: 'gate', name: 'Gate', type: 'conditionBeat', parameters: {
    condition: { type: 'sentiment', character: 'char_nathan', sentimentTarget: 'player', sentimentEmotion: 'trust', operator: '>=', value: 0.3, baseline: 'initial' },
    trueTarget: 'open', falseTarget: 'closed' } } as any));
  story.addBeat(createTestBeat({ id: 'open', name: 'Open', type: 'endScreen', parameters: { message: 'o', showRestart: false } }));
  story.addBeat(createTestBeat({ id: 'closed', name: 'Closed', type: 'endScreen', parameters: { message: 'c', showRestart: false } }));
  return story;
}

const endings = (story: Story) => new Set(new StateSimulationAnalyzer(story).analyzeRaw().map((p) => p.outcome.beatId));

describe('path simulation and feelings', () => {
  it('a feelings gate opens only on the path whose choice raised the feeling', () => {
    expect([...endings(build())].sort()).toEqual(['closed', 'open']);
    const paths = new StateSimulationAnalyzer(build()).analyzeRaw();
    for (const p of paths) {
      const warm = p.decisions.some((d) => d.choiceMade === 'Warm');
      expect([warm, p.outcome.beatId]).toEqual([warm, warm ? 'open' : 'closed']);
    }
  });

  it('a random-variant character is explored once per variant', () => {
    const withVariants = { ...nathan, variantSelectionPolicy: 'random', variants: [
      { id: 'guarded', name: 'Guarded' },
      { id: 'open', name: 'Open', initialSentiments: [{ toEntityRef: 'player', emotion: 'trust', strength: 0.1 }] },
    ] };
    const analyzer = new StateSimulationAnalyzer(build(withVariants));
    const starts = new Set(analyzer.analyzeRaw().map((p) => JSON.stringify((p.steps[0].stateAfter.runtime as any)?.activeCharacterVariants)));
    expect(starts.size).toBe(2);
  });

  it('exposes the feelings at a point for presets', () => {
    const analyzer = new StateSimulationAnalyzer(build());
    const p = analyzer.analyzeRaw().find((x) => x.decisions.some((d) => d.choiceMade === 'Warm'))!;
    const atGate = p.steps.find((s) => s.beatId === 'gate')!.stateAfter;
    const affect: any = analyzer.affectAt(atGate);
    const trust = affect.characterSentiments.char_nathan.find((s: any) => s.emotion === 'trust').strength;
    expect(trust).toBeCloseTo(0.6);
  });
});
