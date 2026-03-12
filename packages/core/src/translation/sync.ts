/**
 * Translation Sync - Staleness detection and synchronization
 *
 * Compares current source strings against the snapshot stored in a
 * TranslationResource to detect new, stale, and orphaned strings.
 */

import type {
  TranslationResource,
  TranslationSyncResult,
  TranslationEntry,
} from './types';

/**
 * Compute a hash of the source strings for quick staleness checks.
 * Uses a simple but effective string-based hash of sorted key-value pairs.
 */
export function computeSourceHash(sourceStrings: Record<string, string>): string {
  const sorted = Object.keys(sourceStrings).sort();
  const content = sorted.map(k => `${k}=${sourceStrings[k]}`).join('\n');

  // Simple djb2 hash — fast and sufficient for change detection
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Sync a translation resource against current source strings.
 * Detects new strings, changed strings (stale), and removed strings (orphaned).
 *
 * @param resource - The existing translation resource
 * @param currentSourceStrings - Current source strings (ID-based keys)
 * @returns Sync result describing what changed
 */
export function syncTranslation(
  resource: TranslationResource,
  currentSourceStrings: Record<string, string>
): TranslationSyncResult {
  const snapshot = resource._sourceSnapshot;
  const currentKeys = new Set(Object.keys(currentSourceStrings));
  const snapshotKeys = new Set(Object.keys(snapshot));

  const newStrings: string[] = [];
  const staleStrings: string[] = [];
  const orphanedStrings: string[] = [];

  // Find new and stale strings
  for (const key of currentKeys) {
    if (!snapshotKeys.has(key)) {
      // String exists in current source but not in snapshot — it's new
      newStrings.push(key);
    } else if (currentSourceStrings[key] !== snapshot[key]) {
      // Source text changed since translation was created
      staleStrings.push(key);
    }
  }

  // Detect corrupted snapshots: entries where a previous sync updated the
  // snapshot (so it matches current source) but the translation value was
  // never updated. This happens when cleanStaleMarkers() wiped stale status
  // after a sync had already updated the snapshot. Detectable pattern:
  // translated value is all-digits but current source is not (common for
  // speaker names that migrated from numeric indices to character names).
  for (const key of currentKeys) {
    if (staleStrings.includes(key) || newStrings.includes(key)) continue;
    const entry = resource.strings[key];
    if (!entry || entry.status !== 'translated') continue;
    const currentValue = currentSourceStrings[key];
    // Snapshot matches source (normal sync wouldn't flag it)
    if (snapshot[key] !== currentValue) continue;
    // Translated value differs from source AND is all-digits while source is not
    if (entry.value !== currentValue && /^\d+$/.test(entry.value) && !/^\d+$/.test(currentValue)) {
      staleStrings.push(key);
    }
  }

  // Find orphaned strings (in snapshot but not in current source)
  for (const key of snapshotKeys) {
    if (!currentKeys.has(key)) {
      orphanedStrings.push(key);
    }
  }

  return {
    newStrings,
    staleStrings,
    orphanedStrings,
    hasChanges: newStrings.length > 0 || staleStrings.length > 0 || orphanedStrings.length > 0,
  };
}

/**
 * Apply sync results to a translation resource.
 * - New strings: added as 'untranslated' with source text as placeholder value
 * - Stale strings: marked as 'stale' (translation kept, but flagged for review)
 * - Orphaned strings: removed from the resource (source was deleted)
 * - Phantom entries: any resource strings not in current source are also removed
 *
 * @param resource - The translation resource to update (mutated in place)
 * @param syncResult - Result from syncTranslation()
 * @param currentSourceStrings - Current source strings for adding new entries
 */
export function applySyncResult(
  resource: TranslationResource,
  syncResult: TranslationSyncResult,
  currentSourceStrings: Record<string, string>
): void {
  // Add new strings as untranslated (source text as placeholder).
  // Preserve existing translations — a key can be "new" (not in snapshot)
  // if the extraction logic was updated, but the resource may already have
  // a translated entry from a previous sync or AI generation.
  for (const key of syncResult.newStrings) {
    if (!resource.strings[key] || resource.strings[key].status === 'untranslated') {
      resource.strings[key] = {
        value: currentSourceStrings[key],
        status: 'untranslated',
      };
    }
  }

  // Mark stale strings
  for (const key of syncResult.staleStrings) {
    if (resource.strings[key]) {
      resource.strings[key].status = 'stale';
    }
  }

  // Remove orphaned strings (source was deleted — translation no longer needed)
  for (const key of syncResult.orphanedStrings) {
    delete resource.strings[key];
  }

  // Remove phantom entries — strings that exist in the resource but not in the
  // current extraction. These can accumulate when beats are deleted but the
  // snapshot was never updated on disk (so syncTranslation can't detect them
  // as orphaned). This is the definitive cleanup pass.
  const validKeys = new Set(Object.keys(currentSourceStrings));
  for (const key of Object.keys(resource.strings)) {
    if (!validKeys.has(key)) {
      delete resource.strings[key];
    }
  }

  // Update the source snapshot — but preserve old values for stale keys.
  // This ensures stale entries can be re-detected on future loads until
  // the translation is actually updated (at which point the snapshot
  // should be refreshed via updateTranslation or re-translation).
  const staleSet = new Set(syncResult.staleStrings);
  const updatedSnapshot: Record<string, string> = {};
  for (const [key, value] of Object.entries(currentSourceStrings)) {
    if (staleSet.has(key) && resource._sourceSnapshot[key] !== undefined) {
      // Preserve old snapshot so stale can be re-detected
      updatedSnapshot[key] = resource._sourceSnapshot[key];
    } else {
      updatedSnapshot[key] = value;
    }
  }
  resource._sourceSnapshot = updatedSnapshot;
  resource.sourceHash = computeSourceHash(currentSourceStrings);
  resource.modifiedAt = new Date().toISOString();
}
