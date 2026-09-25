/**
 * Links a beat derives from a parameter (2026-09-25): shown and analysed,
 * never stored; restart links are marked so they are drawn as restarts and
 * state is not assumed to travel along them.
 */
import { describe, it, expect } from 'vitest';
import { AISummaryBeat } from '../../src/beats/AISummaryBeat';
import { EndScreenBeat } from '../../src/beats/EndScreenBeat';
import { KeypadBeat } from '../../src/beats/KeypadBeat';

describe('AI summary restart link', () => {
  it('restartTarget appears as a derived restart link; stored exits are untouched', () => {
    const beat = new AISummaryBeat({ id: 's', type: 'aiSummary', parameters: { showRestart: true, restartTarget: 'beat_4' }, connections: [] } as any);
    expect(beat.getConnections()).toEqual([{ targetId: 'beat_4', label: 'Restart', derivedFrom: 'restartTarget', role: 'restart' }]);
    expect(beat.connections).toEqual([]); // the runtime's "go on" exits
  });

  it('older stories: a stored link is adopted as the restart target, and not drawn twice', () => {
    // Ember-style: Restart pointed with a stored link only.
    const ember = new AISummaryBeat({ id: 's', type: 'aiSummary', parameters: { showRestart: true }, connections: [{ targetId: 'beat_0', label: 'To Title Screen' }] } as any);
    expect(ember.getParameters().restartTarget).toBe('beat_0');
    expect(ember.getConnections()).toEqual([{ targetId: 'beat_0', label: 'Restart', role: 'restart' }]);
    // Environmental-Choices-style: both set to the same beat.
    const both = new AISummaryBeat({ id: 's', type: 'aiSummary', parameters: { showRestart: true, restartTarget: 'title' }, connections: [{ targetId: 'title' }] } as any);
    expect(both.getConnections()).toEqual([{ targetId: 'title', label: 'Restart', role: 'restart' }]);
  });

  it('no link without a restart button or an explicit target', () => {
    expect(new AISummaryBeat({ id: 's', type: 'aiSummary', parameters: { showRestart: false, restartTarget: 'beat_4' } } as any).getConnections()).toEqual([]);
    expect(new AISummaryBeat({ id: 's', type: 'aiSummary', parameters: { showRestart: true } } as any).getConnections()).toEqual([]);
  });
});

describe('end screen restart link', () => {
  it('its exit is marked as a restart — unless the restart button is off', () => {
    const on = new EndScreenBeat({ id: 'e', type: 'endScreen', parameters: { showRestart: true }, connections: [{ targetId: 'beat_0' }] } as any);
    expect(on.getConnections()[0]).toMatchObject({ targetId: 'beat_0', role: 'restart' });
    const off = new EndScreenBeat({ id: 'e', type: 'endScreen', parameters: { showRestart: false }, connections: [{ targetId: 'beat_0' }] } as any);
    expect(off.getConnections()[0].role).toBeUndefined();
  });
});

describe('keypad wrong-code link', () => {
  it('is derived and labelled; a stored copy from an older save is not shown twice', () => {
    const beat = new KeypadBeat({ id: 'k', type: 'keypad', parameters: { code: '1234', failTarget: 'nope' },
      connections: [{ targetId: 'yes' }, { targetId: 'nope', label: 'fail' }] } as any);
    expect(beat.getConnections()).toEqual([
      { targetId: 'yes' },
      { targetId: 'nope', label: 'Wrong code', derivedFrom: 'failTarget' },
    ]);
  });
});
