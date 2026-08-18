/**
 * Persistent-storage guard for the web build.
 *
 * Browser data is deletable data: IndexedDB can be evicted under storage
 * pressure, and "clear site data" destroys a semester of student projects in
 * one click. `navigator.storage.persist()` is the one-line API that asks the
 * browser to exempt this origin from automatic eviction — and it was never
 * called, so every web-build project sat in the evictable pool.
 *
 * Timing matters: Chromium grants or denies silently based on engagement
 * heuristics, but Firefox shows the user a PROMPT. Asking at first paint is
 * both rude and likely to be denied — so this is called after the first
 * successful project save, when "keep this site's data?" is a question the
 * user has an obvious answer to.
 *
 * Electron is exempt: its profile lives in the app's userData directory and
 * is not subject to web eviction. (The durable answer on desktop is the
 * folder-canonical storage direction — this guard is the web ring's half.)
 */

export type PersistenceState = 'persisted' | 'denied' | 'unsupported' | 'electron';

const isElectron = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).electronAPI;

let requestedThisSession = false;
let lastKnownState: PersistenceState | null = null;

/**
 * Ask the browser to protect this origin's storage from eviction. Safe to
 * call repeatedly — the request itself fires at most once per session.
 */
export async function ensurePersistentStorage(): Promise<PersistenceState> {
  if (isElectron()) return (lastKnownState = 'electron');
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return (lastKnownState = 'unsupported');
  }
  try {
    if (await navigator.storage.persisted()) {
      return (lastKnownState = 'persisted');
    }
    if (requestedThisSession) {
      return (lastKnownState = 'denied');
    }
    requestedThisSession = true;
    const granted = await navigator.storage.persist();
    lastKnownState = granted ? 'persisted' : 'denied';
    console.log(`[storagePersistence] persist() ${granted ? 'granted — projects protected from eviction' : 'denied — projects remain evictable under storage pressure'}`);
    return lastKnownState;
  } catch (e) {
    console.warn('[storagePersistence] persist() check failed:', e);
    return (lastKnownState = 'unsupported');
  }
}

/** Current state without triggering a request (null until first check). */
export async function getPersistenceState(): Promise<PersistenceState> {
  if (isElectron()) return 'electron';
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    return lastKnownState === 'denied' ? 'denied' : (requestedThisSession ? 'denied' : 'unsupported');
  } catch {
    return 'unsupported';
  }
}

/**
 * Should this project's card nudge the author about backups?
 *
 * A nudge means: ACTIVE work exists only in this browser and that has been
 * true for a while. Three gates, and all must pass:
 *  - old enough (past the grace period) that "just started" stays quiet,
 *  - recently worked on (the dormancy window) — first rollout painted 84 of
 *    95 library cards amber, which is a wall, not a signal; a project
 *    untouched since spring has survived this long and doesn't need a badge,
 *  - and either never exported, or edited since an export that has gone
 *    stale.
 * The point is a safety rail for the work someone would actually cry over.
 */
export function backupStaleness(
  project: { createdAt?: Date | string; modifiedAt?: Date | string; lastExportedAt?: Date | string | null },
  graceDays = 14,
  now: Date = new Date(),
  dormantDays = 90,
): 'fresh' | 'never-backed-up' | 'backup-outdated' {
  const ms = graceDays * 24 * 60 * 60 * 1000;
  const dormantMs = dormantDays * 24 * 60 * 60 * 1000;
  const t = (v: Date | string | null | undefined): number | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };
  const exported = t(project.lastExportedAt);
  const modified = t(project.modifiedAt);
  const created = t(project.createdAt);

  // Dormant projects stay quiet regardless — the badge is for active risk.
  if (modified == null || now.getTime() - modified > dormantMs) return 'fresh';

  if (exported == null) {
    const age = created != null ? now.getTime() - created : null;
    return age != null && age > ms ? 'never-backed-up' : 'fresh';
  }
  if (modified > exported && now.getTime() - exported > ms) {
    return 'backup-outdated';
  }
  return 'fresh';
}
