/**
 * UndoneMergeDialog — bring back beats from a merge someone undid
 * (vcs/undoneMerge.ts). Opens after Merge when the branch's work was merged
 * before and a teammate reverted that merge, so merging again changes
 * nothing. The author ticks the beats to bring back; one commit, not pushed.
 */
import React, { useMemo, useState } from 'react';
import type { RestoreItem, RestoreKind, RestorePlan } from '../../vcs/undoneMerge';

const GROUPS: Array<{ kind: RestoreKind; title: string; hint: string }> = [
  { kind: 'added', title: 'New on the branch', hint: 'Removed when the merge was undone.' },
  { kind: 'changed', title: 'Changed on the branch', hint: 'Nobody changed them here since; the undo put the old version back.' },
  { kind: 'bothChanged', title: 'Changed on both sides', hint: 'Ticked = take the branch’s version and lose what was changed here.' },
  { kind: 'deletedHere', title: 'Deleted here since', hint: 'The branch changed them; someone deleted them here afterwards.' },
  { kind: 'removedOnBranch', title: 'Removed on the branch', hint: 'Ticked = remove them again.' },
];

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const Leads: React.FC<{ item: RestoreItem }> = ({ item }) => {
  const there = item.leadsToOnBranch.join(', ');
  const here = item.leadsToHere.join(', ');
  if (item.kind === 'added' || item.kind === 'deletedHere') {
    return there ? <div style={leadStyle}>leads to {there}</div> : null;
  }
  if (item.kind === 'removedOnBranch' || there === here) return null;
  return (
    <div style={leadStyle}>
      On the branch it leads to <b>{there || 'nothing'}</b>; here to <b>{here || 'nothing'}</b>.
    </div>
  );
};

export const UndoneMergeDialog: React.FC<{
  plan: RestorePlan;
  onCancel: () => void;
  onRestore: (chosen: Set<string>) => Promise<void>;
}> = ({ plan, onCancel, onRestore }) => {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(plan.items.filter((i) => i.suggested).map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => GROUPS.map((g) => ({ ...g, items: plan.items.filter((i) => i.kind === g.kind) })).filter((g) => g.items.length > 0), [plan]);
  const branch = plan.branch.replace(/^origin\//, '');
  const u = plan.undone;
  const toggle = (id: string) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleGroup = (items: RestoreItem[], on: boolean) => setChosen((prev) => {
    const next = new Set(prev);
    items.forEach((i) => (on ? next.add(i.id) : next.delete(i.id)));
    return next;
  });

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="undone-merge-title"
        style={{ background: '#fff', color: '#0f172a', borderRadius: 10, width: 560, maxWidth: '100%', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
      >
        <div style={{ padding: '18px 20px 10px' }}>
          <h2 id="undone-merge-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Bring back beats from “{branch}”?
          </h2>
          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
            “{u.undoneSubject}” ({day(u.undoneDate)}) was merged, and <b>{u.revertAuthor}</b> undid it
            on {day(u.revertDate)} (“{u.revertSubject}”). Merging the branch again can’t bring that work back:
            Git counts it as merged and removed on purpose.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
            Tick what should come back. Pictures, sounds, characters and clusters these beats need come along.
            It becomes one commit; push it when you’re happy with it.
          </p>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 20px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
          {groups.map((g) => {
            const all = g.items.every((i) => chosen.has(i.id));
            return (
              <section key={g.kind} style={{ padding: '10px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={all} onChange={() => toggleGroup(g.items, !all)} />
                  {g.title} ({g.items.length})
                </label>
                <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0 6px 24px' }}>{g.hint}</div>
                {g.items.map((item) => (
                  <label key={item.id} style={{ display: 'flex', gap: 8, padding: '3px 0 3px 24px', fontSize: 13, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={chosen.has(item.id)} onChange={() => toggle(item.id)} style={{ marginTop: 3 }} />
                    <span>
                      {item.name}
                      <Leads item={item} />
                    </span>
                  </label>
                ))}
              </section>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 16px' }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 13, cursor: 'pointer' }}
          >
            Not now
          </button>
          <button type="button" disabled={busy || chosen.size === 0}
            onClick={async () => { setBusy(true); try { await onRestore(chosen); } finally { setBusy(false); } }}
            style={{ padding: '7px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: busy || chosen.size === 0 ? 'default' : 'pointer', background: chosen.size === 0 ? '#94a3b8' : '#2563eb', color: '#fff' }}
          >
            {busy ? 'Bringing back…' : `Bring back ${chosen.size} beat${chosen.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const leadStyle: React.CSSProperties = { fontSize: 12, color: '#64748b' };
