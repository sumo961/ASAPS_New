/**
 * Path analysis follows cast roles (D8): castings made by Choose Your
 * Character or castRole effects reach roleHolder gates, random roles start
 * once per candidate, and reachability knows only candidates can play.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { ReachabilityAnalyzer } from '../../src/analysis/ReachabilityAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const chars = [
  { id: 'char_mara', name: 'mara', displayName: 'Mara', role: 'player' },
  { id: 'char_jonas', name: 'jonas', displayName: 'Jonas', role: 'player' },
];

function build(selection: 'cast' | 'random', withPick: boolean) {
  const story = new Story({ title: 'Roles', author: 'T', firstBeatId: withPick ? 'pick' : 'gate' });
  story.setCharacters(chars as any);
  story.setSettings({ roles: [{ id: 'player', candidates: ['char_mara', 'char_jonas'], selection }] });
  if (withPick) {
    story.addBeat(createTestBeat({ id: 'pick', name: 'Pick', type: 'chooseCharacter', parameters: { role: 'player', question: 'q', choices: [
      { id: 'm', character: 'char_mara', text: 'Mara', target: 'gate' },
      { id: 'j', character: 'char_jonas', text: 'Jonas', target: 'gate' },
    ] } } as any));
  }
  story.addBeat(createTestBeat({ id: 'gate', name: 'Gate', type: 'conditionBeat', parameters: {
    condition: { type: 'roleHolder', role: 'player', character: 'char_jonas', operator: '==' },
    trueTarget: 'jonas_end', falseTarget: 'mara_end' } } as any));
  story.addBeat(createTestBeat({ id: 'jonas_end', name: 'J', type: 'endScreen', parameters: { message: 'j', showRestart: false } }));
  story.addBeat(createTestBeat({ id: 'mara_end', name: 'M', type: 'endScreen', parameters: { message: 'm', showRestart: false } }));
  return story;
}

const endings = (story: Story) => new Set(new StateSimulationAnalyzer(story).analyzeRaw().map((p) => p.outcome.beatId));

describe('path analysis and roles', () => {
  it('a Choose Your Character pick reaches the matching roleHolder branch', () => {
    const story = build('cast', true);
    expect([...endings(story)].sort()).toEqual(['jonas_end', 'mara_end']);
    for (const p of new StateSimulationAnalyzer(story).analyzeRaw()) {
      const jonas = p.decisions.some((d) => d.choiceMade === 'Jonas');
      expect(p.outcome.beatId).toBe(jonas ? 'jonas_end' : 'mara_end');
    }
  });

  it('Choose Your Character options without their own link, or none authored, still cast (2026-10-31)', () => {
    for (const choices of [
      [{ id: 'm', character: 'char_mara', text: 'Mara', target: 'gate' }, { id: 'j', character: 'char_jonas', text: 'Jonas' }],
      [],
    ]) {
      const story = new Story({ title: 'Roles', author: 'T', firstBeatId: 'pick' });
      story.setCharacters(chars as any);
      story.setSettings({ roles: [{ id: 'player', candidates: ['char_mara', 'char_jonas'], selection: 'cast' }] });
      story.addBeat(createTestBeat({ id: 'pick', name: 'Pick', type: 'chooseCharacter', parameters: { role: 'player', question: 'q', choices },
        connections: [{ targetId: 'gate' }] } as any));
      for (const b of build('cast', false).getAllBeats()) story.addBeat(b);
      expect([...endings(story)].sort()).toEqual(['jonas_end', 'mara_end']);
    }
  });

  it('a random role is explored once per candidate', () => {
    expect([...endings(build('random', false))].sort()).toEqual(['jonas_end', 'mara_end']);
  });

  it('without a pick, an uncast role only reads as its default', () => {
    expect([...endings(build('cast', false))]).toEqual(['mara_end']);
  });

  it('reachability: only a candidate can ever play the role', () => {
    const analyzer = new ReachabilityAnalyzer(build('cast', true));
    expect(analyzer.analyzeCondition({ type: 'roleHolder', role: 'player', character: 'char_jonas', operator: '==' } as any).isSatisfiable).toBe(true);
    expect(analyzer.analyzeCondition({ type: 'roleHolder', role: 'player', character: 'char_ghost', operator: '==' } as any).isSatisfiable).toBe(false);
    expect(analyzer.analyzeCondition({ type: 'roleHolder', role: 'nobody', character: 'char_jonas', operator: '==' } as any).isSatisfiable).toBe(false);
  });
});
