/**
 * AI Configuration Service for Mobile Player
 * Manages API keys and AI provider settings using Capacitor Preferences
 */

export type AIProvider = 'openai' | 'anthropic' | 'custom';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;  // For custom providers
  model?: string;    // Optional model override
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
};

const STORE_KEY = 'asaps-ai-settings';

/**
 * Load AI settings from Capacitor Preferences
 */
export async function loadAISettings(): Promise<AISettings> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const result = await Preferences.get({ key: STORE_KEY });
    if (result.value) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(result.value) };
    }
  } catch (e) {
    console.error('[AIConfig] Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save AI settings to Capacitor Preferences
 */
export async function saveAISettings(settings: AISettings): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({
      key: STORE_KEY,
      value: JSON.stringify(settings),
    });
  } catch (e) {
    console.error('[AIConfig] Failed to save settings:', e);
    throw e;
  }
}

/**
 * Check if AI is configured (has valid API key)
 */
export async function isAIConfigured(): Promise<boolean> {
  const settings = await loadAISettings();
  return settings.apiKey.length > 0;
}

/**
 * Get the API base URL for the configured provider
 */
export function getProviderBaseUrl(settings: AISettings): string {
  switch (settings.provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'custom':
      return settings.baseUrl || '';
    default:
      return '';
  }
}

/**
 * Get the default model for the configured provider
 */
export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'custom':
      return '';
    default:
      return '';
  }
}
