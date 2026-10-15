/**
 * Editor colours for the speakers of a dialog tree. Speakers get palette
 * slots in the order they first speak, so up to `paletteSize` speakers never
 * share a colour (a name hash let two characters in one scene collide).
 */
type Node = { speaker?: string; choices?: Array<{ dialogNode?: Node }> } | null | undefined;

/** The key a speaker is coloured by; an unnamed line counts as "NPC". */
export const speakerColorKey = (speaker: string | undefined): string => (speaker ?? '').trim() || 'NPC';

export function assignSpeakerColorSlots(tree: Node): Map<string, number> {
  const slots = new Map<string, number>();
  const visit = (node: Node) => {
    if (!node) return;
    const key = speakerColorKey(node.speaker);
    if (!slots.has(key)) slots.set(key, slots.size);
    for (const choice of node.choices ?? []) visit(choice.dialogNode);
  };
  visit(tree);
  return slots;
}

/** Fallback for a speaker not in the tree yet: a stable hash of the name. */
export function hashSpeakerSlot(speaker: string): number {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = ((hash << 5) - hash + speaker.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
