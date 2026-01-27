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
import { generatePathPresets, groupPresetsByOutcome, type GeneratedPreset } from '../services/PathBasedPresetGenerator';
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
          max_tokens: 4096,
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
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Could not extract JSON from response');
        return JSON.parse(jsonMatch[0]);
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
    const model = savedConfig.model || 'gpt-4';

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
          4096
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
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Could not extract JSON from response');
        return JSON.parse(jsonMatch[0]);
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
  assets?: Asset[];
  characters?: Character[];
  themeAssets?: any;
}

export const PreviewWindow: React.FC = () => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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
  const shouldPauseOnFirstBeatRef = useRef<boolean>(true);
  const hasResumedRef = useRef<boolean>(false); // Prevents race condition with auto-pause setTimeout
  const stateChangeUnsubscribeRef = useRef<(() => void) | null>(null); // Cleanup previous listener

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
            setPreviewData(message.payload);
            setConnectionStatus('connected');
            // If a specific beat was requested, set it as start
            if (message.payload.beatId) {
              setStartBeatId(message.payload.beatId);
            }
          }
          break;

        case 'NAVIGATE_TO_BEAT':
          if (message.payload?.beatId) {
            setStartBeatId(message.payload.beatId);
            // If preview is running, restart from this beat
            if (isRunning && engineRef.current) {
              handleRestart(message.payload.beatId);
            }
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
  }, [isRunning]);

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

  // Reset auto-start flag when story data changes
  useEffect(() => {
    hasAutoStarted.current = false;
  }, [previewData?.storyData]);

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

  // Calculate fit scale
  useLayoutEffect(() => {
    const calculateFitScale = () => {
      if (!previewAreaRef.current) return;

      const padding = 20;
      const availableWidth = previewAreaRef.current.clientWidth - (padding * 2);
      const availableHeight = previewAreaRef.current.clientHeight - (padding * 2);

      const scaleX = availableWidth / STAGE_WIDTH;
      const scaleY = availableHeight / STAGE_HEIGHT;
      const newFitScale = Math.min(scaleX, scaleY, 1);

      setFitScale(newFitScale);

      if (isAutoFit) {
        setScale(newFitScale);
      }
    };

    calculateFitScale();

    const resizeObserver = new ResizeObserver(calculateFitScale);
    if (previewAreaRef.current) {
      resizeObserver.observe(previewAreaRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [isAutoFit]);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current || !story || !previewData) return;

    if (!rendererRef.current) {
      const reactRenderer = new ReactRenderer({
        container: containerRef.current,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
      });

      // Set up asset resolver
      if (previewData.assets && previewData.assets.length > 0) {
        reactRenderer.setAssetResolver((assetId: string) => {
          const asset = previewData.assets?.find(a => a.id === assetId);
          return asset ? asset.url : undefined;
        });
      }

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
          return resolveImage(defaultState?.visual) ||
            resolveImage({ assetId: character.visual.defaultAssetId, image: character.visual.defaultImage });
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

      // Set whether we should auto-pause on the first beat
      shouldPauseOnFirstBeatRef.current = startPaused;
      hasResumedRef.current = false; // Reset the resumed flag

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

          // Auto-pause only on the first beat (start paused)
          if (shouldPauseOnFirstBeatRef.current && engineRef.current) {
            shouldPauseOnFirstBeatRef.current = false; // Only pause once - using ref so it persists
            // Small delay to let the beat render before pausing
            setTimeout(() => {
              // Check if user has already clicked to resume - if so, don't pause
              if (hasResumedRef.current) {
                console.log('[PreviewWindow] Skipping auto-pause - user already resumed');
                return;
              }
              if (engineRef.current && !engineRef.current.isPaused()) {
                engineRef.current.pause();
                setIsPaused(true);
                setIsRunning(false);
                console.log('[PreviewWindow] Started paused at beat:', beatInfo.name);
              }
            }, 50);
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
      context.on('timerStarted', updateDebugInfo);
      context.on('timerStopped', updateDebugInfo);

      // Initial debug info
      updateDebugInfo();

      // Start from the specified beat or the beginning
      const actualStartBeat = overrideBeatId || startBeatId || undefined;
      await engineRef.current.start(actualStartBeat);

    } catch (error) {
      console.error('[PreviewWindow] Preview error:', error);
    } finally {
      setIsRunning(false);
    }
  }, [story, previewData, startBeatId, selectedPreset]);

  // Auto-start preview when story is loaded
  useEffect(() => {
    // Only auto-start once when story first loads
    if (story && previewData && !isRunning && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      // Small delay to ensure renderer is initialized
      const timer = setTimeout(() => {
        console.log('[PreviewWindow] Auto-starting preview');
        startPreview();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [story, previewData, isRunning, startPreview]);

  // Restart preview
  const handleRestart = useCallback((overrideBeatId?: string, overridePreset?: StatePreset | null) => {
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
    startPreview(overrideBeatId, true, overridePreset); // Start paused with preset
  }, [startPreview]);

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
      hasResumedRef.current = true; // Prevent race condition with auto-pause setTimeout
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
      // Ctrl/Cmd+I: Toggle inventory
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setInventoryVisible(prev => !prev);
      }
      // Escape: Stop preview
      if (e.key === 'Escape' && (isRunning || isPaused)) {
        stopPreview();
      }
      // Space: Start/pause/resume preview
      if (e.key === ' ' && story) {
        e.preventDefault();
        if (isPaused) {
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
  }, [isRunning, isPaused, story, startPreview, stopPreview, pausePreview, resumePreview]);

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
                    onClick={() => { setStartBeatId(null); setShowBeatMenu(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${!startBeatId ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    <div className="font-medium">Start from beginning</div>
                  </button>
                  <div className="border-t border-gray-200" />
                  {story.getAllBeats().map((beat) => (
                    <button
                      key={beat.id}
                      onClick={() => { setStartBeatId(beat.id); setShowBeatMenu(false); }}
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
                      setSelectedPreset(null);
                      setShowPresetMenu(false);
                      // Auto-restart preview with no preset (pass null explicitly)
                      setTimeout(() => handleRestart(startBeatId || undefined, null), 50);
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

                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                // Convert GeneratedPreset to StatePreset format
                                const preset: StatePreset = {
                                  ...genPreset.preset,
                                  id: `gen_${idx}`,
                                  createdAt: new Date().toISOString(),
                                  modifiedAt: new Date().toISOString(),
                                };
                                setSelectedPreset(preset);
                                setShowPresetMenu(false);
                                // Auto-restart preview with the selected path (pass preset directly to avoid state timing issues)
                                setTimeout(() => handleRestart(startBeatId || undefined, preset), 50);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                                selectedPreset?.name === genPreset.preset.name ? 'bg-blue-50 text-blue-700' : ''
                              }`}
                            >
                              <div className="font-medium truncate">{genPreset.pathDescription}</div>
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
          {!isRunning && !isPaused ? (
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
          className="flex-1 flex items-center justify-center overflow-auto py-4 px-2"
        >
          {/* Stage wrapper */}
          <div
            style={{
              width: STAGE_WIDTH * scale,
              height: STAGE_HEIGHT * scale,
              flexShrink: 0,
            }}
          >
            <div
              className="relative bg-white shadow-lg"
              style={{
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <div ref={containerRef} className="absolute inset-0" />
              {/* Click overlay to resume when paused */}
              {isPaused && (
                <div
                  className="absolute inset-0 cursor-pointer flex items-end justify-center pb-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    resumePreview();
                  }}
                  title="Click anywhere to resume"
                >
                  <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 pointer-events-none">
                    <Play className="w-4 h-4" />
                    Click to continue
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
            {isPaused ? (
              <span className="text-yellow-600 font-medium">⏸ PAUSED at: {currentBeat?.name || 'Unknown'}</span>
            ) : currentBeat ? (
              `${currentBeat.name} (${currentBeat.type})`
            ) : (
              'Ready'
            )}
          </div>
          {isPaused && (
            <div className="ml-2 text-xs text-gray-400">
              Press Space to resume
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewWindow;
