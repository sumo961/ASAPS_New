/**
 * Review findings for cast roles (docs/Character-Roles-Design.md): a story
 * that refers to a role nobody declared, casts a character who is not a
 * candidate, or casts a non-recastable role in more than one beat.
 * Deterministic and pure, like the rest of the generation review.
 */
import { normalizeRoles, type CastRole } from '@asaps/core';
import type { RoleFinding } from '../types/generationReview';

interface CastSite { beatId: string; beatName?: string; role: string; character?: string }

/** Every place a beat casts a role: castRole effects anywhere in it, and Choose Your Character. */
function castSites(beat: any): CastSite[] {
  const out: CastSite[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    if (v.type === 'castRole' && typeof v.target === 'string') {
      out.push({ beatId: beat.id, beatName: beat.name, role: v.target.replace(/^@/, ''), character: v.character });
    }
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(beat.parameters);
  walk(beat.connections);
  if (beat.type === 'chooseCharacter') {
    const role = String(beat.parameters?.role ?? 'player').replace(/^@/, '');
    const choices: any[] = Array.isArray(beat.parameters?.choices) ? beat.parameters.choices : [];
    if (choices.length === 0) out.push({ beatId: beat.id, beatName: beat.name, role });
    for (const c of choices) out.push({ beatId: beat.id, beatName: beat.name, role, character: c?.character });
  }
  return out;
}

/** '@role' values and ${@role…} placeholders anywhere in a beat. */
function referencedRoles(beat: any): Set<string> {
  const refs = new Set<string>();
  const walk = (v: any) => {
    if (typeof v === 'string') {
      const whole = /^@([A-Za-z0-9_-]+)$/.exec(v.trim());
      if (whole) refs.add(whole[1]);
      for (const m of v.matchAll(/\$\{\s*@([A-Za-z0-9_-]+)/g)) refs.add(m[1]);
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
  };
  walk({ speaker: beat.speaker, characterRef: beat.characterRef, parameters: beat.parameters, connections: beat.connections });
  if (beat.type === 'chooseCharacter') refs.add(String(beat.parameters?.role ?? 'player').replace(/^@/, ''));
  return refs;
}

export function analyzeRoleFindings(beats: any[], rawRoles: unknown, characters?: Array<{ id: string; displayName?: string; name?: string }>): RoleFinding[] {
  const roles = normalizeRoles(rawRoles);
  const byId = new Map<string, CastRole>(roles.map((r) => [r.id, r]));
  const charName = (id?: string) => {
    const c = characters?.find((x) => x.id === id);
    return c?.displayName || c?.name || id || '?';
  };
  const out: RoleFinding[] = [];

  for (const beat of beats) {
    if (!beat?.id) continue;
    for (const role of referencedRoles(beat)) {
      if (byId.has(role)) continue;
      out.push({
        id: `role:unknown:${beat.id}:${role}`, kind: 'role', problem: 'unknown-role', beatId: beat.id, beatName: beat.name, role,
        message: `"${beat.name || beat.id}" refers to @${role}, but there is no role "${role}" — add it under Project Settings → Roles, or pick an existing one.`,
      });
    }
  }

  const sitesByRole = new Map<string, CastSite[]>();
  for (const beat of beats) for (const site of castSites(beat || {})) {
    const role = byId.get(site.role);
    if (!role) continue; // reported above as unknown
    if (site.character && !role.candidates.includes(site.character)) {
      out.push({
        id: `role:not-candidate:${site.beatId}:${role.id}:${site.character}`, kind: 'role', problem: 'not-candidate',
        beatId: site.beatId, beatName: site.beatName, role: role.id,
        message: `"${site.beatName || site.beatId}" casts ${charName(site.character)} as @${role.id}, but ${charName(site.character)} is not one of the characters who can play it.`,
      });
    }
    const list = sitesByRole.get(role.id) ?? [];
    if (!list.some((s) => s.beatId === site.beatId)) list.push(site);
    sitesByRole.set(role.id, list);
  }
  for (const [roleId, sites] of sitesByRole) {
    const role = byId.get(roleId)!;
    if (role.recastable || sites.length < 2) continue;
    const names = sites.map((s) => `"${s.beatName || s.beatId}"`).join(', ');
    out.push({
      id: `role:recast:${roleId}`, kind: 'role', problem: 'recast', beatId: sites[1].beatId, beatName: sites[1].beatName, role: roleId,
      message: `@${roleId} is cast in ${sites.length} beats (${names}). If one playthrough can pass more than one, the later choice replaces the earlier — tick "Can be recast later" on the role if that is intended.`,
    });
  }
  return out;
}
