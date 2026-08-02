/**
 * playSound Effect (roadmap Tier-1 item 5 — the location-triggered-sound
 * gap). Core stays audio-free: applyEffect emits a 'playSound' signal and
 * the hosts (PreviewWindow / PlayerEngine) bridge it to the renderer's
 * audio pipeline. These pin the signal contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

describe('applyEffect — playSound', () => {
  let ctx: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    ctx = new StoryContext();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('emits the playSound signal with the sound ref', () => {
    const heard: any[] = [];
    ctx.on('playSound', (p) => heard.push(p));
    ctx.applyEffect({ type: 'playSound', target: 'asset_123_chime' });
    expect(heard).toEqual([{ sound: 'asset_123_chime', volume: undefined }]);
  });

  it('carries a numeric volume and ignores non-numeric values', () => {
    const heard: any[] = [];
    ctx.on('playSound', (p) => heard.push(p));
    ctx.applyEffect({ type: 'playSound', target: 'ding', value: 0.4 });
    ctx.applyEffect({ type: 'playSound', target: 'ding', value: 'loud' });
    expect(heard).toEqual([
      { sound: 'ding', volume: 0.4 },
      { sound: 'ding', volume: undefined },
    ]);
  });

  it('does not mutate story state', () => {
    const before = JSON.stringify(ctx.serialize?.() ?? ctx.getAllVariables?.() ?? {});
    ctx.applyEffect({ type: 'playSound', target: 'chime' });
    const after = JSON.stringify(ctx.serialize?.() ?? ctx.getAllVariables?.() ?? {});
    expect(after).toBe(before);
  });
});
