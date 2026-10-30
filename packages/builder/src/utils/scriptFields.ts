/**
 * The Script view's text (2026-10-29, class feedback: "I would like a better
 * text editor. Our group resorted to writing large parts of our text in
 * Google Docs"; "a filter for the type of things you want to edit … I only
 * want to edit text").
 *
 * The fields an author writes, beat by beat, in the shapes the Inspector
 * edits — not the translation extractor's list: that one writes into the
 * translation fields (`displayText`) and carries button labels and other UI
 * strings. Each field has a parameter path; `scriptEdit` turns a changed
 * value into the update App's undoable handleBeatUpdate takes.
 */
import { beatLinks } from './storyLinks';
import { setAtPath } from './linkOutputs';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ScriptField {
  /** Parameter path, e.g. `text`, `choices[1].text`, `dialogTree.choices[0].dialogNode.text`. */
  path: string;
  /** Shown next to the text: "Text", "Choice 2", a speaker's name, "Reply"… */
  label: string;
  value: string;
  /**
   * Indent level: how many branching points of a Dialog Tree lead here. As in
   * the Dialog Tree editor, replies indent only where a line has more than
   * one, so a long back-and-forth stays flat.
   */
  depth: number;
  /** A line a character says, a line the player picks, or plain text. */
  kind: 'text' | 'line' | 'reply' | 'choice';
}

const params = (beat: any): Record<string, any> =>
  (typeof beat?.getParameters === 'function' ? beat.getParameters() : beat?.parameters) || {};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function scriptFields(beat: any): ScriptField[] {
  const p = params(beat);
  const type: string = beat?.type || '';
  const out: ScriptField[] = [];
  const add = (path: string, label: string, value: unknown, kind: ScriptField['kind'] = 'text', depth = 0) => {
    if (typeof value === 'string' || value == null) out.push({ path, label, value: str(value), depth, kind });
  };
  const has = (field: string) => typeof p[field] === 'string' && p[field] !== '';

  if (has('title')) add('title', 'Title', p.title);
  if (has('question')) add('question', 'Question', p.question);
  if (has('text') || ['infoText', 'explanation', 'durScreen', 'hyperText'].includes(type)) add('text', 'Text', p.text);
  if (has('message')) add('message', 'Message', p.message);
  // An AI beat's prompt is an instruction to the model, not text for players.
  if (has('prompt') && !type.startsWith('ai')) add('prompt', 'Prompt', p.prompt);
  if (Array.isArray(p.textVariations)) {
    p.textVariations.forEach((v: unknown, i: number) => add(`textVariations[${i}]`, `Variation ${i + 1}`, v));
  }

  if (['multiChoice', 'movementChoice', 'chooseCharacter'].includes(type) && Array.isArray(p.choices)) {
    p.choices.forEach((c: any, i: number) => {
      if (!c || typeof c !== 'object') return;
      // A label set apart from the matching key is what players read.
      const field = typeof c.displayText === 'string' && c.displayText ? 'displayText' : 'text';
      add(`choices[${i}].${field}`, `Choice ${i + 1}`, c[field], 'choice');
      if (type === 'chooseCharacter' && typeof c.description === 'string') {
        add(`choices[${i}].description`, `Choice ${i + 1} line`, c.description, 'choice');
      }
    });
  }

  // Free Layout: the words on its text boxes and text buttons. Entries whose
  // element was deleted (kept for Undo) and clickable pictures have none.
  if (type === 'freeLayout') {
    const locs: any[] = beat?.locations instanceof Map
      ? Array.from(beat.locations.values())
      : Object.values(beat?.locations || {});
    const kindOf = new Map(locs.map((l) => [l?.name, l?.kind || l?.type]));
    const words = (list: unknown, field: 'texts' | 'choices', kind: string, label: string, as: ScriptField['kind']) => {
      if (!Array.isArray(list)) return;
      list.forEach((e: any, i: number) => {
        if (!e || kindOf.get(e.locationName) !== kind) return;
        const f = typeof e.displayText === 'string' && e.displayText ? 'displayText' : 'text';
        add(`${field}[${i}].${f}`, `${label} (${e.locationName})`, e[f], as);
      });
    };
    words(p.texts, 'texts', 'text', 'Text', 'text');
    words(p.choices, 'choices', 'button', 'Button', 'choice');
  }

  if (type === 'dialogTree' && p.dialogTree) {
    const walk = (node: any, path: string, depth: number) => {
      if (!node || typeof node !== 'object') return;
      add(`${path}.text`, str(node.speaker) || 'Character', node.text, 'line', depth);
      const choices: any[] = Array.isArray(node.choices) ? node.choices : [];
      const branches = choices.filter((c) => c && c.continue !== true).length > 1;
      const inner = depth + (branches ? 1 : 0);
      choices.forEach((c: any, i: number) => {
        if (!c) return;
        // A continue step ("Then another character speaks") has no player
        // line: the next line follows at the same level. Writing text into
        // it would turn it into a reply.
        if (c.continue === true) {
          if (c.dialogNode) walk(c.dialogNode, `${path}.choices[${i}].dialogNode`, depth);
          return;
        }
        add(`${path}.choices[${i}].text`, 'Reply', c.text, 'reply', inner);
        if (c.dialogNode) walk(c.dialogNode, `${path}.choices[${i}].dialogNode`, inner);
      });
    };
    walk(p.dialogTree, 'dialogTree', 0);
  }

  if (type === 'panorama' && Array.isArray(p.hotspots)) {
    p.hotspots.forEach((h: any, i: number) => {
      if (!h) return;
      const field = typeof h.displayText === 'string' && h.displayText ? 'displayText' : 'text';
      if (typeof h[field] === 'string') add(`hotspots[${i}].${field}`, `Hotspot ${i + 1}`, h[field], 'choice');
    });
  }
  if (type === 'aiConversation' && typeof p.openingLine === 'string') add('openingLine', 'Opening line', p.openingLine);
  if ((type === 'endScreen' || type === 'aiSummary') && has('creditsText')) add('creditsText', 'Credits', p.creditsText);

  return out;
}

/** The update that writes `value` at `path` (for App's undoable handleBeatUpdate). */
export function scriptEdit(beat: any, path: string, value: string): { parameters: Record<string, any> } {
  const next = structuredClone(params(beat));
  setAtPath(next, path, value);
  return { parameters: next };
}

const asData = (b: any) => (typeof b?.toJSON === 'function' ? b.toJSON() : b);

/**
 * Beats in reading order: from the story's start along its links, depth
 * first, so a branch is read to its end before the next one; beats no link
 * reaches come after, in list order.
 */
export function storyOrder<T extends { id: string; type?: string }>(beats: ReadonlyArray<T>, firstBeatId?: string | null): T[] {
  const byId = new Map(beats.map((b) => [b.id, b]));
  const incoming = new Set<string>();
  const next = new Map<string, string[]>();
  for (const b of beats) {
    const targets = beatLinks(asData(b)).map((l) => l.target).filter((t) => byId.has(t) && t !== b.id);
    next.set(b.id, [...new Set(targets)]);
    targets.forEach((t) => incoming.add(t));
  }
  const start = (firstBeatId && byId.has(firstBeatId) ? firstBeatId : undefined)
    ?? beats.find((b) => b.type === 'titleScreen')?.id
    ?? beats.find((b) => !incoming.has(b.id))?.id
    ?? beats[0]?.id;
  const seen = new Set<string>();
  const out: T[] = [];
  const visit = (id: string) => {
    // Iterative, so a long chain can't overflow the stack.
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(byId.get(cur)!);
      const kids = next.get(cur) || [];
      for (let i = kids.length - 1; i >= 0; i--) if (!seen.has(kids[i])) stack.push(kids[i]);
    }
  };
  if (start) visit(start);
  for (const b of beats) if (!seen.has(b.id)) visit(b.id);
  return out;
}
