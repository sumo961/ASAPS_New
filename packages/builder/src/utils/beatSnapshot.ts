/**
 * A beat as it is now, for an undo step: its own fields and its parameters,
 * copied. The Properties panel writes an edit onto the beat before App
 * records the undo step, so App's own "before" read the edited beat and
 * Undo changed nothing; the panel takes this snapshot first and hands it on.
 *
 * `parameters` makes the undo go through updateParameters(), which rebuilds
 * what a beat type derives from them (links from choices and the like).
 */
export function beatSnapshot(beat: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(beat ?? {})) {
    if (typeof value === 'function' || key === '_version') continue;
    out[key] = copy(value);
  }
  if (typeof beat?.getParameters === 'function') out.parameters = copy(beat.getParameters());
  return out;
}

function copy(value: any): any {
  if (!value || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    // Something not cloneable (a function inside): the data without it.
    return JSON.parse(JSON.stringify(value));
  }
}

/** JSON.stringify replacer that writes a Map (a beat's locations) as its entries, to compare. */
export function mapsAsEntries(_key: string, value: any): any {
  return value instanceof Map ? Array.from(value.entries()) : value;
}
