/**
 * useSTT Hook
 *
 * React hook for accessing STT services.
 * Mirrors useTTS: localStorage persistence, auto-configure, polling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSTTService, WebSpeechSTTProvider, WhisperSTTProvider, LocalSTTProvider, VoskSTTProvider, WhisperCppSTTProvider } from '../services/stt';
import type { STTProviderType, STTTranscriptionResult } from '../types/stt';

const STT_CONFIG_STORAGE_KEY = 'asaps_stt_config';

export interface SavedSTTConfig {
  provider: string;
  providerType: STTProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  language?: string;
}

function loadSavedConfig(): SavedSTTConfig | null {
  try {
    const saved = localStorage.getItem(STT_CONFIG_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn('[useSTT] Failed to load saved config:', error);
  }
  return null;
}

function saveConfig(config: SavedSTTConfig): void {
  try {
    localStorage.setItem(STT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('[useSTT] Failed to save config:', error);
  }
}

export function clearSavedSTTConfig(): void {
  try {
    localStorage.removeItem(STT_CONFIG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getSavedSTTConfig(): SavedSTTConfig | null {
  return loadSavedConfig();
}

export interface STTServiceState {
  isConfigured: boolean;
  isListening: boolean;
  error: string | null;
  currentProvider: string | null;
  interimText: string;
  finalText: string;
}

export function useSTT() {
  const [state, setState] = useState<STTServiceState>({
    isConfigured: false,
    isListening: false,
    error: null,
    currentProvider: null,
    interimText: '',
    finalText: '',
  });

  const sttService = getSTTService();
  const hasInitialized = useRef(false);

  const configureProvider = useCallback((
    providerType: STTProviderType,
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    language?: string,
  ) => {
    let provider;
    if (providerType === 'web-speech') {
      provider = new WebSpeechSTTProvider();
    } else if (providerType === 'whisper') {
      provider = new WhisperSTTProvider();
    } else if (providerType === 'local') {
      provider = new LocalSTTProvider();
    } else if (providerType === 'vosk') {
      provider = new VoskSTTProvider();
    } else if (providerType === 'whisper-cpp') {
      provider = new WhisperCppSTTProvider();
    } else {
      throw new Error(`STT provider "${providerType}" not supported`);
    }

    provider.configure({
      provider: providerType,
      apiKey,
      model,
      baseUrl,
      language,
    });

    sttService.registerProvider(provider);
    sttService.setProvider(provider.name);

    if (language) {
      sttService.setLanguage(language);
    }

    setState(prev => ({
      ...prev,
      isConfigured: true,
      error: null,
      currentProvider: provider.name,
    }));

    console.log('[useSTT] Configured provider:', providerType);
  }, [sttService]);

  // Auto-configure on first mount
  useEffect(() => {
    const checkState = () => {
      setState(prev => ({
        ...prev,
        isConfigured: sttService.isReady(),
        isListening: sttService.isListening(),
        currentProvider: sttService.getActiveProvider()?.name ?? null,
      }));
    };

    if (!hasInitialized.current) {
      hasInitialized.current = true;

      const saved = loadSavedConfig();
      if (saved) {
        console.log('[useSTT] Restoring saved configuration for:', saved.providerType);
        try {
          configureProvider(saved.providerType, saved.apiKey, saved.model, saved.baseUrl, saved.language);
        } catch (error) {
          console.warn('[useSTT] Failed to restore saved config, falling back to Web Speech:', error);
          configureProvider('web-speech');
        }
      } else {
        // Auto-register Web Speech as default if available
        if (window.SpeechRecognition || (window as any).webkitSpeechRecognition) {
          configureProvider('web-speech');
        }
      }
    }

    checkState();

    const intervalId = setInterval(checkState, 1000);
    return () => clearInterval(intervalId);
  }, [sttService, configureProvider]);

  const configure = useCallback((
    providerType: STTProviderType,
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    language?: string,
  ) => {
    try {
      configureProvider(providerType, apiKey, model, baseUrl, language);

      saveConfig({
        provider: providerType,
        providerType,
        apiKey,
        model,
        baseUrl,
        language,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'STT configuration failed',
      }));
    }
  }, [configureProvider]);

  const startListening = useCallback((onFinalResult?: (text: string) => void) => {
    setState(prev => ({ ...prev, interimText: '', finalText: '', error: null }));

    sttService.startListening({
      onResult: (result: STTTranscriptionResult) => {
        setState(prev => {
          if (result.isFinal) {
            const newFinal = prev.finalText
              ? prev.finalText + ' ' + result.text
              : result.text;
            onFinalResult?.(newFinal);
            return { ...prev, finalText: newFinal, interimText: '' };
          }
          return { ...prev, interimText: result.text };
        });
      },
      onError: (error: Error) => {
        setState(prev => ({ ...prev, error: error.message, isListening: false }));
      },
      onEnd: () => {
        setState(prev => ({ ...prev, isListening: false }));
      },
    });

    setState(prev => ({ ...prev, isListening: true }));
  }, [sttService]);

  const stopListening = useCallback(async (): Promise<string> => {
    const result = await sttService.stopListening();
    const text = result?.text || state.finalText;
    setState(prev => ({ ...prev, isListening: false }));
    return text;
  }, [sttService, state.finalText]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const clearText = useCallback(() => {
    setState(prev => ({ ...prev, interimText: '', finalText: '' }));
  }, []);

  return {
    ...state,
    configure,
    startListening,
    stopListening,
    clearError,
    clearText,
  };
}
