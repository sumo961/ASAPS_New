/**
 * Where a beat's player options live, and immutable edits to one of them.
 *
 * A "wiring site" is anything that can carry its own `conditions` (show only
 * if…) and `effects` (what picking / reaching it does):
 *   - multiChoice / movementChoice   parameters.choices[]
 *   - pickProp                       parameters.props[]
 *   - panorama                       parameters.hotspots[]
 *   - dialogTree / aiDialogTree      parameters.dialogTree — every node and
 *                                    every choice, at any depth
 *
 * Used by the Co-Designer (setChoiceEffects / setChoiceConditions proposals)
 * and by the story digest that shows the model the current wiring.
 */

type Json = Record<string, any>;

export type WiringSiteKind = 'choice' | 'prop' | 'hotspot' | 'dialogNode' | 'dialogChoice';

export interface WiringSite {
  kind: WiringSiteKind;
  id: string;
  /** Player-facing label (button text / prop name / node text), for descriptions. */
  label: string;
  target?: string;
  conditions: Json[];
  effects: Json[];
  /** Legacy single-counter shorthand on a choice (counter / counterOperation / counterValue). */
  legacyCounter?: { counter: string; operation: string; value: unknown };
  /** Dialog depth (0 = root node) — for indenting the digest. */
  depth: number;
}

const FLAT_LISTS: Array<{ param: string; kind: WiringSiteKind }> = [
  { param: 'choices', kind: 'choice' },
  { param: 'props', kind: 'prop' },
  { param: 'hotspots', kind: 'hotspot' },
];

function labelOf(o: Json): string {
  const raw = o.text ?? o.buttonText ?? o.label ?? o.name ?? o.displayName ?? '';
  return typeof raw === 'string' ? raw : '';
}

function site(kind: WiringSiteKind, o: Json, depth: number): WiringSite {
  const s: WiringSite = {
    kind,
    id: String(o.id),
    label: labelOf(o),
    target: typeof o.target === 'string' && o.target ? o.target : undefined,
    conditions: Array.isArray(o.conditions) ? o.conditions : [],
    effects: Array.isArray(o.effects) ? o.effects : [],
    depth,
  };
  if (typeof o.counter === 'string' && o.counter) {
    s.legacyCounter = { counter: o.counter, operation: o.counterOperation ?? 'change', value: o.counterValue };
  }
  return s;
}

function walkDialog(node: Json | undefined, depth: number, out: WiringSite[]): void {
  if (!node || typeof node !== 'object' || node.id === undefined) return;
  out.push(site('dialogNode', node, depth));
  for (const c of Array.isArray(node.choices) ? node.choices : []) {
    if (!c || typeof c !== 'object' || c.id === undefined) continue;
    out.push(site('dialogChoice', c, depth));
    walkDialog(c.dialogNode, depth + 1, out);
  }
}

/** Every wiring site on a beat, in reading order. */
export function listWiringSites(parameters: Json | undefined): WiringSite[] {
  const p = parameters ?? {};
  const out: WiringSite[] = [];
  for (const { param, kind } of FLAT_LISTS) {
    for (const o of Array.isArray(p[param]) ? p[param] : []) {
      if (o && typeof o === 'object' && o.id !== undefined) out.push(site(kind, o, 0));
    }
  }
  if (p.dialogTree && typeof p.dialogTree === 'object') walkDialog(p.dialogTree, 0, out);
  return out;
}

/** Any field on an option; wiring uses 'effects' / 'conditions', text edits the label field. */
export type SiteField = string;

/** The field an option's player-facing label lives in (what labelOf read), default 'text'. */
export function labelFieldOf(parameters: Json | undefined, siteId: string): string {
  const raw = findRawSite(parameters, siteId);
  if (!raw) return 'text';
  for (const k of ['text', 'buttonText', 'label', 'name', 'displayName']) {
    if (typeof raw[k] === 'string') return k;
  }
  return 'text';
}

function findRawSite(parameters: Json | undefined, siteId: string): Json | null {
  const p = parameters ?? {};
  for (const { param } of FLAT_LISTS) {
    const hit = (Array.isArray(p[param]) ? p[param] : []).find((o: Json) => o && String(o.id) === siteId);
    if (hit) return hit;
  }
  let found: Json | null = null;
  const walk = (node: Json | undefined) => {
    if (!node || typeof node !== 'object' || found) return;
    if (String(node.id) === siteId) { found = node; return; }
    for (const c of Array.isArray(node.choices) ? node.choices : []) {
      if (!c || typeof c !== 'object') continue;
      if (String(c.id) === siteId) { found = c; return; }
      walk(c.dialogNode);
    }
  };
  walk(p.dialogTree);
  return found;
}

export type SitePatch =
  | { ok: true; parametersPatch: Json; site: WiringSite }
  | { ok: false; problem: string };

function replaceInDialog(node: Json, id: string, field: SiteField, value: unknown, hits: { n: number }): Json {
  let next = node;
  if (String(node.id) === id) {
    hits.n++;
    next = { ...node, [field]: value };
  }
  if (Array.isArray(node.choices)) {
    const choices = node.choices.map((c: Json) => {
      if (!c || typeof c !== 'object') return c;
      let nc = c;
      if (String(c.id) === id) {
        hits.n++;
        nc = { ...c, [field]: value };
      }
      if (c.dialogNode && typeof c.dialogNode === 'object') {
        const nn = replaceInDialog(c.dialogNode, id, field, value, hits);
        if (nn !== c.dialogNode) nc = { ...nc, dialogNode: nn };
      }
      return nc;
    });
    if (choices.some((c: Json, i: number) => c !== node.choices[i])) next = { ...next, choices };
  }
  return next;
}

/**
 * Replace `effects` or `conditions` on the ONE site with this id. Returns the
 * top-level parameter patch (e.g. `{ choices: [...] }`), leaving everything
 * else untouched. An id that matches zero or several sites is refused.
 */
export function setSiteField(
  parameters: Json | undefined,
  siteId: string,
  field: SiteField,
  value: unknown,
): SitePatch {
  const p = parameters ?? {};
  const sites = listWiringSites(p).filter((s) => s.id === siteId);
  if (sites.length === 0) {
    const known = listWiringSites(p).map((s) => s.id);
    return {
      ok: false,
      problem: known.length
        ? `no option "${siteId}" (options: ${known.slice(0, 12).join(', ')}${known.length > 12 ? ', …' : ''})`
        : 'this beat has no choices, props, hotspots or dialog',
    };
  }
  if (sites.length > 1) return { ok: false, problem: `option id "${siteId}" is used ${sites.length} times on this beat` };

  const target = sites[0];
  if (target.kind === 'dialogNode' || target.kind === 'dialogChoice') {
    const hits = { n: 0 };
    const tree = replaceInDialog(p.dialogTree, siteId, field, value, hits);
    return { ok: true, parametersPatch: { dialogTree: tree }, site: target };
  }
  const param = FLAT_LISTS.find((f) => f.kind === target.kind)!.param;
  const list = (p[param] as Json[]).map((o) => (o && String(o.id) === siteId ? { ...o, [field]: value } : o));
  return { ok: true, parametersPatch: { [param]: list }, site: target };
}

/** Find one site by id (null when missing or ambiguous). */
export function findWiringSite(parameters: Json | undefined, siteId: string): WiringSite | null {
  const hits = listWiringSites(parameters).filter((s) => s.id === siteId);
  return hits.length === 1 ? hits[0] : null;
}

/** A new option as proposed: label, and optionally where it goes and what it does. */
export interface NewOption {
  id?: string;
  text: string;
  target?: string;
  effects?: Json[];
  conditions?: Json[];
  /** Dialog only: the conversation continues with this node instead of exiting. */
  dialogNode?: Json;
}

export type AddPatch =
  | { ok: true; parametersPatch: Json; id: string; where: string }
  | { ok: false; problem: string };

let optionSeq = 0;
/** Fresh option id, unique against the ids already on the beat. */
export function freshOptionId(taken: Set<string>): string {
  let id: string;
  do { id = `choice_${Date.now()}_${++optionSeq}`; } while (taken.has(id));
  return id;
}

/**
 * Add one option. choices[] beats (multiChoice / movementChoice) append to
 * their list; dialog trees append to a node's choices — the root unless
 * `parentId` names a node, or a choice that already continues into a node.
 * Props and hotspots are refused: they need placing on the stage.
 */
export function addOption(parameters: Json | undefined, option: NewOption, parentId?: string): AddPatch {
  const p = parameters ?? {};
  const taken = new Set(listWiringSites(p).map((s) => s.id));
  if (option.id && taken.has(option.id)) return { ok: false, problem: `option id "${option.id}" already exists on this beat` };
  const id = option.id || freshOptionId(taken);
  const entry: Json = { id, text: option.text };
  if (option.target) entry.target = option.target;
  if (option.effects?.length) entry.effects = option.effects;
  if (option.conditions?.length) entry.conditions = option.conditions;
  if (option.dialogNode) entry.dialogNode = option.dialogNode;

  if (p.dialogTree && typeof p.dialogTree === 'object') {
    const rootId = String(p.dialogTree.id);
    const parent = parentId ?? rootId;
    let where = '';
    const append = (node: Json): Json => {
      if (String(node.id) === parent) {
        where = `node ${parent}`;
        return { ...node, choices: [...(Array.isArray(node.choices) ? node.choices : []), entry] };
      }
      if (!Array.isArray(node.choices)) return node;
      let changed = false;
      const choices = node.choices.map((c: Json) => {
        if (!c || typeof c !== 'object') return c;
        if (String(c.id) === parent && c.dialogNode) {
          changed = true;
          where = `after choice ${parent}`;
          return { ...c, dialogNode: { ...c.dialogNode, choices: [...(c.dialogNode.choices || []), entry] } };
        }
        if (c.dialogNode) {
          const nn = append(c.dialogNode);
          if (nn !== c.dialogNode) { changed = true; return { ...c, dialogNode: nn }; }
        }
        return c;
      });
      return changed ? { ...node, choices } : node;
    };
    const tree = append(p.dialogTree);
    if (!where) {
      return { ok: false, problem: `no dialog node "${parent}" (or a choice ${parent} that continues the conversation) on this beat` };
    }
    return { ok: true, parametersPatch: { dialogTree: tree }, id, where };
  }
  if (Array.isArray(p.choices) && p.choices.every((c: unknown) => c && typeof c === 'object')) {
    if (parentId) return { ok: false, problem: 'parentId only applies to dialog trees' };
    if (!option.target) return { ok: false, problem: 'a choice button needs a target beat' };
    return { ok: true, parametersPatch: { choices: [...p.choices, entry] }, id, where: 'choices' };
  }
  if (Array.isArray(p.props) || Array.isArray(p.hotspots)) {
    return { ok: false, problem: 'props and hotspots need placing on the stage — add them in the Visual Editor' };
  }
  return { ok: false, problem: 'this beat has no choice list or dialog to add to' };
}

/** Give every dialog node / choice an id (a model-written tree may omit them). */
export function ensureDialogIds(tree: Json): Json {
  const taken = new Set<string>();
  const seen = (n: Json) => { if (n && n.id !== undefined) taken.add(String(n.id)); };
  const collect = (n: Json | undefined) => {
    if (!n || typeof n !== 'object') return;
    seen(n);
    for (const c of Array.isArray(n.choices) ? n.choices : []) { seen(c); collect(c?.dialogNode); }
  };
  collect(tree);
  const fix = (n: Json, depth: number): Json => {
    const node: Json = { ...n, id: n.id !== undefined && n.id !== '' ? n.id : `node_${depth}_${freshOptionId(taken)}` };
    taken.add(String(node.id));
    node.choices = (Array.isArray(n.choices) ? n.choices : []).filter((c: unknown) => c && typeof c === 'object').map((c: Json) => {
      const choice: Json = { ...c, id: c.id !== undefined && c.id !== '' ? c.id : freshOptionId(taken) };
      taken.add(String(choice.id));
      if (c.dialogNode && typeof c.dialogNode === 'object') choice.dialogNode = fix(c.dialogNode, depth + 1);
      return choice;
    });
    return node;
  };
  return fix(tree, 0);
}
