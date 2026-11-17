/**
 * Where a story's variables and counters are used: the beats that set each
 * one, the beats that test it in a condition, and the beats that show it
 * (a ${name} in text, a meter). One walk over every beat's parameters,
 * requirements and links, so effects on choices, Dialog Tree lines, hotspots
 * and buttons are all found without a list of where effects can sit.
 *
 * Story Warnings builds its "checked but never set" findings on this walk,
 * and the builder's Story Data window lists it.
 */

export type StoryDataKind = 'variable' | 'counter';

export interface StoryDataUse {
  kind: StoryDataKind;
  name: string;
  /** The character a counter belongs to in this use; absent for the story's own. */
  character?: string;
  /** Beat ids, in story order, without repeats. */
  sets: string[];
  tests: string[];
  /** Named in text as ${name}. */
  shows: string[];
  /**
   * Named by a `counter` field that is not an effect (a meter, a HUD row).
   * Story Warnings has always counted these as "set"; kept apart so the
   * Story Data window can say "shown" instead.
   */
  displays: string[];
}

interface BeatLike {
  id: string;
  type: string;
  getParameters?: () => unknown;
  parameters?: unknown;
  requires?: unknown;
  connections?: unknown;
}

const PLACEHOLDER = /\$\{\s*([A-Za-z_][\w-]*)\s*\}/g;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
/** 'player' and no character at all both mean the story's own store for a condition. */
const owner = (v: unknown): string | undefined => str(v);

export function storyDataUsage(beats: ReadonlyArray<BeatLike>): StoryDataUse[] {
  const uses = new Map<string, StoryDataUse>();
  const entry = (kind: StoryDataKind, name: string, character?: string): StoryDataUse => {
    const k = `${kind}\u0001${character ?? ''}\u0001${name}`;
    let u = uses.get(k);
    if (!u) { u = { kind, name, ...(character ? { character } : {}), sets: [], tests: [], shows: [], displays: [] }; uses.set(k, u); }
    return u;
  };
  const note = (list: string[], beatId: string) => { if (list[list.length - 1] !== beatId && !list.includes(beatId)) list.push(beatId); };
  /** ${name} in text: kind is not known from the text, so it is settled at the end. */
  const placeholders: Array<{ name: string; beatId: string }> = [];

  for (const beat of beats) {
    const params = (beat.getParameters ? beat.getParameters() : beat.parameters) as any ?? {};
    const walk = (o: any): void => {
      if (typeof o === 'string') {
        if (o.includes('${')) for (const m of o.matchAll(PLACEHOLDER)) placeholders.push({ name: m[1], beatId: beat.id });
        return;
      }
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;

      const isCondition = o.type === 'variable' || o.type === 'counter';
      if (isCondition) {
        const name = str(o.variableName) ?? str(o.variable) ?? str(o.left);
        if (name) note(entry(o.type, name, owner(o.character)).tests, beat.id);
      }
      if (o.type === 'counterCompare') {
        for (const name of [str(o.counter1), str(o.counter2)]) if (name) note(entry('counter', name, owner(o.character)).tests, beat.id);
      }
      if (o.type === 'setVariable') { const n = str(o.target); if (n) note(entry('variable', n).sets, beat.id); }
      if (o.type === 'setCounter' || o.type === 'incrementCounter') {
        const n = str(o.target); if (n) note(entry('counter', n, owner(o.character)).sets, beat.id);
      }
      const counterField = str(o.counter);
      if (counterField) {
        // A choice's own counter fields (counter + counterValue) change it;
        // any other `counter` field names one to show.
        const changes = o.counterValue !== undefined || o.counterOperation !== undefined;
        note(changes ? entry('counter', counterField).sets : entry('counter', counterField).displays, beat.id);
      }
      if (!isCondition) { const n = str(o.variable); if (n) note(entry('variable', n).sets, beat.id); }
      for (const v of Object.values(o)) if (v && (typeof v === 'object' || typeof v === 'string')) walk(v);
    };
    walk(params);
    walk(beat.requires);
    walk(beat.connections);
    if (beat.type === 'setVariable' || beat.type === 'variable') {
      const n = str(params.name);
      if (n) note(entry(params.type === 'counter' ? 'counter' : 'variable', n, params.type === 'counter' ? owner(params.character) : undefined).sets, beat.id);
    }
    if (beat.type === 'inputText') {
      const n = str(params.variable) ?? str(params.variableName);
      if (n) note(entry('variable', n).sets, beat.id);
    }
  }

  // A ${name} goes with the counter of that name when the story has one and
  // no variable of that name; otherwise it is a variable.
  for (const { name, beatId } of placeholders) {
    const known = [...uses.values()].filter((u) => u.name === name && !u.character);
    const target = known.find((u) => u.kind === 'variable') ?? known.find((u) => u.kind === 'counter');
    if (target) note(target.shows, beatId);
    else if ([...uses.values()].some((u) => u.name === name)) continue; // a character's counter: shown through that character
    else note(entry('variable', name).shows, beatId);
  }
  return [...uses.values()];
}
