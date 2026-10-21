/**
 * Ambient cluster sounds: the cluster's sound button stores the asset id in
 * `sound.file` ({ file: 'asset_…', loop, volume }). Only `assetId` was
 * resolved, so ambient sounds chosen in the editor never played (user
 * report, 2026-10-21).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactRenderer } from '../../src/renderers/ReactRenderer';
import * as audio from '../../src/audio/AudioManager';

describe('playClusterSound', () => {
  const play = vi.fn(async () => {});
  beforeEach(() => {
    play.mockClear();
    vi.spyOn(audio, 'getAudioManager').mockReturnValue({ playClusterSound: play } as any);
  });

  function setup() {
    const renderer = new ReactRenderer({ container: document.createElement('div'), soundEnabled: true } as any);
    const blob = new Blob(['x']);
    const resolver = vi.fn(async (id: string) => (id === 'asset_1792406791034_0' ? blob : null));
    renderer.setSoundBlobResolver(resolver);
    return { renderer, blob, resolver };
  }

  it('resolves an asset id stored in file, as the cluster sound button saves it', async () => {
    const { renderer, blob, resolver } = setup();
    await renderer.playClusterSound('c1', { file: 'asset_1792406791034_0', loop: true, volume: 0.5 } as any);
    expect(resolver).toHaveBeenCalledWith('asset_1792406791034_0');
    expect(play).toHaveBeenCalledWith('c1', blob, 0.5);
  });

  it('still takes assetId, and a URL in file', async () => {
    const { renderer, blob } = setup();
    await renderer.playClusterSound('c1', { assetId: 'asset_1792406791034_0', volume: 0.3 } as any);
    expect(play).toHaveBeenLastCalledWith('c1', blob, 0.3);
    await renderer.playClusterSound('c2', { file: 'https://example.test/rain.mp3' } as any);
    expect(play).toHaveBeenLastCalledWith('c2', 'https://example.test/rain.mp3', 0.5);
  });
});
