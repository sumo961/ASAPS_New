/**
 * Beats from a merge someone undid (NarrativDesign, 2026-10-23): Mission 4
 * was merged from a branch, a teammate reverted that merge, and merging the
 * branch again did nothing. Git counts the branch's commits as merged; the
 * revert removed their changes. "Revert the revert" would bring everything
 * back at once and clash with what the team changed since.
 *
 * Here, beat by beat: compare the branch with the current branch, each
 * against where the two parted (the merge base), and offer what the branch
 * added or changed that is missing now. Beats the branch added come back
 * (ticked); beats only the branch changed come back in its version (ticked);
 * beats both sides changed, beats the team deleted since, and beats the
 * branch removed are offered unticked. Pictures, sounds, characters and
 * clusters the chosen beats need come along. One commit, nothing pushed.
 */
import { deterministicStringify } from '@asaps/core';

export type Run = (cmd: string, args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
export type Write = (path: string, content: string) => Promise<void>;

/** <cluster folder>/<beatType>_<beatId>.json under clusters/. */
const BEAT_FILE = /^clusters\/([^/]+)\/([A-Za-z]+)_(.+)\.json$/;
const LOCK_FILE = '.asaps-editing.json';

export interface UndoneMerge {
  /** The commit that was undone (a merge, or a single commit). */
  undone: string;
  undoneSubject: string;
  undoneDate: string;
  /** The commit that undid it. */
  revert: string;
  revertSubject: string;
  revertAuthor: string;
  revertDate: string;
  /** Where the branch and the current branch parted. */
  base: string;
}

export type RestoreKind =
  /** New on the branch; the undo removed it. */
  | 'added'
  /** Only the branch changed it; the undo put the old version back. */
  | 'changed'
  /** The branch and the current branch both changed it since they parted. */
  | 'bothChanged'
  /** The branch changed it; it was deleted here since. */
  | 'deletedHere'
  /** The branch deleted it; the undo brought it back. */
  | 'removedOnBranch';

export interface RestoreItem {
  id: string;
  name: string;
  kind: RestoreKind;
  /** Ticked when the dialog opens. */
  suggested: boolean;
  /** Repository paths of the beat's file on the branch / here. */
  branchPath?: string;
  herePath?: string;
  /** Names of the beats it leads to on the branch / here. */
  leadsToOnBranch: string[];
  leadsToHere: string[];
}

export interface RestorePlan {
  branch: string;
  branchRev: string;
  undone: UndoneMerge;
  items: RestoreItem[];
}

interface Entry { path: string; blob: string }

function json(text: string | null): any | null {
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function stringify(value: any): string {
  return deterministicStringify(value) + '\n';
}

async function context(projectPath: string, run: Run, sep: string) {
  const git = (args: string[]) => run('git', args, projectPath);
  const top = (await git(['rev-parse', '--show-toplevel'])).stdout.trim() || projectPath;
  const prefix = (await git(['rev-parse', '--show-prefix'])).stdout.trim();
  const show = async (rev: string, path: string): Promise<string | null> => {
    const r = await git(['show', `${rev}:${path}`]);
    return r.exitCode === 0 ? r.stdout : null;
  };
  /** Beat files of a commit by beat id, with their blob hashes. */
  const beats = async (rev: string): Promise<Map<string, Entry>> => {
    const out = new Map<string, Entry>();
    const r = await git(['ls-tree', '-r', '--full-tree', rev, '--', `${prefix}clusters`]);
    if (r.exitCode !== 0) return out;
    for (const line of r.stdout.split('\n')) {
      const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line.trim());
      if (!m) continue;
      const path = m[2];
      const inProject = path.startsWith(prefix) ? path.slice(prefix.length) : null;
      const file = inProject ? BEAT_FILE.exec(inProject) : null;
      if (!file || inProject!.endsWith('/cluster.json') || inProject!.endsWith('/_index.json')) continue;
      out.set(file[3], { path, blob: m[1] });
    }
    return out;
  };
  return { git, top, prefix, show, beats, full: (rel: string) => [top, ...rel.split('/')].join(sep) };
}

/**
 * The most recent commit on the current branch that undid (part of) `branch`
 * — a revert of a merge of it, or of one of its commits — and was not itself
 * undone later. Null when there is none.
 */
export async function findUndoneMerge(projectPath: string, run: Run, branch: string): Promise<UndoneMerge | null> {
  const git = (args: string[]) => run('git', args, projectPath);
  const log = await git(['log', 'HEAD', '-E', '--grep=This reverts commit [0-9a-f]+', '--format=%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e']);
  if (log.exitCode !== 0) return null;
  const reverts = log.stdout.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [hash, author, date, subject, body] = r.split('\x1f');
    return { hash, author, date, subject, target: /This reverts commit ([0-9a-f]{7,40})/.exec(body ?? '')?.[1] ?? '' };
  }).filter((r) => r.target);
  const full = async (rev: string) => (await git(['rev-parse', '--verify', '-q', `${rev}^{commit}`])).stdout.trim();
  // A revert that was itself reverted is no longer in effect.
  const undoneReverts = new Set<string>();
  for (const r of reverts) undoneReverts.add(await full(r.target));

  for (const r of reverts) {
    if (undoneReverts.has(r.hash)) continue;
    const target = await full(r.target);
    if (!target) continue;
    const parents = (await git(['rev-list', '--parents', '-n', '1', target])).stdout.trim().split(/\s+/).slice(1);
    if (parents.length === 0) continue;
    const merged = parents.length > 1 ? parents[1] : target;
    if ((await git(['merge-base', '--is-ancestor', merged, branch])).exitCode !== 0) continue;
    const base = parents.length > 1
      ? (await git(['merge-base', parents[0], parents[1]])).stdout.trim()
      : parents[0];
    if (!base) continue;
    const info = (await git(['log', '-1', '--format=%s%x1f%aI', target])).stdout.trim().split('\x1f');
    return {
      undone: target,
      undoneSubject: info[0] ?? '',
      undoneDate: info[1] ?? '',
      revert: r.hash,
      revertSubject: r.subject,
      revertAuthor: r.author,
      revertDate: r.date,
      base,
    };
  }
  return null;
}

/** Ids of other beats a beat's JSON mentions (links, choices, branches …). */
function linkedIds(beat: any, known: Set<string>): string[] {
  const found = new Set<string>();
  const walk = (v: any) => {
    if (typeof v === 'string') { if (known.has(v) && v !== beat?.id) found.add(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk({ ...beat, id: undefined });
  return [...found];
}

/** What the branch has that the undo took away, beat by beat. */
export async function planRestore(projectPath: string, run: Run, sep: string, branch: string, undone: UndoneMerge): Promise<RestorePlan> {
  const ctx = await context(projectPath, run, sep);
  const branchRev = (await ctx.git(['rev-parse', '--verify', '-q', `${branch}^{commit}`])).stdout.trim();
  const [there, here, before] = await Promise.all([ctx.beats(branchRev), ctx.beats('HEAD'), ctx.beats(undone.base)]);

  const picked: Array<{ id: string; kind: RestoreKind; b?: Entry; h?: Entry }> = [];
  for (const id of new Set([...there.keys(), ...here.keys()])) {
    const b = there.get(id);
    const h = here.get(id);
    const o = before.get(id);
    if (b && !h) {
      if (!o) picked.push({ id, kind: 'added', b });
      else if (o.blob !== b.blob) picked.push({ id, kind: 'deletedHere', b });
    } else if (b && h) {
      if (b.blob === h.blob || o?.blob === b.blob) continue;
      picked.push({ id, kind: o?.blob === h.blob ? 'changed' : 'bothChanged', b, h });
    } else if (h && o && o.blob === h.blob) {
      picked.push({ id, kind: 'removedOnBranch', h });
    }
  }

  // Names and links, read from the two versions involved.
  const texts = new Map<string, any>();
  const read = async (rev: string, e?: Entry) => {
    if (!e || texts.has(`${rev}:${e.path}`)) return;
    texts.set(`${rev}:${e.path}`, json(await ctx.show(rev, e.path)));
  };
  for (const p of picked) { await read(branchRev, p.b); await read('HEAD', p.h); }
  const known = new Set([...there.keys(), ...here.keys()]);
  const names = new Map<string, string>();
  const nameOf = async (id: string): Promise<string> => {
    if (names.has(id)) return names.get(id)!;
    const e = here.get(id) ?? there.get(id);
    const beat = e ? json(await ctx.show(here.has(id) ? 'HEAD' : branchRev, e.path)) : null;
    const name = typeof beat?.name === 'string' && beat.name.trim() ? beat.name.trim() : id;
    names.set(id, name);
    return name;
  };

  const items: RestoreItem[] = [];
  for (const p of picked) {
    const onBranch = p.b ? texts.get(`${branchRev}:${p.b.path}`) : null;
    const onHere = p.h ? texts.get(`HEAD:${p.h.path}`) : null;
    const name = (onBranch?.name || onHere?.name || p.id) as string;
    names.set(p.id, name);
    items.push({
      id: p.id,
      name,
      kind: p.kind,
      suggested: p.kind === 'added' || p.kind === 'changed',
      ...(p.b ? { branchPath: p.b.path } : {}),
      ...(p.h ? { herePath: p.h.path } : {}),
      leadsToOnBranch: onBranch ? await Promise.all(linkedIds(onBranch, known).map(nameOf)) : [],
      leadsToHere: onHere ? await Promise.all(linkedIds(onHere, known).map(nameOf)) : [],
    });
  }
  const order: RestoreKind[] = ['added', 'changed', 'bothChanged', 'deletedHere', 'removedOnBranch'];
  items.sort((a, z) => order.indexOf(a.kind) - order.indexOf(z.kind) || a.name.localeCompare(z.name, undefined, { numeric: true }));
  return { branch, branchRev, undone, items };
}

export interface RestoreResult {
  success: boolean;
  message: string;
  restored: number;
  /** Pictures/sounds, characters and clusters that came along. */
  alongWith: string[];
}

/**
 * Bring the chosen beats back as the branch has them (a beat the branch
 * removed is removed), with the assets, characters and clusters they need,
 * and commit that. Refuses when there are uncommitted changes.
 */
export async function applyRestore(projectPath: string, run: Run, write: Write, sep: string, plan: RestorePlan, chosen: Set<string>): Promise<RestoreResult> {
  const ctx = await context(projectPath, run, sep);
  const fail = (message: string): RestoreResult => ({ success: false, message, restored: 0, alongWith: [] });
  const status = await ctx.git(['status', '--porcelain', '--', '.']);
  const dirty = status.stdout.split('\n').map((l) => l.slice(3).trim()).filter((p) => p && !p.endsWith(LOCK_FILE));
  if (dirty.length > 0) return fail('Commit or discard your changes first (Pending Changes), then bring the beats back.');

  const items = plan.items.filter((i) => chosen.has(i.id));
  if (items.length === 0) return fail('Nothing chosen.');
  const rev = plan.branchRev;
  const touched: string[] = [];
  const along: string[] = [];
  const takenTexts: string[] = [];

  for (const item of items) {
    if (item.kind === 'removedOnBranch') {
      if (item.herePath) {
        const r = await ctx.git(['rm', '-q', '--', `:/${item.herePath}`]);
        if (r.exitCode !== 0) return fail(r.stderr.trim() || `Couldn't remove "${item.name}".`);
      }
      continue;
    }
    if (!item.branchPath) continue;
    const r = await ctx.git(['checkout', rev, '--', `:/${item.branchPath}`]);
    if (r.exitCode !== 0) return fail(r.stderr.trim() || `Couldn't bring back "${item.name}".`);
    touched.push(item.branchPath);
    if (item.herePath && item.herePath !== item.branchPath) await ctx.git(['rm', '-q', '--', `:/${item.herePath}`]);
    takenTexts.push((await ctx.show(rev, item.branchPath)) ?? '');
  }
  const mentioned = (id: string) => takenTexts.some((t) => t.includes(id));
  const p = ctx.prefix;

  // Pictures and sounds the beats use that are gone here.
  const manifestThere = json(await ctx.show(rev, `${p}assets/_manifest.json`));
  const manifestHere = json(await ctx.show('HEAD', `${p}assets/_manifest.json`)) ?? { _format: '1.0', assets: {} };
  let manifestChanged = false;
  for (const [id, entry] of Object.entries<any>(manifestThere?.assets ?? {})) {
    if (manifestHere.assets?.[id] || !mentioned(id) || !entry?.filename) continue;
    const file = `${p}assets/${entry.folder ? `${entry.folder}/` : ''}${entry.filename}`;
    if ((await ctx.git(['checkout', rev, '--', `:/${file}`])).exitCode !== 0) continue;
    manifestHere.assets = { ...(manifestHere.assets ?? {}), [id]: entry };
    manifestChanged = true;
    touched.push(file);
    along.push(entry.filename);
  }
  if (manifestChanged) {
    await write(ctx.full(`${p}assets/_manifest.json`), stringify(manifestHere));
    touched.push(`${p}assets/_manifest.json`);
  }

  // Characters they speak with.
  const charsThere = json(await ctx.show(rev, `${p}characters/_index.json`));
  const charsHere = json(await ctx.show('HEAD', `${p}characters/_index.json`)) ?? { _format: '1.0', characterIds: [] };
  let charsChanged = false;
  for (const id of (charsThere?.characterIds ?? []) as string[]) {
    if ((charsHere.characterIds ?? []).includes(id) || !mentioned(id)) continue;
    const file = `${p}characters/${id}.json`;
    if ((await ctx.git(['checkout', rev, '--', `:/${file}`])).exitCode !== 0) continue;
    charsHere.characterIds = [...(charsHere.characterIds ?? []), id];
    charsChanged = true;
    touched.push(file);
    along.push(json(await ctx.show(rev, file))?.name ?? id);
  }
  if (charsChanged) {
    await write(ctx.full(`${p}characters/_index.json`), stringify(charsHere));
    touched.push(`${p}characters/_index.json`);
  }

  // Clusters they sit in, and their places in them.
  const clustersThere = json(await ctx.show(rev, `${p}clusters/_index.json`));
  const clustersHere = json(await ctx.show('HEAD', `${p}clusters/_index.json`)) ?? { _format: '1.0', clusters: [], containerBeatPositions: [] };
  let clustersChanged = false;
  const slugs = new Set(items.map((i) => (i.branchPath ? /clusters\/([^/]+)\//.exec(i.branchPath.slice(p.length))?.[1] : undefined)).filter(Boolean) as string[]);
  for (const slug of slugs) {
    if (slug === '_unclustered' || (clustersHere.clusters ?? []).some((c: any) => c.slug === slug)) continue;
    const cluster = (clustersThere?.clusters ?? []).find((c: any) => c.slug === slug);
    if (!cluster) continue;
    const file = `${p}clusters/${slug}/cluster.json`;
    if ((await ctx.git(['checkout', rev, '--', `:/${file}`])).exitCode === 0) touched.push(file);
    clustersHere.clusters = [...(clustersHere.clusters ?? []), cluster];
    clustersChanged = true;
    along.push(`cluster "${cluster.name ?? slug}"`);
  }
  const chosenIds = new Set(items.filter((i) => i.kind !== 'removedOnBranch').map((i) => i.id));
  const placedHere = new Set((clustersHere.containerBeatPositions ?? []).map((x: any) => x.beatId));
  const places = (clustersThere?.containerBeatPositions ?? []).filter((x: any) => chosenIds.has(x.beatId) && !placedHere.has(x.beatId));
  if (places.length > 0) {
    clustersHere.containerBeatPositions = [...(clustersHere.containerBeatPositions ?? []), ...places];
    clustersChanged = true;
  }
  if (clustersChanged) {
    await write(ctx.full(`${p}clusters/_index.json`), stringify(clustersHere));
    touched.push(`${p}clusters/_index.json`);
  }

  if (touched.length > 0) {
    const add = await ctx.git(['add', '--', ...touched.map((t) => `:/${t}`)]);
    if (add.exitCode !== 0) return fail(add.stderr.trim() || 'Git refused to add the files.');
  }
  const count = items.length;
  const branchName = plan.branch.replace(/^origin\//, '');
  const message = `Bring back ${count} beat${count === 1 ? '' : 's'} from ${branchName} (undone by "${plan.undone.revertSubject}")`;
  const commit = await ctx.git(['commit', '-q', '-m', message]);
  const done = `Brought back ${count} beat${count === 1 ? '' : 's'} from ${branchName}`
    + (along.length ? `, with ${along.join(', ')}` : '');
  // The files are back either way; without a commit they wait in Pending Changes.
  const why = (commit.stderr.trim() || commit.stdout.trim()).split('\n').find((l) => /^(fatal|error):/.test(l)) ?? '';
  return {
    success: true,
    message: commit.exitCode === 0
      ? `${done}. Committed — push it in the Version Control panel to share it.`
      : `${done}. They aren't committed yet${why ? ` (${why})` : ''} — commit them in Pending Changes.`,
    restored: count,
    alongWith: along,
  };
}
