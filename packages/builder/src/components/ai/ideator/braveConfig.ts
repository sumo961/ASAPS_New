/**
 * Brave Search API key persistence.
 *
 * Stored in its own localStorage entry rather than threaded through the
 * main AI provider config — Brave is purely a research tool consumed by
 * Ideator and has nothing to do with the active LLM provider.
 */

const BRAVE_KEY_STORAGE = 'asaps_brave_api_key';

export function getSavedBraveApiKey(): string | null {
  try {
    const v = localStorage.getItem(BRAVE_KEY_STORAGE);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveBraveApiKey(key: string): void {
  try {
    if (key && key.trim().length > 0) {
      localStorage.setItem(BRAVE_KEY_STORAGE, key.trim());
    } else {
      localStorage.removeItem(BRAVE_KEY_STORAGE);
    }
  } catch (err) {
    console.warn('[braveConfig] Failed to save Brave API key:', err);
  }
}

export function clearSavedBraveApiKey(): void {
  try {
    localStorage.removeItem(BRAVE_KEY_STORAGE);
  } catch {
    /* no-op */
  }
}
