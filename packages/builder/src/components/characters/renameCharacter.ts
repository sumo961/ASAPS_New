/**
 * Renaming a character without breaking the story (UX-Eval B12).
 *
 * A speaker picked from the character list stores TWO things: the character's
 * id (`characterRef`) and a copy of its name (`speaker`), taken when the link
 * was made. Before this, renaming a character updated only the character
 * record, so every linked beat kept — and the player displayed — the old name,
 * and the TTS voice assignment (keyed by speaker name) stopped matching.
 *
 * Three pure pieces, applied by App as ONE undoable step:
 *   - `detectRenames`         which characters changed their shown label
 *   - `planLinkedSpeakerRefresh` linked sites (characterRef === id) whose copy
 *                              is stale → the new label. Automatic: a linked
 *                              reference IS this character by definition.
 *   - `renameSpeakerVoices`   move the TTS voice from the old label to the new
 *
 * Free-text references that merely spell the OLD name are NOT changed here —
 * renaming "Guard" to "Marco" must not silently turn every other unlinked
 * "Guard" into Marco. App offers them through the existing bulk-relink
 * prompt (findReferencesByName with the old names).
 */

export interface CharacterLabelLike {
  id: string;
  name?: string;
  displayName?: string;
}

export interface CharacterRename<C extends CharacterLabelLike = CharacterLabelLike> {
  before: C;
  after: C;
  /** Label shown before the rename (displayName → name → id). */
  oldLabel: string;
  /** Label shown after the rename. */
  newLabel: string;
}

/** The label a character is shown by — the same fallback the speaker picker writes. */
export function characterLabel(c: CharacterLabelLike): string {
  return c.displayName || c.name || c.id;
}

/**
 * Characters present in both lists (by id) whose name or display name changed.
 * Additions, deletions and edits that leave both names alone are ignored.
 */
export function detectRenames<C extends CharacterLabelLike>(
  before: ReadonlyArray<C>,
  after: ReadonlyArray<C>,
): CharacterRename<C>[] {
  const byId = new Map(before.map((c) => [c.id, c]));
  const out: CharacterRename<C>[] = [];
  for (const a of after) {
    const b = byId.get(a.id);
    if (!b) continue;
    if ((b.name || '') === (a.name || '') && (b.displayName || '') === (a.displayName || '')) continue;
    out.push({ before: b, after: a, oldLabel: characterLabel(b), newLabel: characterLabel(a) });
  }
  return out;
}

export interface BeatLike {
  id: string;
  type?: string;
  speaker?: string;
  characterRef?: string;
  parameters?: Record<string, any>;
}

/** Per-beat field updates, in the shape App's beat-update command takes. */
export type BeatUpdates = { speaker?: string; parameters?: Record<string, any> };

/**
 * Walk a dialog tree and refresh every node linked to `characterId` whose
 * speaker copy differs from `label`. Returns the same object when nothing
 * changed (so callers can detect no-ops by identity).
 */
function refreshDialogNode(node: any, characterId: string, label: string): any {
  if (!node || typeof node !== 'object') return node;
  let next = node;
  if (node.characterRef === characterId && node.speaker !== label) {
    next = { ...next, speaker: label };
  }
  if (Array.isArray(node.choices)) {
    let changed = false;
    const choices = node.choices.map((choice: any) => {
      if (!choice || !choice.dialogNode) return choice;
      const child = refreshDialogNode(choice.dialogNode, characterId, label);
      if (child === choice.dialogNode) return choice;
      changed = true;
      return { ...choice, dialogNode: child };
    });
    if (changed) next = { ...next, choices };
  }
  return next;
}

/**
 * Beats whose LINKED speaker copies of `character` are stale, with the
 * updates that make them show `character`'s current label. Covers the beat's
 * own speaker and every dialog-tree node (root and nested).
 */
export function planLinkedSpeakerRefresh(
  beats: ReadonlyArray<BeatLike>,
  character: CharacterLabelLike,
): Map<string, BeatUpdates> {
  const label = characterLabel(character);
  const plan = new Map<string, BeatUpdates>();
  for (const beat of beats) {
    const updates: BeatUpdates = {};
    if (beat.characterRef === character.id && (beat.speaker || '') !== label) {
      updates.speaker = label;
    }
    const tree = beat.parameters?.dialogTree;
    if (tree) {
      const refreshed = refreshDialogNode(tree, character.id, label);
      if (refreshed !== tree) {
        updates.parameters = { ...(beat.parameters || {}), dialogTree: refreshed };
      }
    }
    if (updates.speaker !== undefined || updates.parameters !== undefined) {
      plan.set(beat.id, updates);
    }
  }
  return plan;
}

/**
 * TTS voice assignments are keyed by the speaker label, per provider
 * (`speakerVoices[provider][label] = voiceId`). Move each rename's entry to
 * its new label. Returns the input object unchanged when nothing moves; when
 * the new label already has a voice, both entries are kept as they are.
 */
export function renameSpeakerVoices(
  speakerVoices: Record<string, Record<string, string>> | undefined,
  renames: ReadonlyArray<Pick<CharacterRename, 'oldLabel' | 'newLabel'>>,
): Record<string, Record<string, string>> | undefined {
  if (!speakerVoices || renames.length === 0) return speakerVoices;
  let changed = false;
  const next: Record<string, Record<string, string>> = {};
  for (const [provider, voices] of Object.entries(speakerVoices)) {
    if (!voices || typeof voices !== 'object') {
      next[provider] = voices;
      continue;
    }
    let map = voices;
    for (const { oldLabel, newLabel } of renames) {
      // Nothing to move, or the new label already has its own voice — leave
      // both entries as they are rather than drop or overwrite an assignment.
      if (oldLabel === newLabel || !(oldLabel in map) || newLabel in map) continue;
      const { [oldLabel]: voiceId, ...rest } = map;
      map = { ...rest, [newLabel]: voiceId };
      changed = true;
    }
    next[provider] = map;
  }
  return changed ? next : speakerVoices;
}
