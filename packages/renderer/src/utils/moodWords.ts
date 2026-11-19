/**
 * The mood panel's words in the story's language.
 *
 * The components work with the English words (they are also what prompts
 * use); what the player reads comes from the catalog of runtime words
 * (core i18n/uiStrings), which a translation overrides.
 */
import { uiString, type UIStringKey } from '@asaps/core';

/** A mood word as the player reads it. Unknown words pass through. */
export function moodLabel(word: string): string {
  const key = MOOD_WORD_KEYS[word];
  return key ? uiString(key) : word;
}

const MOOD_WORD_KEYS: Record<string, UIStringKey> = {
  neutral: 'moodNeutral', elated: 'moodElated', upbeat: 'moodUpbeat', hostile: 'moodHostile', tense: 'moodTense',
  despairing: 'moodDespairing', withdrawn: 'moodWithdrawn', serene: 'moodSerene', content: 'moodContent',
  happy: 'moodAxisHappy', sad: 'moodAxisSad', excited: 'moodAxisExcited', calm: 'moodAxisCalm',
  pleased: 'moodPleased', displeased: 'moodDispleased', even: 'moodEven',
  energetic: 'moodEnergetic', alert: 'moodAlert', lethargic: 'moodLethargic', subdued: 'moodSubdued', steady: 'moodSteady',
};
