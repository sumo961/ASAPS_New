/**
 * The project's cast roles (Project Settings → Roles), for every picker that
 * takes a character: effects, conditions, speakers, AI partners. Roles are
 * listed above characters as "@ The confidant" and stored as '@confidant'.
 *
 * Also holds the editor's "Preview as" casting: which candidate the Visual
 * Editor and the Inspector show for each role while authoring. Session-only,
 * never saved with the story. See docs/Character-Roles-Design.md.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { normalizeRoles, fallbackHolder, type CastRole } from '@asaps/core';

interface RolesContextValue {
  roles: CastRole[];
  /** Preview casting chosen by the author (role id → character id). */
  previewCasting: Record<string, string>;
  setPreviewHolder: (roleId: string, characterId: string) => void;
}

const RolesContext = createContext<RolesContextValue>({
  roles: [],
  previewCasting: {},
  setPreviewHolder: () => {},
});

export const RolesProvider: React.FC<{
  roles: unknown;
  /** Controlled casting (the App sends it to the Preview Window); local state when omitted. */
  previewCasting?: Record<string, string>;
  onPreviewCastingChange?: (next: Record<string, string>) => void;
  children: React.ReactNode;
}> = ({ roles, previewCasting: controlled, onPreviewCastingChange, children }) => {
  const normalized = useMemo(() => normalizeRoles(roles), [roles]);
  const [local, setLocal] = useState<Record<string, string>>({});
  const previewCasting = controlled ?? local;
  const setPreviewHolder = useCallback((roleId: string, characterId: string) => {
    const next = { ...previewCasting, [roleId]: characterId };
    if (onPreviewCastingChange) onPreviewCastingChange(next);
    else setLocal(next);
  }, [previewCasting, onPreviewCastingChange]);
  const value = useMemo(
    () => ({ roles: normalized, previewCasting, setPreviewHolder }),
    [normalized, previewCasting, setPreviewHolder],
  );
  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>;
};

export function useProjectRoles(): CastRole[] {
  return useContext(RolesContext).roles;
}

/**
 * The editor's preview casting: who the Visual Editor and the Inspector show
 * for a role — the author's pick, else the role's default, else its first
 * candidate (what the story itself does before anything casts it).
 */
export function useRolePreview(): {
  roles: CastRole[];
  holderOf: (roleId: string) => string | null;
  setPreviewHolder: (roleId: string, characterId: string) => void;
} {
  const { roles, previewCasting, setPreviewHolder } = useContext(RolesContext);
  const holderOf = useCallback((roleId: string) => {
    const role = roles.find((r) => r.id === roleId.replace(/^@/, ''));
    if (!role) return null;
    const picked = previewCasting[role.id];
    return picked && role.candidates.includes(picked) ? picked : fallbackHolder(role);
  }, [roles, previewCasting]);
  return { roles, holderOf, setPreviewHolder };
}

/** Picker label for a role reference: '@ The confidant'. */
export function roleOptionLabel(role: CastRole): string {
  return `@ ${role.name || role.id}`;
}
