/**
 * HTML exports carry only the files a story uses, and large stories are
 * encoded in pieces (2026-10-28: a group's 333 MB project — four unused
 * copies of a 60 MB WAV, 130 unused pictures — crashed the single-file
 * export).
 */
import { describe, it, expect } from 'vitest';
import { assetsUsedByProject } from '../projectZipManager';
import { arrayBufferToBase64, SINGLE_FILE_LIMIT_BYTES, singleFileTooLargeMessage } from '../../export/HtmlExporter';

const asset = (id: string, filename: string, type = 'image', variants?: Array<{ assetId: string }>) => ({ id, filename, type, variants });

describe('assetsUsedByProject', () => {
  const project = JSON.stringify({ story: { beats: [{ node: 'asset_1_bg', parameters: { sound: 'asset_2_used' } }] }, globalSettings: { fonts: { textFont: 'Queen Serif' } } });

  it('keeps what the project names and leaves out the rest', () => {
    const kept = assetsUsedByProject(project, [
      asset('asset_1_bg', 'alley.png'),
      asset('asset_2_used', 'Evans Full_5.wav', 'audio'),
      asset('asset_3_copy', 'Evans Full.wav', 'audio'),
      asset('asset_4_old', 'trayshadow.png'),
    ]);
    expect(kept.map((a) => a.id)).toEqual(['asset_1_bg', 'asset_2_used']);
  });

  it('keeps every font and the variants of kept pictures, but not a copy sharing a used file\'s name', () => {
    const named = JSON.stringify({ story: { beats: [{ node: 'asset_1_bg' }] } });
    const kept = assetsUsedByProject(named, [
      asset('f1', 'Queen Serif.otf', 'font'),
      asset('asset_2_copy', 'alley.png'),
      asset('asset_1_bg', 'alley.png', 'image', [{ assetId: 'v1' }]),
      asset('v1', 'alley-portrait.png', 'image', [{ assetId: 'v2' }]),
      asset('v2', 'alley-phone.png'),
      asset('asset_9_unused', 'unused.png'),
    ]);
    expect(kept.map((a) => a.id)).toEqual(['f1', 'asset_1_bg', 'v1', 'v2']);
  });
});

describe('arrayBufferToBase64', () => {
  it('matches a plain encoding at any length, across piece boundaries', () => {
    for (const n of [0, 1, 2, 3, 8191, 8192, 8193, 3 * 65536 - 1, 3 * 65536, 3 * 65536 + 1, 3 * 65536 * 2 + 5]) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 255;
      expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

describe('single-file limit', () => {
  it('names the size and points to Folder export', () => {
    expect(SINGLE_FILE_LIMIT_BYTES).toBe(200 * 1024 * 1024);
    expect(singleFileTooLargeMessage(317 * 1024 * 1024)).toMatch(/317 MB.*Folder export/);
  });
});
