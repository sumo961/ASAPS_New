import { describe, it, expect } from 'vitest';
import { splitVoicedSegments } from '../../src/utils/voicedSegments';

describe('splitVoicedSegments', () => {
  it('splits narration from quoted speech, in order', () => {
    expect(splitVoicedSegments('Karin sits down without taking her coat off.\n\n"I don\'t see why we\'re here.\nThis feels blown out of proportion."')).toEqual([
      { text: 'Karin sits down without taking her coat off.', quoted: false },
      { text: "I don't see why we're here.\nThis feels blown out of proportion.", quoted: true },
    ]);
  });

  it('handles curly, German and French quotes, and interleaving', () => {
    expect(splitVoicedSegments('Her shoulders drop. “Okay.” She nods, once. “I just want to know.”')!.map((s) => s.quoted))
      .toEqual([false, true, false, true]);
    expect(splitVoicedSegments('Er sagt: „Nein.“')!.map((s) => s.text)).toEqual(['Er sagt:', 'Nein.']);
    expect(splitVoicedSegments('Il dit : « Non. »')!.map((s) => s.text)).toEqual(['Il dit :', 'Non.']);
  });

  it('returns null without quotes (read whole, as before); apostrophes are not quotes', () => {
    expect(splitVoicedSegments("Welcome to my shop! Don't touch anything.")).toBeNull();
    expect(splitVoicedSegments('')).toBeNull();
  });

  it('an unclosed quote runs to the end of the line', () => {
    expect(splitVoicedSegments('She stands. "You\'re not listening')).toEqual([
      { text: 'She stands.', quoted: false },
      { text: "You're not listening", quoted: true },
    ]);
  });
});
