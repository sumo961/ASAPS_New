import type { Effect } from '../types';

/**
 * Migrate a choice/prop's flat counter fields and dead effects entries
 * into canonical Effect entries in the effects array.
 *
 * - Converts flat `counter`/`counterOperation`/`counterValue` → canonical Effect
 * - Removes dead `type: "counter"` entries from effects array (non-canonical, never processed by applyEffect)
 * - Preserves any other valid effects already in the array
 *
 * Mutates the choice object in place and returns it for convenience.
 */
export function migrateChoiceEffects<T extends Record<string, any>>(choice: T): T {
  if (!choice) return choice;

  // Start with existing effects, filtering out dead `type: "counter"` entries
  const existingEffects: Effect[] = Array.isArray(choice.effects)
    ? choice.effects.filter((e: any) => e.type !== 'counter')
    : [];

  // Convert flat counter fields to canonical Effect
  if (choice.counter) {
    const counterName = choice.counter as string;
    const operation = (choice.counterOperation as string) || 'change';
    const value = choice.counterValue ?? 1;

    // Don't add duplicate if an equivalent canonical effect already exists
    const alreadyHasCanonical = existingEffects.some(
      (e: Effect) =>
        (e.type === 'incrementCounter' || e.type === 'setCounter') &&
        e.target === counterName
    );

    if (!alreadyHasCanonical) {
      if (operation === 'set') {
        existingEffects.push({
          type: 'setCounter',
          target: counterName,
          value: value,
        });
      } else {
        existingEffects.push({
          type: 'incrementCounter',
          target: counterName,
          value: value,
        });
      }
    }

    // Remove flat fields
    delete choice.counter;
    delete choice.counterOperation;
    delete choice.counterValue;
  }

  // Update effects array (or remove if empty)
  if (existingEffects.length > 0) {
    (choice as any).effects = existingEffects;
  }

  return choice;
}

/**
 * Migrate all choices in a dialog tree node recursively.
 */
export function migrateDialogTreeEffects(node: any): void {
  if (!node) return;

  if (node.choices && Array.isArray(node.choices)) {
    for (const choice of node.choices) {
      migrateChoiceEffects(choice);
      // Recurse into nested dialog nodes
      if (choice.dialogNode) {
        migrateDialogTreeEffects(choice.dialogNode);
      }
    }
  }
}
