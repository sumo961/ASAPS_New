/**
 * Bulk re-link helpers for "Define '<name>' as a Character".
 *
 * Two pure functions:
 *   - findReferencesByName(beats, name): list every beat field that currently
 *     references the given name as free text (NOT already linked to a different
 *     character via a canonical id).
 *   - relinkReferences(beats, references, characterId): produce a new beats
 *     array with every matched reference updated to use the canonical id.
 *
 * Sites covered (matches what useUsedNames walks, so the dropdown count and
 * the bulk-relink count stay in sync):
 *   - Beat.speaker / Beat.characterRef (top-level)
 *   - DialogNode.speaker / DialogNode.characterRef (root + every nested node
 *     reachable via choices[].dialogNode)
 *   - AddRemoveInventory.character / .fromChar / .toChar
 *   - AIDialogTree.npcName / AIConversation.npcName
 *
 * Matching is case-insensitive against the character's name and displayName.
 * Refs that already store a Character.id (any character.id, not just the one
 * we're linking to) are skipped — those are explicitly linked, possibly to
 * a different character; we don't want to silently re-link them.
 */

export interface BeatRef {
  id: string;
  type?: string;
  speaker?: string;
  characterRef?: string;
  parameters?: Record<string, any>;
  /** Beat name for display in the confirmation dialog. */
  name?: string;
}

interface CharLike {
  id: string;
  name?: string;
  displayName?: string;
}

/**
 * One reference site found by `findReferencesByName`. The `apply` function is
 * a pure mutation factory — given a target Character.id, it returns a clone of
 * the beat with this specific reference updated.
 */
export interface ReferenceMatch {
  beatId: string;
  beatName?: string;
  /** Human-readable description of where this reference lives. */
  where: string;
  /** The string value currently stored at this site. */
  currentValue: string;
  /** Apply the re-link to a beat clone. Caller passes the matching beat;
   * implementation walks to the right field and updates it. */
  apply: (beat: BeatRef, characterId: string, character: CharLike) => BeatRef;
}

function namesMatch(value: string, c: CharLike): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (c.name && c.name.toLowerCase() === v) return true;
  if (c.displayName && c.displayName.toLowerCase() === v) return true;
  return false;
}

/**
 * Walk a DialogNode and call `visit` for each speaker site that matches.
 * Path argument is for diagnostic strings only.
 */
function walkDialogNodes(
  node: any,
  path: string,
  character: CharLike,
  allCharacters: ReadonlyArray<CharLike>,
  visit: (path: string, currentValue: string) => void,
): void {
  if (!node || typeof node !== 'object') return;

  const speaker = typeof node.speaker === 'string' ? node.speaker : '';
  const ref = typeof node.characterRef === 'string' ? node.characterRef : '';

  // Skip if already linked to ANY character (prevents silent overwrite of an
  // explicit link to a different character).
  const alreadyLinked = ref && allCharacters.some((c) => c.id === ref);
  if (!alreadyLinked && speaker && namesMatch(speaker, character)) {
    visit(path, speaker);
  }

  if (Array.isArray(node.choices)) {
    for (let i = 0; i < node.choices.length; i++) {
      const choice = node.choices[i];
      if (choice && choice.dialogNode) {
        walkDialogNodes(
          choice.dialogNode,
          `${path} > choice ${i + 1}`,
          character,
          allCharacters,
          visit,
        );
      }
    }
  }
}

/** Update a DialogNode (immutably) so the matching speaker is linked to characterId. */
function relinkDialogNodeAtPath(
  node: any,
  pathSegments: number[],
  characterId: string,
  character: CharLike,
): any {
  if (!node) return node;
  // pathSegments empty → this is the target node.
  if (pathSegments.length === 0) {
    return { ...node, speaker: character.displayName || character.name || node.speaker, characterRef: characterId };
  }
  const [head, ...rest] = pathSegments;
  if (!Array.isArray(node.choices) || !node.choices[head] || !node.choices[head].dialogNode) {
    return node;
  }
  const updatedChoices = node.choices.map((c: any, i: number) =>
    i === head ? { ...c, dialogNode: relinkDialogNodeAtPath(c.dialogNode, rest, characterId, character) } : c,
  );
  return { ...node, choices: updatedChoices };
}

/**
 * Find every place in the project that currently references the new character
 * by name (free-text), so the bulk-relink dialog can list them.
 */
export function findReferencesByName(
  beats: ReadonlyArray<BeatRef> | null | undefined,
  character: CharLike,
  allCharacters: ReadonlyArray<CharLike>,
): ReferenceMatch[] {
  if (!beats || beats.length === 0) return [];
  const out: ReferenceMatch[] = [];

  for (const beat of beats) {
    const beatLabel = beat.name || beat.id;

    // 1) Top-level speaker
    {
      const speaker = beat.speaker || '';
      const ref = beat.characterRef || '';
      const alreadyLinked = ref && allCharacters.some((c) => c.id === ref);
      if (!alreadyLinked && namesMatch(speaker, character)) {
        out.push({
          beatId: beat.id,
          beatName: beat.name,
          where: `${beatLabel} — speaker`,
          currentValue: speaker,
          apply: (b, charId, ch) => ({ ...b, speaker: ch.displayName || ch.name || speaker, characterRef: charId }),
        });
      }
    }

    const params = beat.parameters || {};

    // 2) DialogTree node speakers
    if (beat.type === 'dialogTree' && params.dialogTree) {
      // Use a path-of-indices to address the matched node so apply() can rebuild it.
      const visit = (pathStr: string, currentValue: string, indices: number[]) => {
        out.push({
          beatId: beat.id,
          beatName: beat.name,
          where: `${beatLabel} — ${pathStr}`,
          currentValue,
          apply: (b, charId, ch) => ({
            ...b,
            parameters: {
              ...(b.parameters || {}),
              dialogTree: relinkDialogNodeAtPath((b.parameters || {}).dialogTree, indices, charId, ch),
            },
          }),
        });
      };
      // Walk root + nested, building indices alongside the human-readable path.
      const recurse = (node: any, indices: number[], pathStr: string) => {
        if (!node || typeof node !== 'object') return;
        const speaker = typeof node.speaker === 'string' ? node.speaker : '';
        const ref = typeof node.characterRef === 'string' ? node.characterRef : '';
        const alreadyLinked = ref && allCharacters.some((c) => c.id === ref);
        if (!alreadyLinked && speaker && namesMatch(speaker, character)) {
          visit(pathStr, speaker, indices);
        }
        if (Array.isArray(node.choices)) {
          for (let i = 0; i < node.choices.length; i++) {
            const choice = node.choices[i];
            if (choice && choice.dialogNode) {
              recurse(choice.dialogNode, [...indices, i], `${pathStr} > choice ${i + 1}`);
            }
          }
        }
      };
      recurse(params.dialogTree, [], 'dialog');
    }

    // 3) AddRemoveInventory: character / fromChar / toChar
    if (beat.type === 'addRemoveInventory') {
      for (const field of ['character', 'fromChar', 'toChar'] as const) {
        const cur = params[field];
        if (typeof cur !== 'string' || !cur) continue;
        // 'player' is the special routing keyword, never link it.
        if (cur.toLowerCase() === 'player') continue;
        const alreadyLinked = allCharacters.some((c) => c.id === cur);
        if (alreadyLinked) continue;
        if (!namesMatch(cur, character)) continue;
        out.push({
          beatId: beat.id,
          beatName: beat.name,
          where: `${beatLabel} — inventory ${field}`,
          currentValue: cur,
          apply: (b, charId) => ({
            ...b,
            parameters: { ...(b.parameters || {}), [field]: charId },
          }),
        });
      }
    }

    // 4) AI beats: npcName
    if (beat.type === 'aiDialogTree' || beat.type === 'aiConversation') {
      const cur = params.npcName;
      if (typeof cur === 'string' && cur) {
        const alreadyLinked = allCharacters.some((c) => c.id === cur);
        if (!alreadyLinked && namesMatch(cur, character)) {
          out.push({
            beatId: beat.id,
            beatName: beat.name,
            where: `${beatLabel} — NPC name`,
            currentValue: cur,
            apply: (b, charId) => ({
              ...b,
              parameters: { ...(b.parameters || {}), npcName: charId },
            }),
          });
        }
      }
    }
  }

  return out;
}

/**
 * Apply a list of references to the beats array, returning a new array with
 * every matched site updated to use the canonical Character.id. Beats not in
 * the matched set are returned unchanged (referentially identical).
 */
export function relinkReferences(
  beats: ReadonlyArray<BeatRef>,
  matches: ReadonlyArray<ReferenceMatch>,
  character: CharLike,
): BeatRef[] {
  if (matches.length === 0) return beats.slice();

  // Group matches by beat id so each beat is updated once with all its
  // references applied in sequence.
  const matchesByBeat = new Map<string, ReferenceMatch[]>();
  for (const m of matches) {
    const list = matchesByBeat.get(m.beatId) || [];
    list.push(m);
    matchesByBeat.set(m.beatId, list);
  }

  return beats.map((beat) => {
    const list = matchesByBeat.get(beat.id);
    if (!list || list.length === 0) return beat;
    let updated: BeatRef = beat;
    for (const m of list) {
      updated = m.apply(updated, character.id, character);
    }
    return updated;
  });
}
