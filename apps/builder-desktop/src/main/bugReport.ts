/**
 * Help ▸ Report a Bug… — builds the GitHub "new issue" URL.
 *
 * Opens the repository's bug-report issue form (.github/ISSUE_TEMPLATE/
 * bug_report.yml) with the environment fields already filled in, so a
 * report arrives with the exact build, OS and runtime instead of "the
 * latest version on my Mac". GitHub issue forms prefill a field from a
 * query parameter named after the field's `id`.
 *
 * Nothing is sent by the app: the URL opens in the user's browser, where
 * they read, edit and submit (or abandon) the report themselves. Only the
 * environment summary below is included — never project content, story
 * text, file paths or API keys.
 *
 * Pure and Electron-free so it can be unit-tested; the caller gathers the
 * values from `app` / `process` / `os`.
 */

export const ISSUES_REPO_URL = 'https://github.com/sumo961/ASAPS_New';

/** File name of the issue form in .github/ISSUE_TEMPLATE/. */
export const BUG_REPORT_TEMPLATE = 'bug_report.yml';

export interface BugReportEnvironment {
  /** app.getVersion(), e.g. "0.9.101" */
  appVersion: string;
  /** CI build number from build-number.json; 0 / undefined for local builds */
  buildNumber?: number | string;
  /** false when running from the dev server (npm run dev) */
  packaged: boolean;
  /** process.platform */
  platform: string;
  /** Human OS version: process.getSystemVersion() — "26.6.2" on macOS, "10.0.26100" on Windows */
  osVersion: string;
  /** process.arch */
  arch: string;
  /** app.runningUnderARM64Translation — an x64 build under Rosetta / Windows-on-ARM emulation */
  translated?: boolean;
  electron: string;
  chrome: string;
  node: string;
  /** app.getLocale(), e.g. "de-DE" */
  locale?: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

/** "0.9.101.162" — the same form the app header shows. */
export function formatVersion(env: Pick<BugReportEnvironment, 'appVersion' | 'buildNumber' | 'packaged'>): string {
  const build = env.buildNumber !== undefined && `${env.buildNumber}` !== '' && `${env.buildNumber}` !== '0'
    ? `.${env.buildNumber}`
    : '';
  return `${env.appVersion}${build}${env.packaged ? '' : ' (dev)'}`;
}

/** Multi-line environment block for the issue's "Environment" field. */
export function formatEnvironment(env: BugReportEnvironment): string {
  const os = `${PLATFORM_NAMES[env.platform] ?? env.platform} ${env.osVersion}`.trim();
  const arch = env.translated ? `${env.arch} (translated — Rosetta / emulation)` : env.arch;
  const lines = [
    `ASAPS Builder: ${formatVersion(env)}`,
    `OS: ${os} (${arch})`,
    `Electron: ${env.electron} · Chromium: ${env.chrome} · Node: ${env.node}`,
  ];
  if (env.locale) lines.push(`Locale: ${env.locale}`);
  return lines.join('\n');
}

/**
 * The new-issue URL: bug-report form, `bug` label, and the version /
 * environment fields prefilled. The title is left for the reporter.
 */
export function buildBugReportUrl(env: BugReportEnvironment, repoUrl: string = ISSUES_REPO_URL): string {
  const params = new URLSearchParams({
    template: BUG_REPORT_TEMPLATE,
    labels: 'bug',
    version: formatVersion(env),
    environment: formatEnvironment(env),
  });
  return `${repoUrl.replace(/\/$/, '')}/issues/new?${params.toString()}`;
}
