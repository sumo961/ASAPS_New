import { describe, it, expect } from 'vitest';
import { createSpeechGate } from '../../src/audio/speechActivity';

/** Feed a gate with stretches of loudness, 50 ms apart; collect what it says and when. */
function run(stretches: Array<[rms: number, ms: number]>, options = {}) {
  const gate = createSpeechGate(options);
  const said: Array<[string, number]> = [];
  let now = 0;
  for (const [rms, ms] of stretches) {
    for (let t = 0; t < ms; t += 50) {
      const event = gate.feed(rms, now);
      if (event) said.push([event, now]);
      now += 50;
    }
  }
  return said;
}

describe('when someone starts and stops speaking', () => {
  it('speech after a quiet moment, then a pause: start, and the end once the pause is long enough', () => {
    const said = run([[0.004, 1000], [0.12, 2000], [0.004, 2000]]);
    expect(said.map(([e]) => e)).toEqual(['speech-start', 'speech-end']);
    expect(said[0][1]).toBeGreaterThanOrEqual(1200); // 200 ms of it first
    expect(said[0][1]).toBeLessThan(1400);
    // 1.4 s after the last loud moment (at 2950 ms).
    expect(said[1][1]).toBeGreaterThanOrEqual(4350);
    expect(said[1][1]).toBeLessThan(4500);
  });

  it('a short pause inside a sentence does not end it', () => {
    const said = run([[0.004, 500], [0.1, 1500], [0.004, 900], [0.1, 1500], [0.004, 1800]]);
    expect(said.map(([e]) => e)).toEqual(['speech-start', 'speech-end']);
    expect(said[1][1]).toBeGreaterThan(5500);
  });

  it('a click or a cough is not speech', () => {
    const said = run([[0.004, 1000], [0.2, 100], [0.004, 3000]], { noSpeechMs: 60_000 });
    expect(said).toEqual([]);
  });

  it('nobody speaks: it gives up, once', () => {
    const said = run([[0.004, 25_000]]);
    expect(said.map(([e]) => e)).toEqual(['no-speech']);
    expect(said[0][1]).toBeGreaterThanOrEqual(20_000);
  });

  it('a noisy room is learnt: its hum is not speech, a voice over it is', () => {
    expect(run([[0.03, 6000]], { noSpeechMs: 60_000 })).toEqual([]);
    // Somebody already talking when it starts to listen is heard too, once a gap shows the room.
    expect(run([[0.15, 400], [0.004, 150], [0.15, 1500], [0.004, 2000]]).map(([e]) => e)).toEqual(['speech-start', 'speech-end']);
    const said = run([[0.03, 3000], [0.2, 1500], [0.03, 2000]], { noSpeechMs: 60_000 });
    expect(said.map(([e]) => e).slice(-2)).toEqual(['speech-start', 'speech-end']);
  });

  it('says nothing more after the end', () => {
    const said = run([[0.004, 500], [0.1, 1000], [0.004, 2000], [0.1, 1000], [0.004, 2000]]);
    expect(said.map(([e]) => e)).toEqual(['speech-start', 'speech-end']);
  });
});
