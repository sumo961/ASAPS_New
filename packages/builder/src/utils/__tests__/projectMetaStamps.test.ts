import { describe, it, expect } from 'vitest';
import { onlyStampsDiffer, keepNewestSavedWith } from '../projectMetaStamps';

describe('onlyStampsDiffer', () => {
  const base = { id: 'p', name: 'S', firstBeatId: 'b1', modifiedAt: '2026-10-20T10:00:00Z', savedWith: '0.9.125' };
  it('ignores modifiedAt and key order', () => {
    const a = JSON.stringify(base);
    const b = JSON.stringify({ savedWith: '0.9.125', modifiedAt: '2026-10-21T10:00:00Z', firstBeatId: 'b1', name: 'S', id: 'p' });
    expect(onlyStampsDiffer(a, b)).toBe(true);
  });

  it('writes once when a newer ASAPS saves, never for an older one', () => {
    const a = JSON.stringify(base);
    expect(onlyStampsDiffer(a, JSON.stringify({ ...base, savedWith: '0.9.126' }))).toBe(false);
    expect(onlyStampsDiffer(a, JSON.stringify({ ...base, savedWith: '0.9.124' }))).toBe(true);
    expect(onlyStampsDiffer(a, JSON.stringify({ ...base, savedWith: '0.9.126' }), { ignoreVersionBump: true })).toBe(true);
  });

  it('keeps the higher savedWith when an older ASAPS writes a real change', () => {
    const newer = JSON.stringify({ ...base, savedWith: '0.9.140' });
    const older = JSON.stringify({ ...base, name: 'Renamed', savedWith: '0.9.132' });
    expect(JSON.parse(keepNewestSavedWith(newer, older))).toMatchObject({ name: 'Renamed', savedWith: '0.9.140' });
    expect(keepNewestSavedWith(older, newer)).toBe(newer);
  });
  it('sees any other change', () => {
    expect(onlyStampsDiffer(JSON.stringify(base), JSON.stringify({ ...base, firstBeatId: 'b2' }))).toBe(false);
  });
  it('treats unreadable text as a change', () => {
    expect(onlyStampsDiffer('<<<<<<< HEAD', JSON.stringify(base))).toBe(false);
  });
});
