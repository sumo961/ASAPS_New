/**
 * Project Settings → Roles: parts in the story that one of several
 * characters fills at runtime (docs/Character-Roles-Design.md). A role is
 * referenced as '@id' in speaker / NPC / character fields and as
 * ${@id.name}, ${@id.they} in text.
 */
import React from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import type { CastRole, RoleSelection } from '@asaps/core';

interface Props {
  roles: CastRole[] | undefined;
  characters: ReadonlyArray<{ id?: string; name: string; displayName: string }>;
  onChange: (roles: CastRole[]) => void;
}

const SELECTION_LABELS: Record<RoleSelection, string> = {
  cast: 'Chosen in the story',
  random: 'Drawn at random at the start',
  fixed: 'Always the default',
};

const SELECTION_HINTS: Record<RoleSelection, string> = {
  cast: 'A Choose Your Character beat or a Cast Role effect on a choice decides. Until then the default plays it.',
  random: 'Each playthrough draws one of the characters above.',
  fixed: 'The default always plays it — useful while the other characters are still unwritten.',
};

/** 'The confidant' → 'confidant'; unique against existing ids. */
function idFromName(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

export const RolesSettingsPanel: React.FC<Props> = ({ roles = [], characters, onChange }) => {
  const named = characters.filter((c): c is { id: string; name: string; displayName: string } => !!c.id);
  const update = (index: number, patch: Partial<CastRole>) =>
    onChange(roles.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const hasPlayerRole = roles.some(r => r.id === 'player');

  const add = (asPlayer = false) => {
    const taken = new Set(roles.map(r => r.id));
    const role: CastRole = asPlayer
      ? { id: 'player', name: 'The player', candidates: named.filter(c => (c as any).role === 'player').map(c => c.id), selection: 'cast' }
      : { id: idFromName(`role ${roles.length + 1}`, taken), name: '', candidates: [], selection: 'cast' };
    onChange([...roles, role]);
  };

  return (
    <div className="space-y-4" data-testid="roles-settings">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-700">Roles</h3>
        <div className="flex gap-2">
          {!hasPlayerRole && (
            <button
              onClick={() => add(true)}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-50"
              title="The protagonist the player picks: 'player' everywhere in the story follows the pick"
            >
              <Plus className="w-4 h-4" />
              Player role
            </button>
          )}
          <button
            onClick={() => add(false)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Plus className="w-4 h-4" />
            Add Role
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        A role is a part in your story that one of several characters can play: the confidant is Mara or Jonas,
        depending on what happened earlier, or the player picks who to be. Write the scene once for the role:
        pick <em>@ The confidant</em> as a speaker or AI partner, and write{' '}
        <code className="font-mono text-xs bg-gray-100 px-1 rounded">{'${@confidant.name}'}</code> or{' '}
        <code className="font-mono text-xs bg-gray-100 px-1 rounded">{'${@confidant.they}'}</code> in text.
        Counters and feelings stay with each character. A role called <code className="font-mono text-xs bg-gray-100 px-1 rounded">player</code>{' '}
        makes the player's own counters and feelings follow the character they chose; the inventory stays the player's.
      </p>

      {roles.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
          <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>No roles yet.</p>
          <p className="text-sm">Add one, then pick which characters can play it.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role, index) => (
            <div key={index} className="p-3 border rounded-lg bg-white space-y-2" data-testid={`role-${role.id}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                    <input
                      type="text"
                      value={role.name || ''}
                      placeholder="The confidant"
                      onChange={e => update(index, { name: e.target.value })}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Referenced as</label>
                    <div className="flex items-center">
                      <span className="px-1 text-sm text-gray-500">@</span>
                      <input
                        type="text"
                        value={role.id}
                        onChange={e => update(index, {
                          id: e.target.value.replace(/[^A-Za-z0-9_-]/g, ''),
                          // Remember the saved id so Save can move every reference along.
                          renamedFrom: role.renamedFrom ?? role.id,
                        })}
                        className="w-full px-2 py-1 text-sm border rounded font-mono"
                        title="Used in fields and text: @id, ${@id.name}. Renaming it updates every beat that uses it when you save."
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onChange(roles.filter((_, i) => i !== index))}
                  className="p-1 text-gray-400 hover:text-red-600"
                  title="Remove role"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={role.description || ''}
                  placeholder="What this role does in the story"
                  onChange={e => update(index, { description: e.target.value })}
                  className="w-full px-2 py-1 text-sm border rounded"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Can be played by</label>
                {named.length === 0 ? (
                  <p className="text-xs text-gray-500">Create characters first (Characters).</p>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {named.map(c => (
                      <label key={c.id} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={role.candidates.includes(c.id)}
                          onChange={e => update(index, {
                            candidates: e.target.checked
                              ? [...role.candidates, c.id]
                              : role.candidates.filter(id => id !== c.id),
                          })}
                        />
                        {c.displayName || c.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Who plays it</label>
                  <select
                    value={role.selection || 'cast'}
                    onChange={e => update(index, { selection: e.target.value as RoleSelection })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  >
                    {(Object.keys(SELECTION_LABELS) as RoleSelection[]).map(k => (
                      <option key={k} value={k}>{SELECTION_LABELS[k]}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{SELECTION_HINTS[role.selection || 'cast']}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Default (before anyone is chosen)</label>
                  <select
                    value={role.defaultCharacterId || ''}
                    onChange={e => update(index, { defaultCharacterId: e.target.value || undefined })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  >
                    <option value="">First of the list</option>
                    {named.filter(c => role.candidates.includes(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-1 text-sm" title="Off: choosing a second time is flagged while you write the story">
                  <input
                    type="checkbox"
                    checked={!!role.recastable}
                    onChange={e => update(index, { recastable: e.target.checked || undefined })}
                  />
                  Can be recast later
                </label>
                <label className="flex items-center gap-1 text-sm" title="An ending's Restart keeps who plays this role">
                  <input
                    type="checkbox"
                    checked={!!role.keepOnRestart}
                    onChange={e => update(index, { keepOnRestart: e.target.checked || undefined })}
                  />
                  Keep across restarts
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
