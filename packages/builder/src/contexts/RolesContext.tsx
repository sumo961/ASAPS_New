/**
 * The project's cast roles (Project Settings → Roles), for every picker that
 * takes a character: effects, conditions, speakers, AI partners. Roles are
 * listed above characters as "@ The confidant" and stored as '@confidant'.
 * See docs/Character-Roles-Design.md.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { normalizeRoles, type CastRole } from '@asaps/core';

const RolesContext = createContext<CastRole[]>([]);

export const RolesProvider: React.FC<{ roles: unknown; children: React.ReactNode }> = ({ roles, children }) => {
  const value = useMemo(() => normalizeRoles(roles), [roles]);
  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>;
};

export function useProjectRoles(): CastRole[] {
  return useContext(RolesContext);
}

/** Picker label for a role reference: '@ The confidant'. */
export function roleOptionLabel(role: CastRole): string {
  return `@ ${role.name || role.id}`;
}
