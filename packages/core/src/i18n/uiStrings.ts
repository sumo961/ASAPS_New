/**
 * Runtime UI strings — the player-facing text that is NOT authored per
 * beat: renderer chrome (input placeholders, HUD labels, image-picker
 * text), default button labels, and the AI-beat loading messages.
 *
 * Why this exists: these strings used to be hardcoded English inside the
 * renderer components and core beats, so even a fully translated story
 * showed English placeholders, HUD titles, and "Thinking..." spinners.
 * This module is the single catalog. Translation flows override it:
 *   - Preview Window: batch-AI-translates the catalog per active language
 *     and calls setUIStrings().
 *   - HTML exports: the catalog is seeded into
 *     globalSettings.uiStrings, translated by both export translation
 *     flows (pre-translated resources + in-player AI translation), and
 *     the exported player calls setUIStrings() from the loaded data.
 *
 * The module is a singleton by design — one story plays per window.
 * Values may contain {name} / {title} / {count} placeholders; callers
 * substitute them (see translateLoadingMessage / formatUIString).
 */

export const UI_STRING_DEFAULTS = {
  // Default button labels (renderer fallbacks when a beat param is empty)
  continue: 'Continue',
  playAgain: 'Play Again',
  credits: 'Credits',
  yourJourney: 'Your Journey',

  // Conversation input (aiConversation / chat views)
  typeYourResponse: 'Type your response...',
  listening: 'Listening...',

  // Inventory HUD chrome
  inventoryTitle: 'Inventory',
  inventoryExpandHint: '{title} ({count} items) - click to expand',

  // Image-input beat picker
  imagePickBoth: 'Take or choose a photo',
  imagePickCamera: 'Take a photo',
  imagePickUpload: 'Choose an image',
  imageProcessing: 'Processing…',
  imageReadError: 'Could not read that image — please try another one.',
  imageRetakeHint: 'Tap to choose a different image',

  // AI-beat loading messages (emitted hardcoded by core beats; matched
  // by translateLoadingMessage below)
  loadingPreparingConversation: 'Preparing conversation with {name}...',
  loadingGettingReady: '{name} is getting ready to speak...',
  loadingSettingUp: 'Setting up the conversation...',
  loadingConnecting: 'Let me connect you with {name}...',
  loadingThinking: 'Thinking...',
  loadingFetching: 'Fetching data...',
  loadingSearching: 'Let me search for that...',
  loadingSearchingInternet: 'Searching the internet for you...',
  loadingFindOutMore: 'Let me find out more...',
  loadingLookingUp: 'Looking that up for you...',
  loadingReflect: 'Let me reflect on your journey...',
  loadingSummarizing: 'Summarizing your experience...',
  loadingReviewing: 'Reviewing your choices...',
  loadingCreatingSummary: 'Creating your personal summary...',
  loadingGeneratingDialog: 'Generating personalized dialog',
  loadingGeneratingResponse: 'Generating response',
  loadingRetrieving: 'Please wait while I retrieve the information',
  loadingMoment: 'This may take a moment',
  loadingJustAMoment: 'This will just take a moment',
} as const;

export type UIStringKey = keyof typeof UI_STRING_DEFAULTS;

let current: Record<UIStringKey, string> = { ...UI_STRING_DEFAULTS };

/**
 * Install (translated) UI strings. Unknown keys are ignored; missing keys
 * keep their English default. Pass nothing/null to reset to defaults.
 */
export function setUIStrings(overrides?: Partial<Record<UIStringKey, string>> | null): void {
  current = { ...UI_STRING_DEFAULTS };
  if (!overrides) return;
  for (const key of Object.keys(UI_STRING_DEFAULTS) as UIStringKey[]) {
    const v = overrides[key];
    if (typeof v === 'string' && v.length > 0) current[key] = v;
  }
}

/** Current value for a UI string key (translated when installed). */
export function uiString(key: UIStringKey): string {
  return current[key];
}

/** uiString + {placeholder} substitution, e.g. {title}/{count}/{name}. */
export function formatUIString(key: UIStringKey, values: Record<string, string | number>): string {
  let out = current[key];
  for (const [k, v] of Object.entries(values)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
}

/**
 * Regex patterns for loading messages that carry a dynamic NPC name —
 * the core beats emit e.g. "Elena is getting ready to speak..." and the
 * matcher recovers the {name} template to look up the translation.
 */
export const LOADING_NAME_PATTERNS: Array<{ pattern: RegExp; template: string }> = [
  { pattern: /^Preparing conversation with (.+)\.\.\.$/, template: 'Preparing conversation with {name}...' },
  { pattern: /^(.+) is getting ready to speak\.\.\.$/, template: '{name} is getting ready to speak...' },
  { pattern: /^Let me connect you with (.+)\.\.\.$/, template: 'Let me connect you with {name}...' },
];

/**
 * Look up a translated loading message, handling {name} substitution.
 * `translations` maps the ENGLISH template to its translated value.
 * Unknown messages pass through unchanged.
 */
export function translateLoadingMessage(message: string, translations: Map<string, string>): string {
  if (translations.has(message)) {
    return translations.get(message)!;
  }
  for (const { pattern, template } of LOADING_NAME_PATTERNS) {
    const match = message.match(pattern);
    if (match && translations.has(template)) {
      return translations.get(template)!.replace('{name}', match[1]);
    }
  }
  return message;
}

/**
 * Build the english-template → current-value map that renderLoading
 * wrappers feed to translateLoadingMessage. Identity mapping when no
 * translations are installed (harmless).
 */
export function buildLoadingTranslationMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(UI_STRING_DEFAULTS) as UIStringKey[]) {
    map.set(UI_STRING_DEFAULTS[key], current[key]);
  }
  return map;
}
