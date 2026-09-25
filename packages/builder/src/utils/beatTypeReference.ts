/**
 * A beat type's parameters, from the schema, for a model to write against —
 * and the check that holds it to them.
 *
 * The Co-Designer (and any AI path) sees beat type NAMES in its prompt, not
 * their parameters: the condensed schema drops them to save tokens. Asked to
 * build an aiConversation it had to ask the author for field names. This is
 * the on-demand answer (the get_beat_type_schema tool) — generated from
 * beat-definitions/core-beats.json, so it cannot go stale — plus the
 * validator that refuses parameters the beat type does not have, instead of
 * creating a beat whose guessed fields are silently ignored.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import beatDefinitions from '../../../../beat-definitions/core-beats.json';
import { resolveBeatTypeAlias } from '../services/beatSchemaVocabulary';

const BEAT_TYPES: Record<string, any> = (beatDefinitions as any).beatTypes ?? {};
const CUSTOM_TYPES: Record<string, any> = (beatDefinitions as any).customTypes ?? {};

/**
 * Parameters every visual beat may carry that the per-type schema does not
 * list (layout and media the Visual Editor / Inspector manage). Never flagged
 * as unknown.
 */
const COMMON_PARAMS = new Set([
  'locations', 'slotIntent', 'slotAnimations', 'spatialAnimations', 'animations',
  'node', 'backgroundAssetId', 'backgroundImage', 'backgroundSound', 'backgroundSoundAssetId',
]);

function optionValues(def: any): string[] {
  const opts = def?.ui?.options ?? def?.options ?? def?.enum;
  if (!Array.isArray(opts)) return [];
  return opts.map((o: any) => (o && typeof o === 'object' ? String(o.value) : String(o)));
}

function dependsOn(def: any): string {
  const d = def?.ui?.dependsOn;
  if (!d?.field) return '';
  const v = Array.isArray(d.value) ? d.value.join('|') : String(d.value);
  return ` [when ${d.field} = ${v}]`;
}

function line(name: string, def: any, indent: string): string[] {
  const out: string[] = [];
  // A "connection" named *Target is a beat picker that stores the bare beat
  // id (aiConversation.fallbackExitTarget) — not the { target } object the
  // generic connection type describes. Say which, or a model writes an
  // object the runtime never follows.
  const bareId = def?.type === 'connection' && /Target$/.test(name);
  const bits: string[] = [bareId ? 'beat id string, e.g. "beat_12"' : String(def?.type ?? 'any')];
  if (def?.required === true) bits.push('required');
  if (def?.default !== undefined && typeof def.default !== 'object') bits.push(`default ${JSON.stringify(def.default)}`);
  const opts = optionValues(def);
  if (opts.length) bits.push(`one of ${opts.join(' | ')}`);
  const desc = typeof def?.description === 'string' ? def.description.replace(/\s+/g, ' ').trim() : '';
  out.push(`${indent}- ${name} (${bits.join(', ')})${dependsOn(def)}${desc ? ` — ${desc.length > 320 ? `${desc.slice(0, 317)}…` : desc}` : ''}`);
  if (def?.itemSchema && typeof def.itemSchema === 'object') {
    out.push(`${indent}  each item:`);
    for (const [k, v] of Object.entries(def.itemSchema)) out.push(...line(k, v, `${indent}    `));
  }
  // A custom type (dialogNode, multiChoiceOption, …): show its shape.
  const base = String(def?.type ?? '').replace(/\[\]$|^array<|>$/g, '');
  const custom = CUSTOM_TYPES[base];
  if (!bareId && custom?.schema && typeof custom.schema === 'object' && !def?.itemSchema) {
    out.push(`${indent}  ${base}: ${Object.entries(custom.schema).map(([k, v]) => `${k}: ${String(v)}`).join('; ')}`);
  }
  return out;
}

/** The schema's connectionType for a beat type: 'single' | 'multiple' | 'conditional' (undefined if unknown). */
export function beatConnectionType(beatType: string | undefined): string | undefined {
  return beatType ? BEAT_TYPES[beatType]?.connectionType : undefined;
}

/** Resolve an author- or model-typed name ("conversation", "AI Conversation") to a schema id. */
export function resolveBeatType(name: string): string | null {
  if (BEAT_TYPES[name]) return name;
  return resolveBeatTypeAlias(name);
}

/** The reference text for one beat type, or a helpful miss. */
export function beatTypeReference(name: string): string {
  const id = resolveBeatType(String(name ?? '').trim());
  if (!id) {
    return `No beat type "${name}". Beat types: ${Object.keys(BEAT_TYPES).join(', ')}.`;
  }
  const t = BEAT_TYPES[id];
  const lines = [
    `BEAT TYPE ${id}${t.displayName ? ` ("${t.displayName}")` : ''} — ${t.description ?? ''}`,
    'PARAMETERS (write exactly these names; unknown names are refused):',
  ];
  for (const [k, v] of Object.entries(t.parameters ?? {})) {
    if ((v as any)?.ui?.hidden) continue;
    lines.push(...line(k, v, ''));
  }
  lines.push('Links to other beats are beat ids from the digest (e.g. a "connection" type is { "target": "beat_12" }).');
  return lines.join('\n');
}

/**
 * Check parameters against a beat type. `creating` also demands required
 * parameters that have no default (a new beat has nothing to fall back on).
 * Returns a problem sentence or null.
 */
export function beatParameterProblem(beatType: string, params: Record<string, unknown>, creating: boolean): string | null {
  const t = BEAT_TYPES[beatType];
  if (!t) return null; // unknown types are refused elsewhere
  const declared = t.parameters ?? {};
  const unknown = Object.keys(params).filter((k) => !(k in declared) && !COMMON_PARAMS.has(k));
  if (unknown.length) {
    const valid = Object.keys(declared).filter((k) => !declared[k]?.ui?.hidden);
    return `${beatType} has no parameter${unknown.length > 1 ? 's' : ''} ${unknown.map((u) => `"${u}"`).join(', ')} (it has: ${valid.join(', ')})`;
  }
  if (creating) {
    const missing = Object.entries(declared)
      // Links are not demanded: a new beat is wired by connectTo / the
      // redirect, not necessarily through its own link parameter.
      .filter(([k, d]: [string, any]) => d?.required === true && d.default === undefined && d.type !== 'connection'
        && (params[k] === undefined || params[k] === ''))
      .map(([k]) => k);
    if (missing.length) return `${beatType} needs ${missing.join(', ')}`;
  }
  return null;
}

/**
 * Every beat type, one line each (id, display name, what it is for) — so a
 * model knows what EXISTS (e.g. randomTarget) before it designs around a
 * gap. Parameters come from beatTypeReference on demand.
 */
export function beatTypeCatalog(): string {
  return Object.entries(BEAT_TYPES)
    .map(([id, t]) => {
      const desc = String(t.description ?? '').replace(/\s+/g, ' ').trim();
      return `- ${id}${t.displayName ? ` ("${t.displayName}"` + (t.category === 'invisible' ? ', invisible' : '') + ')' : ''}: ${desc.length > 150 ? `${desc.slice(0, 147)}…` : desc}`;
    })
    .join('\n');
}
