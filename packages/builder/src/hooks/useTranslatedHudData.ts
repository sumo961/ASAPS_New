/**
 * The characters and project settings as the HUD panels should show them in
 * the Visual Editor: in the language chosen in the header.
 *
 * A translation holds a character's name, its counters' names and band
 * labels, its items, and the timer and countdown labels (see
 * extractTranslatableStrings). The Preview and exports get them because the
 * whole story is translated before it plays; the editor draws its HUD panels
 * from the project as written, so they stayed in the original language.
 *
 * Only for what is DRAWN on the panels. Lookups by name keep using the
 * project's own characters: a translation rewrites a character's `name`
 * as well as its display name.
 */

import { useMemo } from 'react';
import { UI_STRING_DEFAULTS, setUIStrings } from '@asaps/core';
import { useTranslationState } from '../contexts/TranslationContext';
import { applyTranslationResource } from '../export/StoryTranslator';

export function useTranslatedHudData<C, G>(characters: C[] | undefined, globalSettings: G): { hudCharacters: C[]; hudGlobalSettings: G } {
  const { activeLanguage, translations } = useTranslationState();
  const resource = activeLanguage ? translations.find((t) => t.languageCode === activeLanguage) : undefined;

  return useMemo(() => {
    const original = { hudCharacters: characters ?? [], hudGlobalSettings: globalSettings };
    // The player's own words (the mood panel's "happy" and "calm", "Inventory",
    // "Continue"…) come from one catalog per window, which the stage reads
    // while it draws. This window plays no story, so the editor sets it to
    // the language it shows, here, before the stage below is drawn.
    const ownWords = (globalSettings as { uiStrings?: Record<string, string> } | null | undefined)?.uiStrings;
    if (!resource) {
      setUIStrings(ownWords);
      return original;
    }
    try {
      const translated = applyTranslationResource(
        {
          project: {
            story: { beats: [], characters: characters ?? [] },
            // Seeded, as an export seeds it: a translation fills the catalog in.
            globalSettings: { ...(globalSettings as object), uiStrings: { ...UI_STRING_DEFAULTS, ...(ownWords ?? {}) } },
          },
        },
        resource,
      );
      setUIStrings(translated.project.globalSettings?.uiStrings);
      return {
        hudCharacters: (translated.project.story.characters ?? []) as C[],
        hudGlobalSettings: (translated.project.globalSettings ?? globalSettings) as G,
      };
    } catch (error) {
      console.warn('[useTranslatedHudData] Could not apply the translation; showing the original', error);
      setUIStrings(ownWords);
      return original;
    }
  }, [characters, globalSettings, resource]);
}
