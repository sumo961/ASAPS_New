/**
 * Share GitHub Project — Export ▸ Share for editing (desktop, GitHub remote).
 *
 * GitHub has no shareable invite link for one repository, so this does the
 * two things that exist: invite a collaborator by GitHub username (GitHub
 * emails them; they get write access) and copy a ready-to-send message with
 * the repository link and the one step in ASAPS. For a public repository the
 * invitation is optional — the link alone gives read access.
 *
 * Runs `git` / `gh` through the desktop app's command bridge, the same way
 * the New GitHub Project dialog does.
 */

import React, { useEffect, useState } from 'react';
import { X, Github, Copy, Send, Check } from 'lucide-react';
import { notify, errorMessage } from '../../utils/notify';
import {
  parseGitHubRemote,
  isValidGitHubUsername,
  buildShareMessage,
  repoWebUrl,
  type GitHubRepo,
} from '../../utils/githubShare';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  storyTitle: string;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; detail?: string }
  | { kind: 'ready'; repo: GitHubRepo; visibility: 'PUBLIC' | 'PRIVATE' | 'INTERNAL' | string; canInvite: boolean };

type Run = (cmd: string, args: string[], cwd?: string, timeout?: number) =>
  Promise<{ exitCode: number; stdout: string; stderr: string }>;

function runner(): Run | null {
  return (window as any).electronAPI?.fs?.runCommand ?? null;
}

export const ShareGitHubDialog: React.FC<Props> = ({ isOpen, onClose, projectPath, storyTitle }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPhase({ kind: 'loading' });
    setInvited(null);
    setCopied(false);
    setUsername('');
    const run = runner();
    if (!run) {
      setPhase({ kind: 'error', message: 'Sharing a GitHub project needs the desktop app.' });
      return;
    }
    (async () => {
      const remote = await run('git', ['remote', 'get-url', 'origin'], projectPath, 10000);
      const repo = remote.exitCode === 0 ? parseGitHubRemote(remote.stdout) : null;
      if (!repo) {
        setPhase({
          kind: 'error',
          message: 'This project is not connected to a GitHub repository.',
          detail: remote.stdout.trim() || remote.stderr.trim() || undefined,
        });
        return;
      }
      const view = await run('gh', ['repo', 'view', `${repo.owner}/${repo.repo}`, '--json', 'visibility,viewerPermission'], projectPath, 20000);
      if (view.exitCode !== 0) {
        // gh missing or signed out: still useful — the link can be shared.
        setPhase({ kind: 'ready', repo, visibility: 'UNKNOWN', canInvite: false });
        return;
      }
      try {
        const info = JSON.parse(view.stdout) as { visibility?: string; viewerPermission?: string };
        setPhase({
          kind: 'ready',
          repo,
          visibility: info.visibility ?? 'UNKNOWN',
          canInvite: info.viewerPermission === 'ADMIN',
        });
      } catch {
        setPhase({ kind: 'ready', repo, visibility: 'UNKNOWN', canInvite: false });
      }
    })().catch((err) => setPhase({ kind: 'error', message: 'Could not read the project’s GitHub connection.', detail: errorMessage(err) }));
  }, [isOpen, projectPath]);

  if (!isOpen) return null;

  const copyMessage = async (repo: GitHubRepo, wasInvited: boolean) => {
    const text = buildShareMessage({ repo, storyTitle, invited: wasInvited });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify.success('Share message copied — paste it into an email or chat.');
    } catch (err) {
      notify.error('Could not copy to the clipboard.', { detail: errorMessage(err) });
    }
  };

  const invite = async (repo: GitHubRepo) => {
    const run = runner();
    const user = username.trim().replace(/^@/, '');
    if (!run || !isValidGitHubUsername(user)) return;
    setBusy(true);
    try {
      const r = await run('gh', ['api', '-X', 'PUT', `repos/${repo.owner}/${repo.repo}/collaborators/${user}`, '-f', 'permission=push'], projectPath, 30000);
      if (r.exitCode !== 0) {
        const msg = (r.stderr || r.stdout).trim();
        notify.error(`Could not invite ${user}.`, {
          detail: /404|Not Found/i.test(msg) ? `GitHub has no user called "${user}".` : msg || undefined,
        });
        return;
      }
      setInvited(user);
      await copyMessage(repo, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="share-gh-title" className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 id="share-gh-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Github className="w-5 h-5" /> Share GitHub project
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-sm">
          {phase.kind === 'loading' && <p className="text-gray-500">Reading the project’s GitHub connection…</p>}

          {phase.kind === 'error' && (
            <div>
              <p className="text-gray-800">{phase.message}</p>
              {phase.detail && <p className="text-xs text-gray-500 mt-1 break-all">{phase.detail}</p>}
              <p className="text-xs text-gray-500 mt-2">
                To share for editing without GitHub, use Export → Project file (.asaps).
              </p>
            </div>
          )}

          {phase.kind === 'ready' && (
            <>
              <p className="text-gray-700">
                <a href={repoWebUrl(phase.repo)} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                  {phase.repo.owner}/{phase.repo.repo}
                </a>
                {phase.visibility === 'PUBLIC' && <span className="ml-2 text-xs text-gray-500">public</span>}
                {phase.visibility === 'PRIVATE' && <span className="ml-2 text-xs text-gray-500">private</span>}
              </p>

              {phase.canInvite ? (
                <div className="space-y-2">
                  <label htmlFor="gh-user" className="block font-medium text-gray-800">Invite a collaborator</label>
                  <p className="text-xs text-gray-500">
                    GitHub has no invite link for a single project, so the invitation goes to a GitHub username; GitHub emails
                    them. They can then open, change and push the story.
                  </p>
                  <div className="flex gap-2">
                    <input
                      id="gh-user"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="GitHub username"
                      className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => { if (e.key === 'Enter') void invite(phase.repo); }}
                    />
                    <button
                      type="button"
                      disabled={busy || !isValidGitHubUsername(username.trim().replace(/^@/, ''))}
                      onClick={() => void invite(phase.repo)}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Send className="w-4 h-4" /> {busy ? 'Inviting…' : 'Invite'}
                    </button>
                  </div>
                  {invited && (
                    <p className="text-xs text-green-700 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Invitation sent to {invited}; the message for them is on your clipboard.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  {phase.visibility === 'UNKNOWN'
                    ? 'Inviting collaborators needs the GitHub command-line tool, signed in (see Version Control). You can still share the link.'
                    : 'Only the repository’s owner or an admin can invite collaborators. You can still share the link.'}
                </p>
              )}

              <div className="pt-3 border-t">
                <button
                  type="button"
                  onClick={() => void copyMessage(phase.repo, !!invited)}
                  className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  Copy link and instructions
                </button>
                <p className="text-xs text-gray-500 mt-1.5">
                  {phase.visibility === 'PUBLIC'
                    ? 'The repository is public: anyone with the link can open the story. To send changes back, they need an invitation.'
                    : 'Recipients also need an invitation to open a private repository.'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
