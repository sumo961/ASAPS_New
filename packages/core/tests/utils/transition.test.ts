/**
 * Transitions kept by stories brought in from ASML 1.0 ("Fade", seconds)
 * play as ASML 2.0 ones (the Red story's 76 fades never played).
 */
import { describe, it, expect } from 'vitest';
import { normalizeTransition } from '../../src/utils/transition';
import { createTestBeat } from '../test-utils';

describe('normalizeTransition', () => {
  it('reads ASML 1.0 types and seconds', () => {
    expect(normalizeTransition({ type: 'Fade', duration: 0.5, direction: 'IN', easing: 'ease-in-out' }))
      .toEqual({ type: 'fade', duration: 500, direction: 'in', easing: 'ease-in-out' });
    expect(normalizeTransition({ type: 'Wipe', duration: 1 })).toMatchObject({ type: 'slide', duration: 1000 });
    expect(normalizeTransition({ type: 'Rotate', duration: '1.0' })).toMatchObject({ type: 'zoom', duration: 1000 });
    expect(normalizeTransition({ type: 'Blinds', duration: 0.5 })).toMatchObject({ type: 'fade', duration: 500 });
    expect(normalizeTransition({ type: 'None', duration: 500 })).toMatchObject({ type: 'none', duration: 500 });
  });

  it('leaves ASML 2.0 transitions as they are', () => {
    const t = { type: 'slide', duration: 800, direction: 'left', easing: 'linear' };
    expect(normalizeTransition(t)).toEqual(t);
    expect(normalizeTransition(undefined)).toBeUndefined();
  });

  it('a loaded beat carries the ASML 2.0 form, so the next save keeps it', () => {
    const beat = createTestBeat({ id: 'b', type: 'infoText', parameters: { text: 'x' }, transition: { type: 'Fade', duration: 0.5, direction: 'IN' } as any });
    expect(beat.transition).toMatchObject({ type: 'fade', duration: 500 });
    expect((beat.toJSON() as any).transition).toMatchObject({ type: 'fade', duration: 500 });
  });
});
