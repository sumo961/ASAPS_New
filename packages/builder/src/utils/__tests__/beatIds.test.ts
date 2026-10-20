import { describe, it, expect } from 'vitest';
import { newBeatId } from '../beatIds';

describe('newBeatId', () => {
  it('makes beat_ plus eight lowercase letters or digits, never twice in a large batch', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newBeatId()));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id).toMatch(/^beat_[0-9a-z]{8}$/);
  });
});
