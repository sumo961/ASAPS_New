/**
 * IndexedDB persistence for Co-Designer sessions. Same tiny schema as the
 * ideator's session store (own DB so the two histories stay separate), with
 * the projectId index doing real work here: Co-Designer conversations are
 * about a specific story, so the sessions panel filters to the open project.
 */

import type { IdeatorMessage } from '../ideator/types';

export interface CoDesignerSession {
  id: string;
  projectId?: string;
  projectTitle?: string;
  createdAt: number;
  lastUpdatedAt: number;
  messages: IdeatorMessage[];
}

const DB_NAME = 'asaps_codesigner';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const INDEX_PROJECT = 'by_project';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(INDEX_PROJECT, 'projectId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then(db => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
  });
}

export function newSessionId(): string {
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSession(session: CoDesignerSession): Promise<void> {
  const store = await tx('readwrite');
  await awaitRequest(store.put(session));
}

export async function loadSession(id: string): Promise<CoDesignerSession | null> {
  const store = await tx('readonly');
  const result = await awaitRequest(store.get(id));
  return (result as CoDesignerSession) ?? null;
}

/**
 * List sessions, newest first. When projectId is given, only that project's
 * sessions are returned (conversations are story-specific).
 */
export async function listSessions(projectId?: string): Promise<CoDesignerSession[]> {
  const store = await tx('readonly');
  let sessions: CoDesignerSession[];
  if (projectId) {
    const index = store.index(INDEX_PROJECT);
    sessions = (await awaitRequest(index.getAll(projectId))) as CoDesignerSession[];
  } else {
    sessions = (await awaitRequest(store.getAll())) as CoDesignerSession[];
  }
  return sessions.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  const store = await tx('readwrite');
  await awaitRequest(store.delete(id));
}
