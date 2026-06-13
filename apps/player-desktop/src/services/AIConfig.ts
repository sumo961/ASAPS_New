/**
 * AI Configuration Service for Desktop Player
 * Manages API keys and AI provider settings using Tauri store
 */

export type AIProvider = 'openai' | 'anthropic' | 'custom' | 'local';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;  // For custom providers
  model?: string;    // Optional model override
  localModelId?: string;  // For local LLM provider
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  localModelId: 'gemma-3-4b',
};

const STORE_KEY = 'ai-settings';

// Cached store instance
let storeInstance: any = null;

async function getStore() {
  if (storeInstance) return storeInstance;

  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    storeInstance = await Store.load('settings.json');
    return storeInstance;
  } catch (e) {
    console.warn('[AIConfig] Tauri store not available, using localStorage fallback');
    return null;
  }
}

/**
 * Load AI settings from secure storage
 */
export async function loadAISettings(): Promise<AISettings> {
  const store = await getStore();

  if (store) {
    try {
      const settings = await store.get(STORE_KEY) as AISettings | null;
      if (settings) {
        return { ...DEFAULT_SETTINGS, ...settings };
      }
    } catch (e) {
      console.error('[AIConfig] Failed to load settings:', e);
    }
  } else {
    // localStorage fallback for development
    try {
      const stored = localStorage.getItem(STORE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('[AIConfig] Failed to load from localStorage:', e);
    }
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save AI settings to secure storage
 */
export async function saveAISettings(settings: AISettings): Promise<void> {
  const store = await getStore();

  if (store) {
    try {
      await store.set(STORE_KEY, settings);
      await store.save();
    } catch (e) {
      console.error('[AIConfig] Failed to save settings:', e);
      throw e;
    }
  } else {
    // localStorage fallback for development
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('[AIConfig] Failed to save to localStorage:', e);
      throw e;
    }
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
      return 'gpt-5.2';
    case 'anthropic':
      return 'claude-sonnet-4-6';
    case 'local':
      return 'gemma-3-4b';
    case 'custom':
      return '';
    default:
      return '';
  }
}
