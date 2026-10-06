import { describe, it, expect } from 'vitest';
import { win32 } from 'path';
import {
  windowsToolCandidates,
  windowsToolDirs,
  expandWindowsEnv,
  parseRegPath,
  mergePathEntries,
  toolNotFoundMessage,
} from '../toolPaths';

const env = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local',
  USERPROFILE: 'C:\\Users\\ana',
  ProgramData: 'C:\\ProgramData',
  SystemRoot: 'C:\\Windows',
};

describe('windowsToolCandidates', () => {
  it('knows where the GitHub CLI installers put gh.exe', () => {
    const c = windowsToolCandidates('gh', env, win32.join);
    expect(c[0]).toBe('C:\\Program Files\\GitHub CLI\\gh.exe');
    expect(c).toContain('C:\\Users\\ana\\AppData\\Local\\Programs\\GitHub CLI\\gh.exe');
    expect(c).toContain('C:\\Users\\ana\\AppData\\Local\\Microsoft\\WinGet\\Links\\gh.exe');
    expect(c).toContain('C:\\Users\\ana\\scoop\\shims\\gh.exe');
    expect(c).toContain('C:\\ProgramData\\chocolatey\\bin\\gh.exe');
  });

  it('keeps the Git for Windows locations', () => {
    expect(windowsToolCandidates('git', env, win32.join)[0]).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
  });

  it('skips per-user folders when their variables are missing', () => {
    const c = windowsToolCandidates('gh', { ProgramFiles: 'D:\\Apps' }, win32.join);
    expect(c[0]).toBe('D:\\Apps\\GitHub CLI\\gh.exe');
    expect(c.every(p => !p.startsWith('\\'))).toBe(true);
  });

  it('has no candidates for other commands', () => {
    expect(windowsToolCandidates('npm', env, win32.join)).toEqual([]);
  });
});

describe('windowsToolDirs', () => {
  it('lists each folder once', () => {
    const dirs = windowsToolDirs(env, win32.join);
    expect(dirs).toContain('C:\\Program Files\\GitHub CLI');
    expect(dirs).toContain('C:\\Program Files\\Git\\cmd');
    expect(dirs.filter(d => d === 'C:\\Users\\ana\\scoop\\shims')).toHaveLength(1);
  });
});

describe('registry PATH', () => {
  it('expands %VAR% case-insensitively and leaves unknown ones', () => {
    expect(expandWindowsEnv('%systemroot%\\system32;%NOPE%\\x', env)).toBe('C:\\Windows\\system32;%NOPE%\\x');
  });

  it('reads the Path value from reg query output', () => {
    const out = '\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %LOCALAPPDATA%\\Microsoft\\WindowsApps;C:\\Program Files\\GitHub CLI\\\r\n\r\n';
    expect(parseRegPath(out, env)).toBe('C:\\Users\\ana\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Program Files\\GitHub CLI\\');
  });

  it('returns an empty string without a Path line', () => {
    expect(parseRegPath('ERROR: The system was unable to find the specified registry key or value.', env)).toBe('');
  });

  it('merges PATH lists keeping order and dropping duplicates', () => {
    expect(mergePathEntries([['C:\\A', 'c:\\b'], ['C:\\B', '', 'C:\\C']], true)).toEqual(['C:\\A', 'c:\\b', 'C:\\C']);
    expect(mergePathEntries([['/a', '/b'], ['/B']], false)).toEqual(['/a', '/b', '/B']);
  });
});

describe('toolNotFoundMessage', () => {
  it('names the right download for each tool', () => {
    expect(toolNotFoundMessage('gh')).toContain('cli.github.com');
    expect(toolNotFoundMessage('git')).toContain('git-scm.com');
  });
});
