/**
 * PreviewWindow - Standalone page for story preview in a separate window
 *
 * This component receives story data via postMessage from the parent builder window
 * and renders the preview. It auto-reloads when the story changes.
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Type, Zap, ZoomIn, ZoomOut, Maximize2, Package, ChevronDown, ChevronRight, Database, RefreshCw, Info, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Story, StoryEngine, Beat, BeatTypeRegistry } from '@asaps/core';
import type { StatePreset, IAIService } from '@asaps/core';
import { ReactRenderer, getAudioManager } from '@asaps/renderer';
import { convertGlobalSettingsToTheme } from '../utils/themeConverter';
import { initializeBeatLocations } from '../utils/SchemaLocationInitializer';
import type { PreviewMessage, SerializedStoryData } from '../services/PreviewWindowManager';
import type { Asset } from '../components/assets/AssetManager';
import type { Character } from '../types/character';
import { generatePathPresets, groupPresetsByOutcome, type GeneratedPreset, type InputTextBeatInfo } from '../services/PathBasedPresetGenerator';
import { InputTextValuesModal } from '../components/preview/InputTextValuesModal';
import { getSavedAIConfig } from '../hooks/useAI';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { buildChatRequestBody } from '../services/providers/openai-utils';

// Stage dimensions (matching StoryPreview)
const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 768;

// Proxy endpoint for CORS-blocked requests (custom baseUrls)
const CLAUDE_PROXY_ENDPOINT = 'http://localhost:3001/api/ai/claude';
const OPENAI_PROXY_ENDPOINT = 'http://localhost:3001/api/ai/openai';

/**
 * Strip thinking/reasoning blocks from AI responses.
 */
function stripThinkingBlocks(text: string): string {
  let result = text;
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, '');
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  result = result.replace(/^\s+/, '').replace(/\s+$/, '');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

/**
 * Extract JSON from AI response using brace matching.
 * This is more reliable than regex because it handles nested braces correctly
 * and stops at the matching closing brace instead of the last brace in the text.
 */
function extractJSON(text: string): string {
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON object found in response');
  }

  let braceCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = jsonStart; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return text.slice(jsonStart, i + 1);
        }
      }
    }
  }

  // If we didn't find a matching close brace, try the greedy regex as fallback
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  throw new Error('Could not extract complete JSON from response');
}

/**
 * Make a proxied request to avoid CORS issues with custom API endpoints
 */
async function makeProxyRequest(
  endpoint: string,
  baseUrl: string,
  apiKey: string,
  requestBody: any
): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey, ...requestBody }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Proxy request failed' }));
    throw new Error(error.message || 'Proxy request failed');
  }

  return response.json();
}

/**
 * Create an AI service adapter that implements IAIService interface
 */
function createAIServiceAdapter(): IAIService | null {
  const savedConfig = getSavedAIConfig();
  console.log('[PreviewWindow] Loaded AI config:', savedConfig ? {
    provider: savedConfig.provider,
    providerType: savedConfig.providerType,
    hasApiKey: !!savedConfig.apiKey,
    hasBaseUrl: !!savedConfig.baseUrl,
    baseUrl: savedConfig.baseUrl,
    model: savedConfig.model,
  } : null);

  // For local providers with a baseUrl, API key is optional
  const hasValidConfig = savedConfig && (savedConfig.apiKey || savedConfig.baseUrl);
  if (!hasValidConfig) {
    console.log('[PreviewWindow] No AI configuration found');
    return null;
  }

  console.log('[PreviewWindow] Creating AI service adapter for provider:', savedConfig.provider);

  // Use proxy only for remote custom URLs (not localhost)
  const isLocalUrl = savedConfig.baseUrl?.includes('localhost') || savedConfig.baseUrl?.includes('127.0.0.1');
  const useProxy = !!savedConfig.baseUrl && !isLocalUrl;

  if (savedConfig.provider === 'claude') {
    const model = savedConfig.model || 'claude-sonnet-4-20250514';
    const client = !useProxy ? new Anthropic({
      apiKey: savedConfig.apiKey,
      dangerouslyAllowBrowser: true,
    }) : null;

    return {
      async generateContent(prompt: string, options?: { maxTokens?: number }): Promise<string> {
        const requestBody = {
          model,
          max_tokens: options?.maxTokens || 4096,
          messages: [{ role: 'user' as const, content: prompt }],
        };

        let response;
        if (useProxy) {
          response = await makeProxyRequest(CLAUDE_PROXY_ENDPOINT, savedConfig.baseUrl!, savedConfig.apiKey, requestBody);
        } else {
          const apiResponse = await client!.messages.create(requestBody);
          response = { content: apiResponse.content };
        }

        const content = response.content[0];
        if (content.type === 'text') return content.text;
        throw new Error('Unexpected response type from Claude');
      },

      async generateDialog(request: { prompt: string; format: 'dialogTree'; maxTurns?: number }): Promise<any> {
        const systemPrompt = `You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.`;
        const requestBody = {
          model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user' as const, content: request.prompt }],
        };

        let response;
        if (useProxy) {
          response = await makeProxyRequest(CLAUDE_PROXY_ENDPOINT, savedConfig.baseUrl!, savedConfig.apiKey, requestBody);
        } else {
          const apiResponse = await client!.messages.create(requestBody as any);
          response = { content: apiResponse.content };
        }

        const content = response.content[0];
        if (content.type !== 'text') throw new Error('Unexpected response type from Claude');
        const jsonStr = extractJSON(content.text);
        return JSON.parse(jsonStr);
      },

      async classifyContent(prompt: string, categories: string[]): Promise<string> {
        const systemPrompt = `You are a classifier. Classify into ONE of these categories: ${categories.join(', ')}. Respond with ONLY the category name.`;
        const requestBody = {
          model,
          max_tokens: 100,
          system: systemPrompt,
          messages: [{ role: 'user' as const, content: prompt }],
        };

        let response;
        if (useProxy) {
          response = await makeProxyRequest(CLAUDE_PROXY_ENDPOINT, savedConfig.baseUrl!, savedConfig.apiKey, requestBody);
        } else {
          const apiResponse = await client!.messages.create(requestBody as any);
          response = { content: apiResponse.content };
        }

        const content = response.content[0];
        if (content.type === 'text') {
          const result = content.text.trim();
          const match = categories.find(c => c.toLowerCase() === result.toLowerCase());
          return match || categories[0];
        }
        return categories[0];
      },
    };
  } else {
    // OpenAI provider (also used for local/Ollama)
    const model = savedConfig.model || 'gpt-5.2';

    // Create client - for local URLs, include baseURL; for remote custom URLs, we use proxy
    const client = !useProxy ? new OpenAI({
      apiKey: savedConfig.apiKey || 'ollama', // Ollama doesn't need a real key
      baseURL: isLocalUrl ? savedConfig.baseUrl : undefined,
      dangerouslyAllowBrowser: true,
    }) : null;

    return {
      async generateContent(prompt: string, options?: { maxTokens?: number }): Promise<string> {
        const requestBody = buildChatRequestBody(
          model,
          [{ role: 'user' as const, content: prompt }],
          options?.maxTokens || 4096
        );

        let content: string;
        if (useProxy) {
          const response = await makeProxyRequest(OPENAI_PROXY_ENDPOINT, savedConfig.baseUrl!, savedConfig.apiKey, requestBody);
          content = response.choices?.[0]?.message?.content || '';
        } else {
          const response = await client!.chat.completions.create(requestBody as any);
          content = response.choices[0]?.message?.content || '';
        }
        return stripThinkingBlocks(content);
      },

      async generateDialog(request: { prompt: string; format: 'dialogTree'; maxTurns?: number }): Promise<any> {
        const systemPrompt = `You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.`;
        const requestBody = buildChatRequestBody(
          model,
          [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: request.prompt },
          ],
          8192
        );

        let content: string;
        if (useProxy) {
          const response = await makeProxyRequest(OPENAI_PROXY_ENDPOINT, savedConfig.baseUrl!, savedConfig.apiKey, requestBody);
          content = response.choices?.[0]?.message?.content || '';
        } else {
          const response = await client!.chat.completions.create(requestBody as any);
          content = response.choices[0]?.message?.content || '';
        }

        content = stripThinkingBlocks(content);
        const jsonStr = extractJSON(content);
        return JSON.parse(jsonStr);
      },

      async classifyContent(prompt: string, categories: string[]): Promise<string> {
        const systemPrompt = `You are a classifier. Classify into ONE of these categories: ${categories.join(', ')}. Respond with ONLY the category name.`;
        const requestBody = buildChatRequestBody(
          model,
          [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: prompt },
          ],
          100
        );

        let result: string;
        if (useProxy) {
          const response = await makeProxyRequest(OPENAI_PROXY_ENDPOINT, savedConfig.baseUrl!, savedConfig.apiKey, requestBody);
          result = (response.choices?.[0]?.message?.content || '').trim();
        } else {
          const response = await client!.chat.completions.create(requestBody as any);
          result = (response.choices[0]?.message?.content || '').trim();
        }

        result = stripThinkingBlocks(result);
        const match = categories.find(c => c.toLowerCase() === result.toLowerCase());
        return match || categories[0];
      },
    };
  }
}

interface PreviewData {
  storyData?: SerializedStoryData;
  beatId?: string;
  statePreset?: StatePreset;
  settings?: any;
  projectSettings?: { width: number; height: number };
  assets?: Asset[];
  characters?: Character[];
  themeAssets?: any;
}

export const PreviewWindow: React.FC = () => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isWaitingToStart, setIsWaitingToStart] = useState(false); // Ready to preview but waiting for user click
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [startBeatId, setStartBeatId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [inventoryVisible, setInventoryVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [showBeatMenu, setShowBeatMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<StatePreset | null>(null);
  const [generatedPresets, setGeneratedPresets] = useState<GeneratedPreset[]>([]);
  const [isGeneratingPresets, setIsGeneratingPresets] = useState(false);
  // Input text values modal state
  const [showInputTextModal, setShowInputTextModal] = useState(false);
  const [pendingInputTextBeats, setPendingInputTextBeats] = useState<InputTextBeatInfo[]>([]);
  const [pendingPreset, setPendingPreset] = useState<StatePreset | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const [debugInfo, setDebugInfo] = useState<{
    visitedBeats?: string[];
    variables?: Record<string, any>;
    counters?: Record<string, number>;
    inventory?: Array<{ name: string; quantity: number }>;
    timers?: Record<string, any>;
  }>({});
  const [activeTimers, setActiveTimers] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReactRenderer | null>(null);
  const engineRef = useRef<StoryEngine | null>(null);
  const countersRef = useRef<Record<string, number>>({});
  const isElectronRef = useRef<boolean>(false);
  const stateChangeUnsubscribeRef = useRef<(() => void) | null>(null); // Cleanup previous listener
  const handleRestartRef = useRef<((beatId?: string, preset?: StatePreset | null, pauseOnStart?: boolean) => void) | null>(null);
  const navigatedBeatIdRef = useRef<string | null>(null); // Track manually navigated beat to prevent STORY_UPDATE from overwriting

  // Detect if running in Electron
  useEffect(() => {
    isElectronRef.current = typeof window !== 'undefined' &&
      !!(window as any).electronAPI?.onPreviewMessage;
  }, []);

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;

      const message = event.data as PreviewMessage;
      if (!message || typeof message.type !== 'string') return;

      console.log('[PreviewWindow] Received message:', message.type);

      switch (message.type) {
        case 'STORY_UPDATE':
          if (message.payload) {
            const payloadBeatId = message.payload.beatId;
            const firstBeatId = message.payload.storyData?.firstBeatId;

            console.log('[PreviewWindow] STORY_UPDATE received:', {
              payloadBeatId,
              firstBeatId,
              hasAutoStarted: hasAutoStarted.current,
              isWaitingToStart
            });

            setPreviewData(message.payload);
            setConnectionStatus('connected');

            // On first load (no story running), show "waiting to start" state
            if (!hasAutoStarted.current) {
              // Determine which beat to start from
              const targetBeatId = payloadBeatId || firstBeatId;
              if (targetBeatId) {
                setStartBeatId(targetBeatId);
              }
              console.log('[PreviewWindow] STORY_UPDATE: first load, showing wait state for:', targetBeatId);
              hasAutoStarted.current = true;
              setIsWaitingToStart(true);
            }
            // If already initialized, only update startBeatId if explicitly provided
            else if (payloadBeatId && !isWaitingToStart && !isRunning && !isPaused) {
              console.log('[PreviewWindow] STORY_UPDATE: beat changed to:', payloadBeatId);
              setStartBeatId(payloadBeatId);
              setIsWaitingToStart(true);
            }
            // Otherwise don't change startBeatId - just update the story data
          }
          break;

        case 'NAVIGATE_TO_BEAT':
          if (message.payload?.beatId) {
            console.log('[PreviewWindow] NAVIGATE_TO_BEAT:', message.payload.beatId);
            // Track this as a manual navigation to prevent STORY_UPDATE from overwriting
            navigatedBeatIdRef.current = message.payload.beatId;
            setStartBeatId(message.payload.beatId);
            // Mark as already started to prevent auto-start effect from running
            hasAutoStarted.current = true;
            // Stop any current execution and wait for user to click to start
            if (engineRef.current) {
              engineRef.current.stop();
            }
            if (rendererRef.current) {
              rendererRef.current.clear();
            }
            setIsRunning(false);
            setIsPaused(false);
            setIsWaitingToStart(true); // Show "click to start" state
            setCurrentBeat(null);
          }
          break;

        case 'STATE_PRESET':
          if (message.payload?.statePreset) {
            setSelectedPreset(message.payload.statePreset);
          }
          break;

        case 'CLOSE':
          window.close();
          break;
      }
    };

    // Web: postMessage
    window.addEventListener('message', handleMessage);

    // Send PING to parent to indicate we're ready
    if (window.opener) {
      window.opener.postMessage({ type: 'PING' }, window.location.origin);
      console.log('[PreviewWindow] Sent PING to parent');
    }

    // Electron: IPC listener
    if (isElectronRef.current) {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.onPreviewMessage) {
        const unsubscribe = electronAPI.onPreviewMessage((message: PreviewMessage) => {
          handleMessage({ data: message, origin: window.location.origin } as MessageEvent);
        });
        return () => {
          window.removeEventListener('message', handleMessage);
          unsubscribe?.();
        };
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isRunning, isPaused]);

  // Reconstruct story from serialized data
  useEffect(() => {
    if (!previewData?.storyData) {
      setStory(null);
      return;
    }

    try {
      const { storyData } = previewData;
      const registry = BeatTypeRegistry.getInstance();

      // Create new Story object
      const newStory = new Story({
        title: storyData.title,
        author: storyData.author || 'Unknown',
        firstBeatId: storyData.firstBeatId,
      });

      // Reconstruct beats from serialized data
      for (const beatData of storyData.beats) {
        const beat = registry.createBeat(beatData.type, {
          ...beatData,
          parameters: beatData.parameters,
          connections: beatData.connections,
        });

        // Set position
        if (beatData.x !== undefined) beat.x = beatData.x;
        if (beatData.y !== undefined) beat.y = beatData.y;

        // Restore locations
        if (beatData.locations && beatData.locations.length > 0) {
          beat.locations = new Map(beatData.locations.map(loc => [loc.id || loc.name, loc]));
        }

        // Restore animations
        if (beatData.animations) {
          beat.animations = beatData.animations;
        }

        newStory.addBeat(beat);
      }

      setStory(newStory);
      console.log('[PreviewWindow] Reconstructed story:', newStory.getMetadata().title, 'with', storyData.beats.length, 'beats');
    } catch (error) {
      console.error('[PreviewWindow] Failed to reconstruct story:', error);
      setStory(null);
    }
  }, [previewData?.storyData]);

  // Track if we've auto-started (ref to persist across renders)
  const hasAutoStarted = useRef(false);

  // Note: hasAutoStarted is now only used to track if we've shown the initial "waiting to start" state

  // Generate presets when story or start beat changes
  const handleGeneratePresets = useCallback(() => {
    if (!story || !startBeatId) {
      setGeneratedPresets([]);
      return;
    }

    // Check if this is the first beat - no paths needed
    const firstBeatId = story.getMetadata().firstBeatId;
    if (startBeatId === firstBeatId) {
      setGeneratedPresets([]);
      setSelectedPreset(null);
      return;
    }

    setIsGeneratingPresets(true);

    // Run in a timeout to avoid blocking UI
    setTimeout(() => {
      try {
        const result = generatePathPresets(story, startBeatId);
        setGeneratedPresets(result.presets);
        console.log('[PreviewWindow] Generated', result.presets.length, 'presets for beat:', startBeatId);

        // Auto-select first preset if there's only one path
        if (result.presets.length === 1) {
          const preset: StatePreset = {
            ...result.presets[0].preset,
            id: 'auto_0',
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
          };
          setSelectedPreset(preset);
        } else if (result.presets.length > 0 && !selectedPreset) {
          // If no preset selected and there are paths, suggest selecting one
          // Don't auto-select to let user choose
        }
      } catch (error) {
        console.error('[PreviewWindow] Failed to generate presets:', error);
        setGeneratedPresets([]);
      } finally {
        setIsGeneratingPresets(false);
      }
    }, 0);
  }, [story, startBeatId, selectedPreset]);

  // Auto-generate presets when start beat changes
  useEffect(() => {
    // Clear any previously selected preset when beat changes
    setSelectedPreset(null);
    if (startBeatId && story) {
      handleGeneratePresets();
    }
  }, [startBeatId, story]); // Note: intentionally not including handleGeneratePresets to avoid loops

  // Group presets by outcome for display
  const presetsByOutcome = useMemo(() => {
    return groupPresetsByOutcome(generatedPresets);
  }, [generatedPresets]);

  // Calculate fit scale based on available space
  // Note: We include `story` in deps so this effect re-runs when the main UI becomes visible
  // (initially the component shows "Connecting..." which doesn't have previewAreaRef)
  useLayoutEffect(() => {
    const calculateFitScale = () => {
      if (!previewAreaRef.current) return;

      const padding = 20;
      const availableWidth = previewAreaRef.current.clientWidth - (padding * 2);
      const availableHeight = previewAreaRef.current.clientHeight - (padding * 2);

      const scaleX = availableWidth / STAGE_WIDTH;
      const scaleY = availableHeight / STAGE_HEIGHT;
      // Allow scaling up to fill available space (max 2x to avoid excessive pixelation)
      const newFitScale = Math.min(scaleX, scaleY, 2);

      console.log(`[PreviewWindow] Available: ${availableWidth}x${availableHeight}, fitScale: ${newFitScale.toFixed(3)}`);
      setFitScale(newFitScale);

      if (isAutoFit) {
        setScale(newFitScale);
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(calculateFitScale);

    const resizeObserver = new ResizeObserver(calculateFitScale);
    if (previewAreaRef.current) {
      resizeObserver.observe(previewAreaRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [isAutoFit, story]);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current || !story || !previewData) return;

    if (!rendererRef.current) {
      const reactRenderer = new ReactRenderer({
        container: containerRef.current,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
      });

      // Disable renderer's internal scaling - PreviewWindow handles scaling via CSS transforms
      (reactRenderer as any).setDisableScaling?.(true);

      // Set up asset resolver
      if (previewData.assets && previewData.assets.length > 0) {
        reactRenderer.setAssetResolver((assetId: string) => {
          const asset = previewData.assets?.find(a => a.id === assetId);
          return asset ? asset.url : undefined;
        });
      }

      // Set up sound blob resolver for beat sounds
      // This fetches audio from URLs and converts to blobs for the audio manager
      reactRenderer.setSoundBlobResolver(async (assetIdOrUrl: string): Promise<Blob | null> => {
        try {
          // First try to find asset by ID
          const asset = previewData.assets?.find(a => a.id === assetIdOrUrl);
          const url = asset?.url || assetIdOrUrl;

          if (!url || (!url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('data:'))) {
            console.warn('[PreviewWindow] Invalid sound URL:', url);
            return null;
          }

          const response = await fetch(url);
          if (!response.ok) {
            console.warn('[PreviewWindow] Failed to fetch sound:', url);
            return null;
          }

          return await response.blob();
        } catch (error) {
          console.warn('[PreviewWindow] Error loading sound:', error);
          return null;
        }
      });
      console.log('[PreviewWindow] Sound blob resolver set up');

      // Set up character resolver
      if (previewData.characters && previewData.characters.length > 0) {
        (reactRenderer as any).setCharacterResolver((characterId: string, stateId?: string) => {
          const character = previewData.characters?.find(c => c.id === characterId);
          if (!character) return undefined;

          const resolveImage = (visual: { assetId?: string; image?: string } | undefined): string | undefined => {
            if (!visual) return undefined;
            if (visual.assetId && previewData.assets) {
              const asset = previewData.assets.find(a => a.id === visual.assetId);
              if (asset?.url) return asset.url;
            }
            if (visual.image && !visual.image.startsWith('blob:')) return visual.image;
            return undefined;
          };

          if (stateId) {
            const state = character.states.find(s => s.id === stateId);
            const resolved = resolveImage(state?.visual);
            if (resolved) return resolved;
          }

          const defaultState = character.states.find(s => s.id === character.defaultState);
          const resolvedDefault = resolveImage(defaultState?.visual);
          if (resolvedDefault) return resolvedDefault;

          // Fall back to character's default image (static) or spriteSheet (sprite)
          if (character.visual.type === 'sprite' && character.visual.spriteSheet?.url) {
            // For sprite characters, return the spriteSheet URL
            // Note: This returns the full spritesheet; frame extraction happens in renderer
            console.log(`[PreviewWindow] Resolved sprite character ${character.name} → spriteSheet URL`);
            return character.visual.spriteSheet.url;
          }

          return resolveImage({ assetId: character.visual.defaultAssetId, image: character.visual.defaultImage });
        });
      }

      // Set up counter resolver
      (reactRenderer as any).setCounterResolver?.((counterName: string) => {
        const value = countersRef.current[counterName] ?? 0;
        const counterDef = previewData.characters
          ?.flatMap(c => c.counters || [])
          .find(c => c.name === counterName);
        return {
          value,
          min: counterDef?.min ?? 0,
          max: counterDef?.max ?? 100,
        };
      });

      // Set up character meter frame resolver for HUD overlays
      if (previewData.characters && previewData.characters.length > 0) {
        (reactRenderer as any).setCharacterMeterFrameResolver?.((characterId: string) => {
          const character = previewData.characters?.find(c => c.id === characterId);
          if (!character || !character.meterFrame) {
            return null;
          }

          // Filter to visible counters
          const visibleCounters = character.counters?.filter(c => c.visible) || [];
          if (visibleCounters.length === 0) {
            return null;
          }

          // Build counter data with current values
          const counters = visibleCounters.map(counter => ({
            name: counter.name,
            displayName: counter.displayName,
            value: countersRef.current[counter.name] ?? counter.value,
            min: counter.min ?? 0,
            max: counter.max ?? 100,
            color: counter.color || '#3B82F6',
            showNumericValue: counter.showNumericValue ?? false,
            numericFormat: counter.numericFormat || 'value',
            orientation: counter.levelMeterOrientation || 'horizontal',
          }));

          return {
            counters,
            config: character.meterFrame,
          };
        });
        console.log('[PreviewWindow] Character meter frame resolver set up');
      }

      // Set up character inventory resolver for HUD overlays
      if (previewData.characters && previewData.characters.length > 0) {
        // Build prop asset map from PickProp beats
        const propAssetMap = new Map<string, string>();
        if (story) {
          const allBeats = story.getAllBeats();
          for (const beat of allBeats) {
            if (beat.type === 'pickProp') {
              const props = (beat as any).props || [];
              for (const prop of props) {
                if (prop.name && prop.assetId) {
                  const asset = previewData.assets?.find(a => a.id === prop.assetId);
                  if (asset?.url) {
                    propAssetMap.set(prop.name, asset.url);
                    propAssetMap.set(prop.name.toLowerCase(), asset.url);
                  }
                }
              }
              // Also check beat locations for prop graphics
              const locations = Array.from(beat.locations?.values?.() || []);
              for (const loc of locations) {
                if ((loc as any).kind === 'prop' && (loc as any).name && (loc as any).assetId) {
                  const asset = previewData.assets?.find(a => a.id === (loc as any).assetId);
                  if (asset?.url) {
                    propAssetMap.set((loc as any).name, asset.url);
                    propAssetMap.set((loc as any).name.toLowerCase(), asset.url);
                  }
                }
              }
            }
          }
        }

        (reactRenderer as any).setCharacterInventoryResolver?.((characterId: string) => {
          const character = previewData.characters?.find(c => c.id === characterId);
          if (!character || !character.inventoryFrame) {
            return null;
          }

          // Get current inventory from runtime context
          const ctx = engineRef.current?.getContext();
          if (!ctx) {
            return null;
          }

          const isPlayer = character.role === 'player';
          const runtimeInventory = isPlayer
            ? ctx.getInventoryEntries()
            : (ctx.getState().characterInventories[character.name] || []);

          if (runtimeInventory.length === 0) {
            return null;
          }

          // Build item data
          const itemDefinitions = character.inventory || [];
          const itemData = runtimeInventory.map((entry: { name: string; quantity: number }) => {
            const definition = itemDefinitions.find((def: any) => def.name === entry.name);
            if (definition) {
              const icon = definition.icon || propAssetMap.get(entry.name) || propAssetMap.get(entry.name.toLowerCase()) || '';
              return {
                id: definition.id,
                name: definition.name,
                displayName: definition.displayName,
                description: definition.description || '',
                icon,
                quantity: entry.quantity,
                category: definition.category || '',
              };
            }
            const propIcon = propAssetMap.get(entry.name) || propAssetMap.get(entry.name.toLowerCase()) || '';
            return {
              id: entry.name,
              name: entry.name,
              displayName: entry.name,
              description: '',
              icon: propIcon,
              quantity: entry.quantity,
              category: '',
            };
          });

          return {
            items: itemData,
            config: character.inventoryFrame,
          };
        });
        console.log('[PreviewWindow] Character inventory resolver set up');
      }

      // Set up sprite data resolver for character spritesheets
      if (previewData.characters && previewData.characters.length > 0) {
        (reactRenderer as any).setSpriteDataResolver?.((characterId: string) => {
          const character = previewData.characters?.find(c => c.id === characterId);
          if (!character || character.visual.type !== 'sprite' || !character.visual.spriteSheet) {
            return null;
          }

          const sheet = character.visual.spriteSheet;
          return {
            frameWidth: sheet.frameWidth,
            frameHeight: sheet.frameHeight,
            imageWidth: sheet.imageWidth,
            defaultFrame: 0,
            animations: sheet.animations?.map(a => ({
              name: a.name,
              frames: a.frames,
              frameDuration: a.frameDuration,
              loop: a.loop,
            })),
            activeAnimation: undefined,
          };
        });
        console.log('[PreviewWindow] Sprite data resolver set up');
      }

      const engine = new StoryEngine(reactRenderer as any);
      rendererRef.current = reactRenderer;
      engineRef.current = engine;
    }

    // Set up AI service for AI-powered beats (update on every previewData change)
    if (rendererRef.current) {
      const aiServiceAdapter = createAIServiceAdapter();
      if (aiServiceAdapter) {
        rendererRef.current.setState('aiService', aiServiceAdapter);
        console.log('[PreviewWindow] AI service adapter configured for runtime AI beats');
      } else {
        console.log('[PreviewWindow] No AI configuration found - AI beats will show fallback messages');
      }

      // Set up story context for AI beats to use
      // This provides story metadata and character info for better AI responses
      const storyContext = {
        title: previewData.storyData?.title || 'Untitled Story',
        author: previewData.storyData?.author || 'Unknown',
        characters: previewData.characters?.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          description: c.description || '',
        })) || [],
      };
      rendererRef.current.setState('storyContext', storyContext);
      console.log('[PreviewWindow] Story context set for AI beats:', {
        title: storyContext.title,
        characterCount: storyContext.characters.length,
      });
    }

    // Apply theme
    if (previewData.settings && rendererRef.current) {
      const baseTheme = convertGlobalSettingsToTheme(previewData.settings);
      const theme = animationEnabled ? baseTheme : {
        ...baseTheme,
        textEffects: { ...baseTheme.textEffects, animation: 'none' as const },
      };

      const themeWithAssets = {
        ...theme,
        textboxFrameUrl: previewData.themeAssets?.textboxFrame,
        buttonNormalUrl: previewData.themeAssets?.buttonNormal,
        buttonHoverUrl: previewData.themeAssets?.buttonHover,
        buttonLayout: previewData.themeAssets?.buttonLayout,
      };

      (rendererRef.current as any).setTheme?.(themeWithAssets);

      // Set layout theme for DialogTreeBeat to use
      // This ensures preview uses the same layout calculations as the visual editor
      const settings = previewData.settings;
      rendererRef.current.setState('layoutTheme', {
        fontSize: settings?.fonts?.textFontSize || 16,
        fontFamily: settings?.fonts?.textFont || 'Arial',
        padding: settings?.textbox?.padding || 20,
        maxTextWidthRatio: 0.8,
        maxButtonWidthRatio: 0.6,
        textButtonGap: 20,
        buttonGap: 16,
        startY: 50,
      });

      // Set stage size for DialogTreeBeat to use
      // This ensures preview uses the same stage dimensions as the visual editor
      rendererRef.current.setState('stageSize', {
        width: previewData.projectSettings?.width || 1024,
        height: previewData.projectSettings?.height || 768,
      });

      // Set HUD overlay configs from global settings
      const hudOverlays = settings?.hudOverlays;
      if (hudOverlays?.timerHud) {
        (rendererRef.current as any).setTimerHudConfig?.(hudOverlays.timerHud);
      }
      if (hudOverlays?.countdownMeter) {
        (rendererRef.current as any).setCountdownMeterConfig?.(hudOverlays.countdownMeter);
      }
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, [story, previewData, animationEnabled]);

  // Start preview (startPaused = true means pause after showing the first beat)
  // overridePreset allows passing a preset directly (bypasses React state timing issues)
  const startPreview = useCallback(async (overrideBeatId?: string, startPaused: boolean = true, overridePreset?: StatePreset | null) => {
    if (!engineRef.current || !rendererRef.current || !story || !previewData) return;

    try {
      // Stop any previous run and clear renderer
      if (engineRef.current) {
        engineRef.current.stop();
      }
      rendererRef.current.clear();
      setIsRunning(true);

      // Initialize beat locations
      const allBeats = story.getAllBeats();
      initializeBeatLocations(allBeats, STAGE_WIDTH, STAGE_HEIGHT);

      // Merge assets into story environment
      const existingEnvironment = story.getEnvironment() || {};
      const assetNodes = (previewData.assets || []).map(asset => ({
        id: asset.id,
        url: asset.url,
        type: asset.type,
        name: asset.name,
        file: asset.url
      }));

      const nodeMap = new Map<string, any>();
      for (const node of existingEnvironment.nodes || []) {
        if (node.id) nodeMap.set(node.id, { ...node, url: node.url || node.file || node.path });
      }
      for (const node of assetNodes) {
        nodeMap.set(node.id, node);
      }
      story.setEnvironment({ ...existingEnvironment, nodes: Array.from(nodeMap.values()) });

      await engineRef.current.loadStory(story);
      const context = engineRef.current.getContext();

      // Apply selected preset (use override if provided, otherwise use state)
      const presetToApply = overridePreset !== undefined ? overridePreset : selectedPreset;
      if (presetToApply) {
        Object.entries(presetToApply.state.variables).forEach(([key, value]) => context.setVariable(key, value));
        Object.entries(presetToApply.state.counters).forEach(([key, value]) => context.setCounter(key, value));
        presetToApply.state.inventory.forEach(item => context.addToInventory(item));
        presetToApply.state.visitedBeats.forEach(beatId => context.markBeatVisited(beatId));
      }

      // Set up beat tracking and debug info updates
      const updateDebugInfo = () => {
        const ctx = engineRef.current?.getContext();
        if (!ctx) return;

        // Get all state info from context (these methods return Records)
        const variables = ctx.getVariables();
        const counters = ctx.getCounters();
        const timers = ctx.getTimers();

        // Update countersRef for counter resolver
        Object.entries(counters).forEach(([key, value]) => {
          countersRef.current[key] = value;
        });

        setDebugInfo({
          visitedBeats: ctx.getVisitedBeats(),
          variables,
          counters,
          inventory: ctx.getInventoryEntries(),
          timers,
        });

        // Update active timers
        const timerManager = ctx.getTimerManager();
        if (timerManager) {
          const active = timerManager.getActiveTimers?.() || [];
          setActiveTimers(active);
        }
      };

      // Clean up previous state change listener to avoid multiple callbacks
      if (stateChangeUnsubscribeRef.current) {
        stateChangeUnsubscribeRef.current();
        stateChangeUnsubscribeRef.current = null;
      }

      const unsubscribe = (rendererRef.current as any).onStateChange?.('currentBeatInfo', (beatInfo: { id: string; name: string; type: string } | null) => {
        if (beatInfo) {
          const beat = story.getBeat(beatInfo.id);
          setCurrentBeat(beat || null);
          // Update debug info when beat changes
          updateDebugInfo();

          // Set per-beat timer HUD override text (for static mode)
          if (rendererRef.current) {
            const params = beat?.getParameters?.() || {};
            const overrideText = params.timeDisplayText || undefined;
            (rendererRef.current as any).setTimerHudOverrideText?.(overrideText);
          }
        }
      });

      // Store unsubscribe function to clean up on next start
      if (unsubscribe) {
        stateChangeUnsubscribeRef.current = unsubscribe;
      }

      // Subscribe to context events for state updates
      context.on('variableChanged', updateDebugInfo);
      context.on('counterChanged', updateDebugInfo);
      context.on('inventoryChanged', updateDebugInfo);

      // Set up timer manager for defaultTarget timers (used by DurScreen, timed beats)
      const timerManager = context.getTimerManager();

      const updateTimers = () => {
        const timers = timerManager.getActiveTimers();
        setActiveTimers(timers);

        // Update renderer's timer state for progress bar
        if (rendererRef.current) {
          // Find default target timer (created by Beat.execute when showTimer is true)
          const defaultTargetTimer = timers.find((t: any) => t.name?.startsWith('defaultTarget_'));

          if (defaultTargetTimer) {
            // Extract beatId from timer name: defaultTarget_<beatId>
            const beatId = defaultTargetTimer.name.replace('defaultTarget_', '');
            const beat = story.getBeat(beatId);

            // Only show progress bar if beat has showTimer: true
            if (beat?.showTimer) {
              (rendererRef.current as any).setTimerState?.({
                totalTime: defaultTargetTimer.totalTime || defaultTargetTimer.remainingTime + 1,
                remainingTime: defaultTargetTimer.remainingTime,
                visible: true,
                label: undefined,
              });
            } else {
              (rendererRef.current as any).setTimerState?.(undefined);
            }
          } else {
            // No active default target timer
            (rendererRef.current as any).setTimerState?.(undefined);
          }
        }
      };

      // Also update timer HUD state for named timers (not just defaultTarget)
      const updateTimerHud = () => {
        if (!rendererRef.current) return;
        const hudConfig = (rendererRef.current as any).timerHudConfig;
        if (!hudConfig?.enabled || hudConfig.mode !== 'timer') return;

        const timers = timerManager.getActiveTimers();
        // Find the matching timer by name, or first active if timerName is empty
        const timerName = hudConfig.timerName;
        const timer = timerName
          ? timers.find((t: any) => t.name === timerName)
          : timers.find((t: any) => !t.name?.startsWith('defaultTarget_'));

        if (timer) {
          (rendererRef.current as any).setTimerHudState?.({
            totalTime: timer.totalTime || timer.remainingTime + 1,
            remainingTime: timer.remainingTime,
          });
        } else {
          (rendererRef.current as any).setTimerHudState?.(undefined);
        }
      };

      // Update countdown meter when counters change
      const updateCountdownMeter = () => {
        if (!rendererRef.current) return;
        const meterConfig = (rendererRef.current as any).countdownMeterConfig;
        if (!meterConfig?.enabled || !meterConfig.counterName) return;

        const counterName = meterConfig.counterName;
        const value = context.getCounter(counterName) ?? 0;
        // Try to get min/max from character definitions
        let min = 0;
        let max = 100;
        if (previewData.characters) {
          for (const char of previewData.characters) {
            const counter = char.counters?.find((c: any) => c.name === counterName);
            if (counter) {
              min = counter.min ?? 0;
              max = counter.max ?? 100;
              break;
            }
          }
        }
        (rendererRef.current as any).setCountdownMeterValue?.({ value, min, max });
      };

      timerManager.on('timerStarted', updateTimers);
      timerManager.on('timerTick', updateTimers);
      timerManager.on('timerStopped', updateTimers);

      // Wire timer HUD updates to timer events
      timerManager.on('timerStarted', updateTimerHud);
      timerManager.on('timerTick', updateTimerHud);
      timerManager.on('timerStopped', updateTimerHud);

      // Wire countdown meter updates to counter events
      context.on('counterChanged', updateCountdownMeter);
      // Initial counter meter state
      updateCountdownMeter();

      // Handle timer expiration - navigate to target beat
      timerManager.on('timerExpired', async ({ name, targetBeat }: { name: string; targetBeat?: string }) => {
        if (targetBeat && rendererRef.current) {
          console.log(`[PreviewWindow] Timer "${name}" expired, navigating to: ${targetBeat}`);
          const beat = story.getBeat(targetBeat);
          if (beat) {
            if (engineRef.current) {
              engineRef.current.stop();
            }
            context.markBeatVisited(targetBeat);
            try {
              const nextBeatId = await beat.execute(context, rendererRef.current as any);
              if (nextBeatId) {
                const nextBeat = story.getBeat(nextBeatId);
                if (nextBeat) {
                  context.markBeatVisited(nextBeatId);
                  await nextBeat.execute(context, rendererRef.current as any);
                }
              }
            } catch (error) {
              console.error('[PreviewWindow] Error executing timer target beat:', error);
            }
          }
        }
      });

      // Initial debug info
      updateDebugInfo();

      // Start background music if configured
      // StoryEngine (from @asaps/core) doesn't handle background music,
      // so we need to handle it here using the AudioManager
      const soundSettings = previewData.settings?.sound;
      if (soundSettings && soundEnabled) {
        const backgroundMusicAssetId = soundSettings.backgroundMusicAssetId;
        const backgroundMusicUrl = soundSettings.backgroundMusic;

        if ((backgroundMusicAssetId || backgroundMusicUrl) && !soundSettings.mute) {
          try {
            const audioManager = getAudioManager();
            // Stop any existing sounds first to prevent duplicates on restart
            audioManager.stopAllSounds();
            const volume = (soundSettings.backgroundVolume || 70) / 100;

            let audioUrl: string | null = null;

            // First priority: use backgroundMusicAssetId if available
            if (backgroundMusicAssetId && previewData.assets) {
              const asset = previewData.assets.find((a: Asset) => a.id === backgroundMusicAssetId);
              if (asset?.url) {
                audioUrl = asset.url;
                console.log(`[PreviewWindow] Found background music asset: ${asset.name}`);
              }
            }

            // Fallback: try to find asset by URL or name reference
            if (!audioUrl && backgroundMusicUrl && previewData.assets) {
              const audioAsset = previewData.assets.find((a: Asset) =>
                a.id === backgroundMusicUrl ||
                a.name === backgroundMusicUrl ||
                a.url === backgroundMusicUrl ||
                a.name?.replace(/\.[^/.]+$/, '') === backgroundMusicUrl
              );
              if (audioAsset?.url) {
                audioUrl = audioAsset.url;
                console.log(`[PreviewWindow] Found background music by name match: ${audioAsset.name}`);
              }
            }

            // Fallback: external URL
            if (!audioUrl && backgroundMusicUrl?.startsWith('http')) {
              audioUrl = backgroundMusicUrl;
            }

            if (audioUrl) {
              // Fetch and play as blob for better caching
              try {
                const response = await fetch(audioUrl);
                if (response.ok) {
                  const blob = await response.blob();
                  await audioManager.playSoundFromBlob(blob, volume, true, audioUrl); // true = loop
                  console.log('[PreviewWindow] Background music started successfully');
                }
              } catch (fetchError) {
                // Fallback to direct URL playback
                console.warn('[PreviewWindow] Blob fetch failed, trying direct URL:', fetchError);
                await audioManager.playSound(audioUrl, volume, true);
              }
            } else {
              console.warn(`[PreviewWindow] Could not resolve background music. AssetId: ${backgroundMusicAssetId}, URL: ${backgroundMusicUrl}`);
            }
          } catch (error) {
            console.warn('[PreviewWindow] Failed to start background music:', error);
          }
        }
      }

      // Start from the specified beat or the beginning
      const actualStartBeat = overrideBeatId || startBeatId || undefined;
      await engineRef.current.start(actualStartBeat);

    } catch (error) {
      console.error('[PreviewWindow] Preview error:', error);
    } finally {
      setIsRunning(false);
    }
  }, [story, previewData, startBeatId, selectedPreset, soundEnabled]);

  // Auto-start preview when story is loaded
  // Note: Auto-start is disabled. User must click to start preview.
  // This provides clearer UX - user sees which beat they'll preview before it runs.

  // Restart preview
  // pauseOnStart: true to pause at first beat (useful when reviewing with preset state)
  const handleRestart = useCallback((overrideBeatId?: string, overridePreset?: StatePreset | null, pauseOnStart: boolean = false) => {
    try {
      const audioManager = getAudioManager();
      audioManager.stopAllSounds();
      audioManager.setMuted(false);
    } catch (error) {
      console.warn('[PreviewWindow] Error stopping sounds:', error);
    }

    if (rendererRef.current) {
      rendererRef.current.clear();
    }
    setCurrentBeat(null);
    setSoundEnabled(true);
    setIsPaused(false);
    setDebugInfo({});
    setActiveTimers([]);
    startPreview(overrideBeatId, pauseOnStart, overridePreset);
  }, [startPreview]);

  // Keep ref updated for use in message handler
  handleRestartRef.current = handleRestart;

  // Stop preview
  const stopPreview = useCallback(() => {
    try {
      const audioManager = getAudioManager();
      audioManager.setMuted(false);
      audioManager.stopAllSounds();
    } catch (error) {
      console.warn('[PreviewWindow] Error stopping audio:', error);
    }

    if (engineRef.current) {
      const context = engineRef.current.getContext();
      context.getTimerManager().stopAllTimers();
      engineRef.current.stop();
    }
    if (rendererRef.current) {
      rendererRef.current.clear();
    }
    setIsRunning(false);
    setIsPaused(false);
    setCurrentBeat(null);
    setSoundEnabled(true);
    setDebugInfo({});
    setActiveTimers([]);
  }, []);

  // Pause preview
  const pausePreview = useCallback(() => {
    if (engineRef.current && isRunning && !isPaused) {
      engineRef.current.pause();
      setIsPaused(true);
      setIsRunning(false);
      console.log('[PreviewWindow] Paused');
    }
  }, [isRunning, isPaused]);

  // Resume preview
  const resumePreview = useCallback(async () => {
    if (engineRef.current && isPaused) {
      setIsPaused(false);
      setIsRunning(true);
      await engineRef.current.resume();
      console.log('[PreviewWindow] Resumed');
    }
  }, [isPaused]);

  // Sound toggle
  const handleSoundToggle = useCallback(() => {
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);
    try {
      const audioManager = getAudioManager();
      audioManager.setMuted(!newSoundEnabled);
    } catch (error) {
      console.warn('[PreviewWindow] Error toggling sound:', error);
    }
  }, [soundEnabled]);

  // Zoom controls
  const handleZoomIn = () => { setIsAutoFit(false); setScale(prev => Math.min(prev + 0.1, 2)); };
  const handleZoomOut = () => { setIsAutoFit(false); setScale(prev => Math.max(prev - 0.1, 0.25)); };
  const handleFitToWindow = () => { setIsAutoFit(true); setScale(fitScale); };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip keyboard shortcuts when focus is in an input/textarea
      // This allows users to type normally in inputText beats during preview
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' ||
                             target.tagName === 'TEXTAREA' ||
                             target.isContentEditable;

      // Ctrl/Cmd+I: Toggle inventory (works even in input)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setInventoryVisible(prev => !prev);
      }
      // Escape: Stop preview or cancel waiting (works even in input)
      if (e.key === 'Escape') {
        if (isWaitingToStart) {
          setIsWaitingToStart(false);
          navigatedBeatIdRef.current = null;
          setStartBeatId(null);
        } else if (isRunning || isPaused) {
          stopPreview();
        }
      }
      // Space: Start/pause/resume preview (skip if typing in input)
      if (e.key === ' ' && story && !isInputFocused) {
        e.preventDefault();
        if (isWaitingToStart) {
          setIsWaitingToStart(false);
          startPreview(startBeatId || undefined, false);
        } else if (isPaused) {
          resumePreview();
        } else if (isRunning) {
          pausePreview();
        } else {
          startPreview();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRunning, isPaused, isWaitingToStart, story, startBeatId, startPreview, stopPreview, pausePreview, resumePreview]);

  // Initialize inventory visibility based on player character's showOnDemand setting
  // This runs once when previewData is first loaded
  const initialInventorySetRef = useRef(false);
  useEffect(() => {
    if (previewData?.characters && !initialInventorySetRef.current) {
      const playerChar = previewData.characters.find(c => c.role === 'player' && c.inventoryFrame);
      if (playerChar?.inventoryFrame) {
        const showByDefault = !playerChar.inventoryFrame.showOnDemand;
        console.log(`[PreviewWindow] Setting initial inventory visibility: ${showByDefault} (showOnDemand=${playerChar.inventoryFrame.showOnDemand})`);
        setInventoryVisible(showByDefault);
        initialInventorySetRef.current = true;
      }
    }
  }, [previewData?.characters]);

  // Update renderer inventory visibility
  useEffect(() => {
    if (rendererRef.current && 'setInventoryVisible' in rendererRef.current) {
      (rendererRef.current as any).setInventoryVisible(inventoryVisible);
    }
  }, [inventoryVisible]);


  // Loading state
  if (connectionStatus === 'connecting' && !previewData) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Connecting to builder...</p>
          <p className="text-sm text-gray-400 mt-2">Waiting for story data</p>
        </div>
      </div>
    );
  }

  // No story loaded
  if (!story) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center text-gray-500">
          <Play className="w-16 h-16 mx-auto mb-4" />
          <p>No story loaded</p>
          <p className="text-sm mt-2">Make changes in the builder to see them here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-gray-800 flex items-center gap-2">
            <Play className="w-4 h-4" />
            Preview: {story.getMetadata().title}
          </h1>

          {/* Beat selection dropdown */}
          {!isRunning && (
            <div className="relative">
              <button
                onClick={() => setShowBeatMenu(!showBeatMenu)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="max-w-40 truncate">
                  {startBeatId ? story.getBeat(startBeatId)?.name || startBeatId : 'Start from beginning'}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showBeatMenu && (
                <div className="absolute left-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => { navigatedBeatIdRef.current = null; setStartBeatId(null); setShowBeatMenu(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${!startBeatId ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    <div className="font-medium">Start from beginning</div>
                  </button>
                  <div className="border-t border-gray-200" />
                  {story.getAllBeats().map((beat) => (
                    <button
                      key={beat.id}
                      onClick={() => { navigatedBeatIdRef.current = null; setStartBeatId(beat.id); setShowBeatMenu(false); }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${startBeatId === beat.id ? 'bg-blue-50 text-blue-700' : ''}`}
                    >
                      <div className="font-medium truncate">{beat.name}</div>
                      <div className="text-xs text-gray-500">{beat.type}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Path State dropdown - shows how player could arrive at this beat */}
          {!isRunning && startBeatId && startBeatId !== story.getMetadata().firstBeatId && (
            <div className="relative">
              <button
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className={`px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-2 ${
                  generatedPresets.length > 0 && !selectedPreset
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-300'
                }`}
                title="Select how the player arrived at this beat"
              >
                <Database className="w-3 h-3" />
                <span className="max-w-40 truncate">
                  {isGeneratingPresets ? (
                    'Analyzing...'
                  ) : selectedPreset ? (
                    selectedPreset.name.replace(/^.*? - /, '') // Show just the path part
                  ) : generatedPresets.length > 0 ? (
                    `Select path (${generatedPresets.length})`
                  ) : (
                    'No paths found'
                  )}
                </span>
                {isGeneratingPresets ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
              {showPresetMenu && (
                <div className="absolute left-0 top-full mt-1 w-96 max-h-[28rem] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  {/* Header */}
                  <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        How did the player arrive here?
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGeneratePresets();
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Re-analyze paths"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGeneratingPresets ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Select a path to set variables, counters, and visited beats
                    </div>
                  </div>

                  {/* Clean state option */}
                  <button
                    onClick={() => {
                      navigatedBeatIdRef.current = null; // Allow STORY_UPDATE to work normally
                      setSelectedPreset(null);
                      setShowPresetMenu(false);
                      // Auto-restart preview with no preset (pass null explicitly)
                      // pauseOnStart=true so user can review initial state
                      setTimeout(() => handleRestart(startBeatId || undefined, null, true), 50);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 border-b border-gray-100 ${!selectedPreset ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    <div className="font-medium">Start fresh (no prior state)</div>
                    <div className="text-xs text-gray-500">All variables reset, no beats visited</div>
                  </button>

                  {isGeneratingPresets ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
                      Analyzing paths...
                    </div>
                  ) : generatedPresets.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">
                      No paths found to this beat.
                      <br />
                      <span className="text-xs">Try selecting a different beat.</span>
                    </div>
                  ) : (
                    /* Group presets by outcome */
                    Array.from(presetsByOutcome.entries()).map(([outcome, presets]) => (
                      <div key={outcome}>
                        <div className="px-3 py-1 bg-gray-50 text-xs font-medium text-gray-600 border-t border-gray-200">
                          → {outcome} ({presets.length} {presets.length === 1 ? 'path' : 'paths'})
                        </div>
                        {presets.map((genPreset, idx) => {
                          const { variables, counters, inventory, visitedBeats } = genPreset.preset.state;
                          const varCount = Object.keys(variables).length;
                          const counterCount = Object.keys(counters).length;
                          const invCount = inventory.length;

                          // Build a more informative summary
                          const summaryParts: string[] = [];

                          // Show actual variable values if few, otherwise count
                          if (varCount > 0) {
                            if (varCount <= 2) {
                              const varStr = Object.entries(variables)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(', ');
                              summaryParts.push(varStr);
                            } else {
                              summaryParts.push(`${varCount} vars`);
                            }
                          }

                          // Show actual counter values if few, otherwise count
                          if (counterCount > 0) {
                            if (counterCount <= 2) {
                              const counterStr = Object.entries(counters)
                                .map(([k, v]) => `${k}:${v}`)
                                .join(', ');
                              summaryParts.push(counterStr);
                            } else {
                              summaryParts.push(`${counterCount} counters`);
                            }
                          }

                          // Show actual items if few, otherwise count
                          if (invCount > 0) {
                            if (invCount <= 2) {
                              summaryParts.push(inventory.join(', '));
                            } else {
                              summaryParts.push(`${invCount} items`);
                            }
                          }

                          const hasInputText = genPreset.inputTextBeats && genPreset.inputTextBeats.length > 0;

                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                navigatedBeatIdRef.current = null; // Allow STORY_UPDATE to work normally
                                // Convert GeneratedPreset to StatePreset format
                                const preset: StatePreset = {
                                  ...genPreset.preset,
                                  id: `gen_${idx}`,
                                  createdAt: new Date().toISOString(),
                                  modifiedAt: new Date().toISOString(),
                                };
                                setShowPresetMenu(false);

                                // If path has inputText beats, show the modal first
                                if (hasInputText) {
                                  setPendingPreset(preset);
                                  setPendingInputTextBeats(genPreset.inputTextBeats);
                                  setShowInputTextModal(true);
                                } else {
                                  // No inputText beats - proceed immediately
                                  setSelectedPreset(preset);
                                  // Auto-restart preview with the selected path (pass preset directly to avoid state timing issues)
                                  // pauseOnStart=true so user can review initial state with preset
                                  setTimeout(() => handleRestart(startBeatId || undefined, preset, true), 50);
                                }
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                                selectedPreset?.name === genPreset.preset.name ? 'bg-blue-50 text-blue-700' : ''
                              }`}
                            >
                              <div className="font-medium truncate flex items-center gap-2">
                                {genPreset.pathDescription}
                                {hasInputText && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                    {genPreset.inputTextBeats.length} input{genPreset.inputTextBeats.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {summaryParts.length > 0 ? (
                                <div className="text-xs text-gray-500 truncate mt-0.5">
                                  {summaryParts.join(' • ')}
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400 italic mt-0.5">
                                  {visitedBeats.length} beats visited, no state changes
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isWaitingToStart ? (
            <>
              <button
                onClick={() => {
                  setIsWaitingToStart(false);
                  startPreview(startBeatId || undefined, false);
                }}
                className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Start Preview
              </button>
              <button
                onClick={() => {
                  setIsWaitingToStart(false);
                  navigatedBeatIdRef.current = null;
                  setStartBeatId(null);
                }}
                className="px-3 py-1.5 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <div className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded flex items-center gap-1">
                Ready
              </div>
            </>
          ) : !isRunning && !isPaused ? (
            <button
              onClick={() => startPreview()}
              className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              {selectedPreset ? 'Start with preset' : 'Start'}
            </button>
          ) : isPaused ? (
            <>
              <button
                onClick={resumePreview}
                className="px-3 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600 flex items-center gap-2"
                title="Resume (Space)"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
              <button
                onClick={stopPreview}
                className="px-3 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Stop
              </button>
              <button
                onClick={() => handleRestart()}
                className="px-3 py-1.5 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
              <div className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded flex items-center gap-1">
                <Pause className="w-3 h-3" />
                Paused
              </div>
            </>
          ) : (
            <>
              <button
                onClick={pausePreview}
                className="px-3 py-1.5 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600 flex items-center gap-2"
                title="Pause (Space)"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
              <button
                onClick={stopPreview}
                className="px-3 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Stop
              </button>
              <button
                onClick={() => handleRestart()}
                className="px-3 py-1.5 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left spacer for balance with debug panel */}
        <div className="w-4 flex-shrink-0" />

        {/* Preview Area */}
        <div
          ref={previewAreaRef}
          className="flex-1 flex items-center justify-center overflow-hidden p-5"
        >
          {/* Stage wrapper - sized to scaled dimensions */}
          <div
            style={{
              width: STAGE_WIDTH * scale,
              height: STAGE_HEIGHT * scale,
              flexShrink: 0,
            }}
          >
            {/* Inner stage - full size with CSS transform */}
            <div
              className={`relative bg-white shadow-lg transition-all duration-200 ${
                (isPaused || isWaitingToStart) ? 'ring-4 ring-amber-400 ring-offset-2' : ''
              }`}
              style={{
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                overflow: 'hidden',
              }}
            >
              {/* Renderer container */}
              <div ref={containerRef} className="absolute inset-0" />
              {/* Waiting to start overlay - shows when navigated to a beat but not yet started */}
              {isWaitingToStart && (
                <div
                  className="absolute inset-0 z-50 bg-gray-900/30 cursor-pointer flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWaitingToStart(false);
                    startPreview(startBeatId || undefined, false); // Start without auto-pause
                  }}
                  title="Click to start preview"
                >
                  <div className="bg-black/80 text-white px-6 py-3 rounded-lg text-base flex items-center gap-3 shadow-lg">
                    <Play className="w-5 h-5" />
                    Click to preview from {story?.getBeat(startBeatId || '')?.name || 'this beat'}
                  </div>
                </div>
              )}
              {/* Pause overlay - blocks all interaction including hover */}
              {isPaused && !isWaitingToStart && (
                <div
                  className="absolute inset-0 z-50 bg-black/20 cursor-pointer flex items-end justify-center pb-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    resumePreview();
                  }}
                  title="Click to resume"
                >
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg">
                    <Play className="w-4 h-4" />
                    Click anywhere to continue
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebugPanel && (
          <div className="w-72 bg-gray-100 p-4 border-l overflow-y-auto">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Debug Info
            </h3>

            {currentBeat ? (
              <div className="space-y-3">
                {/* Current Beat */}
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-600">Current Beat</div>
                  <div className="font-semibold">{currentBeat.name}</div>
                  <div className="text-xs text-gray-500">{currentBeat.type} • {currentBeat.id}</div>
                </div>

                {/* Visited Beats */}
                {debugInfo.visitedBeats && debugInfo.visitedBeats.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">
                      Visited Beats ({debugInfo.visitedBeats.length})
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {debugInfo.visitedBeats.map((beatId: string, idx: number) => {
                        const beat = story?.getBeat(beatId);
                        return (
                          <div key={`${beatId}-${idx}`} className="text-xs text-gray-600 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            {beat?.name || beatId}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Variables */}
                {debugInfo.variables && Object.keys(debugInfo.variables).length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Variables</div>
                    <div className="space-y-1">
                      {Object.entries(debugInfo.variables).map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="font-mono text-gray-600">{key}:</span>
                          <span className="ml-2">{JSON.stringify(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Counters */}
                {debugInfo.counters && Object.keys(debugInfo.counters).length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Counters</div>
                    <div className="space-y-2">
                      {Object.entries(debugInfo.counters).map(([key, value]) => {
                        // Find counter definition from characters in previewData
                        const counterDef = previewData?.characters?.flatMap(c => c.counters || []).find(c => c.name === key);
                        const showMeter = counterDef?.showLevelMeter;
                        const orientation = counterDef?.levelMeterOrientation || 'horizontal';
                        const color = counterDef?.color || '#3B82F6';
                        const min = counterDef?.min ?? 0;
                        const max = counterDef?.max ?? 100;
                        const percentage = max > min ? Math.min(100, Math.max(0, ((value as number) - min) / (max - min) * 100)) : 0;

                        return (
                          <div key={key} className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-gray-600">{counterDef?.displayName || key}:</span>
                              <span className="font-bold">{value as number}</span>
                            </div>
                            {showMeter && (
                              orientation === 'horizontal' ? (
                                <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: color
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="mt-1 flex justify-center">
                                  <div className="w-3 h-16 bg-gray-200 rounded-full overflow-hidden flex flex-col-reverse">
                                    <div
                                      className="w-full rounded-full transition-all duration-300"
                                      style={{
                                        height: `${percentage}%`,
                                        backgroundColor: color
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inventory */}
                {debugInfo.inventory && debugInfo.inventory.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Inventory</div>
                    <div className="space-y-1">
                      {debugInfo.inventory.map((item: { name: string; quantity: number }) => (
                        <div key={item.name} className="text-xs text-gray-600 flex justify-between">
                          <span>• {item.name}</span>
                          <span className="font-mono text-gray-500">×{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timers */}
                {debugInfo.timers && Object.keys(debugInfo.timers).length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Timers</div>
                    <div className="space-y-1">
                      {Object.entries(debugInfo.timers).map(([key, timer]: [string, any]) => (
                        <div key={key} className="text-xs">
                          <span className="font-mono text-gray-600">{key}:</span>
                          <span className="ml-2 font-bold">{timer.value}s</span>
                          {timer.target && (
                            <span className="ml-2 text-gray-500">→ {timer.target}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Timers */}
                {activeTimers.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Active Timers</div>
                    <div className="space-y-2">
                      {activeTimers.map((timer: any) => (
                        <div key={timer.name} className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-bold text-blue-900">{timer.name}</div>
                          <div className="text-sm font-mono text-blue-700">{timer.remainingTime}s</div>
                          {timer.targetBeat && (
                            <div className="text-xs text-blue-600">Target: {timer.targetBeat}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center mt-8">
                <p>Debug information will appear here when the story is running.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="bg-gray-200 border-t px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-300 rounded" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-14 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-300 rounded" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-400 mx-2" />
          <button
            onClick={handleFitToWindow}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${isAutoFit ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-300'}`}
            title="Fit to Window"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnimationEnabled(!animationEnabled)}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${animationEnabled ? 'hover:bg-gray-300' : 'bg-yellow-100 text-yellow-700'}`}
            title={animationEnabled ? 'Disable Text Animation' : 'Enable Text Animation'}
          >
            {animationEnabled ? <Type className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
          </button>
          <button
            onClick={handleSoundToggle}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${soundEnabled ? 'hover:bg-gray-300' : 'bg-red-100 text-red-700'}`}
            title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setInventoryVisible(prev => !prev)}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${inventoryVisible ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-300'}`}
            title={inventoryVisible ? 'Hide Inventory' : 'Show Inventory'}
          >
            <Package className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-400 mx-1" />
          <button
            onClick={() => setShowDebugPanel(prev => !prev)}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${showDebugPanel ? 'bg-purple-100 text-purple-700' : 'hover:bg-gray-300'}`}
            title={showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel'}
          >
            {showDebugPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <div className="w-px h-5 bg-gray-400 mx-1" />
          <div className="text-xs text-gray-500">
            {isWaitingToStart ? (
              <span className="text-amber-600 font-medium">▶ Ready to preview: {story?.getBeat(startBeatId || '')?.name || 'Unknown'}</span>
            ) : isPaused ? (
              <span className="text-yellow-600 font-medium">⏸ PAUSED at: {currentBeat?.name || 'Unknown'}</span>
            ) : currentBeat ? (
              `${currentBeat.name} (${currentBeat.type})`
            ) : (
              'Ready'
            )}
          </div>
          {isWaitingToStart && (
            <div className="ml-2 text-xs text-gray-400">
              Click stage to start
            </div>
          )}
          {isPaused && !isWaitingToStart && (
            <div className="ml-2 text-xs text-gray-400">
              Press Space to resume
            </div>
          )}
        </div>
      </div>

      {/* InputText Values Modal */}
      {showInputTextModal && pendingInputTextBeats.length > 0 && (
        <InputTextValuesModal
          inputTextBeats={pendingInputTextBeats}
          onConfirm={(userValues) => {
            // Merge user values into the pending preset
            if (pendingPreset) {
              const updatedVariables = { ...pendingPreset.state.variables };
              const updatedCounters = { ...pendingPreset.state.counters };

              // Apply user-entered values
              for (const beat of pendingInputTextBeats) {
                const value = userValues[beat.variableName];
                if (beat.saveToType === 'counter') {
                  updatedCounters[beat.variableName] = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
                } else {
                  updatedVariables[beat.variableName] = String(value);
                }
              }

              const updatedPreset: StatePreset = {
                ...pendingPreset,
                state: {
                  ...pendingPreset.state,
                  variables: updatedVariables,
                  counters: updatedCounters,
                },
              };

              setSelectedPreset(updatedPreset);
              setShowInputTextModal(false);
              setPendingInputTextBeats([]);
              setPendingPreset(null);
              setIsWaitingToStart(false); // Clear the "click to preview" overlay

              // Start preview with updated preset
              setTimeout(() => handleRestart(startBeatId || undefined, updatedPreset, true), 50);
            }
          }}
          onUsePlaceholders={() => {
            // Use the preset as-is with placeholder values
            if (pendingPreset) {
              setSelectedPreset(pendingPreset);
              setShowInputTextModal(false);
              setPendingInputTextBeats([]);
              setPendingPreset(null);
              setIsWaitingToStart(false); // Clear the "click to preview" overlay

              // Start preview with placeholder values
              setTimeout(() => handleRestart(startBeatId || undefined, pendingPreset, true), 50);
            }
          }}
          onCancel={() => {
            setShowInputTextModal(false);
            setPendingInputTextBeats([]);
            setPendingPreset(null);
          }}
        />
      )}
    </div>
  );
};

export default PreviewWindow;
