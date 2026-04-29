/**
 * VCSOnboardingPanel — guided first-time GitHub setup.
 *
 * Renders one of four stages depending on detected state:
 *  1. Tools missing (git or gh) → install instructions, copy-paste commands
 *  2. Tools present, not authed → "Sign in to GitHub" via `gh auth login --web`
 *  3. Authed, no remote → "Create new repo" / "Connect existing repo" / "Skip"
 *  4. All set → small success card with username + remote URL (auto-dismisses)
 *
 * Replaces the regular VCS tabs while the user works through these stages.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { getInstallHints, type VCSToolsState } from '../../vcs/ToolsDetector';

interface Props {
  /** Project remote URL (already on origin). If null, we offer to create/connect a repo. */
  vcsRemoteUrl: string | null;
  /** Project name — used as the default GitHub repo name. */
  defaultRepoName: string;
  /** Project path on disk — needed for `gh repo create` and `git remote add`. */
  projectPath: string | null;
  /** Called after a remote is successfully wired up so the host refreshes VCS state. */
  onRemoteConfigured: (url: string) => void;
}

type Stage = 'tools-missing' | 'auth-needed' | 'remote-needed' | 'complete';

function chooseStage(tools: VCSToolsState | null, vcsRemoteUrl: string | null): Stage {
  if (!tools) return 'tools-missing'; // detection still in flight; avoid flicker by treating as missing
  if (!tools.git.present || !tools.gh.present) return 'tools-missing';
  if (!tools.ghAuth?.authenticated) return 'auth-needed';
  if (!vcsRemoteUrl) return 'remote-needed';
  return 'complete';
}

export const VCSOnboardingPanel: React.FC<Props> = ({ vcsRemoteUrl, defaultRepoName, projectPath, onRemoteConfigured }) => {
  const vcs = useVCSStatus();
  if (!vcs) return null;
  const stage = chooseStage(vcs.tools, vcsRemoteUrl);

  if (stage === 'tools-missing') return <ToolsMissingCard />;
  if (stage === 'auth-needed') return <AuthCard />;
  if (stage === 'remote-needed') {
    return (
      <RemoteSetupCard
        defaultRepoName={defaultRepoName}
        projectPath={projectPath}
        username={vcs.tools?.ghAuth?.username || null}
        onConfigured={onRemoteConfigured}
      />
    );
  }
  return null; // 'complete' — host shows normal panels
};

// ============================================================================
// Stage 1: tools missing
// ============================================================================

const ToolsMissingCard: React.FC = () => {
  const vcs = useVCSStatus();
  const hints = getInstallHints();
  if (!vcs) return null;
  const tools = vcs.tools;
  const open = (url: string) => {
    (window as unknown as { electronAPI?: { shell?: { openExternal: (u: string) => void } } }).electronAPI?.shell?.openExternal(url);
  };
  const copy = (text: string) => navigator.clipboard?.writeText(text);

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>GitHub setup — install required tools</h3>
      <p style={paragraphStyle}>
        ASAPS uses Git and the GitHub CLI to back up your project to GitHub. Install both, then click "Re-check".
      </p>
      <ul style={statusListStyle}>
        <StatusRow label="Git" status={tools?.git} />
        <StatusRow label="GitHub CLI (gh)" status={tools?.gh} />
      </ul>
      <div style={{ marginTop: 16 }}>
        <div style={subTitleStyle}>Install with {hints.manager}</div>
        <pre style={codeBoxStyle}>
          <code>{hints.bothCommand}</code>
          <button style={copyBtnStyle} onClick={() => copy(hints.bothCommand)}>Copy</button>
        </pre>
        <div style={smallNoteStyle}>
          Or download the installers directly:{' '}
          <a style={linkStyle} onClick={() => open(hints.gitDownloadUrl)}>Git</a>
          {' · '}
          <a style={linkStyle} onClick={() => open(hints.ghDownloadUrl)}>GitHub CLI</a>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={primaryBtnStyle} onClick={vcs.recheckTools} disabled={vcs.toolsChecking}>
          {vcs.toolsChecking ? 'Checking...' : 'Re-check'}
        </button>
      </div>
    </div>
  );
};

const StatusRow: React.FC<{ label: string; status: { present: boolean; version: string | null } | undefined }> = ({ label, status }) => (
  <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
    <span style={{ color: status?.present ? '#22c55e' : '#ef4444', width: 14, fontWeight: 700 }}>
      {status?.present ? '✓' : '✗'}
    </span>
    <span style={{ minWidth: 140, color: '#cbd5e1' }}>{label}</span>
    <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>
      {status?.present ? (status.version || 'installed') : 'not found'}
    </span>
  </li>
);

// ============================================================================
// Stage 2: gh auth login (streaming)
// ============================================================================

const AuthCard: React.FC = () => {
  const vcs = useVCSStatus();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const streamIdRef = useRef<string | null>(null);

  const startLogin = useCallback(async () => {
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    if (!api?.vcs?.runStreaming || !vcs) return;
    setRunning(true);
    setLog('');
    const streamId = `gh-auth-${Date.now()}`;
    streamIdRef.current = streamId;
    const offData = api.vcs.onStreamData(({ streamId: id, data }: any) => {
      if (id !== streamId) return;
      setLog((prev) => prev + data);
    });
    const offEnd = api.vcs.onStreamEnd(async ({ streamId: id }: any) => {
      if (id !== streamId) return;
      offData?.();
      offEnd?.();
      streamIdRef.current = null;
      setRunning(false);
      // Re-check auth state regardless of exit code so the UI reflects reality.
      await vcs.recheckTools();
    });
    await api.vcs.runStreaming(streamId, 'gh', ['auth', 'login', '--web', '--git-protocol', 'https', '--hostname', 'github.com']);
  }, [vcs]);

  const cancel = useCallback(async () => {
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    const id = streamIdRef.current;
    if (id && api?.vcs?.cancelStream) {
      await api.vcs.cancelStream(id);
    }
  }, []);

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>Sign in to GitHub</h3>
      <p style={paragraphStyle}>
        ASAPS will run <code style={inlineCodeStyle}>gh auth login</code> and open a browser window with a one-time code.
        Paste the code in the browser to authorise — then return here.
      </p>
      {!running ? (
        <button style={primaryBtnStyle} onClick={startLogin}>Sign in with GitHub</button>
      ) : (
        <div>
          <button style={secondaryBtnStyle} onClick={cancel}>Cancel sign-in</button>
          <pre style={logBoxStyle}>{log || 'Waiting for output...'}</pre>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Stage 3: create or connect repo
// ============================================================================

const RemoteSetupCard: React.FC<{
  defaultRepoName: string;
  projectPath: string | null;
  username: string | null;
  onConfigured: (url: string) => void;
}> = ({ defaultRepoName, projectPath, username, onConfigured }) => {
  const [mode, setMode] = useState<'create' | 'connect' | null>(null);
  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>Connect this project to GitHub</h3>
      {!mode && (
        <>
          <p style={paragraphStyle}>
            {username ? <>Signed in as <strong>{username}</strong>. </> : null}
            Choose how to set up the GitHub remote for this project.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <button style={primaryBtnStyle} onClick={() => setMode('create')}>
              Create a new GitHub repo
              <div style={btnSubStyle}>Best option — ASAPS creates an empty repo and pushes your project to it.</div>
            </button>
            <button style={secondaryBtnStyle} onClick={() => setMode('connect')}>
              Connect to an existing empty repo
              <div style={btnSubStyle}>Paste a repository URL you've already created on GitHub.</div>
            </button>
          </div>
        </>
      )}
      {mode === 'create' && (
        <CreateRepoForm
          defaultRepoName={defaultRepoName}
          projectPath={projectPath}
          username={username}
          onBack={() => setMode(null)}
          onConfigured={onConfigured}
        />
      )}
      {mode === 'connect' && (
        <ConnectRepoForm
          projectPath={projectPath}
          onBack={() => setMode(null)}
          onConfigured={onConfigured}
        />
      )}
    </div>
  );
};

const CreateRepoForm: React.FC<{
  defaultRepoName: string;
  projectPath: string | null;
  username: string | null;
  onBack: () => void;
  onConfigured: (url: string) => void;
}> = ({ defaultRepoName, projectPath, username, onBack, onConfigured }) => {
  // Sanitise the suggested name: GitHub disallows spaces and most punctuation.
  const sanitisedDefault = defaultRepoName.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'asaps-project';
  const [repoName, setRepoName] = useState(sanitisedDefault);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');

  const run = useCallback(async () => {
    if (!projectPath) {
      setLog('No project path available.');
      return;
    }
    setRunning(true);
    setLog('');
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    const runCmd = api?.fs?.runCommand;
    if (!runCmd) {
      setRunning(false);
      setLog('Electron API not available.');
      return;
    }
    const append = (s: string) => setLog((prev) => prev + s);

    const exec = async (cmd: string, args: string[]) => {
      append(`$ ${cmd} ${args.join(' ')}\n`);
      const r = await runCmd(cmd, args, projectPath, 60000);
      if (r.stdout) append(r.stdout);
      if (r.stderr) append(r.stderr);
      append(`\n`);
      return r;
    };

    try {
      // 1. Ensure git repo + at least one commit (gh repo create --push needs HEAD).
      const inRepo = await runCmd('git', ['rev-parse', '--is-inside-work-tree'], projectPath, 5000);
      if (inRepo.exitCode !== 0) {
        const init = await exec('git', ['init', '-b', 'main']);
        if (init.exitCode !== 0) throw new Error('git init failed');
      }
      const log1 = await runCmd('git', ['log', '-1', '--oneline'], projectPath, 5000);
      if (log1.exitCode !== 0) {
        // No commits yet — make one. Stage everything tracked-or-not.
        await exec('git', ['add', '-A']);
        const c = await exec('git', ['commit', '-m', 'Initial commit from ASAPS Builder']);
        if (c.exitCode !== 0) throw new Error('Could not create initial commit. Make sure git user.name and user.email are set.');
      }
      // 2. Create repo on GitHub and push.
      const repoSpec = username ? `${username}/${repoName}` : repoName;
      const visFlag = visibility === 'private' ? '--private' : '--public';
      const create = await exec('gh', ['repo', 'create', repoSpec, '--source=.', '--remote=origin', '--push', visFlag]);
      if (create.exitCode !== 0) throw new Error('gh repo create failed — see log above.');
      // 3. Read back the canonical URL gh wrote to git config.
      const remote = await runCmd('git', ['remote', 'get-url', 'origin'], projectPath, 5000);
      const url = remote.stdout.trim();
      if (url) {
        append(`\n✓ Connected to ${url}\n`);
        onConfigured(url);
      }
    } catch (e) {
      append(`\nERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    } finally {
      setRunning(false);
    }
  }, [projectPath, repoName, visibility, username, onConfigured]);

  return (
    <div>
      <button style={linkBtnStyle} onClick={onBack}>← Back</button>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Repository name</label>
        <input
          type="text"
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          style={inputStyle}
          disabled={running}
          placeholder="my-asaps-project"
        />
        <div style={smallNoteStyle}>
          Will be created as <code style={inlineCodeStyle}>{username ? `${username}/${repoName}` : repoName}</code>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Visibility</label>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={radioLabelStyle}>
            <input type="radio" checked={visibility === 'private'} onChange={() => setVisibility('private')} disabled={running} />
            Private (recommended)
          </label>
          <label style={radioLabelStyle}>
            <input type="radio" checked={visibility === 'public'} onChange={() => setVisibility('public')} disabled={running} />
            Public
          </label>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button style={primaryBtnStyle} onClick={run} disabled={running || !repoName}>
          {running ? 'Working...' : 'Create and push'}
        </button>
      </div>
      {log && <pre style={logBoxStyle}>{log}</pre>}
    </div>
  );
};

const ConnectRepoForm: React.FC<{
  projectPath: string | null;
  onBack: () => void;
  onConfigured: (url: string) => void;
}> = ({ projectPath, onBack, onConfigured }) => {
  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');

  const run = useCallback(async () => {
    if (!projectPath) return;
    setRunning(true);
    setLog('');
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    const runCmd = api?.fs?.runCommand;
    if (!runCmd) { setRunning(false); return; }
    const append = (s: string) => setLog((prev) => prev + s);
    const exec = async (cmd: string, args: string[]) => {
      append(`$ ${cmd} ${args.join(' ')}\n`);
      const r = await runCmd(cmd, args, projectPath, 60000);
      if (r.stdout) append(r.stdout);
      if (r.stderr) append(r.stderr);
      append(`\n`);
      return r;
    };
    try {
      // Ensure repo exists locally with at least one commit
      const inRepo = await runCmd('git', ['rev-parse', '--is-inside-work-tree'], projectPath, 5000);
      if (inRepo.exitCode !== 0) {
        const init = await exec('git', ['init', '-b', 'main']);
        if (init.exitCode !== 0) throw new Error('git init failed');
      }
      const log1 = await runCmd('git', ['log', '-1', '--oneline'], projectPath, 5000);
      if (log1.exitCode !== 0) {
        await exec('git', ['add', '-A']);
        const c = await exec('git', ['commit', '-m', 'Initial commit from ASAPS Builder']);
        if (c.exitCode !== 0) throw new Error('Initial commit failed.');
      }
      // Add remote (replace if exists)
      const exists = await runCmd('git', ['remote', 'get-url', 'origin'], projectPath, 5000);
      if (exists.exitCode === 0) {
        await exec('git', ['remote', 'set-url', 'origin', url]);
      } else {
        await exec('git', ['remote', 'add', 'origin', url]);
      }
      // Push (sets upstream)
      const push = await exec('git', ['push', '-u', 'origin', 'main']);
      if (push.exitCode !== 0) throw new Error('git push failed — is the remote repo empty? Check the log above.');
      append(`\n✓ Connected to ${url}\n`);
      onConfigured(url);
    } catch (e) {
      append(`\nERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    } finally {
      setRunning(false);
    }
  }, [projectPath, url, onConfigured]);

  return (
    <div>
      <button style={linkBtnStyle} onClick={onBack}>← Back</button>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Repository URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={inputStyle}
          disabled={running}
          placeholder="https://github.com/username/repo.git"
        />
        <div style={smallNoteStyle}>The repo on GitHub must be empty — create one at github.com/new if needed.</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={primaryBtnStyle} onClick={run} disabled={running || !url}>
          {running ? 'Working...' : 'Connect and push'}
        </button>
      </div>
      {log && <pre style={logBoxStyle}>{log}</pre>}
    </div>
  );
};

// ============================================================================
// Styles (kept inline to match the rest of vcs/ components)
// ============================================================================

const cardStyle: React.CSSProperties = {
  padding: 20, color: '#cbd5e1', maxWidth: 640,
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 16, color: '#e2e8f0', marginBottom: 8 };
const subTitleStyle: React.CSSProperties = { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const paragraphStyle: React.CSSProperties = { fontSize: 13, lineHeight: 1.5, color: '#94a3b8', margin: '0 0 12px' };
const statusListStyle: React.CSSProperties = { listStyle: 'none', margin: '8px 0', background: '#0f172a', borderRadius: 6, padding: '8px 12px' };
const codeBoxStyle: React.CSSProperties = {
  background: '#0f172a', padding: 10, borderRadius: 6, position: 'relative', fontSize: 12,
  fontFamily: 'monospace', color: '#e2e8f0', overflow: 'auto', margin: 0,
};
const copyBtnStyle: React.CSSProperties = {
  position: 'absolute', top: 6, right: 6, padding: '2px 8px', fontSize: 10,
  background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer',
};
const inlineCodeStyle: React.CSSProperties = { background: '#0f172a', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 };
const smallNoteStyle: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 6 };
const linkStyle: React.CSSProperties = { color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' };
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, background: '#15803d', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, background: '#334155', color: '#e2e8f0',
  border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 12, padding: 0,
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 13, background: '#0f172a',
  color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, boxSizing: 'border-box',
};
const radioLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' };
const btnSubStyle: React.CSSProperties = { fontSize: 11, color: '#cbd5e1', opacity: 0.85, fontWeight: 'normal', marginTop: 3 };
const logBoxStyle: React.CSSProperties = {
  marginTop: 12, padding: 10, background: '#0f172a', color: '#cbd5e1',
  fontFamily: 'monospace', fontSize: 11, borderRadius: 4, maxHeight: 240,
  overflow: 'auto', whiteSpace: 'pre-wrap',
};
