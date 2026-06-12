/**
 * Tests for EditingLocks — advisory beat-editing locks for Git-based
 * collaboration. Locks are stored as JSON in .asaps-editing.json and
 * propagate through normal git commit/push/fetch flow. The lock UI
 * gates editing in the visual editor + flags conflicts on save.
 *
 * Coverage focus:
 *   - readLocalLocks: returns empty when missing fs / missing file /
 *     unparseable JSON; honors v:1 schema; safe defaults for shape
 *     drift
 *   - writeLocalLocks: pretty-printed JSON, trailing newline; no-op
 *     when fs is unavailable
 *   - acquireLock / releaseLock semantics: overwrite-on-acquire,
 *     release only if owned-by-user (other users' locks survive)
 *   - releaseAllLocks: removes ALL of one user's locks, leaves others
 *   - getRemoteLocksForOthers: skips own locks, skips stale (>2h),
 *     handles invalid since timestamps
 *   - cross-platform path join (backslash vs forward slash)
 *   - readRemoteLocks via gitShowRemoteFile
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as GitAdapter from '../GitAdapter';
import {
  readLocalLocks,
  writeLocalLocks,
  readRemoteLocks,
  acquireLock,
  releaseLock,
  releaseAllLocks,
  getRemoteLocksForOthers,
  type EditingLock,
  type EditingLockFile,
} from '../EditingLocks';

interface FakeFS {
  exists?: ReturnType<typeof vi.fn>;
  readFile?: ReturnType<typeof vi.fn>;
  writeFile?: ReturnType<typeof vi.fn>;
}

function setupElectron(fs?: FakeFS) {
  vi.stubGlobal('window', { electronAPI: fs ? { fs } : {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readLocalLocks', () => {
  it('returns empty lock file when electronAPI.fs is missing', async () => {
    setupElectron();
    const result = await readLocalLocks('/proj');
    expect(result).toEqual({ v: 1, locks: {} });
  });

  it('returns empty when the file does not exist', async () => {
    setupElectron({
      exists: vi.fn().mockResolvedValue(false),
      readFile: vi.fn(),
    });
    const result = await readLocalLocks('/proj');
    expect(result).toEqual({ v: 1, locks: {} });
  });

  it('parses a valid v:1 lock file', async () => {
    const payload = {
      v: 1,
      locks: { beat1: { user: 'alice', since: '2026-06-13T10:00:00Z', beat: 'Beat One' } },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    setupElectron({
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(bytes),
    });
    const result = await readLocalLocks('/proj');
    expect(result.locks.beat1.user).toBe('alice');
  });

  it('returns empty for unparseable JSON', async () => {
    // Defensive: a corrupted lock file should NOT crash the
    // editor. Worst case: lock advice is lost; users see no
    // locks until someone re-acquires.
    const bytes = new TextEncoder().encode('{not valid json');
    setupElectron({
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(bytes),
    });
    const result = await readLocalLocks('/proj');
    expect(result).toEqual({ v: 1, locks: {} });
  });

  it('returns empty when schema version is missing', async () => {
    // Forward-compat reject: a future v:2 file wouldn't have v:1,
    // so we treat it as unknown and return empty.
    const bytes = new TextEncoder().encode(JSON.stringify({ locks: {} }));
    setupElectron({
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(bytes),
    });
    expect((await readLocalLocks('/proj')).locks).toEqual({});
  });

  it('returns empty when readFile throws', async () => {
    setupElectron({
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockRejectedValue(new Error('EACCES')),
    });
    expect((await readLocalLocks('/proj')).locks).toEqual({});
  });

  it('reads the file at <projectPath>/.asaps-editing.json', async () => {
    const readFile = vi.fn().mockResolvedValue(
      new TextEncoder().encode(JSON.stringify({ v: 1, locks: {} })),
    );
    setupElectron({
      exists: vi.fn().mockResolvedValue(true),
      readFile,
    });
    await readLocalLocks('/my/proj');
    expect(readFile).toHaveBeenCalledWith('/my/proj/.asaps-editing.json');
  });

  it('uses backslash separator on Windows-style paths', async () => {
    // Path-join is heuristic: if the base contains \, use \.
    const exists = vi.fn().mockResolvedValue(false);
    setupElectron({ exists, readFile: vi.fn() });
    await readLocalLocks('C:\\my\\proj');
    expect(exists).toHaveBeenCalledWith('C:\\my\\proj\\.asaps-editing.json');
  });
});

describe('writeLocalLocks', () => {
  it('is a no-op when electronAPI.fs is missing', async () => {
    setupElectron();
    await expect(writeLocalLocks('/proj', { v: 1, locks: {} })).resolves.toBeUndefined();
  });

  it('writes pretty-printed JSON with a trailing newline', async () => {
    const writeFile = vi.fn();
    setupElectron({ writeFile });
    const locks: EditingLockFile = {
      v: 1,
      locks: { b1: { user: 'a', since: '2026-06-13T10:00:00Z', beat: 'B1' } },
    };
    await writeLocalLocks('/proj', locks);
    const [path, content] = writeFile.mock.calls[0];
    expect(path).toBe('/proj/.asaps-editing.json');
    // Pretty-printed → contains newlines + 2-space indent.
    expect(content).toMatch(/\n {2}"v": 1/);
    // Trailing newline (POSIX file convention).
    expect(content.endsWith('\n')).toBe(true);
  });
});

describe('readRemoteLocks', () => {
  it('returns empty when gitShowRemoteFile returns null', async () => {
    vi.spyOn(GitAdapter, 'gitShowRemoteFile').mockResolvedValue(null);
    expect((await readRemoteLocks('/proj', 'main')).locks).toEqual({});
  });

  it('parses a valid v:1 remote lock file', async () => {
    vi.spyOn(GitAdapter, 'gitShowRemoteFile').mockResolvedValue(JSON.stringify({
      v: 1,
      locks: { x: { user: 'bob', since: '2026-06-13T10:00:00Z', beat: 'X' } },
    }));
    const result = await readRemoteLocks('/proj', 'main');
    expect(result.locks.x.user).toBe('bob');
  });

  it('returns empty when gitShowRemoteFile throws', async () => {
    // Branch doesn't exist, no remote, etc.
    vi.spyOn(GitAdapter, 'gitShowRemoteFile').mockRejectedValue(new Error('no upstream'));
    expect((await readRemoteLocks('/proj', 'main')).locks).toEqual({});
  });

  it('returns empty for unparseable JSON content', async () => {
    vi.spyOn(GitAdapter, 'gitShowRemoteFile').mockResolvedValue('not json');
    expect((await readRemoteLocks('/proj', 'main')).locks).toEqual({});
  });
});

describe('acquireLock', () => {
  function mockFS(initial: EditingLockFile = { v: 1, locks: {} }) {
    const written: any[] = [];
    let current = JSON.parse(JSON.stringify(initial));
    const exists = vi.fn().mockResolvedValue(true);
    const readFile = vi.fn().mockImplementation(async () =>
      new TextEncoder().encode(JSON.stringify(current)),
    );
    const writeFile = vi.fn().mockImplementation(async (_path, content) => {
      written.push(content);
      current = JSON.parse(content);
    });
    setupElectron({ exists, readFile, writeFile });
    return { written, getCurrent: () => current };
  }

  it('adds a new lock when the beat is unlocked', async () => {
    const { getCurrent } = mockFS();
    await acquireLock('/proj', 'b1', 'Beat One', 'alice');
    const current = getCurrent();
    expect(current.locks.b1.user).toBe('alice');
    expect(current.locks.b1.beat).toBe('Beat One');
    expect(current.locks.b1.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('overwrites an existing lock (last-acquirer wins)', async () => {
    // Author stole the lock — re-acquiring updates the timestamp +
    // user. Source says "add/update" so this is the documented
    // behavior. Pin so future "abort if locked" refactors are
    // a deliberate edit.
    const { getCurrent } = mockFS({
      v: 1,
      locks: { b1: { user: 'bob', since: '2026-06-13T08:00:00Z', beat: 'B1' } },
    });
    await acquireLock('/proj', 'b1', 'B1 by alice', 'alice');
    expect(getCurrent().locks.b1.user).toBe('alice');
  });
});

describe('releaseLock', () => {
  function mockFS(initial: EditingLockFile) {
    let current = JSON.parse(JSON.stringify(initial));
    const exists = vi.fn().mockResolvedValue(true);
    const readFile = vi.fn().mockImplementation(async () =>
      new TextEncoder().encode(JSON.stringify(current)),
    );
    const writeFile = vi.fn().mockImplementation(async (_path, content) => {
      current = JSON.parse(content);
    });
    setupElectron({ exists, readFile, writeFile });
    return { getCurrent: () => current, writeFile };
  }

  it('releases the lock when owned by the user', async () => {
    const { getCurrent } = mockFS({
      v: 1,
      locks: { b1: { user: 'alice', since: '2026-06-13T10:00:00Z', beat: 'B1' } },
    });
    await releaseLock('/proj', 'b1', 'alice');
    expect(getCurrent().locks).toEqual({});
  });

  it('does NOT release a lock owned by a different user', async () => {
    // Critical invariant: bob's lock can't be released by alice.
    // Without this guard, anyone could "release" anyone else's
    // advisory lock by editing the file.
    const { getCurrent } = mockFS({
      v: 1,
      locks: { b1: { user: 'bob', since: '2026-06-13T10:00:00Z', beat: 'B1' } },
    });
    await releaseLock('/proj', 'b1', 'alice');
    expect(getCurrent().locks.b1.user).toBe('bob');
  });

  it('does not write the file when nothing changes', async () => {
    // Performance + git-noise reduction — releaseLock for a
    // non-existent beat must NOT touch the file.
    const { writeFile } = mockFS({ v: 1, locks: {} });
    await releaseLock('/proj', 'nope', 'alice');
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('releaseAllLocks', () => {
  function mockFS(initial: EditingLockFile) {
    let current = JSON.parse(JSON.stringify(initial));
    const exists = vi.fn().mockResolvedValue(true);
    const readFile = vi.fn().mockImplementation(async () =>
      new TextEncoder().encode(JSON.stringify(current)),
    );
    const writeFile = vi.fn().mockImplementation(async (_path, content) => {
      current = JSON.parse(content);
    });
    setupElectron({ exists, readFile, writeFile });
    return { getCurrent: () => current, writeFile };
  }

  it('removes all of one user\'s locks; leaves other users\' locks', async () => {
    const { getCurrent } = mockFS({
      v: 1,
      locks: {
        a1: { user: 'alice', since: '2026-06-13T10:00:00Z', beat: 'A1' },
        a2: { user: 'alice', since: '2026-06-13T10:00:00Z', beat: 'A2' },
        b1: { user: 'bob',   since: '2026-06-13T10:00:00Z', beat: 'B1' },
      },
    });
    await releaseAllLocks('/proj', 'alice');
    const current = getCurrent();
    expect(current.locks.a1).toBeUndefined();
    expect(current.locks.a2).toBeUndefined();
    expect(current.locks.b1.user).toBe('bob');
  });

  it('no-op write when the user has no locks', async () => {
    // Critical for the "user exits cleanly without ever editing"
    // path — must not produce a no-change commit-noise.
    const { writeFile } = mockFS({
      v: 1,
      locks: { b1: { user: 'bob', since: '2026-06-13T10:00:00Z', beat: 'B1' } },
    });
    await releaseAllLocks('/proj', 'alice');
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('getRemoteLocksForOthers', () => {
  // Pure function — no fs mocking needed.

  function mkLock(user: string, since: string, beat = 'B'): EditingLock {
    return { user, since, beat };
  }

  it('returns other users\' fresh locks as a Map', () => {
    const remote: EditingLockFile = {
      v: 1,
      locks: {
        a1: mkLock('alice', new Date().toISOString()),
        b1: mkLock('bob',   new Date().toISOString()),
        c1: mkLock('alice', new Date().toISOString()),
      },
    };
    const result = getRemoteLocksForOthers(remote, 'alice');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(1);
    expect(result.get('b1')?.user).toBe('bob');
  });

  it('skips the local user\'s own locks', () => {
    const remote: EditingLockFile = {
      v: 1,
      locks: { a1: mkLock('alice', new Date().toISOString()) },
    };
    expect(getRemoteLocksForOthers(remote, 'alice').size).toBe(0);
  });

  it('skips stale locks (>2 hours old)', () => {
    // The advisory lock stays in the remote file but conceptually
    // a 2h+ lock means the editor likely crashed or the user
    // forgot. Don't block other authors indefinitely.
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const remote: EditingLockFile = {
      v: 1,
      locks: { b1: mkLock('bob', threeHoursAgo) },
    };
    expect(getRemoteLocksForOthers(remote, 'alice').size).toBe(0);
  });

  it('keeps just-under-stale locks (<2 hours old)', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const remote: EditingLockFile = {
      v: 1,
      locks: { b1: mkLock('bob', oneHourAgo) },
    };
    expect(getRemoteLocksForOthers(remote, 'alice').size).toBe(1);
  });

  it('skips locks with an invalid since timestamp', () => {
    // Defensive — corrupted/manually-edited timestamp shouldn't
    // crash the filter; treat as stale.
    const remote: EditingLockFile = {
      v: 1,
      locks: {
        b1: mkLock('bob', 'not a date'),
        b2: mkLock('bob', ''),
      },
    };
    expect(getRemoteLocksForOthers(remote, 'alice').size).toBe(0);
  });

  it('returns empty Map when remote has no locks', () => {
    expect(getRemoteLocksForOthers({ v: 1, locks: {} }, 'alice').size).toBe(0);
  });
});
