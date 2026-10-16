/**
 * Real git, no mocks: a pull must not fail because this app rewrote the
 * tracked .asaps-editing.json ("Your local changes to the following files
 * would be overwritten by merge"), and the local lock must survive it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitPull, gitSwitchBranch } from '../GitAdapter';

const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const lockFile = (locks: Record<string, any>) => JSON.stringify({ v: 1, locks }, null, 2) + '\n';
const lock = (user: string, beat: string) => ({ user, beat, since: '2026-10-16T10:00:00.000Z' });

describe.skipIf(!hasGit)('pull with a locally rewritten .asaps-editing.json (real git)', () => {
  let root: string;
  let mine: string;
  let theirs: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'asaps-locks-'));
    const remote = path.join(root, 'remote.git');
    git(root, 'init', '--bare', '-b', 'main', remote);
    mine = path.join(root, 'mine');
    theirs = path.join(root, 'theirs');
    for (const dir of [mine, theirs]) {
      git(root, 'clone', '-q', remote, dir);
      git(dir, 'config', 'user.email', 'qa@example.test');
      git(dir, 'config', 'user.name', 'QA');
      git(dir, 'checkout', '-q', '-B', 'main');
    }
    fs.writeFileSync(path.join(mine, 'story.json'), '{"beats":1}\n');
    fs.writeFileSync(path.join(mine, '.asaps-editing.json'), lockFile({}));
    git(mine, 'add', '.');
    git(mine, 'commit', '-q', '-m', 'start');
    git(mine, 'push', '-q', '-u', 'origin', 'main');
    git(theirs, 'pull', '-q', 'origin', 'main');
    git(theirs, 'branch', '-q', '--set-upstream-to', 'origin/main', 'main');

    (window as any).electronAPI = {
      fs: {
        runCommand: async (cmd: string, args: string[], cwd: string) => {
          const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
          return { exitCode: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
        },
        exists: async (p: string) => fs.existsSync(p),
        readFile: async (p: string) => new Uint8Array(fs.readFileSync(p)),
        writeFile: async (p: string, text: string) => fs.writeFileSync(p, text),
        unlink: async (p: string) => fs.unlinkSync(p),
      },
    };
  });

  afterEach(() => {
    delete (window as any).electronAPI;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('pulls, takes the other locks and keeps mine', async () => {
    // A teammate starts editing a beat, changes the story, pushes.
    fs.writeFileSync(path.join(theirs, '.asaps-editing.json'), lockFile({ b2: lock('ana', 'Forest') }));
    fs.writeFileSync(path.join(theirs, 'story.json'), '{"beats":2}\n');
    git(theirs, 'commit', '-q', '-am', 'their work');
    git(theirs, 'push', '-q');
    // Meanwhile I selected a beat: the app rewrote the lock file.
    fs.writeFileSync(path.join(mine, '.asaps-editing.json'), lockFile({ b1: lock('me', 'Intro') }));

    // Plain git refuses exactly as reported…
    const plain = spawnSync('git', ['pull'], { cwd: mine, encoding: 'utf8' });
    expect(plain.status).not.toBe(0);
    expect(plain.stderr).toContain('would be overwritten by merge');

    // …the app's pull goes through.
    const result = await gitPull(mine);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(mine, 'story.json'), 'utf8')).toBe('{"beats":2}\n');
    const locks = JSON.parse(fs.readFileSync(path.join(mine, '.asaps-editing.json'), 'utf8')).locks;
    expect(locks).toEqual({ b1: lock('me', 'Intro'), b2: lock('ana', 'Forest') });
  });

  it('switches branch with the lock file rewritten', async () => {
    git(mine, 'branch', '-q', 'draft');
    git(mine, 'checkout', '-q', 'draft');
    fs.writeFileSync(path.join(mine, '.asaps-editing.json'), lockFile({ b9: lock('ana', 'Old') }));
    git(mine, 'commit', '-q', '-am', 'draft locks');
    git(mine, 'checkout', '-q', 'main');
    fs.writeFileSync(path.join(mine, '.asaps-editing.json'), lockFile({ b1: lock('me', 'Intro') }));

    const result = await gitSwitchBranch(mine, 'draft');
    expect(result.success).toBe(true);
    expect(git(mine, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('draft');
    const locks = JSON.parse(fs.readFileSync(path.join(mine, '.asaps-editing.json'), 'utf8')).locks;
    expect(locks).toEqual({ b1: lock('me', 'Intro'), b9: lock('ana', 'Old') });
  });
});
