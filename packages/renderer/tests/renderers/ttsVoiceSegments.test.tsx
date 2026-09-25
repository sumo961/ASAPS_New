/**
 * Lines read aloud: a line with quotation marks and a speaker carries voice
 * segments (narration → Narrator, quoted speech → the speaker). Lines without
 * quotes, or without a speaker, are read whole as before.
 */
import { describe, it, expect, vi } from 'vitest';
import { ReactRenderer } from '../../src/renderers/ReactRenderer';

function setup() {
  const renderer = new ReactRenderer({ container: document.createElement('div') });
  const cb = vi.fn();
  renderer.setTTSSpeakCallback(cb);
  return { speak: (t: string, s?: string) => (renderer as any).speakAloud(t, s), cb };
}

describe('TTS voice segments', () => {
  it('splits a prose line between the Narrator and the speaker', () => {
    const { speak, cb } = setup();
    speak('Karin sits down. "I don\'t see why we\'re here."', 'Karin');
    expect(cb.mock.calls[0][3]).toEqual([
      { text: 'Karin sits down.', speaker: 'Narrator' },
      { text: "I don't see why we're here.", speaker: 'Karin' },
    ]);
  });

  it('leaves unquoted lines and narrator lines whole', () => {
    const { speak, cb } = setup();
    speak('Welcome to my shop!', 'Merchant');
    speak('He says "hi".', 'Narrator');
    speak('He says "hi".');
    expect(cb.mock.calls.map((c) => c[3])).toEqual([undefined, undefined, undefined]);
  });
});
