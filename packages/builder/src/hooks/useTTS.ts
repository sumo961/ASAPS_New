/**
 * useTTS Hook
 *
 * React hook for accessing TTS services.
 * Mirrors useAI: localStorage persistence, auto-configure, polling.
 *
 * Key difference: Web Speech needs no API key, so a WebSpeechProvider
 * is auto-registered on first mount — TTS works out of the box.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getTTSService, WebSpeechProvider, OpenAITTSProvider, ElevenLabsProvider, CustomTTSProvider, LocalTTSProvider } from '../services/tts';
import type { TTSProviderType } from '../types/tts';

const TTS_CONFIG_STORAGE_KEY = 'asaps_tts_config';

/**
 * Saved TTS configuration
 */
export interface SavedTTSConfig {
  provider: string;
  providerType: TTSProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  defaultVoiceId?: string;
  localPreset?: string;
}

function loadSavedConfig(): SavedTTSConfig | null {
  try {
    const saved = localStorage.getItem(TTS_CONFIG_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn('[useTTS] Failed to load saved config:', error);
  }
  return null;
}

function saveConfig(config: SavedTTSConfig): void {
  try {
    localStorage.setItem(TTS_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('[useTTS] Failed to save config:', error);
  }
}

export function clearSavedTTSConfig(): void {
  try {
    localStorage.removeItem(TTS_CONFIG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getSavedTTSConfig(): SavedTTSConfig | null {
  return loadSavedConfig();
}

/**
 * TTS service state exposed to components
 */
export interface TTSServiceState {
  isConfigured: boolean;
  isSpeaking: boolean;
  error: string | null;
  currentProvider: string | null;
}

export function useTTS() {
  const [state, setState] = useState<TTSServiceState>({
    isConfigured: false,
    isSpeaking: false,
    error: null,
    currentProvider: null,
  });

  const ttsService = getTTSService();
  const hasInitialized = useRef(false);

  /**
   * Register a provider (internal)
   */
  const configureProvider = useCallback((
    providerType: TTSProviderType,
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    defaultVoiceId?: string,
    localPreset?: string,
  ) => {
    let provider;
    if (providerType === 'web-speech') {
      provider = new WebSpeechProvider();
    } else if (providerType === 'openai') {
      provider = new OpenAITTSProvider();
    } else if (providerType === 'elevenlabs') {
      provider = new ElevenLabsProvider();
    } else if (providerType === 'custom') {
      provider = new CustomTTSProvider();
    } else if (providerType === 'local') {
      provider = new LocalTTSProvider();
    } else {
      throw new Error(`TTS provider "${providerType}" not supported`);
    }

    provider.configure({
      provider: providerType,
      apiKey,
      model,
      baseUrl,
      defaultVoiceId,
      localPreset,
    });

    ttsService.registerProvider(provider);
    ttsService.setProvider(provider.name);

    if (defaultVoiceId) {
      ttsService.setDefaultVoiceConfig({ voiceId: defaultVoiceId });
    }

    setState({
      isConfigured: true,
      isSpeaking: false,
      error: null,
      currentProvider: provider.name,
    });

    console.log('[useTTS] Configured provider:', providerType);
  }, [ttsService]);

  /**
   * Auto-configure on first mount.
   * Restores saved config or falls back to Web Speech as default.
   */
  useEffect(() => {
    const checkState = () => {
      setState(prev => ({
        ...prev,
        isConfigured: ttsService.isReady(),
        isSpeaking: ttsService.isSpeaking(),
        currentProvider: ttsService.getActiveProvider()?.name ?? null,
      }));
    };

    if (!hasInitialized.current) {
      hasInitialized.current = true;

      const saved = loadSavedConfig();
      if (saved) {
        console.log('[useTTS] Restoring saved configuration for:', saved.providerType);
        try {
          configureProvider(saved.providerType, saved.apiKey, saved.model, saved.baseUrl, saved.defaultVoiceId, saved.localPreset);
        } catch (error) {
          console.warn('[useTTS] Failed to restore saved config, falling back to Web Speech:', error);
          configureProvider('web-speech');
        }
      } else {
        // Auto-register Web Speech as the default — no config needed
        configureProvider('web-speech');
      }
    }

    checkState();

    const intervalId = setInterval(checkState, 1000);
    return () => clearInterval(intervalId);
  }, [ttsService, configureProvider]);

  /**
   * Public configure — also persists to localStorage
   */
  const configure = useCallback((
    providerType: TTSProviderType,
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    defaultVoiceId?: string,
    localPreset?: string,
  ) => {
    try {
      configureProvider(providerType, apiKey, model, baseUrl, defaultVoiceId, localPreset);

      saveConfig({
        provider: providerType,
        providerType,
        apiKey,
        model,
        baseUrl,
        defaultVoiceId,
        localPreset,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'TTS configuration failed',
      }));
    }
  }, [configureProvider]);

  const speak = useCallback(async (text: string, speaker?: string) => {
    await ttsService.speak(text, speaker);
  }, [ttsService]);

  const stop = useCallback(() => {
    ttsService.stop();
  }, [ttsService]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    configure,
    speak,
    stop,
    clearError,
  };
}
