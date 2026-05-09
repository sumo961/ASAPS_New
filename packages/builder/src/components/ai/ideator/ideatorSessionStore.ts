/**
 * IndexedDB-backed persistence for Ideator sessions.
 *
 * Each session is one ideation conversation. Sessions are scoped to a
 * project when one is open (so the SessionsPanel filters correctly), but
 * sessions started without a project still save — the projectId is just
 * left undefined.
 *
 * Schema is intentionally tiny: one DB, one object store, one secondary
 * index on projectId. No migration history yet — version is bumped if the
 * shape ever needs to change.
 */

import type { StoryGenerationRequest } from '../../../types/ai';
import type { IdeatorMessage } from './types';

export interface IdeatorSession {
  id: string;
  projectId?: string;
  projectTitle?: string;
  createdAt: number;
  lastUpdatedAt: number;
  messages: IdeatorMessage[];
  /** Latest synthesized request, if the user got that far. */
  draftRequest?: StoryGenerationRequest;
  /** True once the user pressed Send to Story Generator. */
  handedOff?: boolean;
}

const DB_NAME = 'asaps_ideator';
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

export async function saveSession(session: IdeatorSession): Promise<void> {
  const store = await tx('readwrite');
  await awaitRequest(store.put(session));
}

export async function loadSession(id: string): Promise<IdeatorSession | null> {
  const store = await tx('readonly');
  const found = await awaitRequest(store.get(id));
  return (found as IdeatorSession | undefined) ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  const store = await tx('readwrite');
  await awaitRequest(store.delete(id));
}

/**
 * List sessions, optionally filtered by projectId. Returned newest-first
 * (sorted client-side by lastUpdatedAt).
 */
export async function listSessions(
  filter?: { projectId?: string }
): Promise<IdeatorSession[]> {
  const store = await tx('readonly');
  const all: IdeatorSession[] = [];

  if (filter?.projectId) {
    const index = store.index(INDEX_PROJECT);
    const cursorReq = index.openCursor(IDBKeyRange.only(filter.projectId));
    return new Promise<IdeatorSession[]>((resolve, reject) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          all.push(cursor.value as IdeatorSession);
          cursor.continue();
        } else {
          resolve(all.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt));
        }
      };
      cursorReq.onerror = () =>
        reject(cursorReq.error ?? new Error('Failed to list sessions'));
    });
  }

  const cursorReq = store.openCursor();
  return new Promise<IdeatorSession[]>((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        all.push(cursor.value as IdeatorSession);
        cursor.continue();
      } else {
        resolve(all.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt));
      }
    };
    cursorReq.onerror = () =>
      reject(cursorReq.error ?? new Error('Failed to list sessions'));
  });
}

/**
 * Generate a stable session id. Uses crypto.randomUUID when available
 * (modern browsers + Electron), with a deterministic fallback for older
 * environments where the API is missing.
 */
export function newSessionId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
