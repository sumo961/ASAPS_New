import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildBugReportUrl,
  formatEnvironment,
  formatVersion,
  BUG_REPORT_TEMPLATE,
  ISSUES_REPO_URL,
  type BugReportEnvironment,
} from '../bugReport';

const mac: BugReportEnvironment = {
  appVersion: '0.9.101',
  buildNumber: 162,
  packaged: true,
  platform: 'darwin',
  osVersion: '26.6.2',
  arch: 'arm64',
  translated: false,
  electron: '43.3.0',
  chrome: '150.0.7871.46',
  node: '24.17.0',
  locale: 'de-DE',
};

describe('formatVersion', () => {
  it('matches the header form version.build', () => {
    expect(formatVersion(mac)).toBe('0.9.101.162');
  });
  it('omits a missing / zero build and marks dev runs', () => {
    expect(formatVersion({ appVersion: '0.9.101', buildNumber: 0, packaged: true })).toBe('0.9.101');
    expect(formatVersion({ appVersion: '0.9.101', packaged: false })).toBe('0.9.101 (dev)');
  });
});

describe('formatEnvironment', () => {
  it('names the OS, architecture and runtime versions', () => {
    expect(formatEnvironment(mac)).toBe(
      'ASAPS Builder: 0.9.101.162\n' +
        'OS: macOS 26.6.2 (arm64)\n' +
        'Electron: 43.3.0 · Chromium: 150.0.7871.46 · Node: 24.17.0\n' +
        'Locale: de-DE',
    );
  });
  it('flags a translated (Rosetta / emulated) x64 build and handles Windows', () => {
    const win = { ...mac, platform: 'win32', osVersion: '10.0.26100', arch: 'x64', translated: true, locale: undefined };
    const text = formatEnvironment(win);
    expect(text).toContain('OS: Windows 10.0.26100 (x64 (translated — Rosetta / emulation))');
    expect(text).not.toContain('Locale');
  });
});

describe('buildBugReportUrl', () => {
  it('targets the bug-report issue form with label and prefilled fields', () => {
    const url = new URL(buildBugReportUrl(mac));
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUES_REPO_URL}/issues/new`);
    expect(url.searchParams.get('template')).toBe(BUG_REPORT_TEMPLATE);
    expect(url.searchParams.get('labels')).toBe('bug');
    expect(url.searchParams.get('version')).toBe('0.9.101.162');
    expect(url.searchParams.get('environment')).toBe(formatEnvironment(mac));
    // the title is the reporter's to write
    expect(url.searchParams.has('title')).toBe(false);
  });

  it('carries nothing beyond the environment summary', () => {
    const url = new URL(buildBugReportUrl(mac));
    expect([...url.searchParams.keys()].sort()).toEqual(['environment', 'labels', 'template', 'version']);
  });

  it('stays well under browser / GitHub URL limits', () => {
    expect(buildBugReportUrl(mac).length).toBeLessThan(1000);
  });

  // Issue forms prefill a field from the query parameter named after its id —
  // a renamed field id in the YAML silently stops the prefill. Tripwire.
  it('uses field ids that exist in .github/ISSUE_TEMPLATE/bug_report.yml', () => {
    const yml = readFileSync(
      resolve(__dirname, '../../../../../.github/ISSUE_TEMPLATE', BUG_REPORT_TEMPLATE),
      'utf-8',
    );
    expect(yml).toMatch(/^\s+id: version$/m);
    expect(yml).toMatch(/^\s+id: environment$/m);
    expect(yml).toMatch(/^labels: \["bug"\]$/m);
  });
});
