/**
 * Which projects were BORN in this session — created, generated, injected,
 * or imported — as opposed to opened from the existing library.
 *
 * The storage-inversion rule on desktop: new projects silently become
 * folder-canonical at the default location (the GarageBand move), while
 * pre-existing library projects stay where they are until the author runs
 * the explicit migration. The line between "new" and "pre-existing" is
 * exactly this registry: creation paths mark ids here, and the adoption
 * hook in the save pipeline consumes them one-shot.
 *
 * Module-level on purpose — creation happens in PersistenceContext AND in
 * utilities outside React (zip import), and a context value can't reach the
 * latter.
 */

const bornThisSession = new Set<string>();

/** Mark a project as born in this session (create / generate / import). */
export function markProjectNew(projectId: string): void {
  bornThisSession.add(projectId);
}

/** One-shot check-and-consume: true exactly once per marked project. */
export function consumeProjectNew(projectId: string): boolean {
  if (!bornThisSession.has(projectId)) return false;
  bornThisSession.delete(projectId);
  return true;
}

/** Peek without consuming (for flows that must not burn the mark). */
export function isProjectNew(projectId: string): boolean {
  return bornThisSession.has(projectId);
}

/**
 * Folder-safe name for a project directory: strips characters no filesystem
 * accepts, collapses whitespace, sidesteps Windows reserved device names,
 * and never returns an empty string.
 */
export function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  if (!cleaned || WINDOWS_RESERVED.test(cleaned)) return `Project ${cleaned}`.trim();
  return cleaned;
}
