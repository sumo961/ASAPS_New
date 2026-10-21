/**
 * Real git: a project.json that only got new stamps (modifiedAt, savedWith)
 * must not block a pull ("Your local changes to the following files would
 * be overwritten by merge: project.json" — group report, 2026-10-21). A real
 * local change to it still does.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitPull } from '../GitAdapter';

const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const meta = (over: Record<string, any> = {}) =>
  JSON.stringify({ id: 'p1', name: 'Story', firstBeatId: 'beat_1', modifiedAt: '2026-10-20T10:00:00.000Z', savedWith: '0.9.125', ...over }, null, 2) + '\n';

describe.skipIf(!hasGit)('pull with a project.json that only has new stamps (real git)', () => {
  let root: string;
  let mine: string;
  let theirs: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'asaps-stamps-'));
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
    fs.writeFileSync(path.join(mine, 'project.json'), meta());
    git(mine, 'add', '.');
    git(mine, 'commit', '-q', '-m', 'start');
    git(mine, 'push', '-q', '-u', 'origin', 'main');
    git(theirs, 'pull', '-q', 'origin', 'main');
    git(theirs, 'branch', '-q', '--set-upstream-to', 'origin/main', 'main');
    // A teammate changes the start beat and pushes.
    fs.writeFileSync(path.join(mine, 'project.json'), meta({ firstBeatId: 'beat_2', modifiedAt: '2026-10-21T09:00:00.000Z' }));
    git(mine, 'commit', '-q', '-am', 'new start');
    git(mine, 'push', '-q');

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

  it('puts back a project.json whose only change is its stamps, and pulls', async () => {
    fs.writeFileSync(path.join(theirs, 'project.json'), meta({ modifiedAt: '2026-10-21T08:00:00.000Z', savedWith: '0.9.126' }));
    const result = await gitPull(theirs);
    expect(result.success, result.message).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(theirs, 'project.json'), 'utf8')).firstBeatId).toBe('beat_2');
  });

  it('leaves a real local change alone (Git reports it as before)', async () => {
    fs.writeFileSync(path.join(theirs, 'project.json'), meta({ name: 'Renamed here' }));
    const result = await gitPull(theirs);
    expect(result.success).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(theirs, 'project.json'), 'utf8')).name).toBe('Renamed here');
  });
});
