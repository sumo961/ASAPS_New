/**
 * Change a beat into another type of beat (2026-10-29, class feedback:
 * "being able to change an already existing beat into another type of beat
 * without having to delete it and remake all the content inside the beat
 * along with its connections").
 *
 * The beat keeps its id — so every link to it stays — and its name,
 * position, cluster, speaker, background, sound, notes and the settings the
 * new type also has. What it says and where it leads are carried across:
 *
 *   text beats   Info Text, Explanation, Timed Screen, End Screen
 *   choice beats Multi Choice, Movement Choice, Pick Prop
 *   Dialog Tree
 *
 * Between text beats the text and the link stay. A text beat becoming a
 * choice beat asks its text as the question, with its link as the first
 * choice; the other way the question becomes the text and the first
 * choice's link the beat's link. A Dialog Tree's first line is the text or
 * question, its replies the choices. Anything the new type can't hold is
 * named in `losses`, so the author decides before it goes.
 */
import { BeatTypeRegistry, type Beat } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';
import { deserializeBeats } from './projectDeserializer';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Family = 'text' | 'choice' | 'dialog';

const FAMILY: Record<string, Family> = {
  infoText: 'text', explanation: 'text', durScreen: 'text', endScreen: 'text',
  multiChoice: 'choice', movementChoice: 'choice', pickProp: 'choice',
  dialogTree: 'dialog',
};

const DEFS = beatDefinitions.beatTypes as Record<string, { displayName?: string; parameters?: Record<string, any> }>;
/** A setting's name as the Properties panel shows it. */
const settingLabel = (type: string, key: string) =>
  DEFS[type]?.parameters?.[key]?.ui?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
/** Worth naming when it goes: set to something, not an empty or off default. */
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== false && v !== 0
  && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
const schemaKeys = (type: string) => new Set(Object.keys(DEFS[type]?.parameters || {}));
export const beatTypeLabel = (type: string) => DEFS[type]?.displayName || type;

/** One thing said and where it leads — the common ground of all three families. */
interface Option { id?: string; text: string; target?: string; effects?: any[]; conditions?: any[]; soundEffect?: string }
interface Content { text: string; link?: string; linkEffects?: any[]; options: Option[]; speaker?: string; nested: string[] }

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

function read(beat: any, json: any): Content {
  const p = json.parameters || {};
  const type: string = json.type;
  const stored = (Array.isArray(json.connections) ? json.connections : []).filter((c: any) => c && !c.derivedFrom);
  const family = FAMILY[type];
  if (family === 'text') {
    return { text: type === 'endScreen' ? p.message || '' : p.text || '', link: stored[0]?.targetId, linkEffects: stored[0]?.effects, options: [], speaker: beat.speaker, nested: [] };
  }
  if (family === 'choice') {
    const list = type === 'pickProp' ? p.props : p.choices;
    const options: Option[] = (Array.isArray(list) ? list : []).filter(Boolean).map((c: any) => ({
      id: c.id,
      text: type === 'pickProp' ? (c.displayName || c.name || '') : (c.displayText || c.text || c.location || ''),
      target: c.target, effects: c.effects, conditions: c.conditions, soundEffect: c.soundEffect,
    }));
    return { text: p.question || '', options, speaker: beat.speaker, nested: [] };
  }
  // Dialog Tree: its first line, and the replies to it.
  const root = p.dialogTree || {};
  const nested: string[] = [];
  const options: Option[] = (Array.isArray(root.choices) ? root.choices : []).filter(Boolean).map((c: any) => {
    if (c.dialogNode) nested.push(c.text || '…');
    return { id: c.id, text: c.text || '', target: typeof c.target === 'string' ? c.target : undefined, effects: c.effects, conditions: c.conditions, soundEffect: c.soundEffect };
  });
  return { text: root.text || '', link: typeof root.target === 'string' ? root.target : undefined, options, speaker: root.speaker || beat.speaker, nested };
}

/** The parameters and stored links of `type` holding `c`, and what didn't fit. */
function write(type: string, c: Content, base: Record<string, any>): { parameters: Record<string, any>; connections: any[]; losses: string[] } {
  const family = FAMILY[type];
  const losses: string[] = [];
  const parameters = { ...base };
  let connections: any[] = [];
  if (c.nested.length) losses.push(`the conversation after ${c.nested.map((t) => `“${short(t)}”`).join(', ')}`);

  if (family === 'text') {
    parameters[type === 'endScreen' ? 'message' : 'text'] = c.text;
    const link = c.link ?? c.options.find((o) => o.target && o.target !== '__self__')?.target;
    if (link) connections = [{ targetId: link, label: '', ...(c.linkEffects ? { effects: c.linkEffects } : {}) }];
    if (c.options.length > 0) {
      const kept = c.options.find((o) => o.target === link);
      const lost = c.options.filter((o) => o !== kept);
      if (lost.length) losses.push(`${lost.length === 1 ? 'the choice' : 'the choices'} ${lost.map((o) => `“${short(o.text)}”`).join(', ')}`);
      if (kept && kept.text) losses.push(`the button text “${short(kept.text)}” (the beat goes on with its own button)`);
    }
  } else if (family === 'choice') {
    parameters.question = c.text;
    const options = c.options.length > 0 ? c.options
      : [{ text: 'Continue', target: c.link, ...(c.linkEffects ? { effects: c.linkEffects } : {}) }];
    const items = options.map((o, i) => {
      const id = o.id || `choice_${i + 1}`;
      const extra = { ...(o.effects ? { effects: o.effects } : {}), ...(o.conditions ? { conditions: o.conditions } : {}), ...(o.soundEffect ? { soundEffect: o.soundEffect } : {}) };
      return type === 'pickProp'
        ? { id, name: o.text, target: o.target || '', ...extra }
        : { id, text: o.text, target: o.target || '', ...extra };
    });
    parameters[type === 'pickProp' ? 'props' : 'choices'] = items;
  } else {
    const replies = c.options.map((o, i) => ({
      id: o.id || `choice_${i + 1}`, text: o.text, target: o.target || undefined,
      ...(o.effects ? { effects: o.effects } : {}), ...(o.conditions ? { conditions: o.conditions } : {}),
    }));
    parameters.dialogTree = {
      id: 'root', speaker: c.speaker || '', text: c.text, choices: replies,
      ...(replies.length === 0 && c.link ? { target: c.link } : {}),
    };
  }
  return { parameters, connections, losses };
}

/** The types `beat` can become, in palette order; empty when its type can't be changed. */
export function changeableTypes(beat: Beat): string[] {
  const from = FAMILY[(beat as any).type];
  if (!from) return [];
  return Object.keys(FAMILY).filter((t) => t !== (beat as any).type && DEFS[t]);
}

/**
 * `beat` as a beat of `type`: same id and shared fields, its text and links
 * carried across. `losses` names what the new type can't hold.
 */
export function changeBeatType(beat: Beat, type: string): { beat: Beat; losses: string[] } {
  const json = structuredClone((beat as any).toJSON());
  const from: string = json.type;
  const content = read(beat, json);

  // Keep the settings every beat has and the ones both types know; drop the
  // old type's own (its choices, its tree…).
  const fromKeys = schemaKeys(from);
  const toKeys = schemaKeys(type);
  const CARRIED = ['text', 'message', 'question', 'choices', 'props', 'dialogTree', 'connection'];
  const base: Record<string, any> = {};
  const droppedSettings: string[] = [];
  // What a new beat of the old type has: settings still at that weren't chosen.
  let defaults: Record<string, any> = {};
  try {
    defaults = (BeatTypeRegistry.getInstance().createBeat(from, { id: '__defaults__', name: '', type: from } as any) as any).getParameters() || {};
  } catch { /* unknown to the registry: name every set value */ }
  for (const [k, v] of Object.entries(json.parameters || {})) {
    if (!fromKeys.has(k) || toKeys.has(k)) base[k] = v;
    else if (!CARRIED.includes(k) && hasValue(v) && JSON.stringify(v) !== JSON.stringify(defaults[k])) droppedSettings.push(settingLabel(from, k));
  }
  for (const k of CARRIED) delete base[k];

  const { parameters, connections, losses } = write(type, content, base);
  if (droppedSettings.length) losses.push(`its ${droppedSettings.join(', ')} (${beatTypeLabel(type)} has no such setting)`);
  const data = {
    ...json,
    type,
    parameters,
    connections,
    // Visual layouts belong to the old type's text boxes and buttons.
    locations: FAMILY[from] === FAMILY[type] ? json.locations : [],
  };
  if (FAMILY[from] !== FAMILY[type] && (json.locations || []).length > 0) {
    losses.push('its layout in the Visual Editor (text box and button positions)');
  }
  const [rebuilt] = deserializeBeats([data]);
  if (!rebuilt) throw new Error(`Could not make a ${type} beat`);
  return { beat: rebuilt, losses };
}
