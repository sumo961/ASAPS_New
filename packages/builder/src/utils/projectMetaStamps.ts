/**
 * project.json carries two stamps that change without the project changing:
 * `modifiedAt` (every save) and `savedWith` (the app version). Writing them
 * on every save made project.json "modified" right after opening a project,
 * and Git then refused teammates' pulls: "Your local changes to the
 * following files would be overwritten by merge: project.json" (group
 * report, 2026-10-21; one group re-created their repository over it).
 */
import { deterministicStringify } from '@asaps/core';

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

/** True when two project.json texts differ in their stamps at most. */
export function onlyStampsDiffer(a: string, b: string): boolean {
  const left = withoutStamps(a);
  return left !== null && left === withoutStamps(b);
}
