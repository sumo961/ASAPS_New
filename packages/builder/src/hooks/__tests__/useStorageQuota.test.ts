/**
 * Tests for useStorageQuota — the standalone size/quota utility functions and
 * the hook itself (driven via renderHook with navigator.storage.estimate
 * stubbed). The hook fetches a quota estimate on mount, derives a warning
 * level, and exposes canStore / getWarningMessage / formatBytes helpers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useStorageQuota,
  formatBytes,
  getSizeTier,
  getSizeRecommendation,
  isStorageCritical,
  needsStorageWarning,
} from '../useStorageQuota';

const MB = 1024 * 1024;
const GB = 1024 * MB;

function stubEstimate(estimate: { quota?: number; usage?: number } | null) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: estimate === null ? undefined : { estimate: vi.fn().mockResolvedValue(estimate) },
  });
}

afterEach(() => {
  // Restore a clean navigator.storage between tests
  Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
});

describe('formatBytes', () => {
  it('formats across unit tiers', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(500)).toBe('500.00 Bytes');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1.5 * MB)).toBe('1.50 MB');
    expect(formatBytes(2 * GB)).toBe('2.00 GB');
  });
});

describe('getSizeTier', () => {
  it('buckets sizes by tier', () => {
    expect(getSizeTier(50 * 1024)).toBe('tiny');
    expect(getSizeTier(2 * MB)).toBe('small');
    expect(getSizeTier(10 * MB)).toBe('medium');
    expect(getSizeTier(30 * MB)).toBe('large');
    expect(getSizeTier(60 * MB)).toBe('huge');
  });
});

describe('getSizeRecommendation', () => {
  it('allows small files with an ok level', () => {
    expect(getSizeRecommendation(1 * MB)).toMatchObject({ canUpload: true, level: 'ok' });
  });

  it('warns on medium/large files but still allows them', () => {
    expect(getSizeRecommendation(10 * MB)).toMatchObject({ canUpload: true, level: 'warn' });
    expect(getSizeRecommendation(30 * MB)).toMatchObject({ canUpload: true, level: 'warn' });
  });

  it('blocks huge files', () => {
    const rec = getSizeRecommendation(60 * MB);
    expect(rec).toMatchObject({ canUpload: false, level: 'block' });
    expect(rec.message).toMatch(/too large/i);
  });
});

describe('threshold predicates', () => {
  it('isStorageCritical at >= 90%', () => {
    expect(isStorageCritical(89.9)).toBe(false);
    expect(isStorageCritical(90)).toBe(true);
  });

  it('needsStorageWarning at >= 80%', () => {
    expect(needsStorageWarning(79.9)).toBe(false);
    expect(needsStorageWarning(80)).toBe(true);
  });
});

describe('useStorageQuota hook', () => {
  it('reports unsupported when the Storage API is missing', async () => {
    stubEstimate(null);
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quota?.supported).toBe(false);
    // canStore is permissive when unsupported
    expect(result.current.canStore(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(result.current.getWarningMessage()).toBeNull();
  });

  it('computes usage, percent, and a safe warning level', async () => {
    stubEstimate({ quota: 100 * MB, usage: 10 * MB });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const q = result.current.quota!;
    expect(q.supported).toBe(true);
    expect(q.usage).toBe(10 * MB);
    expect(q.available).toBe(90 * MB);
    expect(q.percentUsed).toBeCloseTo(10);
    expect(q.warningLevel).toBe('safe');
    expect(result.current.getWarningMessage()).toBeNull();
  });

  it.each([
    [85, 'warning'],
    [92, 'critical'],
    [97, 'full'],
  ] as const)('derives warningLevel %s%% → %s', async (percent, level) => {
    stubEstimate({ quota: 100 * MB, usage: percent * MB });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quota?.warningLevel).toBe(level);
    expect(result.current.getWarningMessage()).toMatch(/storage/i);
  });

  it('canStore respects the 10MB safety buffer', async () => {
    stubEstimate({ quota: 100 * MB, usage: 70 * MB }); // 30MB available
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canStore(19 * MB)).toBe(true); // 19 <= 30-10
    expect(result.current.canStore(21 * MB)).toBe(false); // 21 > 30-10
  });

  it('captures an error when estimate rejects', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockRejectedValue(new Error('boom')) },
    });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('boom');
  });

  it('refresh re-reads the quota', async () => {
    stubEstimate({ quota: 100 * MB, usage: 10 * MB });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quota?.usage).toBe(10 * MB);

    // Swap in a higher usage and refresh
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ quota: 100 * MB, usage: 50 * MB }) },
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.quota?.usage).toBe(50 * MB);
  });
});
