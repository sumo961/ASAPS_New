/**
 * Finding git and the GitHub CLI on Windows.
 *
 * A GUI app keeps the PATH it was started with. Installing a tool while
 * ASAPS is open (the onboarding panel tells people to install, then click
 * "Re-check") changes the user's PATH in the registry, not ours, so the tool
 * stayed "not installed" until a restart — and installers that don't touch
 * PATH at all (portable winget links, scoop shims) were never found. Two
 * remedies, both pure here so they can be tested without Electron:
 *
 *  - the usual install locations of each tool, tried first;
 *  - the current PATH from the registry (`parseRegPath`), re-read by the
 *    caller when a command isn't found.
 */

type Env = Record<string, string | undefined>;

/** Candidate executables for a tool, in the order the installers use them. */
export function windowsToolCandidates(command: string, env: Env, join: (...p: string[]) => string): string[] {
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = env.LOCALAPPDATA || '';
  const userProfile = env.USERPROFILE || '';
  const programData = env.ProgramData || 'C:\\ProgramData';
  const exe = `${command}.exe`;

  const dirs: string[] = command === 'git'
    ? [
        join(programFiles, 'Git', 'cmd'),
        join(programFilesX86, 'Git', 'cmd'),
        localAppData && join(localAppData, 'Programs', 'Git', 'cmd'),
        join(programFiles, 'Git', 'bin'),
        userProfile && join(userProfile, 'scoop', 'shims'),
      ]
    : command === 'gh'
      ? [
          // MSI / winget (machine and per-user scope)
          join(programFiles, 'GitHub CLI'),
          join(programFilesX86, 'GitHub CLI'),
          localAppData && join(localAppData, 'Programs', 'GitHub CLI'),
          // winget portable installs link here
          localAppData && join(localAppData, 'Microsoft', 'WinGet', 'Links'),
          userProfile && join(userProfile, 'scoop', 'shims'),
          join(programData, 'chocolatey', 'bin'),
        ]
      : [];
  return dirs.filter(Boolean).map(d => join(d, exe));
}

/** Directories worth adding to PATH for the tools ASAPS runs. */
export function windowsToolDirs(env: Env, join: (...p: string[]) => string): string[] {
  const all = [...windowsToolCandidates('git', env, join), ...windowsToolCandidates('gh', env, join)];
  return [...new Set(all.map(p => p.slice(0, p.lastIndexOf('\\'))))];
}

/** Expand %VAR% references (REG_EXPAND_SZ values), case-insensitively. */
export function expandWindowsEnv(value: string, env: Env): string {
  const lower: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) lower[k.toLowerCase()] = v;
  return value.replace(/%([^%]+)%/g, (m, name: string) => lower[name.toLowerCase()] ?? m);
}

/**
 * The `Path` value from `reg query <key> /v Path` output, expanded.
 * Returns '' when the output has no Path line.
 */
export function parseRegPath(output: string, env: Env): string {
  const line = output.split(/\r?\n/).find(l => /^\s*Path\s+REG_(EXPAND_)?SZ\s+/i.test(l));
  if (!line) return '';
  const value = line.replace(/^\s*Path\s+REG_(EXPAND_)?SZ\s+/i, '').trim();
  return expandWindowsEnv(value, env);
}

/** PATH entries in order, without duplicates (case-insensitive on Windows). */
export function mergePathEntries(lists: string[][], caseInsensitive: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const entry = raw.trim();
      if (!entry) continue;
      const key = caseInsensitive ? entry.toLowerCase() : entry;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

/** What to tell the user when a tool can't be found. */
export function toolNotFoundMessage(command: string): string {
  if (command === 'gh') {
    return 'The GitHub CLI (gh) was not found.\n\nInstall it from https://cli.github.com, then click Re-check. ' +
      'If it is already installed, check that "gh --version" works in a new Command Prompt or terminal.';
  }
  if (command === 'git') {
    return 'Git was not found.\n\nPlease install Git for Windows from https://git-scm.com/download/win, then click Re-check.';
  }
  return `${command} is not installed or not found on PATH.`;
}
