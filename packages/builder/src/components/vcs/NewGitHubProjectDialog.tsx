/**
 * NewGitHubProjectDialog — modal entry point for File → New Project on GitHub.
 *
 * Walks the user through:
 *   1. Pick a folder where the new project will live (the parent dir).
 *   2. Choose a project name (also the GitHub repo name + folder name).
 *   3. Verify tools (git + gh) and gh auth — fall through to onboarding cards.
 *   4. Create local directory, save a fresh ASAPS project into it, then run
 *      `gh repo create --push` to publish it.
 *
 * After step 4 the host (App.tsx) opens the new directory project and the
 * regular VCS auto-init handles the rest.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { VCSOnboardingPanel } from './VCSOnboardingPanel';

interface Props {
  onClose: () => void;
  /**
   * Called once the project is created on disk AND on GitHub.
   * The host opens the directory project (which auto-initialises VCS).
   */
  onCreated: (projectPath: string, remoteUrl: string) => void;
}

export const NewGitHubProjectDialog: React.FC<Props> = ({ onClose, onCreated }) => {
  const vcs = useVCSStatus();
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('my-asaps-story');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const logRef = useRef<HTMLPreElement | null>(null);

  // Auto-scroll log on update
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const toolsReady = !!(
    vcs?.tools?.git.present &&
    vcs?.tools?.gh.present &&
    vcs?.tools?.ghAuth?.authenticated
  );

  const pickFolder = useCallback(async () => {
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    const result = await api?.dialog?.open?.({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose parent folder for new project',
    });
    if (!result?.canceled && result?.filePaths?.[0]) {
      setParentDir(result.filePaths[0]);
    }
  }, []);

  const sanitisedName = projectName.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const create = useCallback(async () => {
    if (!parentDir || !sanitisedName) return;
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    const fs = api?.fs;
    if (!fs) { setLog('Electron filesystem API not available.'); return; }

    setRunning(true);
    setLog('');
    const append = (s: string) => setLog((prev) => prev + s);
    const sep = parentDir.includes('\\') ? '\\' : '/';
    const projectPath = `${parentDir}${sep}${sanitisedName}`;

    const exec = async (cmd: string, args: string[], cwd?: string) => {
      append(`$ ${cmd} ${args.join(' ')}\n`);
      const r = await fs.runCommand(cmd, args, cwd, 60000);
      if (r.stdout) append(r.stdout);
      if (r.stderr) append(r.stderr);
      append('\n');
      return r;
    };

    try {
      // 1. Create the project directory.
      const exists = await fs.exists(projectPath);
      if (exists) throw new Error(`Folder already exists: ${projectPath}`);
      await fs.mkdir(projectPath);
      append(`Created ${projectPath}\n`);

      // 2. Write a minimal ASAPS directory-format scaffold so opening it as a
      //    directory project succeeds. The full project layout will be filled
      //    in once the host opens it and the user starts editing.
      const formatDir = `${projectPath}${sep}.asaps`;
      await fs.mkdir(formatDir);
      await fs.writeFile(`${formatDir}${sep}format.json`, JSON.stringify({ type: 'directory', version: 1 }, null, 2));

      const projectMeta = {
        id: `proj-${Date.now()}`,
        name: sanitisedName,
        description: '',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        firstBeatId: '',
      };
      await fs.writeFile(`${projectPath}${sep}project.json`, JSON.stringify(projectMeta, null, 2));
      // Empty assets manifest so the manifest path exists. Must include
      // `_format` and `assets` keys — parser rejects manifests missing either.
      await fs.mkdir(`${projectPath}${sep}assets`);
      await fs.writeFile(`${projectPath}${sep}assets${sep}_manifest.json`, JSON.stringify({ _format: '1.0', assets: {} }, null, 2));
      // Reasonable .gitignore for the project (matches DirectoryFormat template intent)
      await fs.writeFile(`${projectPath}${sep}.gitignore`, '.DS_Store\nThumbs.db\nnode_modules/\n');
      append('Wrote project scaffold.\n');

      // 3. git init + commit
      const init = await exec('git', ['init', '-b', 'main'], projectPath);
      if (init.exitCode !== 0) throw new Error('git init failed');
      await exec('git', ['add', '-A'], projectPath);
      const c = await exec('git', ['commit', '-m', 'Initial commit from ASAPS Builder'], projectPath);
      if (c.exitCode !== 0) throw new Error('Initial commit failed. Make sure git user.name and user.email are set in your global git config.');

      // 4. gh repo create + push
      const username = vcs?.tools?.ghAuth?.username || '';
      const repoSpec = username ? `${username}/${sanitisedName}` : sanitisedName;
      const visFlag = visibility === 'private' ? '--private' : '--public';
      const ghCreate = await exec('gh', ['repo', 'create', repoSpec, '--source=.', '--remote=origin', '--push', visFlag], projectPath);
      if (ghCreate.exitCode !== 0) throw new Error('gh repo create failed — see log above.');

      // 5. Read the canonical remote URL gh wrote to git config.
      const remote = await fs.runCommand('git', ['remote', 'get-url', 'origin'], projectPath, 5000);
      const url = (remote.stdout || '').trim();
      append(`\n✓ Project published at ${url}\n`);
      onCreated(projectPath, url);
    } catch (e) {
      append(`\nERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    } finally {
      setRunning(false);
    }
  }, [parentDir, sanitisedName, visibility, vcs?.tools, onCreated]);

  return (
    <div style={overlayStyle} onClick={running ? undefined : onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e8f0' }}>New Project on GitHub</h2>
          {!running && (
            <button onClick={onClose} style={closeBtnStyle} aria-label="Close">×</button>
          )}
        </div>

        {!toolsReady ? (
          // Reuse the onboarding panel for tools + auth steps.
          // Once toolsReady becomes true (after recheck), we fall through to the form.
          <div style={{ padding: 0 }}>
            <VCSOnboardingPanel
              vcsRemoteUrl={null}
              defaultRepoName={sanitisedName}
              projectPath={null}
              onRemoteConfigured={() => { /* not used in this stage */ }}
            />
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              ASAPS will create a new project folder on disk, then publish it as a GitHub repository in one step.
            </p>

            <label style={labelStyle}>Parent folder</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={parentDir || ''}
                readOnly
                placeholder="Click 'Choose...' to pick a folder"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={pickFolder} style={secondaryBtnStyle} disabled={running}>Choose...</button>
            </div>

            <label style={labelStyle}>Project name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              style={inputStyle}
              disabled={running}
              placeholder="my-asaps-story"
            />
            <div style={smallNoteStyle}>
              Folder + GitHub repo will be named{' '}
              <code style={inlineCodeStyle}>{sanitisedName || '(empty)'}</code>
              {parentDir && sanitisedName && (
                <> · path: <code style={inlineCodeStyle}>{`${parentDir}/${sanitisedName}`}</code></>
              )}
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

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={secondaryBtnStyle} disabled={running}>Cancel</button>
              <button onClick={create} style={primaryBtnStyle} disabled={running || !parentDir || !sanitisedName}>
                {running ? 'Working...' : 'Create and publish'}
              </button>
            </div>

            {log && <pre ref={logRef} style={logBoxStyle}>{log}</pre>}
          </div>
        )}
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const dialogStyle: React.CSSProperties = {
  background: '#1e293b', borderRadius: 8, width: 640, maxWidth: '90vw', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 20px', borderBottom: '1px solid #334155',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#94a3b8',
  fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 0,
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 13, background: '#0f172a',
  color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, boxSizing: 'border-box',
};
const radioLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' };
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, background: '#15803d', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer',
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, background: '#334155', color: '#e2e8f0',
  border: 'none', borderRadius: 6, cursor: 'pointer',
};
const smallNoteStyle: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 6 };
const inlineCodeStyle: React.CSSProperties = { background: '#0f172a', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 };
const logBoxStyle: React.CSSProperties = {
  marginTop: 12, padding: 10, background: '#0f172a', color: '#cbd5e1',
  fontFamily: 'monospace', fontSize: 11, borderRadius: 4, maxHeight: 240,
  overflow: 'auto', whiteSpace: 'pre-wrap',
};
