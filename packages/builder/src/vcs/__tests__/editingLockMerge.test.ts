import { describe, it, expect, vi, afterEach } from 'vitest';
import { mergeEditingLocks, sameLockFile } from '../editingLockMerge';
import { gitPull } from '../GitAdapter';

const lock = (user: string, beat: string, since = '2026-10-16T10:00:00.000Z') => ({ user, beat, since });

describe('mergeEditingLocks', () => {
  it('keeps incoming locks and adds the locally acquired ones', () => {
    const base = { v: 1 as const, locks: {} };
    const local = { v: 1 as const, locks: { b1: lock('me', 'Intro') } };
    const incoming = { v: 1 as const, locks: { b2: lock('ana', 'Forest') } };
    expect(mergeEditingLocks(base, local, incoming).locks).toEqual({
      b1: lock('me', 'Intro'),
      b2: lock('ana', 'Forest'),
    });
  });

  it('applies a local release even when the incoming file still has the lock', () => {
    const base = { v: 1 as const, locks: { b1: lock('me', 'Intro') } };
    const local = { v: 1 as const, locks: {} };
    const incoming = { v: 1 as const, locks: { b1: lock('me', 'Intro'), b2: lock('ana', 'Forest') } };
    expect(mergeEditingLocks(base, local, incoming).locks).toEqual({ b2: lock('ana', 'Forest') });
  });

  it('lets incoming changes through for locks not touched locally', () => {
    const base = { v: 1 as const, locks: { b2: lock('ana', 'Forest') } };
    const local = { v: 1 as const, locks: { b2: lock('ana', 'Forest') } };
    const incoming = { v: 1 as const, locks: {} };
    expect(mergeEditingLocks(base, local, incoming).locks).toEqual({});
  });

  it('handles absent files', () => {
    const merged = mergeEditingLocks(null, { v: 1, locks: { b1: lock('me', 'Intro') } }, null);
    expect(merged.locks).toEqual({ b1: lock('me', 'Intro') });
    expect(sameLockFile(mergeEditingLocks(null, null, null), null)).toBe(true);
  });
});

describe('gitPull with a modified .asaps-editing.json', () => {
  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('sets the lock file aside, pulls, and merges the local locks back', async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const files: Record<string, string> = {
      '/proj/.asaps-editing.json': JSON.stringify({ v: 1, locks: { b1: lock('me', 'Intro') } }),
    };
    const committed = JSON.stringify({ v: 1, locks: {} });
    const pulled = JSON.stringify({ v: 1, locks: { b2: lock('ana', 'Forest') } });
    const calls: string[] = [];

    const runCommand = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args.join(' '));
      const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' });
      if (args[0] === 'status' && args[1] === '--porcelain') return ok(' M .asaps-editing.json\n');
      if (args[0] === 'show') return ok(committed);
      if (args[0] === 'checkout') {
        files['/proj/.asaps-editing.json'] = committed;
        return ok();
      }
      if (args[0] === 'pull') {
        // git would refuse if the file were still modified
        if (files['/proj/.asaps-editing.json'] !== committed) {
          return { exitCode: 1, stdout: '', stderr: 'error: Your local changes to the following files would be overwritten by merge' };
        }
        files['/proj/.asaps-editing.json'] = pulled;
        return ok('Updating 73a5735..3c350f2');
      }
      if (args[0] === 'status') return ok('On branch main\nnothing to commit');
      if (args[0] === 'rev-parse') return { exitCode: 1, stdout: '', stderr: '' };
      return ok();
    });

    (window as any).electronAPI = {
      fs: {
        runCommand,
        exists: vi.fn(async (p: string) => p in files),
        readFile: vi.fn(async (p: string) => enc(files[p])),
        writeFile: vi.fn(async (p: string, text: string) => { files[p] = text; }),
        unlink: vi.fn(async (p: string) => { delete files[p]; }),
      },
    };

    const result = await gitPull('/proj');
    expect(result.success).toBe(true);
    expect(calls).toContain('checkout HEAD -- .asaps-editing.json');
    expect(JSON.parse(files['/proj/.asaps-editing.json']).locks).toEqual({
      b1: lock('me', 'Intro'),
      b2: lock('ana', 'Forest'),
    });
  });
});
