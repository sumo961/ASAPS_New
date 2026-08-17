/**
 * How many phases does a dialogTree beat contain?
 *
 * A "phase" is one exchange the conversation can present — the root node plus
 * every nested node reachable inside the SAME beat (a choice's `dialogNode`,
 * an old-format object `target`, an object `next`, or an `entries[]` member).
 * The flowchart draws the whole beat as one flat card, so a dialog the player
 * spends five exchanges inside looks identical to a one-liner — this count is
 * what the graph's stacked-edge/dot-strip rendering is built from.
 *
 * This walks the same wild shapes storyLinks' walkDialog knows, but counts
 * nodes rather than extracting link targets — it deliberately does NOT read
 * or return any `target` beat ids (that job belongs to storyLinks alone).
 */
export function dialogTreePhaseCount(tree: unknown): number {
  if (!tree || typeof tree !== 'object') return 0;
  const seen = new WeakSet<object>();
  let count = 0;

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node as object)) return;
    seen.add(node as object);
    const n = node as Record<string, unknown>;

    // A phase is a node that presents something: dialog text or choices.
    // Pure container objects (entries wrappers without content) don't count.
    const presents =
      typeof n.text === 'string' ||
      typeof n.npcText === 'string' ||
      Array.isArray(n.choices);
    if (presents) count += 1;

    if (Array.isArray(n.choices)) {
      for (const choice of n.choices) {
        if (!choice || typeof choice !== 'object') continue;
        const c = choice as Record<string, unknown>;
        if (c.dialogNode) visit(c.dialogNode);
        // Old nested format: target as an OBJECT is a deeper node.
        if (c.target && typeof c.target === 'object') visit(c.target);
      }
    }
    if (Array.isArray(n.entries)) {
      for (const entry of n.entries) visit(entry);
    }
    if (n.next && typeof n.next === 'object') visit(n.next);
  };

  visit(tree);
  return count;
}
