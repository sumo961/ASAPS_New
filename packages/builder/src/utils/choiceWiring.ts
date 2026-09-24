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

export type SiteField = 'effects' | 'conditions';

export type SitePatch =
  | { ok: true; parametersPatch: Json; site: WiringSite }
  | { ok: false; problem: string };

function replaceInDialog(node: Json, id: string, field: SiteField, value: Json[], hits: { n: number }): Json {
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
  value: Json[],
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
