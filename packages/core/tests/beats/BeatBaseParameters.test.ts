/**
 * Settings every beat has (BEAT_BASE_PARAMETERS) reach a beat that was
 * created empty and filled from a generated story's parameters.
 */
import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';

const fresh = (type: string) => BeatTypeRegistry.getInstance().createBeat(type, { id: 'b', name: 'B', type } as any);

describe('Beat.adoptBaseParameters', () => {
  it('takes the clock display and other base settings an end screen ignores', () => {
    const beat = fresh('endScreen') as any;
    const params = { title: 'The End', timeDisplayMode: 'none', spatialFit: 'cover', requiresMode: 'any' };
    beat.updateParameters(params);
    expect(beat.timeDisplayMode).toBeUndefined();
    beat.adoptBaseParameters(params);
    expect(beat.timeDisplayMode).toBe('none');
    expect(beat.spatialFit).toBe('cover');
    expect(beat.requiresMode).toBe('any');
    expect(beat.toJSON().timeDisplayMode).toBe('none');
  });

  it('keeps values the beat already has and skips invalid ones', () => {
    const beat = fresh('infoText') as any;
    beat.timeDisplayMode = 'manual';
    beat.adoptBaseParameters({ timeDisplayMode: 'none', spatialFit: 'stretch', requiresMode: 'sometimes' });
    expect(beat.timeDisplayMode).toBe('manual');
    expect(beat.spatialFit).toBeUndefined();
    expect(beat.requiresMode).toBe('all');
  });
});
