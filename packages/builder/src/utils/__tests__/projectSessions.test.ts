import { describe, it, expect } from 'vitest';
import { mergeSessions, upsertSession, sessionsNewerThan } from '../projectSessions';

const s = (id: string, t: number, tag = '') => ({ id, lastUpdatedAt: t, tag });
describe('projectSessions', () => {
  it('merges by id, newer copy wins, newest first', () => {
    const m = mergeSessions([s('a', 1, 'local'), s('b', 5)], [s('a', 3, 'project'), s('c', 2)]);
    expect(m.map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(m.find(x => x.id === 'a')!.tag).toBe('project');
  });
  it('upserts one session', () => {
    expect(upsertSession([s('a', 1), s('b', 2)], s('a', 9)).map(x => [x.id, x.lastUpdatedAt])).toEqual([['a', 9], ['b', 2]]);
    expect(upsertSession([], s('z', 1))).toHaveLength(1);
  });
  it('reports what the local store is missing or has stale', () => {
    expect(sessionsNewerThan([s('a', 5), s('b', 1)], [s('a', 5), s('b', 2), s('c', 1)]).map(x => x.id)).toEqual(['b', 'c']);
  });
});
