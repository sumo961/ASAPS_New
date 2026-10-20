/**
 * New beat ids. They used to count up per copy of a project (beat_1,
 * beat_2, …), so people working in parallel on copies of one story each
 * created their own beat_45 — and git could not tell them apart (Birka
 * groups, 2026-10-20). A random part makes an id unique without any
 * coordination. Existing ids are never changed.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newBeatId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let suffix = '';
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `beat_${suffix}`;
}
