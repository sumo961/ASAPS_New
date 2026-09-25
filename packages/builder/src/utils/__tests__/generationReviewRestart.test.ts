/**
 * An ending whose Restart leads nowhere is a finding (2026-09-26): the
 * author must say where replays begin — no silent "first beat" default.
 */
import { describe, it, expect } from 'vitest';
import { analyzeStoryFindings, proposeFixes, storyStartBeatId } from '../generationReview';

const title = { id: 'beat_0', type: 'titleScreen', name: 'Title', parameters: {}, connections: [{ targetId: 'mid' }] };
const mid = { id: 'mid', type: 'infoText', name: 'Mid', parameters: {}, connections: [{ targetId: 'sum' }, { targetId: 'end' }] };

describe('restart-without-target', () => {
  it('flags an AI summary without restartTarget and an end screen without a link', () => {
    const story = { beats: [title, mid,
      { id: 'sum', type: 'aiSummary', name: 'Debrief', parameters: { showRestart: true } },
      { id: 'end', type: 'endScreen', name: 'The End', parameters: {}, connections: [] }] };
    const kinds = analyzeStoryFindings(story).filter((f) => f.kind === 'restart-without-target').map((f) => f.beatId);
    expect(kinds).toEqual(['sum', 'end']);
  });

  it('an older AI summary that points Restart with a stored link is not flagged', () => {
    const story = { beats: [title, mid,
      { id: 'sum', type: 'aiSummary', name: 'Debrief', parameters: { showRestart: true }, connections: [{ targetId: 'beat_0' }] }] };
    expect(analyzeStoryFindings(story).some((f) => f.kind === 'restart-without-target')).toBe(false);
  });

  it('is satisfied by a target — or by switching Restart off (a deliberate final end)', () => {
    const story = { beats: [title, mid,
      { id: 'sum', type: 'aiSummary', name: 'Debrief', parameters: { showRestart: true, restartTarget: 'beat_0' } },
      { id: 'end', type: 'endScreen', name: 'The End', parameters: { showRestart: false }, connections: [] }] };
    expect(analyzeStoryFindings(story).some((f) => f.kind === 'restart-without-target')).toBe(false);
  });

  it('proposes the start beat for an AI summary: Project Settings first, then the title screen', () => {
    const sum = { id: 'sum', type: 'aiSummary', name: 'Debrief', parameters: { showRestart: true } };
    const plain = { beats: [title, mid, sum] };
    expect(storyStartBeatId(plain)).toBe('beat_0');
    const fixes = proposeFixes(analyzeStoryFindings(plain), plain).filter((p) => p.kind === 'set-restart-target');
    expect(fixes).toMatchObject([{ beatId: 'sum', path: 'restartTarget', value: 'beat_0' }]);
    const withSetting = { ...plain, globalSettings: { debug: { firstbeat: 'mid' } } };
    expect(storyStartBeatId(withSetting)).toBe('mid');
  });
});
