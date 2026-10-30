/**
 * A Free Layout beat's elements in the Visual Editor (2026-10-29). The
 * stage elements are the beat's locations; the words of its text boxes
 * (`texts`) and its buttons (`choices`, each with its own link, effects
 * and conditions) live in the beat's parameters, linked to their element
 * by name — and by the element's id, so renaming an element keeps them.
 *
 * The parameters are the one place the words are kept: the canvas and the
 * properties panel read them from there, editing writes them there, and
 * syncing the elements only makes sure every text box and button has its
 * entry. Entries whose element was deleted stay (unused) so Undo brings
 * back the words and the link with the element.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ElementLike { id: string; type: string; name?: string; text?: string }
type Params = Record<string, any>;

/** The element's name on the stage — as VisualWorkspace keys its location. */
export const elementKey = (el: ElementLike): string => el.name || el.text || el.id;

const findEntry = (list: any[], el: ElementLike) =>
  list.find((e) => e?.elementId && e.elementId === el.id) ?? list.find((e) => e?.locationName === elementKey(el));

const newButtonId = () => `btn_${Math.random().toString(36).slice(2, 10)}`;

/** The words shown on a text box or text button. */
export function wordsFor(params: Params, el: ElementLike): string | undefined {
  if (el.type === 'text') return findEntry(params.texts || [], el)?.text;
  if (el.type === 'button') return findEntry(params.choices || [], el)?.text;
  return undefined;
}

/** The parameters with new words on a text box or text button. */
export function withWords(params: Params, el: ElementLike, text: string): Params {
  const field = el.type === 'text' ? 'texts' : 'choices';
  const list: any[] = [...(params[field] || [])];
  const entry = findEntry(list, el);
  const at = entry ? list.indexOf(entry) : -1;
  const base = entry ?? (field === 'choices' ? { id: newButtonId(), target: '' } : {});
  const next = { ...base, locationName: elementKey(el), elementId: el.id, text };
  if (at >= 0) list[at] = next; else list.push(next);
  return { ...params, [field]: list };
}

/** Is this picture or character a button? */
export function isClickable(params: Params, el: ElementLike): boolean {
  return (el.type === 'prop' || el.type === 'character') && !!findEntry(params.choices || [], el);
}

/**
 * The parameters with a picture or character made a button, or a plain
 * picture again. Unticked, its button (link, conditions, effects) is parked
 * in `parkedButtons`, out of the story's links, and comes back when ticked.
 */
export function withClickable(params: Params, el: ElementLike, on: boolean): Params {
  const choices: any[] = [...(params.choices || [])];
  const parked: any[] = [...(params.parkedButtons || [])];
  const entry = findEntry(choices, el);
  if (on && !entry) {
    const back = findEntry(parked, el);
    if (back) parked.splice(parked.indexOf(back), 1);
    choices.push(back
      ? { ...back, locationName: elementKey(el), elementId: el.id }
      : { id: newButtonId(), locationName: elementKey(el), elementId: el.id, text: '', target: '' });
  }
  if (!on && entry) {
    choices.splice(choices.indexOf(entry), 1);
    parked.push(entry);
  }
  return { ...params, choices, parkedButtons: parked };
}

/**
 * Every text box and text button with its entry, under the element's
 * current name. Returns null when nothing changed.
 */
export function syncFreeLayoutParams(params: Params, elements: ReadonlyArray<ElementLike>): Params | null {
  const texts: any[] = [...(params.texts || [])];
  const choices: any[] = [...(params.choices || [])];
  let changed = false;
  const place = (list: any[], el: ElementLike, fresh: () => any) => {
    const entry = findEntry(list, el);
    const key = elementKey(el);
    if (!entry) { list.push(fresh()); changed = true; return; }
    if (entry.locationName !== key || entry.elementId !== el.id) {
      list[list.indexOf(entry)] = { ...entry, locationName: key, elementId: el.id };
      changed = true;
    }
  };
  for (const el of elements) {
    const key = elementKey(el);
    if (el.type === 'text') {
      place(texts, el, () => ({ locationName: key, elementId: el.id, text: el.text && el.text !== 'New Text' ? el.text : 'Text' }));
    } else if (el.type === 'button') {
      place(choices, el, () => ({ id: newButtonId(), locationName: key, elementId: el.id, text: el.text && el.text !== 'New Button' ? el.text : 'Button', target: '' }));
    } else if ((el.type === 'prop' || el.type === 'character') && findEntry(choices, el)) {
      place(choices, el, () => null);
    }
  }
  return changed ? { ...params, texts, choices } : null;
}
