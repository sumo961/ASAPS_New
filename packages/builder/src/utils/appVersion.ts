/**
 * The running ASAPS version, and how it compares with the version that last
 * saved a project. A group whose members run different versions rewrites
 * each other's files on every save (and an older app can drop what a newer
 * one wrote), so a project saved by a NEWER ASAPS gets a warning on open.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

function parts(v: string): number[] {
  return String(v).split('.').map((p) => parseInt(p, 10) || 0);
}

/** a > b, comparing dotted numbers ("0.9.124" > "0.9.123"). */
export function isNewerVersion(a: string, b: string): boolean {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** The author-facing warning when `savedWith` is newer than this app, else null. */
export function newerVersionWarning(savedWith: string | undefined, current: string = APP_VERSION): string | null {
  if (!savedWith || !isNewerVersion(savedWith, current)) return null;
  return `This project was last saved with ASAPS v${savedWith}, a newer version than yours (v${current}). `
    + 'This ASAPS will not save it, commit or push it: an older version drops or rewrites what the newer one saved, '
    + 'and in a group that shows up as beats changed or deleted. Update with Help ▸ Check for Updates…, then open the project again.';
}

/**
 * Thrown when an older ASAPS would write a project a newer one saved. Strict
 * on purpose (2026-10-21): a teammate's outdated copy removed every "then"
 * line and speaker look from a group's dialogs on save — refusing the write
 * is simpler and safer than teaching every version to keep what it doesn't know.
 */
export class NewerProjectError extends Error {
  constructor(public readonly savedWith: string) {
    super(newerVersionWarning(savedWith) ?? `This project was saved with ASAPS v${savedWith}; update ASAPS first.`);
    this.name = 'NewerProjectError';
  }
}
