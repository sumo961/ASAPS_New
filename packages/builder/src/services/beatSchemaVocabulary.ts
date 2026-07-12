/**
 * Schema-driven beat-type vocabulary for AI-assisted story operations.
 *
 * Single source of truth: beat-definitions/core-beats.json (statically
 * imported, same pattern as SchemaLocationInitializer). Everything that
 * previously hand-listed beat types — the deterministic helper-command
 * parser, the helper-command AI prompt context, the beat-suggestions
 * prompt — reads from here, so a new beat type in the schema is
 * automatically visible to all of them.
 */
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

interface SchemaBeatType {
  category?: string;
  displayName?: string;
  description?: string;
  connectionType?: string;
  parameters?: Record<string, unknown>;
}

const BEAT_TYPES: Record<string, SchemaBeatType> =
  (beatDefinitions as any).beatTypes ?? {};

/** Every beat type id defined in the schema. */
export function getAllBeatTypeIds(): string[] {
  return Object.keys(BEAT_TYPES);
}

/**
 * Beat types that render on screen (schema categories 'visible' and 'xr').
 * These can carry transitions, backgrounds, and locations.
 */
export function getVisibleBeatTypeIds(): string[] {
  return Object.entries(BEAT_TYPES)
    .filter(([, def]) => def.category === 'visible' || def.category === 'xr')
    .map(([id]) => id);
}

/** Logic-only beat types (schema category 'invisible'). */
export function getInvisibleBeatTypeIds(): string[] {
  return Object.entries(BEAT_TYPES)
    .filter(([, def]) => def.category === 'invisible')
    .map(([id]) => id);
}

/** Declared parameter names for one beat type (empty for unknown types). */
export function getParameterNames(beatTypeId: string): string[] {
  const params = BEAT_TYPES[beatTypeId]?.parameters;
  return params ? Object.keys(params) : [];
}

function normalizeAlias(s: string): string {
  return s.toLowerCase().replace(/[_\s-]/g, '');
}

/**
 * Colloquial names authors actually type, mapped onto schema ids. These are
 * ADDITIONS on top of the schema-derived aliases (ids + display names) —
 * shorthands and legacy names the schema itself doesn't carry.
 */
const CURATED_ALIASES: Record<string, string> = {
  dialog: 'dialogTree',
  title: 'titleScreen',
  intro: 'infoText',
  introtext: 'infoText',
  text: 'infoText',
  end: 'endScreen',
  movement: 'movementChoice',
  pick: 'pickProp',
  prop: 'pickProp',
  dur: 'durScreen',
  timed: 'durScreen',
  timer: 'setTimer',
  input: 'inputText',
  image: 'inputImage',
  imageinput: 'inputImage',
  hyper: 'hyperText',
  video: 'videoBeat',
  choice: 'multiChoice',
  choices: 'multiChoice',
  variable: 'setVariable',
  counter: 'setVariable',
  condition: 'conditionBeat',
  inventory: 'addRemoveInventory',
  affect: 'updateAffect',
  mood: 'updateAffect',
  summary: 'aiSummary',
  aidialog: 'aiDialogTree',
  online: 'onlineContent',
  conversation: 'aiConversation',
  gps: 'gpsLocation',
  ar: 'arBeat',
  qr: 'qrScan',
  web: 'webView',
  '360': 'panorama',
};

let aliasCache: Record<string, string> | null = null;

/**
 * Map of normalized names (lowercase, no spaces/underscores/hyphens) → beat
 * type id. Derived from schema ids + displayNames, extended with the curated
 * colloquial aliases.
 */
export function getBeatTypeAliases(): Record<string, string> {
  if (aliasCache) return aliasCache;
  const aliases: Record<string, string> = {};
  for (const [id, def] of Object.entries(BEAT_TYPES)) {
    aliases[normalizeAlias(id)] = id;
    if (def.displayName) aliases[normalizeAlias(def.displayName)] = id;
  }
  // Curated shorthands only fill gaps — schema-derived names win on conflict.
  for (const [alias, id] of Object.entries(CURATED_ALIASES)) {
    if (!(alias in aliases) && id in BEAT_TYPES) aliases[alias] = id;
  }
  aliasCache = aliases;
  return aliases;
}

/** Resolve free-form author input ("timed", "Dialog Tree") to a beat type id. */
export function resolveBeatTypeAlias(input: string): string | null {
  return getBeatTypeAliases()[normalizeAlias(input)] ?? null;
}

/**
 * Compact per-type schema digest for AI prompts. One line per beat type:
 *   id ("Display Name", category, connection): description — params: a, b, c
 * Replaces dumping the full 150KB schema JSON into prompts.
 */
export function buildBeatTypeDigest(): string {
  return Object.entries(BEAT_TYPES)
    .map(([id, def]) => {
      const params = getParameterNames(id);
      const paramsNote = params.length > 0 ? ` — params: ${params.join(', ')}` : '';
      const category = def.category ?? 'visible';
      const connection = def.connectionType ? `, connects: ${def.connectionType}` : '';
      return `- ${id} ("${def.displayName ?? id}", ${category}${connection}): ${def.description ?? ''}${paramsNote}`;
    })
    .join('\n');
}
