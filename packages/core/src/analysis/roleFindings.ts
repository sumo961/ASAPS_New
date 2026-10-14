/**
 * Review findings for cast roles (docs/Character-Roles-Design.md): a story
 * that refers to a role nobody declared, casts a character who is not a
 * candidate, or casts a non-recastable role in more than one beat.
 * Deterministic and pure, like the rest of the generation review.
 */
import { normalizeRoles, type CastRole } from '../engine/roles';
import { beatTargetIds } from '../utils/storyLinks';

/** A cast-role problem found in a story (beat data, not Beat instances). */
export interface RoleFinding {
  id: string;
  kind: 'role';
  problem: 'unknown-role' | 'not-candidate' | 'recast' | 'before-cast' | 'bare-npc';
  role: string;
  beatId: string;
  beatName?: string;
  message: string;
}

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

/**
 * Roles a beat casts (Flowchart badge). Accepts a Beat instance or plain
 * beat data.
 */
export function beatCastRoles(beat: any): string[] {
  if (!beat) return [];
  const plain = typeof beat.getParameters === 'function'
    ? { id: beat.id, name: beat.name, type: beat.type, parameters: beat.getParameters(), connections: beat.connections }
    : beat;
  return [...new Set(castSites(plain).map((s) => s.role))];
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
  walk({ speaker: beat.speaker, characterRef: beat.characterRef, parameters: beat.parameters, connections: beat.connections, requires: beat.requires });
  if (beat.type === 'chooseCharacter') refs.add(String(beat.parameters?.role ?? 'player').replace(/^@/, ''));
  return refs;
}

export function analyzeRoleFindings(
  beats: any[],
  rawRoles: unknown,
  characters?: Array<{ id: string; displayName?: string; name?: string; description?: string }>,
  startBeatId?: string | null,
): RoleFinding[] {
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
  // D4: a role the story reads before anything chooses who plays it. Walk
  // from the start without passing a beat that casts it; with no default
  // set, the first character on its list plays it until then.
  if (startBeatId) {
    const byBeat = new Map<string, any>(beats.filter((b) => b?.id).map((b) => [b.id, b]));
    for (const role of roles) {
      if (role.selection !== 'cast' || role.defaultCharacterId || role.candidates.length === 0) continue;
      const casting = new Set((sitesByRole.get(role.id) ?? []).map((s) => s.beatId));
      const seen = new Set<string>();
      const queue = [startBeatId];
      let early: any = null;
      while (queue.length && !early) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const beat = byBeat.get(id);
        if (!beat) continue;
        if (referencedRoles(beat).has(role.id) && !casting.has(id)) { early = beat; break; }
        if (casting.has(id)) continue;
        for (const t of beatTargetIds(beat)) if (!seen.has(t)) queue.push(t);
      }
      if (early) {
        out.push({
          id: `role:before-cast:${role.id}`, kind: 'role', problem: 'before-cast', beatId: early.id, beatName: early.name, role: role.id,
          message: `"${early.name || early.id}" uses @${role.id} before anything chooses who plays it, so ${charName(role.candidates[0])} (first on the role's list) plays it there. Choose someone earlier, or set the role's default.`,
        });
      }
    }
  }

  // An AI partner played by a role: each candidate needs something for the
  // AI to go on, or the conversation runs on a bare name.
  for (const beat of beats) {
    if (beat?.type !== 'aiConversation' && beat?.type !== 'aiDialogTree') continue;
    const npc = String(beat.parameters?.npcName ?? '');
    const m = /^@([A-Za-z0-9_-]+)$/.exec(npc.trim());
    const role = m && byId.get(m[1]);
    if (!role || String(beat.parameters?.npcPersonality ?? '').trim()) continue;
    const bare = role.candidates.filter((id) => !characters?.find((c) => c.id === id)?.description?.trim());
    if (bare.length === 0) continue;
    out.push({
      id: `role:bare-npc:${beat.id}`, kind: 'role', problem: 'bare-npc', beatId: beat.id, beatName: beat.name, role: role.id,
      message: `"${beat.name || beat.id}" talks to @${role.id}, but ${bare.map(charName).join(' and ')} ${bare.length > 1 ? 'have' : 'has'} no description and the beat has no "In this scene" notes — the AI would play them from a name alone.`,
    });
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
