/**
 * UpdateFromCopyDialog — Open ▸ Update from a copy (.asaps)…: a story that
 * travelled as copies goes back into its project folder (and its Git
 * history) as an ordinary change. Pick the copy → see what it changes →
 * update. The work lives in PersistenceContext (plan/apply) and
 * utils/updateFromCopy.ts.
 */
import React, { useRef, useState } from 'react';
import { FileInput, X, AlertTriangle } from 'lucide-react';
import { usePersistence } from '../contexts/PersistenceContext';
import { useVCSStatus } from '../vcs/VCSStatusProvider';
import { notify } from '../utils/notify';
import type { CopyUpdatePlan } from '../utils/updateFromCopy';

const SHOWN = 8;

const Names: React.FC<{ title: string; names: string[]; tone?: 'warn' }> = ({ title, names, tone }) => {
  const [all, setAll] = useState(false);
  if (names.length === 0) return null;
  const shown = all ? names : names.slice(0, SHOWN);
  return (
    <div className="mt-3">
      <div className={`text-sm font-medium ${tone === 'warn' ? 'text-red-700' : 'text-gray-800'}`}>{title} ({names.length})</div>
      <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">
        {shown.join(' · ')}
        {names.length > SHOWN && (
          <button type="button" onClick={() => setAll(!all)} className="ml-1 text-blue-600 hover:underline">
            {all ? 'show fewer' : `and ${names.length - SHOWN} more`}
          </button>
        )}
      </div>
    </div>
  );
};

function when(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const UpdateFromCopyDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { planUpdateFromCopy, applyUpdateFromCopy, currentProject } = usePersistence();
  const vcs = useVCSStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<CopyUpdatePlan | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;
  const close = () => { setPlan(null); setError(null); setBusy(false); onClose(); };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setFileName(file.name);
    try {
      setPlan(await planUpdateFromCopy(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await applyUpdateFromCopy(plan);
      notify.success(vcs?.type === 'git'
        ? 'Updated from the copy. Look through the changes in Version Control ▸ Pending Changes, then commit and push them.'
        : 'Updated from the copy.');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The update failed.');
      setBusy(false);
    }
  };

  const b = plan?.beats;
  const nothing = b && b.added.length + b.removed.length + b.changed.length === 0 && plan!.newAssets.length === 0;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-5" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="update-copy-title" className="bg-white rounded-lg shadow-xl w-[540px] max-w-full max-h-[calc(100vh-40px)] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 id="update-copy-title" className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileInput className="w-5 h-5 text-blue-600" /> Update from a copy
          </h2>
          <button type="button" onClick={close} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-3 overflow-y-auto text-sm text-gray-700">
          {!plan && (
            <>
              <p className="leading-relaxed">
                Your group passed the story around as .asaps copies? Choose the latest copy: its story replaces
                what is in this folder, and <b>“{currentProject?.name}”</b> keeps its name
                {vcs?.type === 'git' ? <> and its Git history. The changes show up in <b>Pending Changes</b>, ready to commit and push — no new repository, no force push.</> : '.'}
              </p>
              <p className="mt-2 text-xs text-gray-500">Pictures and sounds the folder already has are kept, not copied a second time.</p>
              <input ref={fileRef} type="file" accept=".asaps,.zip" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                className="mt-4 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {busy ? 'Reading…' : 'Choose the copy (.asaps)…'}
              </button>
            </>
          )}

          {plan && b && (
            <>
              <p className="leading-relaxed">
                <b>{fileName}</b>{plan.copy.exportedAt ? <> (saved {when(plan.copy.exportedAt)}{plan.copy.appVersion ? `, ASAPS ${plan.copy.appVersion}` : ''})</> : null} replaces
                the story in <b>“{currentProject?.name}”</b>:
              </p>
              {nothing && <p className="mt-3 text-gray-600">The copy says the same as this folder — nothing to update.</p>}
              <Names title="New beats" names={b.added} />
              <Names title="Changed beats" names={b.changed} />
              <Names title="Beats the copy doesn’t have — they will be removed" names={b.removed} tone="warn" />
              <div className="mt-3 text-xs text-gray-600">
                Pictures and sounds: {plan.reusedAssets} already here{plan.newAssets.length ? `, ${plan.newAssets.length} new` : ''}.
              </div>
              {b.removed.length > 0 && (
                <div className="mt-3 flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Check the removed beats: if someone wrote them in their own copy, that copy has them, not this one.
                    {vcs?.type === 'git' ? ' Until you commit, Pending Changes can still discard the update.' : ''}</span>
                </div>
              )}
              {vcs?.isDirty && (
                <div className="mt-3 flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>This folder has changes that aren’t committed. Commit them first if you might want them back.</span>
                </div>
              )}
            </>
          )}
          {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          {plan && <button type="button" disabled={busy} onClick={() => setPlan(null)} className="mr-auto text-sm text-gray-600 hover:underline">Choose another copy</button>}
          <button type="button" onClick={close} disabled={busy} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          {plan && !nothing && (
            <button type="button" disabled={busy} onClick={() => void apply()}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {busy ? 'Updating…' : 'Update this folder'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
