/**
 * AI conversation sessions that travel WITH a project.
 *
 * The Ideator and the Co-Designer keep their conversations in per-machine
 * browser stores. Two of those conversations belong to a project and are
 * lost on another machine: the Ideator session that PRODUCED a project (the
 * handoff creates the project, so the session predates it), and every
 * Co-Designer session held about a project. Both are mirrored onto the
 * project (generation/ideator-sessions.json, generation/codesigner-
 * sessions.json) and merged back into the local store when the project is
 * opened, newest copy of each session winning.
 */
export interface SessionLike {
  id: string;
  lastUpdatedAt: number;
}

/** Union by id; for a session present in both, the newer `lastUpdatedAt` wins. Newest first. */
export function mergeSessions<T extends SessionLike>(a: readonly T[], b: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const s of [...a, ...b]) {
    if (!s?.id) continue;
    const cur = byId.get(s.id);
    if (!cur || (s.lastUpdatedAt ?? 0) > (cur.lastUpdatedAt ?? 0)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((x, y) => (y.lastUpdatedAt ?? 0) - (x.lastUpdatedAt ?? 0));
}

/** Replace-or-append one session; returns a new array (newest first). */
export function upsertSession<T extends SessionLike>(list: readonly T[], session: T): T[] {
  return mergeSessions(list.filter((s) => s.id !== session.id), [session]);
}

/** Sessions in `incoming` that are missing or older in `local` — the ones worth writing to the local store. */
export function sessionsNewerThan<T extends SessionLike>(local: readonly T[], incoming: readonly T[]): T[] {
  const localById = new Map(local.map((s) => [s.id, s]));
  return incoming.filter((s) => { const l = localById.get(s.id); return !l || (s.lastUpdatedAt ?? 0) > (l.lastUpdatedAt ?? 0); });
}
