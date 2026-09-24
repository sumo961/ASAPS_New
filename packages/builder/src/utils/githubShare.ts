/**
 * Share a GitHub-backed project (Export ▸ Share for editing).
 *
 * GitHub has no shareable invite LINK for a single repository — an
 * invitation is always addressed to a GitHub username and GitHub emails it.
 * So sharing is: (1) invite the collaborator by username (private or public
 * repos, for write access), (2) hand them a ready-to-send message with the
 * repository link and the one step in ASAPS. Public repositories can skip
 * the invitation when read access is enough.
 */

export interface GitHubRepo {
  owner: string;
  repo: string;
}

/**
 * Parse `git remote get-url origin` output. Accepts https
 * (github.com/owner/repo(.git)), ssh (git@github.com:owner/repo.git) and
 * ssh:// forms; returns null for anything that isn't GitHub.
 */
export function parseGitHubRemote(url: string | null | undefined): GitHubRepo | null {
  if (!url) return null;
  const trimmed = url.trim();
  const m =
    trimmed.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i) ||
    trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i) ||
    trimmed.match(/^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/** GitHub usernames: 1–39 chars, alphanumerics or single hyphens, not at the ends. */
export function isValidGitHubUsername(name: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(name.trim());
}

export function repoWebUrl(r: GitHubRepo): string {
  return `https://github.com/${r.owner}/${r.repo}`;
}

/** The message the author sends — copied to the clipboard. */
export function buildShareMessage(opts: {
  repo: GitHubRepo;
  storyTitle: string;
  invited: boolean;
}): string {
  const url = repoWebUrl(opts.repo);
  const lines = [`Here's the ASAPS story "${opts.storyTitle}" to work on together:`, ''];
  let step = 1;
  if (opts.invited) {
    lines.push(`${step++}. Accept the GitHub invitation (it's in your email, or at ${url}/invitations).`);
  }
  lines.push(`${step++}. In ASAPS Builder choose File → Open Project from GitHub… and paste:`);
  lines.push(`   ${url}.git`);
  lines.push('');
  lines.push('Your changes come back to me when you Save a version and Push (Version Control panel).');
  return lines.join('\n');
}
