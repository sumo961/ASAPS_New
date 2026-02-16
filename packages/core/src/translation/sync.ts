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
 * - Orphaned strings: kept in the resource (not deleted) but could be flagged
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
  // Add new strings as untranslated (source text as placeholder)
  for (const key of syncResult.newStrings) {
    resource.strings[key] = {
      value: currentSourceStrings[key],
      status: 'untranslated',
    };
  }

  // Mark stale strings
  for (const key of syncResult.staleStrings) {
    if (resource.strings[key]) {
      resource.strings[key].status = 'stale';
    }
  }

  // Update the source snapshot and hash
  resource._sourceSnapshot = { ...currentSourceStrings };
  resource.sourceHash = computeSourceHash(currentSourceStrings);
  resource.modifiedAt = new Date().toISOString();
}
