/**
 * Walk every beat in a story and collect the names of inventory items,
 * counters, and variables that are referenced anywhere — even if the author
 * never declared them on a character or in global settings.
 *
 * Why this exists: AI-generated stories (and many human-authored ones) freely
 * add items via `addRemoveInventory`, pick them up via `pickProp`, and gate
 * beats on them in conditions, without ever listing them on a character. The
 * Inspector's Requirements editor (and any future UI that needs to autocomplete
 * state names) should show the actual working set, not just pre-declared
 * state — otherwise there's nothing to pick from and authors have to retype
 * names from memory.
 *
 * Callers merge the result with character/global declarations.
 */

import type { Beat } from '@asaps/core';

export interface StoryStateReferences {
  items: Set<string>;
  counters: Set<string>;
  variables: Set<string>;
}

function addIfString(target: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.trim().length > 0) target.add(value.trim());
}

/** Walk a Condition-shaped object and record any referenced state names. */
function collectFromCondition(cond: any, out: StoryStateReferences): void {
  if (!cond || typeof cond !== 'object') return;
  const type = cond.type;
  const name = cond.variableName ?? cond.variable ?? cond.left;
  if (type === 'counter' || type === 'counterCompare') {
    addIfString(out.counters, name);
    addIfString(out.counters, cond.counter1);
    addIfString(out.counters, cond.counter2);
  } else if (type === 'variable') {
    addIfString(out.variables, name);
  } else if (type === 'inventory') {
    addIfString(out.items, cond.item ?? name);
  }
}

/** Walk an effect entry from choices/props/connections and record refs. */
function collectFromEffect(eff: any, out: StoryStateReferences): void {
  if (!eff || typeof eff !== 'object') return;
  const t = eff.type;
  if (t === 'addInventory' || t === 'removeInventory') {
    addIfString(out.items, eff.target ?? eff.item);
  } else if (t === 'inventory') {
    addIfString(out.items, eff.item ?? eff.target);
  } else if (t === 'setVariable') {
    addIfString(out.variables, eff.target ?? eff.variable ?? eff.name);
  } else if (t === 'incrementCounter' || t === 'counter') {
    addIfString(out.counters, eff.target ?? eff.counter ?? eff.name);
  }
}

/** Scan a beat's requirements (StateRequirement[]) for referenced state. */
function collectFromRequires(requires: any, out: StoryStateReferences): void {
  if (!Array.isArray(requires)) return;
  for (const req of requires) {
    if (req && req.condition) collectFromCondition(req.condition, out);
  }
}

/** Scan a beat's parameters for type-specific state references. */
function collectFromBeatParameters(
  beatType: string,
  params: any,
  out: StoryStateReferences,
): void {
  if (!params || typeof params !== 'object') return;

  // Logic-beat direct references
  if (beatType === 'addRemoveInventory') {
    addIfString(out.items, params.item);
  } else if (beatType === 'setVariable') {
    // setVariable mutates either a variable, counter, or inventory depending on `type`
    const tgt = params.type;
    if (tgt === 'counter') addIfString(out.counters, params.name ?? params.variableName);
    else if (tgt === 'inventory') addIfString(out.items, params.name ?? params.item);
    else addIfString(out.variables, params.name ?? params.variableName);
  } else if (beatType === 'conditionBeat') {
    // Inline flattened form: { conditionType, variableName, item, ... }
    collectFromCondition(
      {
        type: params.conditionType,
        variableName: params.variableName,
        counter1: params.counter1,
        counter2: params.counter2,
        item: params.item,
      },
      out,
    );
    // Or nested form: { condition: {...} }
    collectFromCondition(params.condition, out);
  }

  // Prop-picker items
  if (Array.isArray(params.props)) {
    for (const prop of params.props) {
      if (!prop) continue;
      // Items added to inventory: inventoryName > locationName > name
      const itemName = prop.inventoryName || prop.locationName || prop.name;
      addIfString(out.items, itemName);
      // Direct counter field on propOption
      addIfString(out.counters, prop.counter);
      // Nested conditions/effects
      if (Array.isArray(prop.conditions)) prop.conditions.forEach((c: any) => collectFromCondition(c, out));
      if (Array.isArray(prop.effects)) prop.effects.forEach((e: any) => collectFromEffect(e, out));
    }
  }

  // Choice-based effects (dialogTree, movementChoice, conversationChoice, …)
  if (Array.isArray(params.choices)) {
    for (const ch of params.choices) {
      if (!ch) continue;
      if (Array.isArray(ch.effects)) ch.effects.forEach((e: any) => collectFromEffect(e, out));
      if (ch.condition) collectFromCondition(ch.condition, out);
    }
  }

  // Dialog tree nested nodes
  if (params.dialogTree) {
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.choices)) {
        for (const c of node.choices) {
          if (Array.isArray(c?.effects)) c.effects.forEach((e: any) => collectFromEffect(e, out));
          if (c?.condition) collectFromCondition(c.condition, out);
          if (c?.next) walk(c.next);
        }
      }
    };
    walk(params.dialogTree);
  }
}

/** Scan a beat's connections for per-edge conditions/effects. */
function collectFromConnections(connections: any, out: StoryStateReferences): void {
  if (!Array.isArray(connections)) return;
  for (const conn of connections) {
    if (!conn) continue;
    if (conn.condition) collectFromCondition(conn.condition, out);
    if (Array.isArray(conn.effects)) conn.effects.forEach((e: any) => collectFromEffect(e, out));
  }
}

/**
 * Scan every beat and return the union of referenced state names.
 * Accepts Beat instances OR plain JSON (whichever the caller has on hand).
 */
export function extractStoryStateReferences(beats: readonly Beat[] | readonly any[]): StoryStateReferences {
  const out: StoryStateReferences = {
    items: new Set(),
    counters: new Set(),
    variables: new Set(),
  };
  if (!Array.isArray(beats)) return out;

  for (const beat of beats) {
    if (!beat) continue;
    const type = beat.type;
    // Beat instances expose getParameters(); plain JSON stores them on .parameters.
    const params = typeof beat.getParameters === 'function'
      ? beat.getParameters()
      : beat.parameters;
    collectFromBeatParameters(type, params, out);
    collectFromConnections(beat.connections, out);
    collectFromRequires(beat.requires, out);
    // Requirements may also be tucked into parameters.requires (legacy / AI output)
    if (params && Array.isArray(params.requires)) collectFromRequires(params.requires, out);
  }

  return out;
}
