/**
 * Bringing back beats from an undone merge, against REAL git repositories,
 * replaying NarrativDesign (2026-10-23): Mission 4 was merged from a branch,
 * a teammate reverted the merge, the team worked on — and merging the
 * branch again did nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findUndoneMerge, planRestore, applyRestore } from '../undoneMerge';

const run = async (cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.status ?? 1 };
};
const write = async (p: string, content: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const beat = (id: string, name: string, extra: any = {}) =>
  JSON.stringify({ id, type: 'infoText', name, parameters: { text: name }, connections: [], ...extra }, null, 2) + '\n';
const put = (dir: string, rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const exists = (dir: string, rel: string) => fs.existsSync(path.join(dir, rel));
const read = (dir: string, rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const link = (target: string) => ({ connections: [{ targetId: target }] });

let tmp: string;

/** The story so far, in `sub` of the repository. Returns the project folder. */
function replay(sub: string): string {
  const repo = fs.mkdtempSync(path.join(tmp, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'x@x'); git(repo, 'config', 'user.name', 'Team');
  const dir = path.join(repo, sub);
  const u = 'clusters/_unclustered';
  put(dir, 'project.json', '{"id":"p1"}\n');
  put(dir, 'assets/_manifest.json', JSON.stringify({ _format: '1.0', assets: {} }) + '\n');
  put(dir, 'characters/_index.json', JSON.stringify({ _format: '1.0', characterIds: [] }) + '\n');
  put(dir, 'clusters/_index.json', JSON.stringify({ _format: '1.0', clusters: [], containerBeatPositions: [] }) + '\n');
  put(dir, `${u}/infoText_beat_72.json`, beat('beat_72', 'InfoText 72', link('beat_75')));
  put(dir, `${u}/infoText_beat_75.json`, beat('beat_75', 'InfoText 75'));
  put(dir, `${u}/infoText_beat_76.json`, beat('beat_76', 'InfoText 76'));
  put(dir, `${u}/infoText_beat_old.json`, beat('beat_old', 'Old scene'));
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'base');

  // The branch: Mission 4, a new picture, a new character, a new cluster.
  git(repo, 'switch', '-q', '-c', 'Noellfixingspelling');
  put(dir, `${u}/infoText_beat_86.json`, beat('beat_86', 'InfoText 86', { ...link('beat_87'), parameters: { text: 'x', backgroundImage: 'asset_tunnel', speaker: 'char_robber' } }));
  put(dir, 'clusters/mission-4/infoText_beat_87.json', beat('beat_87', 'InfoText 87'));
  put(dir, 'clusters/mission-4/cluster.json', '{"id":"cluster_m4","slug":"mission-4"}\n');
  put(dir, 'clusters/_index.json', JSON.stringify({ _format: '1.0', clusters: [{ id: 'cluster_m4', name: 'Mission 4', slug: 'mission-4' }], containerBeatPositions: [{ beatId: 'beat_87', clusterId: 'cluster_m4', position: { x: 1, y: 2 } }] }) + '\n');
  put(dir, 'assets/backgrounds/Tunnel.png', 'PNG');
  put(dir, 'assets/_manifest.json', JSON.stringify({ _format: '1.0', assets: { asset_tunnel: { id: 'asset_tunnel', filename: 'Tunnel.png', folder: 'backgrounds' } } }) + '\n');
  put(dir, 'characters/char_robber.json', '{"id":"char_robber","name":"Robber"}\n');
  put(dir, 'characters/_index.json', JSON.stringify({ _format: '1.0', characterIds: ['char_robber'] }) + '\n');
  put(dir, `${u}/infoText_beat_72.json`, beat('beat_72', 'InfoText 72', link('beat_86')));
  put(dir, `${u}/infoText_beat_75.json`, beat('beat_75', 'InfoText 75', link('beat_86')));
  put(dir, `${u}/infoText_beat_old.json`, beat('beat_old', 'Old scene, spelling fixed'));
  fs.rmSync(path.join(dir, `${u}/infoText_beat_76.json`));
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'Story mission 4 klar');

  // Merged on 22 Oct, undone on 23 Oct.
  git(repo, 'switch', '-q', 'main');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'Story mission 4 klar', 'Noellfixingspelling');
  git(repo, 'revert', '--no-edit', '-m', '1', 'HEAD');
  // The team works on: reroutes 75, deletes the old scene.
  put(dir, `${u}/infoText_beat_75.json`, beat('beat_75', 'InfoText 75', link('beat_police')));
  put(dir, `${u}/infoText_beat_police.json`, beat('beat_police', 'PoliceDeathCheck'));
  fs.rmSync(path.join(dir, `${u}/infoText_beat_old.json`));
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'team goes on');
  return dir;
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'undone-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe.each([['', 'project at the repository root'], ['stories/nd', 'project in a subfolder']])('undone merge (%s)', (sub) => {
  it('finds the revert, offers the branch’s beats, and brings the chosen ones back with what they need', async () => {
    const dir = replay(sub);
    // Merging again does nothing — the reason for all this.
    expect(git(dir, 'merge', 'Noellfixingspelling')).toMatch(/Already up to date/);

    const undone = await findUndoneMerge(dir, run, 'Noellfixingspelling');
    expect(undone).toMatchObject({ undoneSubject: expect.stringContaining('Story mission 4 klar'), revertSubject: expect.stringContaining('Revert') });

    const plan = await planRestore(dir, run, '/', 'Noellfixingspelling', undone!);
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    expect(Object.keys(byId).sort()).toEqual(['beat_72', 'beat_75', 'beat_76', 'beat_86', 'beat_87', 'beat_old']);
    expect(byId.beat_86).toMatchObject({ kind: 'added', suggested: true, leadsToOnBranch: ['InfoText 87'] });
    expect(byId.beat_87).toMatchObject({ kind: 'added', suggested: true });
    expect(byId.beat_72).toMatchObject({ kind: 'changed', suggested: true, leadsToOnBranch: ['InfoText 86'], leadsToHere: ['InfoText 75'] });
    expect(byId.beat_75).toMatchObject({ kind: 'bothChanged', suggested: false, leadsToOnBranch: ['InfoText 86'], leadsToHere: ['PoliceDeathCheck'] });
    expect(byId.beat_old).toMatchObject({ kind: 'deletedHere', suggested: false });
    expect(byId.beat_76).toMatchObject({ kind: 'removedOnBranch', suggested: false });

    const result = await applyRestore(dir, run, write, '/', plan, new Set(['beat_86', 'beat_87', 'beat_72']));
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Brought back 3 beats from Noellfixingspelling, with Tunnel\.png, Robber, cluster "Mission 4"/);

    const u = 'clusters/_unclustered';
    expect(read(dir, `${u}/infoText_beat_86.json`).name).toBe('InfoText 86');
    expect(read(dir, 'clusters/mission-4/infoText_beat_87.json').name).toBe('InfoText 87');
    expect(read(dir, `${u}/infoText_beat_72.json`).connections).toEqual([{ targetId: 'beat_86' }]);
    // The team's work is untouched.
    expect(read(dir, `${u}/infoText_beat_75.json`).connections).toEqual([{ targetId: 'beat_police' }]);
    expect(exists(dir, `${u}/infoText_beat_old.json`)).toBe(false);
    expect(exists(dir, `${u}/infoText_beat_76.json`)).toBe(true);
    // What the beats need came along.
    expect(fs.readFileSync(path.join(dir, 'assets/backgrounds/Tunnel.png'), 'utf8')).toBe('PNG');
    expect(read(dir, 'assets/_manifest.json').assets.asset_tunnel.filename).toBe('Tunnel.png');
    expect(read(dir, 'characters/_index.json').characterIds).toEqual(['char_robber']);
    expect(exists(dir, 'characters/char_robber.json')).toBe(true);
    expect(read(dir, 'clusters/_index.json')).toMatchObject({
      clusters: [{ slug: 'mission-4' }],
      containerBeatPositions: [{ beatId: 'beat_87' }],
    });
    // One commit, nothing left over.
    expect(git(dir, 'log', '-1', '--format=%s')).toMatch(/^Bring back 3 beats from Noellfixingspelling \(undone by "Revert/);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });
});

describe('undone merge — when not to offer it', () => {
  it('no revert, or a revert that was reverted again: nothing to bring back', async () => {
    const dir = replay('');
    git(dir, 'switch', '-q', '-c', 'other', 'HEAD~3');
    put(dir, 'clusters/_unclustered/infoText_beat_x.json', beat('beat_x', 'X'));
    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'other work');
    git(dir, 'switch', '-q', 'main');
    expect(await findUndoneMerge(dir, run, 'other')).toBeNull();
    git(dir, 'reset', '-q', '--hard', 'HEAD~1'); // before the team went on: no conflicts
    const revert = git(dir, 'log', '--format=%H', '-1', '--grep', 'This reverts').trim();
    git(dir, 'revert', '--no-edit', revert);
    expect(await findUndoneMerge(dir, run, 'Noellfixingspelling')).toBeNull();
  });

  it('refuses while there are uncommitted changes', async () => {
    const dir = replay('');
    const plan = await planRestore(dir, run, '/', 'Noellfixingspelling', (await findUndoneMerge(dir, run, 'Noellfixingspelling'))!);
    put(dir, 'clusters/_unclustered/infoText_beat_75.json', beat('beat_75', 'unsaved'));
    const result = await applyRestore(dir, run, write, '/', plan, new Set(['beat_86']));
    expect(result).toMatchObject({ success: false, message: expect.stringMatching(/Commit or discard/) });
    expect(exists(dir, 'clusters/_unclustered/infoText_beat_86.json')).toBe(false);
  });
});
