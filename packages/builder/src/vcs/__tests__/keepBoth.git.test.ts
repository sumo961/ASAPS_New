/**
 * Keep both against REAL git repositories, replaying what happened to the
 * NarrativDesign group (2026-10-20): two people add different beats under
 * the same numbered ids — one pair in the same file (a conflict), one pair
 * with different types (no conflict, two files, one id).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveKeepBoth, fixDuplicateIdsAfterMerge } from '../keepBoth';
import { gitPull, gitSwitchBranch } from '../GitAdapter';

const run = async (cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.status ?? 1 };
};
const write = async (p: string, content: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const beat = (id: string, type: string, name: string, extra: any = {}) =>
  JSON.stringify({ id, type, name, parameters: { text: name }, connections: [], ...extra }, null, 2) + '\n';
const put = (dir: string, rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const read = (dir: string, rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const beatFiles = (dir: string) => fs.readdirSync(path.join(dir, 'clusters/_unclustered')).sort();

let tmp: string;
let remote: string;
let a: string; // N25555 — pushes first
let b: string; // t3kkadan — pulls into the clash

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keepboth-'));
  remote = path.join(tmp, 'remote.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', remote);
  a = path.join(tmp, 'a');
  git(tmp, 'clone', '-q', remote, a);
  for (const d of [a]) { git(d, 'config', 'user.email', 'a@x'); git(d, 'config', 'user.name', 'A'); }
  put(a, 'project.json', JSON.stringify({ id: 'p1', name: 'ND', modifiedAt: '2026-10-19T10:00:00Z' }, null, 2) + '\n');
  put(a, 'clusters/_unclustered/infoText_beat_39.json', beat('beat_39', 'infoText', 'gangRecruitCont.'));
  git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'base'); git(a, 'push', '-q', 'origin', 'main');
  b = path.join(tmp, 'b');
  git(tmp, 'clone', '-q', remote, b);
  git(b, 'config', 'user.email', 'b@x'); git(b, 'config', 'user.name', 'B');
  git(b, 'config', 'pull.rebase', 'false');

  // A: the father storyline under 41/42
  put(a, 'clusters/_unclustered/infoText_beat_41.json', beat('beat_41', 'infoText', 'HomeWithFather', { connections: [{ targetId: 'beat_42' }] }));
  put(a, 'clusters/_unclustered/infoText_beat_42.json', beat('beat_42', 'infoText', 'Hey son, can we talk?'));
  put(a, 'project.json', JSON.stringify({ id: 'p1', name: 'ND', modifiedAt: '2026-10-19T12:32:00Z' }, null, 2) + '\n');
  git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'HomeWithFather'); git(a, 'push', '-q', 'origin', 'main');

  // B: Mission 2 under the same numbers, without having pulled
  put(b, 'clusters/_unclustered/infoText_beat_41.json', beat('beat_41', 'infoText', 'StartMission2', { connections: [{ targetId: 'beat_42' }] }));
  put(b, 'clusters/_unclustered/dialogTree_beat_42.json', beat('beat_42', 'dialogTree', 'mission2Start', { connections: [{ targetId: 'beat_39' }] }));
  put(b, 'clusters/_unclustered/infoText_beat_43.json', beat('beat_43', 'infoText', 'mission2CarTransition', { connections: [{ targetId: 'beat_41' }] }));
  put(b, 'project.json', JSON.stringify({ id: 'p1', name: 'ND', modifiedAt: '2026-10-20T07:30:00Z' }, null, 2) + '\n');
  git(b, 'add', '-A'); git(b, 'commit', '-q', '-m', 'Mission 2');
});

afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('Keep both (real git)', () => {
  it('resolves the NarrativDesign clash: both storylines survive, links follow, the merge commits', async () => {
    const pull = spawnSync('git', ['pull', '-q', 'origin', 'main'], { cwd: b, encoding: 'utf8' });
    expect(pull.status).not.toBe(0); // conflict in infoText_beat_41 and project.json

    const result = await resolveKeepBoth(b, run, write);
    expect(result.success).toBe(true);
    expect(git(b, 'status', '--porcelain').trim()).toBe('');

    // incoming (A, already pushed) keeps the ids
    expect(read(b, 'clusters/_unclustered/infoText_beat_41.json').name).toBe('HomeWithFather');
    expect(read(b, 'clusters/_unclustered/infoText_beat_42.json').name).toBe('Hey son, can we talk?');
    // B's beats moved to fresh ids, and B's links follow them
    const moved = Object.fromEntries(result.moved.map((m) => [m.from, m.to]));
    expect(Object.keys(moved).sort()).toEqual(['beat_41', 'beat_42']);
    const files = beatFiles(b);
    expect(files).toContain(`infoText_${moved.beat_41}.json`);
    expect(files).toContain(`dialogTree_${moved.beat_42}.json`);
    expect(files).not.toContain('dialogTree_beat_42.json');
    const start = read(b, `clusters/_unclustered/infoText_${moved.beat_41}.json`);
    expect(start.name).toBe('StartMission2'); // an id clash, not a double edit: no rename
    expect(start.connections).toEqual([{ targetId: moved.beat_42 }]);
    expect(read(b, 'clusters/_unclustered/infoText_beat_43.json').connections).toEqual([{ targetId: moved.beat_41 }]);
    // a link to a shared beat stays
    expect(read(b, `clusters/_unclustered/dialogTree_${moved.beat_42}.json`).connections).toEqual([{ targetId: 'beat_39' }]);
    // project.json: newest modifiedAt, no markers
    expect(read(b, 'project.json').modifiedAt).toBe('2026-10-20T07:30:00Z');
    // every id is unique now
    const ids = files.map((f) => f.replace(/^[A-Za-z]+_/, '').replace(/\.json$/, ''));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps a double edit of a shared beat as "(your version)"', async () => {
    put(a, 'clusters/_unclustered/infoText_beat_39.json', beat('beat_39', 'infoText', 'gangRecruitCont.', { parameters: { text: 'A wrote this' } }));
    git(a, 'commit', '-qam', 'edit 39'); git(a, 'push', '-q', 'origin', 'main');
    put(b, 'clusters/_unclustered/infoText_beat_39.json', beat('beat_39', 'infoText', 'gangRecruitCont.', { parameters: { text: 'B wrote this' } }));
    git(b, 'commit', '-qam', 'edit 39 too');
    spawnSync('git', ['pull', '-q', 'origin', 'main'], { cwd: b });

    const result = await resolveKeepBoth(b, run, write);
    expect(result.success).toBe(true);
    const mine = result.moved.find((m) => m.from === 'beat_39')!;
    expect(mine.doubleEdit).toBe(true);
    expect(read(b, 'clusters/_unclustered/infoText_beat_39.json').parameters.text).toBe('A wrote this');
    const copy = read(b, `clusters/_unclustered/infoText_${mine.to}.json`);
    expect(copy.parameters.text).toBe('B wrote this');
    expect(copy.name).toBe('gangRecruitCont. (your version)');
  });

  it('after a clean merge, moves local beats that share an id with incoming ones in different files', async () => {
    // only the different-type pair: no conflict at all
    fs.rmSync(path.join(b, 'clusters/_unclustered/infoText_beat_41.json'));
    put(b, 'project.json', JSON.stringify({ id: 'p1', name: 'ND', modifiedAt: '2026-10-19T12:32:00Z' }, null, 2) + '\n');
    git(b, 'add', '-A'); git(b, 'commit', '-q', '--amend', '-m', 'Mission 2 (no 41)');
    const pull = spawnSync('git', ['pull', '-q', '--no-edit', 'origin', 'main'], { cwd: b, encoding: 'utf8' });
    expect(pull.status).toBe(0);
    expect(beatFiles(b)).toEqual(expect.arrayContaining(['dialogTree_beat_42.json', 'infoText_beat_42.json']));

    const moved = await fixDuplicateIdsAfterMerge(b, run, write);
    expect(moved.map((m) => m.from)).toEqual(['beat_42']);
    expect(beatFiles(b)).not.toContain('dialogTree_beat_42.json');
    expect(beatFiles(b)).toContain(`dialogTree_${moved[0].to}.json`);
    expect(read(b, 'clusters/_unclustered/infoText_beat_43.json').connections).toEqual([{ targetId: 'beat_41' }]);
    expect(git(b, 'status', '--porcelain').trim()).toBe('');
    expect(git(b, 'log', '-1', '--format=%s')).toMatch(/kept both beats that shared an ID/);
  });

  it('does nothing after a fast-forward pull', async () => {
    git(b, 'reset', '-q', '--hard', 'origin/main');
    spawnSync('git', ['pull', '-q', 'origin', 'main'], { cwd: b });
    expect(await fixDuplicateIdsAfterMerge(b, run, write)).toEqual([]);
  });
});

// The app's own pull, on real repositories (window.electronAPI → real git).
describe('gitPull on real repositories', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      fs: {
        runCommand: run,
        writeFile: write,
        exists: async (p: string) => fs.existsSync(p),
        readFile: async (p: string) => new Uint8Array(fs.readFileSync(p)),
        unlink: async (p: string) => fs.rmSync(p, { force: true }),
      },
    };
  });
  afterEach(() => { delete (window as any).electronAPI; });

  it('fixes a same-id pair in different files right after the pull (no conflict reported)', async () => {
    fs.rmSync(path.join(b, 'clusters/_unclustered/infoText_beat_41.json'));
    put(b, 'project.json', JSON.stringify({ id: 'p1', name: 'ND', modifiedAt: '2026-10-19T12:32:00Z' }, null, 2) + '\n');
    git(b, 'add', '-A'); git(b, 'commit', '-q', '--amend', '-m', 'Mission 2 (no 41)');
    const result = await gitPull(b);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/shared an ID/);
    const ids = beatFiles(b).map((f) => f.replace(/^[A-Za-z]+_/, '').replace(/\.json$/, ''));
    expect(new Set(ids).size).toBe(ids.length);
    expect(git(b, 'status', '--porcelain').trim()).toBe('');
  });

  it('gets back onto the branch from a detached HEAD, keeping a commit made there, then pulls', async () => {
    // drop B's clashing Mission 2 commit for this case, then work detached
    git(b, 'reset', '-q', '--hard', 'HEAD~1');
    git(b, 'checkout', '-q', '--detach');
    put(b, 'clusters/_unclustered/infoText_beat_77.json', beat('beat_77', 'infoText', 'made while detached'));
    git(b, 'add', '-A'); git(b, 'commit', '-q', '-m', 'detached work');
    expect(spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: b }).status).not.toBe(0);

    const result = await gitPull(b);
    expect(result.success).toBe(true);
    expect(git(b, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('main');
    expect(git(b, 'log', '--format=%s')).toMatch(/detached work/);
    expect(beatFiles(b)).toEqual(expect.arrayContaining(['infoText_beat_77.json', 'infoText_beat_42.json']));
  });

  it('switching to a remote branch makes a local branch that follows it', async () => {
    git(a, 'checkout', '-q', '-b', 'Pablo'); git(a, 'push', '-q', 'origin', 'Pablo');
    git(b, 'fetch', '-q');
    const result = await gitSwitchBranch(b, 'origin/Pablo');
    expect(result.success).toBe(true);
    expect(git(b, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('Pablo');
    expect(git(b, 'rev-parse', '--abbrev-ref', 'Pablo@{upstream}').trim()).toBe('origin/Pablo');
  });
});
