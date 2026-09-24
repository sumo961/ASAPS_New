import { describe, it, expect } from 'vitest';
import { resolveExportSpeech } from '../exportSpeech';

describe('resolveExportSpeech — export read-aloud is a project setting', () => {
  it('the project value wins over any device toggle', () => {
    expect(resolveExportSpeech({ tts: { exportSpeech: false } }, () => 'true')).toBe(false);
    expect(resolveExportSpeech({ tts: { exportSpeech: true } }, () => 'false')).toBe(true);
  });
  it('unset project → seeded from the old device toggle (default on)', () => {
    expect(resolveExportSpeech({}, () => null)).toBe(true);
    expect(resolveExportSpeech({ tts: {} }, () => 'false')).toBe(false);
    expect(resolveExportSpeech(null, () => 'true')).toBe(true);
  });
});
