import { describe, it, expect } from 'vitest';
import { onlyStampsDiffer } from '../projectMetaStamps';

describe('onlyStampsDiffer', () => {
  const base = { id: 'p', name: 'S', firstBeatId: 'b1', modifiedAt: '2026-10-20T10:00:00Z', savedWith: '0.9.125' };
  it('ignores modifiedAt and savedWith, and key order', () => {
    const a = JSON.stringify(base);
    const b = JSON.stringify({ savedWith: '0.9.126', modifiedAt: '2026-10-21T10:00:00Z', firstBeatId: 'b1', name: 'S', id: 'p' });
    expect(onlyStampsDiffer(a, b)).toBe(true);
  });
  it('sees any other change', () => {
    expect(onlyStampsDiffer(JSON.stringify(base), JSON.stringify({ ...base, firstBeatId: 'b2' }))).toBe(false);
  });
  it('treats unreadable text as a change', () => {
    expect(onlyStampsDiffer('<<<<<<< HEAD', JSON.stringify(base))).toBe(false);
  });
});
