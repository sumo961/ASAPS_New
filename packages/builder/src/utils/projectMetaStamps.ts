/**
 * project.json carries two stamps that change without the project changing:
 * `modifiedAt` (every save) and `savedWith` (the app version). Writing them
 * on every save made project.json "modified" right after opening a project,
 * and Git then refused teammates' pulls: "Your local changes to the
 * following files would be overwritten by merge: project.json" (group
 * report, 2026-10-21; one group re-created their repository over it).
 */
import { deterministicStringify } from '@asaps/core';
import { isNewerVersion } from './appVersion';

const STAMPS = ['modifiedAt', 'savedWith'];

function withoutStamps(text: string): string | null {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') return null;
    for (const key of STAMPS) delete data[key];
    return deterministicStringify(data);
  } catch {
    return null;
  }
}

function savedWithOf(text: string): string {
  try { return String(JSON.parse(text)?.savedWith ?? ''); } catch { return ''; }
}

/**
 * True when two project.json texts differ in their stamps at most — and the
 * second (the one about to be written) doesn't carry a NEWER `savedWith`.
 * A newer ASAPS still stamps the project once, so an older one opening it
 * can warn before its save strips what the newer one added (bullying-IDN,
 * 2026-10-20: an outdated copy removed every "continue" step from the
 * group's dialogs). Once per version, so it can't keep a project "modified".
 */
export function onlyStampsDiffer(a: string, b: string, opts: { ignoreVersionBump?: boolean } = {}): boolean {
  const left = withoutStamps(a);
  if (left === null || left !== withoutStamps(b)) return false;
  if (opts.ignoreVersionBump) return true;
  const was = savedWithOf(a);
  const now = savedWithOf(b);
  return !(now && (!was || isNewerVersion(now, was)));
}

/**
 * The project.json text to write, keeping the higher `savedWith` of the two:
 * an older ASAPS saving a real change must not lower the stamp, or the next
 * older copy would no longer be warned.
 */
export function keepNewestSavedWith(existing: string, next: string): string {
  const was = savedWithOf(existing);
  const now = savedWithOf(next);
  if (!was || !now || !isNewerVersion(was, now)) return next;
  try {
    return deterministicStringify({ ...JSON.parse(next), savedWith: was });
  } catch {
    return next;
  }
}
