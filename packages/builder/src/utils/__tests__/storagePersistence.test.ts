/**
 * Backup staleness — the rule that decides when a library card nudges. The
 * point is a safety rail, not a nag: only work that exists solely in this
 * browser AND has for a while gets a badge.
 */
import { describe, it, expect } from 'vitest';
import { backupStaleness } from '../storagePersistence';

const NOW = new Date('2026-08-19T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('backupStaleness', () => {
  it('a fresh project stays quiet even with no export', () => {
    expect(backupStaleness({ createdAt: daysAgo(3), modifiedAt: daysAgo(1) }, 14, NOW))
      .toBe('fresh');
  });

  it('an old never-exported project gets the never-backed-up badge', () => {
    expect(backupStaleness({ createdAt: daysAgo(30), modifiedAt: daysAgo(2) }, 14, NOW))
      .toBe('never-backed-up');
  });

  it('a recently exported project stays quiet regardless of age', () => {
    expect(backupStaleness(
      { createdAt: daysAgo(200), modifiedAt: daysAgo(1), lastExportedAt: daysAgo(2) }, 14, NOW,
    )).toBe('fresh');
  });

  it('edits after an OLD export mark the backup outdated', () => {
    expect(backupStaleness(
      { createdAt: daysAgo(200), modifiedAt: daysAgo(1), lastExportedAt: daysAgo(20) }, 14, NOW,
    )).toBe('backup-outdated');
  });

  it('an untouched project with an old export stays quiet — nothing new to lose', () => {
    expect(backupStaleness(
      { createdAt: daysAgo(200), modifiedAt: daysAgo(60), lastExportedAt: daysAgo(50) }, 14, NOW,
    )).toBe('fresh');
  });

  it('dormant projects stay quiet even when never exported — the badge is for active risk', () => {
    // First rollout painted 84 of 95 library cards amber; a project untouched
    // since spring has survived this long and doesn't need to scream.
    expect(backupStaleness({ createdAt: daysAgo(300), modifiedAt: daysAgo(120) }, 14, NOW))
      .toBe('fresh');
    expect(backupStaleness(
      { createdAt: daysAgo(300), modifiedAt: daysAgo(120), lastExportedAt: daysAgo(200) }, 14, NOW,
    )).toBe('fresh');
  });

  it('accepts string dates (IndexedDB round-trips vary) and junk stays quiet', () => {
    expect(backupStaleness(
      { createdAt: daysAgo(30).toISOString(), modifiedAt: daysAgo(1).toISOString() }, 14, NOW,
    )).toBe('never-backed-up');
    expect(backupStaleness({}, 14, NOW)).toBe('fresh');
    expect(backupStaleness({ createdAt: 'not a date' }, 14, NOW)).toBe('fresh');
  });
});
