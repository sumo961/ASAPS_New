/**
 * Multi-beat duplication.
 *
 * Serializes the selected Beat instances, gives every copy a fresh id, and
 * deep-rewrites all internal references so the duplicated subgraph stays
 * wired to ITSELF: connections, defaultTarget, dialog-tree / choice targets
 * nested in parameters — anything that referenced a selected beat by id now
 * references its copy (deepRewrite is value-equality based, the same
 * machinery the story-merge uses).
 *
 * References to beats OUTSIDE the selection are left untouched, so a copied
 * subgraph still flows onward into the rest of the story exactly like the
 * original does. Incoming connections from unselected beats are NOT cloned —
 * only the originals are targets of the rest of the story.
 *
 * Returns plain serialized beat data; run it through deserializeBeats() to
 * get real Beat instances.
 */
import { deepRewrite, uniqueId } from './projectMerge';

const DUPLICATE_OFFSET = 40;

export interface DuplicateResult {
  /** serialized clones, ready for deserializeBeats() */
  clones: any[];
  /** original id → clone id */
  idMap: Map<string, string>;
}

export function cloneBeatsForDuplicate(
  selected: ReadonlyArray<any>,
  allBeatIds: Iterable<string>
): DuplicateResult {
  const tag = 'copy' + Date.now().toString(36);
  const taken = new Set<string>(Array.from(allBeatIds, id => String(id)));
  const idMap = new Map<string, string>();

  for (const beat of selected) {
    const newId = uniqueId(String(beat.id), taken, tag);
    taken.add(newId);
    idMap.set(String(beat.id), newId);
  }

  const clones = selected.map(beat => {
    const data =
      typeof beat.toJSON === 'function' ? beat.toJSON() : JSON.parse(JSON.stringify(beat));
    const rewritten = deepRewrite(data, idMap);
    return {
      ...rewritten,
      id: idMap.get(String(beat.id)),
      name: `${data.name || beat.id} (Copy)`,
      x: (typeof data.x === 'number' ? data.x : 0) + DUPLICATE_OFFSET,
      y: (typeof data.y === 'number' ? data.y : 0) + DUPLICATE_OFFSET,
    };
  });

  return { clones, idMap };
}
