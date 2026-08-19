/**
 * Import an UNZIPPED project folder — the Safari case.
 *
 * macOS Safari's "Open safe files after downloading" auto-extracts every
 * downloaded .asaps.zip, leaving the recipient with a folder the app could
 * not swallow: no longer a zip, and not directory-format either (that layout
 * has an `.asaps/format.json` marker and per-beat files; a zip's layout is a
 * monolithic project.json plus asset subfolders). The share-a-project flow
 * broke at the last step, on the platform our users actually run.
 *
 * The fix deliberately does NOT teach the import pipeline a second layout.
 * The zip importer is battle-tested (template semantics, asset ID remapping,
 * translations, conflict flow), so a folder is re-zipped IN MEMORY (store
 * only, no compression — it's transient) and fed to the same pipeline. What
 * Safari unzipped, we quietly zip back.
 */
import JSZip from 'jszip';

/** One file found while walking a dropped or picked folder. */
export interface FolderEntryFile {
  /** Path relative to the walked root, forward slashes. */
  path: string;
  /** Lazy content reader — folders can hold large assets. */
  read: () => Promise<ArrayBuffer | Uint8Array | Blob>;
}

/**
 * Locate the project root inside the walked files: the SHALLOWEST
 * `project.json`. Unzipping usually nests contents one folder down
 * ("Night_Train.asaps/project.json"), and users sometimes drop the parent
 * of that — shallowest wins, deeper project.json files (none exist in real
 * exports) are ignored. Returns the prefix to strip, or null when the
 * folder is not an unzipped project at all.
 */
export function findProjectRoot(paths: string[]): string | null {
  let best: string | null = null;
  for (const p of paths) {
    const norm = p.replace(/\\/g, '/');
    if (norm === 'project.json' || norm.endsWith('/project.json')) {
      const prefix = norm.slice(0, norm.length - 'project.json'.length);
      if (best === null || prefix.length < best.length) best = prefix;
    }
  }
  return best;
}

/**
 * Re-zip an unzipped project folder into a File the zip importer accepts.
 * Returns null when no project.json exists anywhere in the folder — the
 * caller keeps its own messaging for that.
 */
export async function rezipUnzippedProject(
  files: FolderEntryFile[],
  folderName: string,
): Promise<File | null> {
  const root = findProjectRoot(files.map((f) => f.path));
  if (root === null) return null;

  const zip = new JSZip();
  for (const f of files) {
    const norm = f.path.replace(/\\/g, '/');
    if (!norm.startsWith(root)) continue;
    const rel = norm.slice(root.length);
    if (!rel || rel.startsWith('.') || rel.includes('/.')) continue; // .DS_Store and friends
    zip.file(rel, await f.read());
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  // The name matters twice: the .asaps.zip suffix satisfies downstream
  // extension checks, and template detection reads the FLAG inside
  // project.json, not the name — so an unzipped .asapst still instantiates
  // as a copy.
  const base = folderName.replace(/(\.(asaps|asapst|zip))+$/i, '') || 'project';
  return new File([blob], `${base}.asaps.zip`, { type: 'application/zip' });
}

/**
 * Walk a dropped directory via the FileSystemEntry API (drag-and-drop in
 * every engine, including Electron's renderer).
 */
export async function collectDroppedDirectory(
  dirEntry: FileSystemDirectoryEntry,
): Promise<FolderEntryFile[]> {
  const out: FolderEntryFile[] = [];

  const readAll = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => {
      // readEntries returns results in batches; drain until empty.
      const acc: FileSystemEntry[] = [];
      const step = () => reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(acc);
        acc.push(...batch);
        step();
      }, reject);
      step();
    });

  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: `${prefix}${entry.name}`, read: async () => file });
    } else if (entry.isDirectory) {
      const entries = await readAll((entry as FileSystemDirectoryEntry).createReader());
      for (const child of entries) {
        await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };

  const children = await readAll(dirEntry.createReader());
  for (const child of children) await walk(child, '');
  return out;
}

/**
 * Walk a filesystem directory via the Electron bridge — the fallback when
 * "Open Project Folder" is pointed at an unzipped export instead of a
 * directory-format project.
 */
export async function collectElectronDirectory(dirPath: string): Promise<FolderEntryFile[]> {
  const api = (window as any).electronAPI;
  if (!api?.fs?.readDir || !api?.fs?.readFile) {
    throw new Error('Electron filesystem bridge not available');
  }
  const out: FolderEntryFile[] = [];
  const walk = async (abs: string, prefix: string): Promise<void> => {
    const entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }> =
      await api.fs.readDir(abs);
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childAbs = `${abs}/${e.name}`;
      if (e.isDirectory) {
        await walk(childAbs, `${prefix}${e.name}/`);
      } else if (e.isFile) {
        out.push({
          path: `${prefix}${e.name}`,
          read: async () => {
            const buf = await api.fs.readFile(childAbs);
            return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
          },
        });
      }
    }
  };
  await walk(dirPath, '');
  return out;
}

/**
 * Wrap a BARE monolithic project.json — the zip's payload without the zip —
 * into an importable in-memory zip. Safari unzips downloads into folders
 * (handled by the folder paths above), but a project.json also travels
 * alone: extracted by hand, pulled from a repo, or exported by a tool.
 * Returns null when the JSON isn't a project export (caller keeps its own
 * messaging); assets referenced by the story will be missing and the
 * importer's existing missing-asset flow reports them.
 */
export async function wrapBareProjectJson(file: File): Promise<File | null> {
  let parsed: any;
  try {
    // FileReader instead of Blob.text() — the latter is missing in some
    // embedders (and jsdom test envs); the reader path works everywhere.
    const text = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.project || !parsed.metadata) return null;
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(parsed));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const base = (parsed.project.name || file.name.replace(/\.project\.json$|\.json$/i, '') || 'project')
    .replace(/[/\\:*?"<>|]/g, ' ').trim() || 'project';
  return new File([blob], `${base}.asaps.zip`, { type: 'application/zip' });
}
