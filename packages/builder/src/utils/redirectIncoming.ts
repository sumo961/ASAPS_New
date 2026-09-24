/**
 * Point every link INTO one beat at another beat instead.
 *
 * Used by the Co-Designer's "new version of a beat" proposal: the old beat
 * stays, the new one is added beside it, and only the incoming links move —
 * so the author can play both and delete whichever loses. Outgoing links
 * are untouched (the new version carries its own).
 *
 * Links live in many shapes (see storyLinks.ts, the one authority on where a
 * beat points). Rather than a second per-shape writer, this rewrites every
 * TARGET-NAMED field whose value is exactly the old id — beat ids are
 * unique tokens ("beat_27"), so an exact match on a target-named key is the
 * link — and then asks storyLinks whether anything still points at the old
 * beat. Anything left is reported, never silently ignored.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { beatLinks } from './storyLinks';

/** Keys that hold a beat id in any of the link shapes storyLinks reads. */
const TARGET_KEYS = new Set([
  'target', 'targetId', 'next', 'defaultTarget', 'trueTarget', 'falseTarget',
  'trueConnection', 'falseConnection', 'timerTarget', 'failTarget', 'targetBeatId',
  'exitTarget', 'actionExitTarget', 'fallbackExitTarget', 'fallbackTarget',
]);
/** Arrays whose string entries are beat ids (randomTarget choices, QR jumps). */
const TARGET_ARRAYS = new Set(['choices', 'qrJumpTargets']);

function rewrite(value: any, from: string, to: string, count: { n: number }): any {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const nv = rewrite(v, from, to, count);
      if (nv !== v) changed = true;
      return nv;
    });
    return changed ? out : value;
  }
  if (!value || typeof value !== 'object') return value;
  let out: any = value;
  for (const [k, v] of Object.entries(value)) {
    let nv: any = v;
    if (TARGET_KEYS.has(k) && v === from) {
      nv = to;
      count.n++;
    } else if (TARGET_ARRAYS.has(k) && Array.isArray(v) && v.some((x) => x === from)) {
      nv = v.map((x) => (x === from ? to : rewrite(x, from, to, count)));
      count.n += v.filter((x) => x === from).length;
    } else if (v && typeof v === 'object') {
      nv = rewrite(v, from, to, count);
    }
    if (nv !== v) {
      if (out === value) out = { ...value };
      out[k] = nv;
    }
  }
  return out;
}

export interface RedirectBeat {
  id: string;
  parameters: Record<string, any>;
  connections?: Array<Record<string, any>>;
  defaultTarget?: string;
  requires?: Array<Record<string, any>>;
}

export interface RedirectUpdate {
  beatId: string;
  /** Only the fields that changed: parameters (top-level keys), connections, defaultTarget, requires. */
  updates: Record<string, any>;
  links: number;
}

export interface RedirectResult {
  updates: RedirectUpdate[];
  links: number;
  /** Links storyLinks still sees into `from` after the rewrite (should be none). */
  leftovers: Array<{ source: string; via: string }>;
}

/** Rewrite links to `from` inside one value (e.g. a new beat's own self-links). */
export function retargetValue<T>(value: T, from: string, to: string): T {
  return rewrite(value, from, to, { n: 0 });
}

export function redirectIncoming(beats: RedirectBeat[], from: string, to: string): RedirectResult {
  const updates: RedirectUpdate[] = [];
  const leftovers: RedirectResult['leftovers'] = [];
  let total = 0;
  for (const b of beats) {
    if (b.id === from || b.id === to) continue;
    const count = { n: 0 };
    const upd: Record<string, any> = {};
    const params = rewrite(b.parameters || {}, from, to, count);
    if (params !== b.parameters) {
      const patch: Record<string, any> = {};
      for (const k of Object.keys(params)) if (params[k] !== (b.parameters || {})[k]) patch[k] = params[k];
      upd.parameters = patch;
    }
    if (Array.isArray(b.connections)) {
      const conns = rewrite(b.connections, from, to, count);
      if (conns !== b.connections) upd.connections = conns;
    }
    if (b.defaultTarget === from) {
      upd.defaultTarget = to;
      count.n++;
    }
    if (Array.isArray(b.requires)) {
      const req = rewrite(b.requires, from, to, count);
      if (req !== b.requires) upd.requires = req;
    }
    if (count.n > 0) {
      updates.push({ beatId: b.id, updates: upd, links: count.n });
      total += count.n;
    }
    const after = {
      id: b.id,
      parameters: params,
      connections: upd.connections ?? b.connections,
      defaultTarget: upd.defaultTarget ?? b.defaultTarget,
    };
    for (const l of beatLinks(after)) if (l.target === from) leftovers.push({ source: b.id, via: l.via });
  }
  return { updates, links: total, leftovers };
}
