/**
 * Recently deleted beats — a safety net for 30 days, kept on this computer
 * (Birka group, 2026-10-27): "ASAPS deleted about 10 dialogue trees", two
 * hours of work, noticed after more work had been done. Undo was out of
 * reach, a folder project deletes beat files for good, and nothing on the
 * computer kept an earlier version.
 *
 * Every save compares the beats with those of the previous save of the same
 * project; a beat that is gone is copied here first, whatever removed it (a
 * key press, an AI change, a pull, an update from a copy, a bug). Whoever
 * removed beats on purpose may say why (noteDeletion) — the list shows it,
 * so the next "it deleted my beats" can be traced.
 *
 * Its own small database: no change to the project stores' schema.
 */

const DB_NAME = 'asaps-deleted-beats';
const STORE = 'beats';
const KEEP_DAYS = 30;

export interface DeletedBeat {
  /** Database key. */
  key?: number;
  projectId: string;
  projectName: string;
  /** When the save that no longer had it ran (ms). */
  deletedAt: number;
  beatId: string;
  name: string;
  type: string;
  /** What removed it, when known ("Delete key in the flowchart: 11 beats"). */
  cause: string;
  /** The beat as it was saved last (serialized JSON). */
  beat: any;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('No IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key', autoIncrement: true });
      store.createIndex('projectId', 'projectId');
      store.createIndex('deletedAt', 'deletedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---- Why beats went: said by whoever removes them, read at the next save --

const causes = new Map<string, string>();

/**
 * Say why these beats are being removed; the next save records it with them.
 * `fallback`: only where nobody said more precisely (the command under a
 * Delete key press says "Deleted", the key press says which key).
 */
export function noteDeletion(beatIds: string[], cause: string, fallback = false): void {
  for (const id of beatIds) if (!fallback || !causes.has(id)) causes.set(id, cause);
}

function takeCause(beatId: string): string {
  const cause = causes.get(beatId);
  causes.delete(beatId);
  return cause ?? 'No longer in the project when it was saved';
}

// ---- Comparing saves ------------------------------------------------------

function serialized(beat: any): any {
  return typeof beat?.toJSON === 'function' ? beat.toJSON() : beat;
}

function beatsOf(story: any): any[] {
  const beats = story?.beats;
  if (Array.isArray(beats)) return beats;
  if (beats instanceof Map) return [...beats.values()];
  if (beats && typeof beats === 'object') return Object.values(beats);
  return [];
}

/**
 * Remembers the beats of the last save per project and reports the ones a
 * new save no longer has. The first save of a project (in this session)
 * only sets the baseline.
 */
export class DeletionWatch {
  private projectId: string | null = null;
  private last = new Map<string, any>();

  /** Start from this project state (open, reload): nothing counts as deleted yet. */
  reset(projectId: string | null, story?: any): void {
    this.projectId = projectId;
    this.last = new Map(beatsOf(story).map((b) => { const s = serialized(b); return [s?.id, s]; }));
  }

  /** The beats gone since the previous save of this project; then this save is the baseline. */
  saved(projectId: string, story: any): any[] {
    const now = new Map(beatsOf(story).map((b) => { const s = serialized(b); return [s?.id, s]; }));
    const gone = this.projectId === projectId
      ? [...this.last.entries()].filter(([id]) => id && !now.has(id)).map(([, beat]) => beat)
      : [];
    this.projectId = projectId;
    // Deep copies: the beat objects on screen change after this save.
    this.last = new Map([...now.entries()].map(([id, b]) => [id, JSON.parse(JSON.stringify(b ?? null))]));
    return gone;
  }
}

// ---- The store --------------------------------------------------------------

/** Keep these beats (from a save of `project` that no longer had them). */
export async function recordDeletedBeats(project: { id: string; name?: string }, beats: any[]): Promise<void> {
  if (beats.length === 0) return;
  const deletedAt = Date.now();
  const rows: DeletedBeat[] = beats.map((beat) => ({
    projectId: project.id,
    projectName: project.name ?? '',
    deletedAt,
    beatId: String(beat?.id ?? ''),
    name: typeof beat?.name === 'string' && beat.name.trim() ? beat.name.trim() : String(beat?.id ?? '?'),
    type: String(beat?.type ?? ''),
    cause: takeCause(String(beat?.id ?? '')),
    beat,
  }));
  console.warn(`[deletedBeats] ${rows.length} beat(s) left "${project.name}":`, rows.map((r) => `${r.name} (${r.cause})`).join('; '));
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  for (const row of rows) tx.objectStore(STORE).add(row);
  await done(tx);
}

/** This project's deleted beats, newest first (older than 30 days are dropped). */
export async function listDeletedBeats(projectId: string): Promise<DeletedBeat[]> {
  await purgeOldDeletedBeats();
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).index('projectId').getAll(projectId);
  const rows = await new Promise<DeletedBeat[]>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as DeletedBeat[]);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function forgetDeletedBeats(keys: number[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  for (const key of keys) tx.objectStore(STORE).delete(key);
  await done(tx);
}

export async function purgeOldDeletedBeats(now = Date.now()): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const range = IDBKeyRange.upperBound(now - KEEP_DAYS * 24 * 60 * 60 * 1000);
  const req = tx.objectStore(STORE).index('deletedAt').openCursor(range);
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };
  await done(tx);
}
