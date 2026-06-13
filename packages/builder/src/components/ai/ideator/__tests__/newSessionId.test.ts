/**
 * Tests for newSessionId — generates the stable IDs that keep
 * Ideator sessions distinguishable across browser restarts. Used
 * as IndexedDB keyPath; collision would silently overwrite an old
 * session with a new one.
 *
 * Coverage focus:
 *   - uses crypto.randomUUID when available (modern browsers / Electron)
 *   - falls back to timestamp+random when crypto.randomUUID is missing
 *     (older environments)
 *   - fallback IDs are well-formed (start with 'session-', contain a
 *     timestamp segment, contain a random suffix)
 *   - successive calls produce different IDs (no in-process collision)
 *   - fallback handles missing crypto entirely
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { newSessionId } from '../ideatorSessionStore';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('newSessionId — crypto.randomUUID path', () => {
  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn().mockReturnValue('11111111-2222-3333-4444-555555555555');
    vi.stubGlobal('crypto', { randomUUID });
    const id = newSessionId();
    expect(id).toBe('11111111-2222-3333-4444-555555555555');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('returns a string that matches the UUID v4 shape (when crypto produces one)', () => {
    // The crypto API doesn't have to return a UUID literally, but
    // on real browsers it does. Pin the round-trip so a test
    // accidentally returning '' or null is caught.
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
    const id = newSessionId();
    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i);
  });
});

describe('newSessionId — fallback path', () => {
  it('falls back when crypto.randomUUID is missing', () => {
    // crypto exists but no randomUUID — typical of older
    // browsers and Node without --experimental-vm-modules.
    vi.stubGlobal('crypto', {});
    const id = newSessionId();
    // Fallback shape: 'session-<timestamp>-<random>'
    expect(id).toMatch(/^session-\d+-[a-z0-9]+$/);
  });

  it('falls back when crypto is entirely undefined', () => {
    // Some headless or unusual JS runtimes don't expose globalThis.crypto.
    vi.stubGlobal('crypto', undefined);
    const id = newSessionId();
    expect(id).toMatch(/^session-\d+-[a-z0-9]+$/);
  });

  it('the timestamp segment is a positive integer (recent epoch ms)', () => {
    vi.stubGlobal('crypto', {});
    const before = Date.now();
    const id = newSessionId();
    const after = Date.now();
    const match = id.match(/^session-(\d+)-/);
    expect(match).not.toBeNull();
    const ts = Number(match![1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('the random suffix is at least 4 chars (collision resistance)', () => {
    // Source uses `.slice(2, 10)` on a base-36 random string,
    // so suffix is up to 8 chars. Even just 4 chars is enough to
    // avoid same-millisecond collisions in practice.
    vi.stubGlobal('crypto', {});
    const id = newSessionId();
    const match = id.match(/^session-\d+-([a-z0-9]+)$/);
    expect(match![1].length).toBeGreaterThanOrEqual(4);
  });

  it('successive calls in the same millisecond produce different ids', () => {
    // The fallback combines Date.now() AND Math.random(); calls
    // within the same ms differ only by the random suffix. Pin
    // that those differ.
    vi.stubGlobal('crypto', {});
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
  });
});

describe('newSessionId — no collisions across calls', () => {
  it('100 successive calls produce 100 distinct ids (UUID path)', () => {
    // Use real crypto via Node's built-in.
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(newSessionId());
    }
    expect(ids.size).toBe(100);
  });
});
