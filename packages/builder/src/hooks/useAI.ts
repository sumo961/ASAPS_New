/**
 * useAI Hook
 *
 * React hook for accessing AI services
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAIService, ClaudeProvider, OpenAIProvider } from '../services';
import type {
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse
} from '../types/ai';

// Storage key for AI configuration
const AI_CONFIG_STORAGE_KEY = 'asaps_ai_config';

/**
 * Saved AI Configuration
 */
export interface SavedAIConfig {
  provider: 'claude' | 'openai';
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  // Track the original provider type for UI (local uses openai provider)
  providerType?: 'claude' | 'openai' | 'local';
}

/**
 * Load saved AI configuration from localStorage
 */
function loadSavedConfig(): SavedAIConfig | null {
  try {
    const saved = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('[useAI] Failed to load saved config:', error);
  }
  return null;
}

/**
 * Save AI configuration to localStorage
 */
function saveConfig(config: SavedAIConfig): void {
  try {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
    console.log('[useAI] Configuration saved to localStorage');
  } catch (error) {
    console.warn('[useAI] Failed to save config:', error);
  }
}

/**
 * Clear saved AI configuration
 */
export function clearSavedAIConfig(): void {
  try {
    localStorage.removeItem(AI_CONFIG_STORAGE_KEY);
    console.log('[useAI] Configuration cleared from localStorage');
  } catch (error) {
    console.warn('[useAI] Failed to clear config:', error);
  }
}

/**
 * Get saved AI configuration (for populating UI fields)
 */
export function getSavedAIConfig(): SavedAIConfig | null {
  return loadSavedConfig();
}

/**
 * AI Service State
 */
export interface AIServiceState {
  isConfigured: boolean;
  isGenerating: boolean;
  error: string | null;
  currentProvider: string | null;
  /**
   * Cumulative content characters received so far during a streaming
   * generation. Reset to 0 at the start of each call; updated as the
   * provider's stream forwards content. 0 when no streaming is in flight.
   */
  generationProgress: number;
}

/**
 * Hook for AI operations
 */
export function useAI() {
  const [state, setState] = useState<AIServiceState>({
    isConfigured: false,
    isGenerating: false,
    error: null,
    currentProvider: null,
    generationProgress: 0,
  });

  const aiService = getAIService();
  const hasInitialized = useRef(false);

  /**
   * Configure a provider (internal implementation)
   */
  const configureProvider = useCallback((
    provider: 'claude' | 'openai',
    apiKey: string,
    model?: string,
    baseUrl?: string,
    maxTokens?: number,
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
    providerType?: 'claude' | 'openai' | 'local'
  ) => {
    // Create and register provider
    let providerInstance;
    if (provider === 'claude') {
      providerInstance = new ClaudeProvider();
    } else {
      providerInstance = new OpenAIProvider();
    }

    providerInstance.configure({
      provider,
      apiKey,
      model,
      temperature: 0.7,
      baseUrl,
      maxTokens,
      reasoningEffort,
    });

    aiService.registerProvider(providerInstance);
    aiService.setProvider(providerInstance.name);

    setState({
      isConfigured: true,
      isGenerating: false,
      error: null,
      currentProvider: providerType || provider,
      generationProgress: 0,
    });

    console.log('[useAI] Configured provider:', providerType || provider);
  }, [aiService]);

  /**
   * Check if service is configured on mount and periodically
   * Also auto-configure from saved settings on first mount
   */
  useEffect(() => {
    const checkConfiguration = () => {
      setState(prev => ({
        ...prev,
        isConfigured: aiService.isReady(),
        currentProvider: aiService.getCurrentProvider()?.name || null,
      }));
    };

    // Auto-configure from saved settings on first mount
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      const savedConfig = loadSavedConfig();
      if (savedConfig && savedConfig.apiKey) {
        console.log('[useAI] Restoring saved configuration for:', savedConfig.providerType || savedConfig.provider);
        try {
          configureProvider(
            savedConfig.provider,
            savedConfig.apiKey,
            savedConfig.model,
            savedConfig.baseUrl,
            savedConfig.maxTokens,
            savedConfig.reasoningEffort,
            savedConfig.providerType
          );
        } catch (error) {
          console.warn('[useAI] Failed to restore saved configuration:', error);
        }
      }
    }

    // Initial check
    checkConfiguration();

    // Set up interval to periodically check configuration status
    // This ensures components update when API key is added elsewhere
    const intervalId = setInterval(checkConfiguration, 1000);

    return () => clearInterval(intervalId);
  }, [aiService, configureProvider]);

  /**
   * Configure a provider (public API - also saves to localStorage)
   */
  const configure = useCallback((
    provider: 'claude' | 'openai',
    apiKey: string,
    model?: string,
    baseUrl?: string,
    maxTokens?: number,
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
    providerType?: 'claude' | 'openai' | 'local'
  ) => {
    try {
      configureProvider(provider, apiKey, model, baseUrl, maxTokens, reasoningEffort, providerType);

      // Save configuration to localStorage for persistence
      saveConfig({
        provider,
        apiKey,
        model,
        baseUrl,
        maxTokens,
        reasoningEffort,
        providerType,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Configuration failed',
      }));
    }
  }, [configureProvider]);

  /**
   * Generate complete story
   */
  const generateStory = useCallback(async (request: StoryGenerationRequest): Promise<StoryGenerationResponse | null> => {
    if (!aiService.isReady()) {
      setState(prev => ({ ...prev, error: 'AI service not configured' }));
      return null;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null, generationProgress: 0 }));

    // Wrap any caller-supplied onProgress so we also update hook state.
    // The dialog uses generationProgress to show "Generating... (N chars)".
    //
    // Throttle the React state updates to ~10Hz. The streaming loop
    // calls onProgress once per network chunk (often dozens per second
    // during fast model output); without throttling React 18's batching
    // collapses the rapid-fire updates and the UI rarely re-renders.
    // 100ms is fast enough to feel live, slow enough to actually flush.
    const callerOnProgress = request.onProgress;
    let lastUiUpdate = 0;
    const wrappedRequest: StoryGenerationRequest = {
      ...request,
      onProgress: (chars: number) => {
        const now = performance.now();
        if (now - lastUiUpdate >= 100) {
          lastUiUpdate = now;
          setState(prev => ({ ...prev, generationProgress: chars }));
        }
        callerOnProgress?.(chars);
      },
    };

    try {
      const response = await aiService.generateStory(wrappedRequest);
      setState(prev => ({ ...prev, isGenerating: false, generationProgress: 0 }));
      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        generationProgress: 0,
        error: error instanceof Error ? error.message : 'Story generation failed',
      }));
      return null;
    }
  }, [aiService]);

  /**
   * Generate dialog
   */
  const generateDialog = useCallback(async (request: DialogGenerationRequest): Promise<DialogGenerationResponse | null> => {
    if (!aiService.isReady()) {
      setState(prev => ({ ...prev, error: 'AI service not configured' }));
      return null;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const response = await aiService.generateDialog(request);
      setState(prev => ({ ...prev, isGenerating: false }));
      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Dialog generation failed',
      }));
      return null;
    }
  }, [aiService]);

  /**
   * Suggest beats
   */
  const suggestBeats = useCallback(async (request: BeatSuggestionRequest): Promise<BeatSuggestionResponse | null> => {
    if (!aiService.isReady()) {
      setState(prev => ({ ...prev, error: 'AI service not configured' }));
      return null;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const response = await aiService.suggestBeats(request);
      setState(prev => ({ ...prev, isGenerating: false }));
      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Beat suggestions failed',
      }));
      return null;
    }
  }, [aiService]);

  /**
   * Create beat from natural language
   */
  const createBeatFromNL = useCallback(async (request: NaturalLanguageBeatRequest): Promise<NaturalLanguageBeatResponse | null> => {
    if (!aiService.isReady()) {
      setState(prev => ({ ...prev, error: 'AI service not configured' }));
      return null;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const response = await aiService.createBeatFromNL(request);
      setState(prev => ({ ...prev, isGenerating: false }));
      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Beat creation failed',
      }));
      return null;
    }
  }, [aiService]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Cancel any in-flight generateStory call. Aborts the underlying fetch
   * and short-circuits the retry loop, then clears the spinner state so
   * the dialog unfreezes immediately.
   */
  const cancelGeneration = useCallback(() => {
    aiService.cancel();
    setState(prev => ({ ...prev, isGenerating: false }));
  }, [aiService]);

  return {
    ...state,
    configure,
    generateStory,
    generateDialog,
    suggestBeats,
    createBeatFromNL,
    clearError,
    cancelGeneration,
  };
}
