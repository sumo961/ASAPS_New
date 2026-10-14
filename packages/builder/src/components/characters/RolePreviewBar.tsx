/**
 * "Preview as": which candidate the editor shows for each role the current
 * beat uses. Shared by the Inspector and the Visual Editor (RolesContext);
 * changes nothing in the story.
 */
import React from 'react';
import { useRolePreview, roleOptionLabel } from '../../contexts/RolesContext';

interface Props {
  /** Role ids the beat refers to. */
  roleIds: ReadonlyArray<string>;
  characters: ReadonlyArray<{ id: string; name?: string; displayName?: string }>;
  compact?: boolean;
}

export const RolePreviewBar: React.FC<Props> = ({ roleIds, characters, compact }) => {
  const { roles, holderOf, setPreviewHolder } = useRolePreview();
  const used = roles.filter((r) => roleIds.includes(r.id) && r.candidates.length > 0);
  if (used.length === 0) return null;
  const nameOf = (id: string) => {
    const c = characters.find((x) => x.id === id);
    return c?.displayName || c?.name || id;
  };
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? 'text-xs' : 'text-xs px-2 py-1.5 bg-fuchsia-50 border border-fuchsia-200 rounded'}`}
      data-testid="role-preview-bar"
      title="Which character the editor shows for each role. The story decides while it plays; this only changes the preview."
    >
      <span className="text-fuchsia-800 font-medium">Preview as</span>
      {used.map((r) => (
        <label key={r.id} className="flex items-center gap-1 text-gray-700">
          <span className="font-mono">{roleOptionLabel(r)}</span>
          <select
            value={holderOf(r.id) ?? ''}
            onChange={(e) => setPreviewHolder(r.id, e.target.value)}
            className="px-1 py-0.5 border border-gray-300 rounded bg-white text-xs"
          >
            {r.candidates.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
};
