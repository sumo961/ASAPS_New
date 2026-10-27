/**
 * Update from a copy (.asaps) — bring a story that travelled as copies back
 * into its project folder (Birka group, 2026-10-27). They left GitHub over
 * merge trouble and sent .asaps files around; to go back, the latest copy
 * must land in the folder that holds the Git history, as an ordinary change
 * that Pending Changes shows and a commit records. No force push, no new
 * repository, history kept.
 *
 * The copy replaces the story; the folder keeps its project id and name.
 * Every import of a copy gave its pictures and sounds new ids, so the same
 * picture would come back as a second file: pictures and sounds whose bytes
 * are already in the folder keep the folder's id (references remapped);
 * only genuinely new ones are written, under a free file name.
 */
import { getAssetFolder, generateUniqueFilename } from '@asaps/core';
import { remapProjectCopyAssets, type ProjectCopy, type ParsedZipAsset } from './projectZipManager';

export interface FolderAsset {
  id: string;
  filename: string;
  folder: string;
  size?: number;
}

export interface CopyUpdatePlan {
  /** The copy with asset references pointing at the folder's ids. */
  copy: ProjectCopy;
  /** Pictures and sounds to write (not in the folder yet), with final ids and file names. */
  newAssets: Array<ParsedZipAsset & { id: string }>;
  /** How many of the copy's pictures and sounds the folder already has. */
  reusedAssets: number;
  beats: {
    added: string[];
    removed: string[];
    changed: string[];
  };
}

/** FNV-1a over the bytes, with the size: same file or not. */
function fingerprint(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${bytes.length}:${(h >>> 0).toString(16)}`;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function beatList(story: any): any[] {
  const beats = story?.beats;
  if (Array.isArray(beats)) return beats;
  if (beats && typeof beats === 'object') return Object.values(beats);
  return [];
}

/** What a beat is, for comparing two versions (not where it sits on the canvas). */
function beatContent(beat: any): string {
  const sorted = (v: any): any => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
    return v;
  };
  const { name, type, parameters, connections } = beat ?? {};
  return JSON.stringify(sorted({ name, type, parameters, connections: connections ?? [] }));
}

function label(beat: any): string {
  return (typeof beat?.name === 'string' && beat.name.trim()) || beat?.id || '?';
}

export function newAssetId(): string {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Compare a copy with the open folder project. `readFolderAsset` returns a
 * folder asset's bytes (null when unreadable); it is asked only for files
 * whose size matches one of the copy's.
 */
export async function planCopyUpdate(
  copy: ProjectCopy,
  currentStory: any,
  folderAssets: FolderAsset[],
  readFolderAsset: (asset: FolderAsset) => Promise<Uint8Array | null>,
): Promise<CopyUpdatePlan> {
  // Pictures and sounds the folder already has, by content.
  const bySize = new Map<number, FolderAsset[]>();
  for (const a of folderAssets) {
    if (typeof a.size === 'number') bySize.set(a.size, [...(bySize.get(a.size) ?? []), a]);
  }
  const folderPrint = new Map<string, string>(); // folder asset id → fingerprint
  const printOf = async (a: FolderAsset): Promise<string | null> => {
    if (folderPrint.has(a.id)) return folderPrint.get(a.id)!;
    const bytes = await readFolderAsset(a);
    if (!bytes) return null;
    const print = fingerprint(bytes);
    folderPrint.set(a.id, print);
    return print;
  };

  const idMap = new Map<string, string>();
  const takenIds = new Set(folderAssets.map((a) => a.id));
  const namesByFolder = new Map<string, Set<string>>();
  for (const a of folderAssets) namesByFolder.set(a.folder, new Set([...(namesByFolder.get(a.folder) ?? []), a.filename]));
  const newAssets: CopyUpdatePlan['newAssets'] = [];
  /** New files by content: a copy can carry the same file twice under two ids. */
  const newByPrint = new Map<string, string>();
  let reused = 0;

  for (const parsed of copy.assets) {
    const blob = parsed.asset.blob;
    const bytes = await blobBytes(blob);
    const print = fingerprint(bytes);
    let match: FolderAsset | undefined;
    for (const candidate of bySize.get(bytes.length) ?? []) {
      if ((await printOf(candidate)) === print) { match = candidate; break; }
    }
    const originalId = parsed.id ?? '';
    if (match) {
      reused++;
      if (originalId && originalId !== match.id) idMap.set(originalId, match.id);
      continue;
    }
    const twin = newByPrint.get(print);
    if (twin) {
      if (originalId && originalId !== twin) idMap.set(originalId, twin);
      continue;
    }
    // New to the folder: a free id and a free file name in its folder.
    let id = originalId && !takenIds.has(originalId) ? originalId : newAssetId();
    while (takenIds.has(id)) id = newAssetId();
    takenIds.add(id);
    if (originalId && originalId !== id) idMap.set(originalId, id);
    const folder = getAssetFolder(parsed.asset.type, parsed.asset.metadata?.subType as string | undefined);
    const names = namesByFolder.get(folder) ?? new Set<string>();
    const filename = generateUniqueFilename(parsed.asset.filename, names);
    names.add(filename);
    namesByFolder.set(folder, names);
    newAssets.push({ ...parsed, id, asset: { ...parsed.asset, filename } });
    newByPrint.set(print, id);
  }

  const remapped = remapProjectCopyAssets(copy, idMap);
  // remapProjectCopyAssets renamed the asset list too; the new assets carry their final ids already.

  const before = new Map(beatList(currentStory).map((b) => [b.id, b]));
  const after = new Map(beatList(remapped.story).map((b) => [b.id, b]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [id, beat] of after) {
    const old = before.get(id);
    if (!old) added.push(label(beat));
    else if (beatContent(old) !== beatContent(beat)) changed.push(label(beat));
  }
  for (const [id, beat] of before) if (!after.has(id)) removed.push(label(beat));
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

  return {
    copy: remapped,
    newAssets,
    reusedAssets: reused,
    beats: { added: added.sort(byName), removed: removed.sort(byName), changed: changed.sort(byName) },
  };
}
