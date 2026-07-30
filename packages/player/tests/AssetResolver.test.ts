/**
 * AssetResolver manifest coverage.
 *
 * Field failure 2026-07-29: an exported AR beat silently fell back to
 * screen-space anchors ("No marker asset configured") because the .mind
 * tracker lives in the zip's `other/` folder, which buildAssetManifest did
 * not scan — and `.mind` has no media extension to rescue it via
 * isMediaFile(). `videos/` was likewise missing from the folder list and
 * only survived because video extensions pass the media check. These pin
 * every folder projectZipManager writes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { AssetResolver } from '../src/AssetResolver';

describe('AssetResolver.buildAssetManifest folder coverage', () => {
  let resolver: AssetResolver;

  beforeAll(async () => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({ project: { story: { beats: [] } } }));
    // One file per projectZipManager folder, extensions chosen so the
    // non-media ones can ONLY enter the manifest via the folder scan.
    zip.file('backgrounds/asset_1_bg.png', 'x');
    zip.file('sounds/asset_2_s.mp3', 'x');
    zip.file('videos/asset_3_v.mp4', 'x');
    zip.file('fonts/asset_4_f.ttf', 'x');
    zip.file('other/asset_5_marker.mind', 'x'); // no media extension — folder scan or nothing
    zip.file('other/asset_5.json', JSON.stringify({ id: 'asset_5', type: 'other' }));

    resolver = new AssetResolver();
    await resolver.loadFromZip(await zip.generateAsync({ type: 'arraybuffer' }));
  });

  it('includes every asset folder — other/ (.mind trackers) especially', () => {
    const paths = resolver.getManifest().map(a => a.path);
    expect(paths).toContain('backgrounds/asset_1_bg.png');
    expect(paths).toContain('sounds/asset_2_s.mp3');
    expect(paths).toContain('videos/asset_3_v.mp4');
    expect(paths).toContain('fonts/asset_4_f.ttf');
    expect(paths).toContain('other/asset_5_marker.mind');
    expect(paths).toContain('other/asset_5.json'); // metadata drives asset-id mapping
  });
});
