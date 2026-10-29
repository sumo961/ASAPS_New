/**
 * "Show AI features" — App Preferences switch (2026-10-29, class feedback:
 * authors who never use AI wanted its menus and buttons out of the way).
 *
 * Off hides every AI tool an author would use: the AI menu, Ask AI and
 * Change with AI, generating stories, dialogs and characters, review
 * fixes, the AI Conversation beat in the add-beat lists. Stories are not
 * changed: AI Conversation beats already in a project still play, and an
 * AI Conversation beat's own settings stay editable.
 *
 * "Beat suggestions" is a second switch under it: the AI's next-beat
 * suggestions at the foot of the Inspector take room on every beat, so
 * they can go while the other AI tools stay.
 *
 * Settings of this computer, kept in localStorage; every open window
 * follows a change (the `storage` event reaches the others).
 */
import { useSyncExternalStore } from 'react';

const CHANGED = 'asaps:ai-features-changed';

/** A switch that is on unless set 'off' under `key`. */
function onOffSetting(key: string) {
  // Used when localStorage can't be read or written.
  let fallback = true;
  const get = (): boolean => {
    try {
      return localStorage.getItem(key) !== 'off';
    } catch {
      return fallback;
    }
  };
  const set = (enabled: boolean): void => {
    fallback = enabled;
    try {
      if (enabled) localStorage.removeItem(key);
      else localStorage.setItem(key, 'off');
    } catch { /* the switch then lasts for this window only */ }
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: { key, enabled } }));
  };
  const subscribe = (onChange: () => void): (() => void) => {
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) onChange(); };
    window.addEventListener(CHANGED, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGED, onChange);
      window.removeEventListener('storage', onStorage);
    };
  };
  return { get, set, subscribe };
}

const aiFeatures = onOffSetting('asaps_ai_features');
const beatSuggestions = onOffSetting('asaps_ai_beat_suggestions');

export const aiFeaturesEnabled = aiFeatures.get;
export const setAIFeaturesEnabled = aiFeatures.set;

/** Re-renders when the switch changes, in this window or another. */
export function useAIFeatures(): boolean {
  return useSyncExternalStore(aiFeatures.subscribe, aiFeatures.get, () => true);
}

export const setBeatSuggestionsEnabled = beatSuggestions.set;

/** The beat suggestions show only while the AI features are shown too. */
export function useBeatSuggestions(): boolean {
  const ai = useAIFeatures();
  return useBeatSuggestionsSetting() && ai;
}

/** The suggestions' own switch, whatever "Show AI features" says. */
export function useBeatSuggestionsSetting(): boolean {
  return useSyncExternalStore(beatSuggestions.subscribe, beatSuggestions.get, () => true);
}
