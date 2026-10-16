import { describe, it, expect } from 'vitest';
import { assetTypeForFile, withMimeFromName } from '../assetAccept';

describe('assetTypeForFile', () => {
  it('recognises fonts when the browser gives no MIME type (Windows)', () => {
    expect(assetTypeForFile({ name: 'Windows Regular.ttf', type: '' })).toBe('font');
    expect(assetTypeForFile({ name: 'Brand.WOFF2', type: 'application/octet-stream' })).toBe('font');
  });

  it('uses the MIME type when there is one, the extension otherwise', () => {
    expect(assetTypeForFile({ name: 'x.bin', type: 'image/png' })).toBe('image');
    expect(assetTypeForFile({ name: 'theme.mp3', type: '' })).toBe('audio');
    expect(assetTypeForFile({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
  });
});

describe('withMimeFromName', () => {
  it('fills in a missing MIME type from the extension', () => {
    const file = withMimeFromName(new File([new Uint8Array([0])], 'Windows Regular.ttf'));
    expect(file.type).toBe('font/ttf');
    expect(file.name).toBe('Windows Regular.ttf');
  });

  it('keeps a file that already has a type', () => {
    const original = new File([new Uint8Array([0])], 'a.png', { type: 'image/png' });
    expect(withMimeFromName(original)).toBe(original);
  });
});
