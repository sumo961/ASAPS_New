/**
 * BranchesTab - List local/remote branches, switch, create, merge.
 * Also manage remotes (add/view).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import {
  gitListBranches, gitSwitchBranch, gitCreateBranch, gitMerge,
  gitListRemotes, gitAddRemote,
  type GitBranch,
} from '../../vcs/GitAdapter';

export const BranchesTab: React.FC = () => {
  const vcs = useVCSStatus();
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddRemote, setShowAddRemote] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newRemoteName, setNewRemoteName] = useState('origin');
  const [newRemoteUrl, setNewRemoteUrl] = useState('');
  const [filter, setFilter] = useState('');

  const loadBranches = useCallback(async () => {
    if (!vcs?.projectPath) return;
    setLoading(true);
    try {
      const [branchResult, remoteResult] = await Promise.all([
        gitListBranches(vcs.projectPath),
        gitListRemotes(vcs.projectPath),
      ]);
      setBranches(branchResult);
      setRemotes(remoteResult);
    } finally {
      setLoading(false);
    }
  }, [vcs?.projectPath]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleSwitch = useCallback(async (branchName: string) => {
    if (!vcs?.projectPath) return;
    if (vcs.isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Switch branch anyway?');
      if (!confirmed) return;
    }
    const result = await gitSwitchBranch(vcs.projectPath, branchName);
    if (result.success) {
      await vcs.refresh();
      await loadBranches();
    }
  }, [vcs, loadBranches]);

  const handleCreate = useCallback(async () => {
    if (!vcs?.projectPath || !newBranchName.trim()) return;
    const result = await gitCreateBranch(vcs.projectPath, newBranchName.trim());
    if (result.success) {
      setNewBranchName('');
      setShowCreate(false);
      await vcs.refresh();
      await loadBranches();
    }
  }, [vcs, newBranchName, loadBranches]);

  const handleMerge = useCallback(async (branchName: string) => {
    if (!vcs?.projectPath) return;
    const confirmed = window.confirm(`Merge "${branchName}" into current branch?`);
    if (!confirmed) return;
    const result = await gitMerge(vcs.projectPath, branchName);
    if (result.success) {
      await vcs.refresh();
      await loadBranches();
    }
  }, [vcs, loadBranches]);

  const handleAddRemote = useCallback(async () => {
    if (!vcs?.projectPath || !newRemoteName.trim() || !newRemoteUrl.trim()) return;
    const result = await gitAddRemote(vcs.projectPath, newRemoteName.trim(), newRemoteUrl.trim());
    if (result.success) {
      setNewRemoteName('origin');
      setNewRemoteUrl('');
      setShowAddRemote(false);
      await loadBranches();
    }
  }, [vcs, newRemoteName, newRemoteUrl, loadBranches]);

  if (!vcs) return null;

  const localBranches = branches.filter(b => !b.remote);
  const remoteBranches = branches.filter(b => b.remote);
  const filtered = filter
    ? (list: GitBranch[]) => list.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
    : (list: GitBranch[]) => list;

  return (
    <div style={{ color: '#cbd5e1' }}>
      {/* Filter + New Branch */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter branches..."
          style={inputStyle}
        />
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={toolbarBtnStyle}
        >
          + Branch
        </button>
        <button
          onClick={() => setShowAddRemote(!showAddRemote)}
          style={toolbarBtnStyle}
        >
          + Remote
        </button>
      </div>

      {/* Create branch form */}
      {showCreate && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #1e293b', backgroundColor: '#1e293b' }}>
          <input
            type="text"
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            placeholder="Branch name..."
            style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!newBranchName.trim()}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              backgroundColor: '#15803d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Create
          </button>
        </div>
      )}

      {/* Add remote form */}
      {showAddRemote && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', backgroundColor: '#1e293b' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={newRemoteName}
              onChange={e => setNewRemoteName(e.target.value)}
              placeholder="Remote name"
              style={{ ...inputStyle, maxWidth: 100 }}
              autoFocus
            />
            <input
              type="text"
              value={newRemoteUrl}
              onChange={e => setNewRemoteUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') handleAddRemote(); }}
            />
            <button
              onClick={handleAddRemote}
              disabled={!newRemoteName.trim() || !newRemoteUrl.trim()}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                backgroundColor: '#1d4ed8',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Remotes section */}
      {remotes.length > 0 && (
        <>
          <div style={sectionHeaderStyle}>Remotes</div>
          {remotes.map(remote => (
            <div
              key={remote.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 12px',
                fontSize: '12px',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600, color: '#94a3b8', minWidth: 50 }}>{remote.name}</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {remote.url}
              </span>
            </div>
          ))}
        </>
      )}

      {remotes.length === 0 && (
        <>
          <div style={sectionHeaderStyle}>Remotes</div>
          <div style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
            No remotes configured.{' '}
            <button
              onClick={() => setShowAddRemote(true)}
              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '12px', padding: 0 }}
            >
              Add one
            </button>{' '}
            to push/pull.
          </div>
        </>
      )}

      {/* Local branches */}
      <div style={sectionHeaderStyle}>Local</div>
      {filtered(localBranches).map(branch => (
        <BranchRow
          key={branch.name}
          branch={branch}
          onSwitch={handleSwitch}
          onMerge={handleMerge}
        />
      ))}
      {localBranches.length === 0 && !loading && (
        <div style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
          No branches yet. Make your first commit to create the main branch.
        </div>
      )}

      {/* Remote branches */}
      {remoteBranches.length > 0 && (
        <>
          <div style={sectionHeaderStyle}>Remote Branches</div>
          {filtered(remoteBranches).map(branch => (
            <BranchRow
              key={branch.name}
              branch={branch}
              onSwitch={handleSwitch}
              onMerge={handleMerge}
            />
          ))}
        </>
      )}

      {loading && (
        <div style={{ padding: 12, textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
          Loading...
        </div>
      )}
    </div>
  );
};

const BranchRow: React.FC<{
  branch: GitBranch;
  onSwitch: (name: string) => void;
  onMerge: (name: string) => void;
}> = ({ branch, onSwitch, onMerge }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '5px 12px',
      fontSize: '12px',
      gap: 8,
    }}
    className="hover:bg-slate-800"
  >
    {branch.current && (
      <span style={{ color: '#22c55e', fontSize: '10px' }}>{'\u25CF'}</span>
    )}
    <span
      style={{
        flex: 1,
        fontFamily: 'monospace',
        fontSize: '11px',
        color: branch.current ? '#4ade80' : '#cbd5e1',
        fontWeight: branch.current ? 600 : 400,
      }}
    >
      {branch.name}
    </span>
    {!branch.current && (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onSwitch(branch.name)} style={actionBtnStyle}>
          Switch
        </button>
        <button onClick={() => onMerge(branch.name)} style={actionBtnStyle}>
          Merge
        </button>
      </div>
    )}
  </div>
);

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: '12px',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  fontFamily: 'monospace',
};

const toolbarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  backgroundColor: '#1e293b',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '11px',
  color: '#94a3b8',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #1e293b',
  backgroundColor: '#0f172a',
};

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #334155',
  color: '#64748b',
  cursor: 'pointer',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: '10px',
};
