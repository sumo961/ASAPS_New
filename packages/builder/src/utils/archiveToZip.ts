/**
 * Theme archives in RAR or 7z (2026-10-28: Ren'Py GUI kits are often shared
 * that way). The importer reads ZIPs, so these are unpacked with libarchive
 * (WebAssembly, in a worker) and packed again into a ZIP in memory; from
 * there the import is the same as for a ZIP.
 */
import JSZip from 'jszip';
import libarchiveWorkerUrl from 'libarchive.js/dist/worker-bundle.js?worker&url';

/** File types the theme importer takes. */
export const THEME_ARCHIVE_ACCEPT = '.zip,.rar,.7z,application/zip,application/x-rar-compressed,application/vnd.rar,application/x-7z-compressed';

export interface ArchiveEntry {
  /** Folder inside the archive, '' or ending in '/' */
  path: string;
  file: Blob & { name: string };
}

/** Unpacks an archive into its files (libarchive in the browser by default). */
export type ArchiveOpener = (archive: File) => Promise<{ encrypted: boolean; entries: ArchiveEntry[] }>;

const openWithLibarchive: ArchiveOpener = async (archive) => {
  const { Archive } = await import('libarchive.js');
  Archive.init({ getWorker: () => new Worker(libarchiveWorkerUrl, { type: 'module' }) });
  const opened = await Archive.open(archive);
  if (await opened.hasEncryptedData()) return { encrypted: true, entries: [] };
  // After extractFiles the listing holds the unpacked files.
  await opened.extractFiles();
  const listed = (await opened.getFilesArray()) as Array<{ file: File; path: string }>;
  return { encrypted: false, entries: listed.map(({ path, file }) => ({ path, file })) };
};

export function isZipArchive(name: string): boolean {
  return /\.zip$/i.test(name);
}

/**
 * The archive as a ZIP: a ZIP as it is; a RAR or 7z unpacked and packed
 * again under the same name with .zip.
 */
export async function archiveToZip(archive: File, open: ArchiveOpener = openWithLibarchive): Promise<File> {
  if (isZipArchive(archive.name)) return archive;
  if (!/\.(rar|7z)$/i.test(archive.name)) {
    throw new Error(`${archive.name} is not a ZIP, RAR or 7z archive.`);
  }
  let result: Awaited<ReturnType<ArchiveOpener>>;
  try {
    result = await open(archive);
  } catch (err) {
    throw new Error(`${archive.name} could not be unpacked${err instanceof Error && err.message ? ` (${err.message})` : ''}. Unpack it and import the folder as a ZIP instead.`);
  }
  if (result.encrypted) {
    throw new Error(`${archive.name} is password-protected. Unpack it with its password and import the folder as a ZIP.`);
  }
  const zip = new JSZip();
  for (const { path, file } of result.entries) {
    zip.file(`${path}${file.name}`, file);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], archive.name.replace(/\.(rar|7z)$/i, '.zip'), { type: 'application/zip' });
}
