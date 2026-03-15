/**
 * Speaker Utilities
 *
 * Shared utility for extracting speaker names from stories
 * and resolving speaker portrait images.
 * Used by both the main app (Header TTS menu) and PreviewWindow.
 */

import type { Story, Beat } from '@asaps/core';

/**
 * Extract unique speaker names from all beats in a story.
 * Accepts either a Story instance or a Beat[] array.
 * Collects per-beat speakers (base Beat property) and walks
 * DialogTree nodes recursively to find nested speakers.
 */
export function extractSpeakers(storyOrBeats: Story | Beat[], playerCharacterName?: string): string[] {
  const beats = Array.isArray(storyOrBeats) ? storyOrBeats : storyOrBeats.getAllBeats();
  const speakers = new Set<string>();
  // Built-in speakers that are always added separately
  const builtIns = new Set(['Narrator', 'Interactor']);
  if (playerCharacterName) builtIns.add(playerCharacterName);

  const walkNode = (node: any) => {
    if (!node) return;
    if (node.speaker && !builtIns.has(node.speaker)) speakers.add(node.speaker);
    if (Array.isArray(node.choices)) {
      for (const choice of node.choices) {
        if (choice?.dialogNode) walkNode(choice.dialogNode);
      }
    }
  };
  for (const beat of beats) {
    // Collect per-beat speaker (base Beat property)
    if (beat.speaker && !builtIns.has(beat.speaker)) {
      speakers.add(beat.speaker);
    }
    // Walk DialogTree nodes for nested speakers
    if (beat.type === 'dialogTree') {
      const params = beat.getParameters();
      walkNode(params.dialogTree);
    }
  }
  return Array.from(speakers).sort();
}

/**
 * Resolve whether speaker should be shown, combining per-beat override with global setting.
 * - beatOverride === true → always show
 * - beatOverride === false → always hide
 * - beatOverride === undefined → inherit global setting
 */
export function shouldShowSpeaker(beatOverride: boolean | undefined, globalShowNames: boolean): boolean {
  if (beatOverride === true) return true;
  if (beatOverride === false) return false;
  return globalShowNames;
}

/**
 * Resolve portrait URL for a speaker name by looking up the matching character.
 * Matches on displayName (case-insensitive) or name.
 */
export function resolvePortraitUrl(
  speakerName: string | undefined,
  characters: Array<{ displayName: string; name: string; portrait?: { image?: string; assetId?: string } }>,
  assets: Array<{ id: string; url: string }>
): string | undefined {
  if (!speakerName || !characters?.length) return undefined;

  const lowerSpeaker = speakerName.toLowerCase();
  const char = characters.find(
    c => c.displayName.toLowerCase() === lowerSpeaker || c.name.toLowerCase() === lowerSpeaker
  );
  if (!char?.portrait) return undefined;

  // Prefer assetId resolution (gives fresh blob URL after reload)
  if (char.portrait.assetId) {
    const asset = assets.find(a => a.id === char.portrait!.assetId);
    if (asset?.url) return asset.url;
  }

  // Fall back to stored image URL
  return char.portrait.image;
}

/**
 * Resolve a speaker name to its translated display name for the active language.
 * Looks up the character by original displayName or name, then checks for a translation.
 * Returns the translated name if found, otherwise the original speaker name.
 */
export function resolveTranslatedSpeakerName(
  speakerName: string | undefined,
  characters: Array<{ displayName: string; name: string; translations?: Record<string, { displayName: string }> }>,
  activeLanguage: string | null
): string | undefined {
  if (!speakerName || !activeLanguage || !characters?.length) return speakerName;

  const lowerSpeaker = speakerName.toLowerCase();
  const char = characters.find(
    c => c.displayName.toLowerCase() === lowerSpeaker || c.name.toLowerCase() === lowerSpeaker
  );
  if (!char?.translations?.[activeLanguage]?.displayName) return speakerName;
  return char.translations[activeLanguage].displayName;
}
