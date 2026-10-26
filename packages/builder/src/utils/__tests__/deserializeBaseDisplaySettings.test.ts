/**
 * A beat's own display settings (background fit, text-box border) live on
 * the Beat base class. Stored top-level or in parameters, they must survive
 * loading — the loader used to pass neither, so a reopened project lost them.
 */
import { describe, it, expect } from 'vitest';
import { deserializeBeats } from '../projectDeserializer';

describe('loading keeps a beat\'s display settings', () => {
  it('from the top level', () => {
    const [b] = deserializeBeats([{ id: 'b1', name: 'B', type: 'infoText', x: 0, y: 0, spatialFit: 'cover', textBoxBorder: 'hide', parameters: { text: 'hi' } }]) as any[];
    expect(b.spatialFit).toBe('cover');
    expect(b.textBoxBorder).toBe('hide');
  });
  it('from the parameters (as toJSON stores them)', () => {
    const [b] = deserializeBeats([{ id: 'b1', name: 'B', type: 'infoText', x: 0, y: 0, parameters: { text: 'hi', spatialFit: 'contain', textBoxBorder: 'show' } }]) as any[];
    expect(b.spatialFit).toBe('contain');
    expect(b.textBoxBorder).toBe('show');
  });
});
