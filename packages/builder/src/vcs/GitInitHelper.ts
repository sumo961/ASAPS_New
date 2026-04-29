/**
 * Helpers for the "create a fresh git repo + first commit" flow used by both
 * the New-Project-on-GitHub dialog and the VCS onboarding panel's
 * Create/Connect forms.
 *
 * Two issues these helpers paper over (root causes for bug reports of
 * "git init failed" / "unable to auto-detect email address"):
 *
 * 1. `git init -b main` requires Git 2.28+ (Aug 2020). Older Git binaries
 *    (some Linux distros, locked-down corporate macOS) fail with
 *    "unknown switch 'b'", which surfaces as "git init failed". We use
 *    `-c init.defaultBranch=main` (silently no-ops on old Git) and rename
 *    HEAD to refs/heads/main as a portable fallback.
 *
 * 2. `gh auth login` only sets up GitHub credentials for HTTPS pushes;
 *    `git commit` needs `user.name` / `user.email`, a separate git-level
 *    identity that's empty on a fresh machine. We query `gh api user`
 *    and write the values into the LOCAL repo (never --global) so the
 *    first commit succeeds without us mutating machine-wide git config.
 */

export type RunCmd = (
  cmd: string,
  args: string[],
  cwd?: string,
  timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * Run `git init` portably (handles pre-2.28 Git) and ensure HEAD → refs/heads/main.
 * Throws on failure with a user-actionable message.
 *
 * Skip detection: we ONLY skip init when `projectPath` is itself the root of a
 * git repo. We must not skip when a parent / ancestor is a repo (a common case
 * if the user keeps projects under a synced folder that happens to be a repo,
 * or anywhere under another checkout) — otherwise `gh repo create --source=.`
 * later fails with "current directory is not a git repository". Checking
 * `git rev-parse --is-inside-work-tree` here was the bug — that command walks
 * upward and returns true for any descendant of a repo. Compare
 * `--show-toplevel` against `projectPath` instead.
 */
export async function ensureGitRepo(
  runCmd: RunCmd,
  projectPath: string,
  append: (s: string) => void,
): Promise<void> {
  const exec = async (cmd: string, args: string[]) => {
    append(`$ ${cmd} ${args.join(' ')}\n`);
    const r = await runCmd(cmd, args, projectPath, 60000);
    if (r.stdout) append(r.stdout);
    if (r.stderr) append(r.stderr);
    append('\n');
    return r;
  };

  // `--show-toplevel` returns the absolute path of the working tree's root,
  // or non-zero if not inside any repo. Skip init only when that root matches
  // our project folder.
  const top = await runCmd('git', ['rev-parse', '--show-toplevel'], projectPath, 5000);
  if (top.exitCode === 0) {
    // git resolves symlinks and uses platform-native separators — compare via
    // resolved trailing-slash trimmed strings.
    const resolvedTop = (top.stdout || '').trim().replace(/[/\\]+$/, '');
    const resolvedProject = projectPath.replace(/[/\\]+$/, '');
    if (resolvedTop === resolvedProject) return;
    // Else: an ancestor is a repo — we still need to init this folder.
    append(`Note: ancestor folder is a git repo (${resolvedTop}); initialising a fresh repo in ${resolvedProject}.\n`);
  }

  const init = await exec('git', ['-c', 'init.defaultBranch=main', 'init']);
  if (init.exitCode !== 0) {
    throw new Error('git init failed — check that Git is installed and on PATH.');
  }
  // Force the default branch to `main` (no-op on Git ≥ 2.28 with the init.defaultBranch
  // hint above; required on older Git which still creates `master`).
  await exec('git', ['symbolic-ref', 'HEAD', 'refs/heads/main']);
}

/**
 * If the local git config is missing user.name or user.email, populate them
 * from `gh api user` so the first commit doesn't fail with "unable to
 * auto-detect email address". Writes to the LOCAL repo only — never --global.
 */
export async function ensureLocalGitIdentity(
  runCmd: RunCmd,
  projectPath: string,
  append: (s: string) => void,
): Promise<void> {
  const haveName = await runCmd('git', ['config', 'user.name'], projectPath, 5000);
  const haveEmail = await runCmd('git', ['config', 'user.email'], projectPath, 5000);
  const needsName = haveName.exitCode !== 0 || !haveName.stdout.trim();
  const needsEmail = haveEmail.exitCode !== 0 || !haveEmail.stdout.trim();
  if (!needsName && !needsEmail) return;

  append('Setting local git identity from your GitHub account...\n');
  const ghUser = await runCmd('gh', ['api', 'user'], projectPath, 10000);
  if (ghUser.exitCode !== 0) {
    append('Could not fetch your GitHub identity (gh api user failed).\n');
    return;
  }

  let userInfo: { name?: string; login?: string; email?: string | null; id?: number };
  try {
    userInfo = JSON.parse(ghUser.stdout);
  } catch (parseErr) {
    append(`Could not parse 'gh api user' response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\n`);
    return;
  }

  const ghName = userInfo.name || userInfo.login;
  // GitHub returns null email when the user has set their email private —
  // fall back to the noreply form GitHub provides for that case.
  const ghEmail = userInfo.email
    || (userInfo.id && userInfo.login
      ? `${userInfo.id}+${userInfo.login}@users.noreply.github.com`
      : null);

  const setIfMissing = async (key: string, value: string | null | undefined) => {
    if (!value) return;
    append(`$ git config ${key} ${value}\n`);
    const r = await runCmd('git', ['config', key, String(value)], projectPath, 5000);
    if (r.stderr) append(r.stderr);
    append('\n');
  };

  if (needsName) await setIfMissing('user.name', ghName);
  if (needsEmail) await setIfMissing('user.email', ghEmail);
}

/**
 * Stage and commit the project's initial commit. Caller is responsible for
 * having set up the repo and identity (use ensureGitRepo + ensureLocalGitIdentity).
 * Throws with a user-actionable message if the commit fails.
 */
export async function makeInitialCommit(
  runCmd: RunCmd,
  projectPath: string,
  append: (s: string) => void,
  message = 'Initial commit from ASAPS Builder',
): Promise<void> {
  const exec = async (cmd: string, args: string[]) => {
    append(`$ ${cmd} ${args.join(' ')}\n`);
    const r = await runCmd(cmd, args, projectPath, 60000);
    if (r.stdout) append(r.stdout);
    if (r.stderr) append(r.stderr);
    append('\n');
    return r;
  };

  // Skip only if HEAD already exists IN THIS REPO. `git log -1` walks up the
  // tree the same way `--is-inside-work-tree` does, so we'd skip the initial
  // commit if any ancestor folder happens to be a repo — wrong. Compare
  // --show-toplevel to projectPath first; only then check for an existing HEAD.
  const top = await runCmd('git', ['rev-parse', '--show-toplevel'], projectPath, 5000);
  const resolvedTop = (top.stdout || '').trim().replace(/[/\\]+$/, '');
  const resolvedProject = projectPath.replace(/[/\\]+$/, '');
  if (top.exitCode === 0 && resolvedTop === resolvedProject) {
    const log1 = await runCmd('git', ['log', '-1', '--oneline'], projectPath, 5000);
    if (log1.exitCode === 0) return;
  }

  await exec('git', ['add', '-A']);
  const c = await exec('git', ['commit', '-m', message]);
  if (c.exitCode !== 0) {
    throw new Error(
      'Initial commit failed. Could not auto-detect a git identity from your GitHub account, ' +
      'and no global user.name / user.email is set. Run:\n' +
      '  git config --global user.name "Your Name"\n' +
      '  git config --global user.email "you@example.com"\n' +
      'and try again.',
    );
  }
}

/**
 * Convenience wrapper — runs all three steps in order. Used by the
 * Create-new-repo flow where we always want repo + identity + commit.
 */
export async function ensureGitRepoAndCommit(
  runCmd: RunCmd,
  projectPath: string,
  append: (s: string) => void,
  commitMessage = 'Initial commit from ASAPS Builder',
): Promise<void> {
  await ensureGitRepo(runCmd, projectPath, append);
  await ensureLocalGitIdentity(runCmd, projectPath, append);
  await makeInitialCommit(runCmd, projectPath, append, commitMessage);
}
