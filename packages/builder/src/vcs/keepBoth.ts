/**
 * "Keep both" — merge a pull without throwing anyone's beats away
 * (NarrativDesign, 2026-10-20).
 *
 * Before random ids, two people working in parallel each created their own
 * beat_42. A pull then met either two different beats in ONE file (a Git
 * conflict, where "keep mine" / "take theirs" deleted one person's work and
 * hand-merging left conflict markers behind), or — when the two beats had
 * different types (infoText_beat_42 / dialogTree_beat_42) — two files with
 * the SAME id and no conflict at all, and the next save dropped one of them.
 *
 * Keep both, in both cases: the incoming (already pushed) beat keeps the id —
 * teammates have it — and the local beat moves to a fresh id in its own
 * file. Links on the local side follow it (files only the local side changed
 * are rewritten old id → new id). A beat that existed before both changes
 * (a double edit, not an id clash) keeps both too: the local copy is named
 * "… (your version)". project.json takes the incoming file with the newest
 * modifiedAt; the cluster and character indexes merge entry by entry.
 * Other conflicts (settings, theme, characters) stay for the author.
 */
import { deterministicStringify } from '@asaps/core';
import { newBeatId, rewriteValues } from '../utils/beatIds';

export type Run = (cmd: string, args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
export type Write = (path: string, content: string) => Promise<void>;

/** <cluster folder>/<beatType>_<beatId>.json under clusters/. */
const BEAT_FILE = /^clusters\/([^/]+)\/([A-Za-z]+)_(.+)\.json$/;

export interface MovedBeat { from: string; to: string; name: string; doubleEdit: boolean }

export interface KeepBothResult {
  success: boolean;
  message: string;
  moved: MovedBeat[];
  /** Conflicted files left for the author. */
  remaining: string[];
}

function json(text: string | null): any | null {
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function stringify(value: any): string {
  return deterministicStringify(value) + '\n';
}

/** Union two index arrays by key; incoming wins for the same key. */
function unionBy(local: any[] = [], incoming: any[] = [], key: (x: any) => string): any[] {
  const out = [...incoming];
  const seen = new Set(incoming.map(key));
  for (const item of local) if (!seen.has(key(item))) out.push(item);
  return out;
}

export function movedSummary(moved: MovedBeat[]): string {
  if (moved.length === 0) return '';
  return ` ${moved.length} of your beat${moved.length === 1 ? '' : 's'} shared an ID with a teammate's and moved to a new one, so both survive: `
    + moved.map((x) => `"${x.name}"`).join(', ') + '.';
}

/** Git plumbing around one project folder that may sit in a subfolder of the repository. */
async function context(projectPath: string, run: Run, sep: string) {
  const git = (args: string[]) => run('git', args, projectPath);
  const show = async (spec: string): Promise<string | null> => {
    const r = await git(['show', spec]);
    return r.exitCode === 0 ? r.stdout : null;
  };
  const top = (await git(['rev-parse', '--show-toplevel'])).stdout.trim() || projectPath;
  const prefix = (await git(['rev-parse', '--show-prefix'])).stdout.trim();
  return {
    git,
    show,
    prefix,
    full: (rel: string) => [top, ...rel.split('/')].join(sep),
    /** Path inside the project folder, or null when outside it. */
    inProject: (rel: string) => (rel.startsWith(prefix) ? rel.slice(prefix.length) : null),
    lines: (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean),
  };
}
type Ctx = Awaited<ReturnType<typeof context>>;

/**
 * Move local beats that share an id with an incoming beat (different files,
 * so Git saw no conflict) to fresh ids. `incomingRev` holds the pushed side.
 */
async function moveDuplicateIds(ctx: Ctx, incomingRev: string, write: Write, idMap: Map<string, string>, moved: MovedBeat[], movedFiles: string[]): Promise<void> {
  const files = ctx.lines((await ctx.git(['ls-files', '--', `${ctx.prefix}clusters`])).stdout)
    .concat(movedFiles)
    .filter((rel, i, all) => all.indexOf(rel) === i);
  const byId = new Map<string, string[]>();
  for (const rel of files) {
    const m = BEAT_FILE.exec(ctx.inProject(rel) ?? '');
    if (!m || rel.endsWith('/cluster.json') || rel.endsWith('/_index.json')) continue;
    const id = m[3];
    byId.set(id, [...(byId.get(id) || []), rel]);
  }
  for (const [id, rels] of byId) {
    if (rels.length < 2 || idMap.has(id)) continue;
    const incoming: string[] = [];
    const local: string[] = [];
    for (const rel of rels) {
      ((await ctx.git(['cat-file', '-e', `${incomingRev}:${rel}`])).exitCode === 0 ? incoming : local).push(rel);
    }
    if (incoming.length === 0 || local.length === 0) continue;
    for (const rel of local) {
      const beat = json(await ctx.show(`:0:${rel}`));
      if (!beat) continue;
      const [, cluster, type] = BEAT_FILE.exec(ctx.inProject(rel)!)!;
      const to = newBeatId();
      const copyRel = `${ctx.prefix}clusters/${cluster}/${type}_${to}.json`;
      await write(ctx.full(copyRel), stringify({ ...beat, id: to }));
      await ctx.git(['rm', '-q', '-f', '--', rel]);
      await ctx.git(['add', '--', copyRel]);
      idMap.set(id, to);
      movedFiles.push(copyRel);
      moved.push({ from: id, to, name: String(beat.name ?? id), doubleEdit: false });
    }
  }
}

/** Rewrite links on the local side to the moved beats. */
async function followMovedIds(ctx: Ctx, base: string, localRev: string, write: Write, idMap: Map<string, string>, movedFiles: string[], skip: Set<string>): Promise<void> {
  if (idMap.size === 0) return;
  const localChanged = ctx.lines((await ctx.git(['diff', '--name-only', base, localRev])).stdout);
  for (const rel of [...movedFiles, ...localChanged]) {
    const local = ctx.inProject(rel);
    if (local === null || !BEAT_FILE.test(local) || rel.endsWith('/cluster.json') || skip.has(rel)) continue;
    const now = json(await ctx.show(`:0:${rel}`));
    if (!now) continue;
    if (!movedFiles.includes(rel)) {
      // Only files the merge took unchanged from the local side.
      const mine = json(await ctx.show(`${localRev}:${rel}`));
      if (!mine || stringify(now) !== stringify(mine)) continue;
    }
    const rewritten = rewriteValues(now, idMap);
    if (stringify(rewritten) !== stringify(now)) {
      await write(ctx.full(rel), stringify(rewritten));
      await ctx.git(['add', '--', rel]);
    }
  }
}

/** Resolve a pull that stopped with merge conflicts, keeping everyone's beats. */
export async function resolveKeepBoth(projectPath: string, run: Run, write: Write, sep = '/'): Promise<KeepBothResult> {
  const ctx = await context(projectPath, run, sep);
  if ((await ctx.git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).exitCode !== 0) {
    return { success: false, message: 'Keep both works on a pull that is merging; this one is not.', moved: [], remaining: [] };
  }
  const conflicts = ctx.lines((await ctx.git(['diff', '--name-only', '--diff-filter=U'])).stdout);
  const base = (await ctx.git(['merge-base', 'HEAD', 'MERGE_HEAD'])).stdout.trim();

  const idMap = new Map<string, string>();
  const moved: MovedBeat[] = [];
  const resolved = new Set<string>();
  const movedFiles: string[] = [];

  // 1. Beat files in conflict: incoming keeps the id, the local beat moves.
  for (const rel of conflicts) {
    const m = BEAT_FILE.exec(ctx.inProject(rel) ?? '');
    if (!m || rel.endsWith('/cluster.json') || rel.endsWith('/_index.json')) continue;
    const [, cluster, type] = m;
    const ours = json(await ctx.show(`:2:${rel}`));
    const theirs = json(await ctx.show(`:3:${rel}`));
    if (!ours || !theirs) continue;
    await write(ctx.full(rel), stringify(theirs));
    await ctx.git(['add', '--', rel]);
    resolved.add(rel);
    if (stringify(ours) === stringify(theirs)) continue;
    const doubleEdit = (await ctx.show(`${base}:${rel}`)) !== null;
    const to = newBeatId();
    const name = String(ours.name ?? ours.id);
    const copyRel = `${ctx.prefix}clusters/${cluster}/${type}_${to}.json`;
    await write(ctx.full(copyRel), stringify({ ...ours, id: to, ...(doubleEdit ? { name: `${name} (your version)` } : {}) }));
    await ctx.git(['add', '--', copyRel]);
    idMap.set(String(ours.id), to);
    movedFiles.push(copyRel);
    moved.push({ from: String(ours.id), to, name, doubleEdit });
  }

  // 2. Same id in different files (no Git conflict, still a clash).
  await moveDuplicateIds(ctx, 'MERGE_HEAD', write, idMap, moved, movedFiles);

  // 3. Local links follow the moved beats.
  await followMovedIds(ctx, base, 'HEAD', write, idMap, movedFiles, resolved);

  // 4. Small shared files.
  for (const rel of conflicts) {
    if (resolved.has(rel)) continue;
    const ours = json(await ctx.show(`:2:${rel}`));
    const theirs = json(await ctx.show(`:3:${rel}`));
    if (!ours || !theirs) continue;
    const local = ctx.inProject(rel);
    let merged: any = null;
    if (local === 'project.json') {
      const newest = [ours.modifiedAt, theirs.modifiedAt].filter(Boolean).sort().pop();
      merged = { ...theirs, ...(newest ? { modifiedAt: newest } : {}) };
    } else if (local === 'clusters/_index.json') {
      const mine = rewriteValues(ours, idMap);
      merged = {
        ...theirs,
        clusters: unionBy(mine.clusters, theirs.clusters, (c) => String(c?.id)),
        containerBeatPositions: unionBy(mine.containerBeatPositions, theirs.containerBeatPositions, (p) => String(p?.beatId)),
      };
    } else if (local === 'characters/_index.json') {
      merged = { ...theirs, characterIds: [...new Set([...(theirs.characterIds || []), ...(ours.characterIds || [])])] };
    }
    if (merged) {
      await write(ctx.full(rel), stringify(merged));
      await ctx.git(['add', '--', rel]);
      resolved.add(rel);
    }
  }

  const remaining = conflicts.filter((rel) => !resolved.has(rel));
  if (remaining.length > 0) {
    return { success: false, message: `Kept both where it could.${movedSummary(moved)} Still to decide: ${remaining.join(', ')}.`, moved, remaining };
  }
  const commit = await ctx.git(['commit', '--no-edit']);
  if (commit.exitCode !== 0) {
    return { success: false, message: `Resolved, but the merge commit failed: ${commit.stderr.trim()}`, moved, remaining };
  }
  return { success: true, message: `Kept everyone's work.${movedSummary(moved)}`, moved, remaining };
}

/**
 * After a pull that merged cleanly: beats from both sides that share an id
 * in different files (no conflict was reported). Moves the local ones to
 * fresh ids and commits that. No-op for fast-forward pulls.
 */
export async function fixDuplicateIdsAfterMerge(projectPath: string, run: Run, write: Write, sep = '/'): Promise<MovedBeat[]> {
  const ctx = await context(projectPath, run, sep);
  if ((await ctx.git(['rev-parse', '-q', '--verify', 'HEAD^2'])).exitCode !== 0) return [];
  const base = (await ctx.git(['merge-base', 'HEAD^1', 'HEAD^2'])).stdout.trim();
  const idMap = new Map<string, string>();
  const moved: MovedBeat[] = [];
  const movedFiles: string[] = [];
  await moveDuplicateIds(ctx, 'HEAD^2', write, idMap, moved, movedFiles);
  if (moved.length === 0) return [];
  await followMovedIds(ctx, base, 'HEAD^1', write, idMap, movedFiles, new Set());
  await ctx.git(['commit', '-q', '-m', `ASAPS: kept both beats that shared an ID (${moved.map((m) => m.from).join(', ')})`]);
  return moved;
}
