import { describe, it, expect } from 'vitest';
import { supportsVisualEditor, supportsBackgroundImage } from '../visualBeatTypes';
import { acceptFor, ACCEPT } from '../assetAccept';

describe('visual beat types (one list for the VE tab and the Background Image field)', () => {
  it('stage beats support the VE and a background image', () => {
    for (const t of ['infoText', 'multiChoice', 'dialogTree', 'inputText', 'titleScreen']) {
      expect(supportsVisualEditor(t)).toBe(true);
      expect(supportsBackgroundImage(t)).toBe(true);
    }
  });
  it('beats whose stage is a panorama / map / video / page / camera get no background field', () => {
    for (const t of ['panorama', 'gpsLocation', 'indoorLocation', 'videoBeat', 'webView', 'qrScan', 'arBeat']) {
      expect(supportsVisualEditor(t)).toBe(true);
      expect(supportsBackgroundImage(t)).toBe(false);
    }
  });
  it('logic beats support neither', () => {
    for (const t of ['setVariable', 'conditionBeat', 'randomTarget', undefined, null]) {
      expect(supportsVisualEditor(t as any)).toBe(false);
      expect(supportsBackgroundImage(t as any)).toBe(false);
    }
  });
});

describe('one accept rule per asset kind', () => {
  it('backgrounds take any image; characters and props need PNG', () => {
    expect(acceptFor('image', 'background')).toBe(ACCEPT.background);
    expect(acceptFor('image', 'character')).toBe('.png');
    expect(acceptFor('image', 'prop')).toBe('.png');
    expect(acceptFor('audio')).toBe('audio/*');
    expect(acceptFor('font')).toBe(ACCEPT.font);
    expect(acceptFor()).toBe('image/*');
  });
});
