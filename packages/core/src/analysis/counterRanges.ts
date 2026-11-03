/**
 * Counter ranges: the values each counter can have when players arrive at a
 * beat, as one range per counter instead of every combination. Used by
 * StateSimulationAnalyzer.counterRanges before the situation search, to rule
 * out branches no way of playing can take (a check that always answers the
 * same way) — soundly: a range only ever holds more values than can happen.
 */

/** Lowest and highest value, inclusive; ±Infinity when unbounded. */
export type Range = readonly [number, number];

/** Certainly true, certainly false, or it depends (undefined). */
export type Verdict = boolean | undefined;

/** How a step changes a counter: to a·x + b, or to anything (null). */
export type Change = { a: number; b: number } | null;

export const ANY: Range = [-Infinity, Infinity];

export function hull(x: Range, y: Range): Range {
  return [Math.min(x[0], y[0]), Math.max(x[1], y[1])];
}

export function applyChange(r: Range, f: Change | undefined): Range {
  if (f === undefined) return r;
  if (f === null) return ANY;
  if (f.a === 0) return [f.b, f.b];
  const x = f.a * r[0] + f.b;
  const y = f.a * r[1] + f.b;
  if (Number.isNaN(x) || Number.isNaN(y)) return ANY;
  return x <= y ? [x, y] : [y, x];
}

/**
 * The change a step makes to one counter, from the values it leaves when the
 * counter was 0, 1 and 7 before. Null when those don't lie on one line.
 */
export function changeFrom(y0: number, y1: number, y7: number): Change {
  if (![y0, y1, y7].every(Number.isFinite)) return null;
  const a = y1 - y0;
  const b = y0;
  const expected = 7 * a + b;
  if (Math.abs(y7 - expected) > 1e-9 * Math.max(1, Math.abs(y7))) return null;
  return { a, b };
}

/** l op r for every value in the ranges: as StateSimulationAnalyzer.compareValues on numbers. */
export function compareRanges(l: Range, op: string, r: Range): Verdict {
  const [a, b] = l;
  const [c, d] = r;
  switch (op) {
    case '>=': return a >= d ? true : b < c ? false : undefined;
    case '>': return a > d ? true : b <= c ? false : undefined;
    case '<=': return b <= c ? true : a > d ? false : undefined;
    case '<': return b < c ? true : a >= d ? false : undefined;
    case '==': return a === b && c === d && a === c ? true : b < c || d < a ? false : undefined;
    case '!=': {
      const same = compareRanges(l, '==', r);
      return same === undefined ? undefined : !same;
    }
    default: return false; // compareValues: an unknown operator never holds
  }
}

export function allOf(verdicts: Verdict[]): Verdict {
  if (verdicts.some((v) => v === false)) return false;
  return verdicts.every((v) => v === true) ? true : undefined;
}

export function anyOf(verdicts: Verdict[]): Verdict {
  if (verdicts.some((v) => v === true)) return true;
  return verdicts.every((v) => v === false) ? false : undefined;
}

export function not(v: Verdict): Verdict {
  return v === undefined ? undefined : !v;
}

/**
 * The nodes that lie on some cycle (strongly connected components of more
 * than one node, or a node linking to itself). Iterative Tarjan: stories run
 * to thousands of beats.
 */
export function beatsOnLoops(ids: string[], next: (id: string) => string[]): Set<string> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const loops = new Set<string>();
  const known = new Set(ids);
  let counter = 0;
  for (const root of ids) {
    if (index.has(root)) continue;
    const work: Array<{ id: string; out: string[]; i: number }> = [];
    const open = (id: string) => {
      index.set(id, counter); low.set(id, counter); counter++;
      stack.push(id); onStack.add(id);
      work.push({ id, out: next(id).filter((t) => known.has(t)), i: 0 });
    };
    open(root);
    while (work.length > 0) {
      const top = work[work.length - 1];
      if (top.i < top.out.length) {
        const t = top.out[top.i++];
        if (t === top.id) loops.add(t);
        if (!index.has(t)) open(t);
        else if (onStack.has(t)) low.set(top.id, Math.min(low.get(top.id)!, index.get(t)!));
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.id)!));
      }
      if (low.get(top.id) === index.get(top.id)) {
        const component: string[] = [];
        let id: string;
        do { id = stack.pop()!; onStack.delete(id); component.push(id); } while (id !== top.id);
        if (component.length > 1) component.forEach((c) => loops.add(c));
      }
    }
  }
  return loops;
}

/** The values a − b takes for a in x and b in y. */
export function gapOf(x: Range, y: Range): Range {
  return [safe(x[0] - y[1], -Infinity), safe(x[1] - y[0], Infinity)];
}

/** NaN (∞ − ∞) means unbounded on that side. */
export function safe(n: number, otherwise: number): number {
  return Number.isNaN(n) ? otherwise : n;
}

/** Both at once; null when they don't overlap. */
export function meet(x: Range, y: Range): Range | null {
  const lo = Math.max(x[0], y[0]);
  const hi = Math.min(x[1], y[1]);
  return lo <= hi + 1e-9 * Math.max(1, Math.abs(hi)) ? [lo, Math.max(lo, hi)] : null;
}

/** Just under / over a value: where a strict check (< 30, > 0) leaves a range. */
export function justBelow(t: number): number { return t - 1e-9 * Math.max(1, Math.abs(t)); }
export function justAbove(t: number): number { return t + 1e-9 * Math.max(1, Math.abs(t)); }

/** A range cut to the values for which `value op t` holds; null if none. */
export function narrowTo(r: Range, op: string, t: number): Range | null {
  switch (op) {
    case '>=': return meet(r, [t, Infinity]);
    case '>': return meet(r, [justAbove(t), Infinity]);
    case '<=': return meet(r, [-Infinity, t]);
    case '<': return meet(r, [-Infinity, justBelow(t)]);
    case '==': return meet(r, [t, t]);
    default: return r;
  }
}

function shown(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

/** "Money is always 0 there", "Trust is at least 2 there". */
export function describeRange(name: string, r: Range): string | null {
  const [lo, hi] = r;
  if (lo === hi) return `${name} is always ${shown(lo)} there`;
  // Just under a round value: what a strict check left ("below 30").
  const under = Number.isFinite(hi) && hi !== Math.round(hi) && Math.round(hi) - hi < 1e-6 * Math.max(1, Math.abs(hi));
  const over = Number.isFinite(lo) && lo !== Math.round(lo) && lo - Math.round(lo) < 1e-6 * Math.max(1, Math.abs(lo)) && lo > Math.round(lo);
  if (under && !Number.isFinite(lo)) return `${name} is below ${shown(Math.round(hi))} there`;
  if (over && !Number.isFinite(hi)) return `${name} is above ${shown(Math.round(lo))} there`;
  if (under && Number.isFinite(lo)) return `${name} is at least ${shown(lo)} and below ${shown(Math.round(hi))} there`;
  if (Number.isFinite(lo) && Number.isFinite(hi)) return `${name} is between ${shown(lo)} and ${shown(hi)} there`;
  if (Number.isFinite(lo)) return `${name} is at least ${shown(lo)} there`;
  if (Number.isFinite(hi)) return `${name} is at most ${shown(hi)} there`;
  return null;
}
