/**
 * defaultTarget is its own link (2026-09-26): auto-advance after a delay on
 * timed beat types, or the exit when a beat has no links. The Inspector's
 * link picker used to copy its choice into it; such copies are inert.
 */
import { describe, it, expect } from 'vitest';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { defaultTargetIsLive } from '../../src/beats/Beat';

describe('defaultTarget', () => {
  it('drops the inert copy of the link (same beat, no delay) on load', () => {
    const b = new InfoTextBeat({ id: 'i', type: 'infoText', parameters: { text: 'x' }, connections: [{ targetId: 'next' }], defaultTarget: 'next' } as any);
    expect(b.defaultTarget).toBeUndefined();
  });

  it('keeps a real second link: another beat, or a delay', () => {
    const other = new InfoTextBeat({ id: 'i', type: 'infoText', parameters: { text: 'x' }, connections: [{ targetId: 'next' }], defaultTarget: 'elsewhere' } as any);
    expect(other.defaultTarget).toBe('elsewhere');
    const timed = new InfoTextBeat({ id: 'i', type: 'infoText', parameters: { text: 'x' }, connections: [{ targetId: 'next' }], defaultTarget: 'next', defaultTargetDelay: 10 } as any);
    expect(timed.defaultTarget).toBe('next');
  });

  it('is live on its timer (timed types with a delay) or as the only exit', () => {
    expect(defaultTargetIsLive({ type: 'infoText', defaultTarget: 'x', defaultTargetDelay: 5, connections: [{ targetId: 'y' }] })).toBe(true);
    expect(defaultTargetIsLive({ type: 'infoText', defaultTarget: 'x', connections: [{ targetId: 'y' }] })).toBe(false);
    expect(defaultTargetIsLive({ type: 'aiSummary', defaultTarget: 'x', defaultTargetDelay: 5, connections: [{ targetId: 'y' }] })).toBe(false);
    expect(defaultTargetIsLive({ type: 'aiSummary', defaultTarget: 'x', connections: [] })).toBe(true);
  });
});
