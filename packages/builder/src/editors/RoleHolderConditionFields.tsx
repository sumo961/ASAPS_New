/**
 * Fields of a roleHolder condition: "<role> is / is not <character>".
 * Shared by the choice "Show only if…" editor and beat Requirements.
 */
import React from 'react';
import { useProjectRoles, roleOptionLabel } from '../contexts/RolesContext';

interface Props {
  role: string | undefined;
  character: string | undefined;
  operator: string | undefined;
  characters?: ReadonlyArray<{ id: string; name?: string; displayName?: string }>;
  onChange: (patch: { role?: string; character?: string; operator?: '==' | '!=' }) => void;
}

export const RoleHolderConditionFields: React.FC<Props> = ({ role, character, operator, characters, onChange }) => {
  const roles = useProjectRoles();
  const roleId = (role || '').replace(/^@/, '');
  const current = roles.find(r => r.id === roleId);
  const candidates = (characters || []).filter(c => !current || current.candidates.includes(c.id));
  return (
    <>
      <select
        value={roleId}
        onChange={e => onChange({ role: e.target.value })}
        className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
        title="A role from Project Settings → Roles"
      >
        <option value="">Role…</option>
        {roles.map(r => <option key={r.id} value={r.id}>{roleOptionLabel(r)}</option>)}
      </select>
      <select
        value={operator === '!=' ? '!=' : '=='}
        onChange={e => onChange({ operator: e.target.value as '==' | '!=' })}
        className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
      >
        <option value="==">is played by</option>
        <option value="!=">is not played by</option>
      </select>
      <select
        value={character || ''}
        onChange={e => onChange({ character: e.target.value })}
        className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
      >
        <option value="">Character…</option>
        {candidates.map(c => <option key={c.id} value={c.id}>{c.displayName || c.name || c.id}</option>)}
      </select>
    </>
  );
};
