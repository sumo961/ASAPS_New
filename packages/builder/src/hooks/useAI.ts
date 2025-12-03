/**
 * useAI Hook
 *
 * React hook for accessing AI services
 */

import { useState, useEffect, useCallback } from 'react';
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

/**
 * AI Service State
 */
export interface AIServiceState {
  isConfigured: boolean;
  isGenerating: boolean;
  error: string | null;
  currentProvider: string | null;
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
  });

  const aiService = getAIService();

  /**
   * Check if service is configured on mount and periodically
   */
  useEffect(() => {
    const checkConfiguration = () => {
      setState(prev => ({
        ...prev,
        isConfigured: aiService.isReady(),
        currentProvider: aiService.getCurrentProvider()?.name || null,
      }));
    };

    // Initial check
    checkConfiguration();

    // Set up interval to periodically check configuration status
    // This ensures components update when API key is added elsewhere
    const intervalId = setInterval(checkConfiguration, 1000);

    return () => clearInterval(intervalId);
  }, [aiService]);

  /**
   * Configure a provider
   */
  const configure = useCallback((provider: 'claude' | 'openai', apiKey: string, model?: string, baseUrl?: string, maxTokens?: number) => {
    try {
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
      });

      aiService.registerProvider(providerInstance);
      aiService.setProvider(providerInstance.name);

      setState({
        isConfigured: true,
        isGenerating: false,
        error: null,
        currentProvider: provider,
      });

      console.log('[useAI] Configured provider:', provider);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Configuration failed',
      }));
    }
  }, [aiService]);

  /**
   * Generate complete story
   */
  const generateStory = useCallback(async (request: StoryGenerationRequest): Promise<StoryGenerationResponse | null> => {
    if (!aiService.isReady()) {
      setState(prev => ({ ...prev, error: 'AI service not configured' }));
      return null;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const response = await aiService.generateStory(request);
      setState(prev => ({ ...prev, isGenerating: false }));
      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
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

  return {
    ...state,
    configure,
    generateStory,
    generateDialog,
    suggestBeats,
    createBeatFromNL,
    clearError,
  };
}
