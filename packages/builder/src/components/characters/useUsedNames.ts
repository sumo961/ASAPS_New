/**
 * useUsedNames — collect free-text speaker / character-ref strings used across
 * the project, with usage counts. Powers the "Used names" section of
 * <CharacterRefField>'s dropdown.
 *
 * Sources walked:
 *   - Beat.speaker on every beat
 *   - Nested DialogNode.speaker for dialog-tree beats (root + every nested node
 *     reachable via choices[].dialogNode)
 *   - AddRemoveInventory.character / fromChar / toChar
 *   - AIDialogTree.npcName / AIConversation.npcName
 *
 * A name is only included as a "used name" when it isn't already the canonical
 * id / name / displayName of a defined Character — those entries are surfaced
 * in the dropdown's `Characters` section instead so we don't duplicate.
 *
 * Returns an array sorted by descending count, stable enough to memoize on
 * the input refs alone.
 */

import { useMemo } from 'react';
import type { UsedName } from './CharacterRefField';

interface BeatLike {
  type?: string;
  speaker?: string;
  characterRef?: string;
  parameters?: Record<string, any>;
}

interface CharLike {
  id: string;
  name?: string;
  displayName?: string;
}

function walkDialogNodeSpeakers(node: any, bump: (name: string | undefined | null) => void): void {
  if (!node || typeof node !== 'object') return;
  bump(node.speaker);
  if (Array.isArray(node.choices)) {
    for (const choice of node.choices) {
      if (choice && choice.dialogNode) walkDialogNodeSpeakers(choice.dialogNode, bump);
    }
  }
}

export function useUsedNames(
  beats: ReadonlyArray<BeatLike> | null | undefined,
  characters: ReadonlyArray<CharLike> | null | undefined,
): UsedName[] {
  return useMemo(() => {
    if (!beats || beats.length === 0) return [];

    const counts = new Map<string, number>();
    const bump = (raw: string | undefined | null) => {
      if (!raw) return;
      const name = raw.trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    };

    for (const beat of beats) {
      // Top-level beat speaker
      bump(beat.speaker);

      const params = beat.parameters || {};
      const beatType = beat.type;

      // DialogTree: walk root + nested. Each node's speaker is counted —
      // a tree where Wolf says two consecutive lines counts Wolf twice.
      if (beatType === 'dialogTree' && params.dialogTree) {
        walkDialogNodeSpeakers(params.dialogTree, bump);
      }

      // AddRemoveInventory: character / fromChar / toChar
      if (beatType === 'addRemoveInventory') {
        bump(params.character);
        bump(params.fromChar);
        bump(params.toChar);
      }

      // AI beats: npcName
      if (beatType === 'aiDialogTree' || beatType === 'aiConversation') {
        bump(params.npcName);
      }
    }

    // Filter out names that match a defined Character (id, name, or displayName,
    // case-insensitive) — those belong in the Characters section, not Used names.
    const definedAliases = new Set<string>();
    for (const c of characters || []) {
      if (c.id) definedAliases.add(c.id.toLowerCase());
      if (c.name) definedAliases.add(c.name.toLowerCase());
      if (c.displayName) definedAliases.add(c.displayName.toLowerCase());
    }
    // Also strip the special "player" routing keyword.
    definedAliases.add('player');

    const result: UsedName[] = [];
    for (const [name, count] of counts) {
      if (definedAliases.has(name.toLowerCase())) continue;
      result.push({ name, count });
    }
    // Highest count first, then alphabetical.
    result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return result;
  }, [beats, characters]);
}
