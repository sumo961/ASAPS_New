/**
 * Real git: the same beat renamed differently on each side — a teammate's
 * older ASAPS shortened a runaway id to a random one and pushed, this
 * computer's shortened it to the derived one (bullying-IDN, 2026-10-21).
 * Git reports a rename/rename conflict (old file DD, each new file on one
 * side only). Keep both, Keep My Changes and Accept Remote must all finish.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveKeepBoth } from '../keepBoth';
import { gitResolveAllConflicts, gitGetConflicts } from '../GitAdapter';

const hasGit = spawnSync('git', ['--version']).status === 0;
const run = async (cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.status ?? 1 };
};
const write = async (p: string, content: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const OLD = 'beat_29_copymv54phfs1_copymv54po2v1';
const trip = (id: string) => JSON.stringify({ id, name: 'cafeteria, trip', parameters: { text: 'Vic is about to walk past you' }, type: 'infoText' }, null, 2) + '\n';
const choice = (target: string) => JSON.stringify({ id: 'beat_19', name: 'apologise or not', parameters: { choices: [{ target }] }, type: 'multiChoice' }, null, 2) + '\n';

for (const sub of ['', 'story']) {
  describe.skipIf(!hasGit)(`one beat renamed twice${sub ? ' (project in a subfolder)' : ''} (real git)`, () => {
    let tmp: string;
    let mine: string; // this computer: the project folder
    let read: (rel: string) => any;
    let exists: (rel: string) => boolean;

    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'));
      const remote = path.join(tmp, 'remote.git');
      git(tmp, 'init', '-q', '--bare', '-b', 'main', remote);
      const a = path.join(tmp, 'a');
      git(tmp, 'clone', '-q', remote, a);
      git(a, 'config', 'user.email', 'a@x'); git(a, 'config', 'user.name', 'A');
      const pa = sub ? path.join(a, sub) : a;
      const put = (root: string, rel: string, text: string) => write(path.join(root, rel), text);
      put(pa, `clusters/cafeteria/infoText_${OLD}.json`, trip(OLD));
      put(pa, 'clusters/cafeteria/multiChoice_beat_19.json', choice(OLD));
      git(a, 'add', '-A'); git(a, 'commit', '-qm', 'base'); git(a, 'push', '-q', 'origin', 'main');
      const b = path.join(tmp, 'b');
      git(tmp, 'clone', '-q', remote, b);
      git(b, 'config', 'user.email', 'b@x'); git(b, 'config', 'user.name', 'B'); git(b, 'config', 'pull.rebase', 'false');
      mine = sub ? path.join(b, sub) : b;
      // Teammate: random short id, links rewritten to it, pushed.
      fs.rmSync(path.join(pa, `clusters/cafeteria/infoText_${OLD}.json`));
      put(pa, 'clusters/cafeteria/infoText_beat_na22e6b5.json', trip('beat_na22e6b5'));
      put(pa, 'clusters/cafeteria/multiChoice_beat_19.json', choice('beat_na22e6b5'));
      git(a, 'add', '-A'); git(a, 'commit', '-qm', 'remote repair'); git(a, 'push', '-q');
      // This computer: derived short id, committed, then pulls.
      fs.rmSync(path.join(mine, `clusters/cafeteria/infoText_${OLD}.json`));
      put(mine, 'clusters/cafeteria/infoText_beat_kwuq5isk.json', trip('beat_kwuq5isk'));
      put(mine, 'clusters/cafeteria/multiChoice_beat_19.json', choice('beat_kwuq5isk'));
      git(b, 'add', '-A'); git(b, 'commit', '-qm', 'local repair');
      expect(spawnSync('git', ['pull', '-q', '--no-edit'], { cwd: b }).status).not.toBe(0);
      read = (rel) => JSON.parse(fs.readFileSync(path.join(mine, rel), 'utf8'));
      exists = (rel) => fs.existsSync(path.join(mine, rel));
      (window as any).electronAPI = { fs: { runCommand: async (c: string, args: string[], cwd: string) => {
        const r = spawnSync(c, args, { cwd, encoding: 'utf8' });
        return { exitCode: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
      } } };
    });

    afterEach(() => {
      delete (window as any).electronAPI;
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('lists every conflicted file, including the one-sided ones', async () => {
      expect((await gitGetConflicts(mine)).length).toBe(4);
    });

    it('Keep both keeps one beat under the incoming id and points local links at it', async () => {
      const result = await resolveKeepBoth(mine, run, write, path.sep);
      expect(result.success, result.message).toBe(true);
      expect(git(mine, 'status', '--porcelain').trim()).toBe('');
      expect(exists('clusters/cafeteria/infoText_beat_na22e6b5.json')).toBe(true);
      expect(exists('clusters/cafeteria/infoText_beat_kwuq5isk.json')).toBe(false);
      expect(exists(`clusters/cafeteria/infoText_${OLD}.json`)).toBe(false);
      expect(read('clusters/cafeteria/multiChoice_beat_19.json').parameters.choices[0].target).toBe('beat_na22e6b5');
    });

    it('Accept Remote and Keep My Changes finish instead of failing on files a side does not have', async () => {
      const accept = await gitResolveAllConflicts(mine, false, false);
      expect(accept.success, accept.message).toBe(true);
      expect(await gitGetConflicts(mine)).toEqual([]);
      expect(exists('clusters/cafeteria/infoText_beat_na22e6b5.json')).toBe(true);
      expect(exists('clusters/cafeteria/infoText_beat_kwuq5isk.json')).toBe(false);
      expect(read('clusters/cafeteria/multiChoice_beat_19.json').parameters.choices[0].target).toBe('beat_na22e6b5');
      expect(read('clusters/cafeteria/infoText_beat_na22e6b5.json').id).toBe('beat_na22e6b5'); // no conflict markers
    });

    it('Keep My Changes keeps the local id and removes the incoming file', async () => {
      const keep = await gitResolveAllConflicts(mine, true, false);
      expect(keep.success, keep.message).toBe(true);
      expect(await gitGetConflicts(mine)).toEqual([]);
      expect(exists('clusters/cafeteria/infoText_beat_kwuq5isk.json')).toBe(true);
      expect(exists('clusters/cafeteria/infoText_beat_na22e6b5.json')).toBe(false);
      expect(read('clusters/cafeteria/infoText_beat_kwuq5isk.json').id).toBe('beat_kwuq5isk'); // no conflict markers
    });
  });
}
