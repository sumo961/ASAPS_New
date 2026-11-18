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
 * project's own characters: a translation writes display fields only, but
 * the editor has no reason to depend on that.
 */

import { useMemo } from 'react';
import { useTranslationState } from '../contexts/TranslationContext';
import { applyTranslationResource } from '../export/StoryTranslator';

export function useTranslatedHudData<C, G>(characters: C[] | undefined, globalSettings: G): { hudCharacters: C[]; hudGlobalSettings: G } {
  const { activeLanguage, translations } = useTranslationState();
  const resource = activeLanguage ? translations.find((t) => t.languageCode === activeLanguage) : undefined;

  return useMemo(() => {
    const original = { hudCharacters: characters ?? [], hudGlobalSettings: globalSettings };
    if (!resource) return original;
    try {
      const translated = applyTranslationResource(
        { project: { story: { beats: [], characters: characters ?? [] }, globalSettings } },
        resource,
      );
      return {
        hudCharacters: (translated.project.story.characters ?? []) as C[],
        hudGlobalSettings: (translated.project.globalSettings ?? globalSettings) as G,
      };
    } catch (error) {
      console.warn('[useTranslatedHudData] Could not apply the translation; showing the original', error);
      return original;
    }
  }, [characters, globalSettings, resource]);
}
