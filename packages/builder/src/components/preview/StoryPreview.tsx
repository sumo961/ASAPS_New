import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { X, Play, RotateCcw, ChevronRight, Info, Eye, EyeOff, ChevronDown, Database, ZoomIn, ZoomOut, Maximize2, Volume2, VolumeX, Type, Zap, List, Package } from 'lucide-react';
import { Story, StoryEngine, Beat } from '@asaps/core';
import type { StatePreset, IAIService } from '@asaps/core';
import { ReactRenderer, getAudioManager } from '@asaps/renderer';
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';
import type { Asset } from '../assets/AssetManager';
import type { Character } from '../../types/character';
import type { ThemeAssetUrls } from '../../hooks/useThemes';
import { StatePresetManager } from '../debug/StatePresetManager';
import { StatePresetEditor } from '../debug/StatePresetEditor';
import { initializeBeatLocations } from '../../utils/SchemaLocationInitializer';
import { getSavedAIConfig } from '../../hooks/useAI';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { buildChatRequestBody } from '../../services/providers/openai-utils';

// Proxy endpoint for CORS-blocked requests (custom baseUrls)
const CLAUDE_PROXY_ENDPOINT = 'http://localhost:3001/api/ai/claude';
const OPENAI_PROXY_ENDPOINT = 'http://localhost:3001/api/ai/openai';

/**
 * Strip thinking/reasoning blocks from AI responses.
 * Some models (like Kimi, DeepSeek) include <think>...</think> or similar blocks
 * that contain internal reasoning which should not be shown to users.
 * Also handles plain-text thinking that some models output without XML tags.
 */
function stripThinkingBlocks(text: string): string {
  let result = text;

  // Remove <think>...</think> blocks (Kimi, DeepSeek, etc.)
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove <thinking>...</thinking> blocks
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Remove <reasoning>...</reasoning> blocks
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

  // Handle plain-text thinking that some models output without XML tags
  // These patterns look for common thinking preambles and remove everything up to the actual content

  // Pattern: "The user wants me to..." followed by analysis - remove until actual content
  // This happens when Kimi outputs its entire thinking process as plain text
  const thinkingPatterns = [
    // Match "The user wants..." through lists/requirements to find where actual content starts
    /^The user wants[^]*?(?=\n\n[A-Z][a-z])/i,
    // Match "Let me analyze/think/consider..." sections
    /^Let me (?:analyze|think|consider|carefully)[^]*?(?=\n\n[A-Z][a-z])/i,
    // Match "I need to..." planning sections
    /^I need to[^]*?(?=\n\n[A-Z][a-z])/i,
    // Match markdown-style thinking with **bold** headers like "**Key data points:**"
    /^\*\*[^*]+\*\*[^]*?(?=\n\n[A-Z][a-z])/,
  ];

  for (const pattern of thinkingPatterns) {
    const match = result.match(pattern);
    if (match && match[0].length < result.length * 0.9) {
      // Only remove if it's not the entire response (safety check)
      result = result.replace(pattern, '');
    }
  }

  // If the response still starts with thinking patterns, try a simpler approach:
  // Look for a clear separator like double newline followed by capitalized text
  if (/^(The user wants|Let me|I need to|I'll|I will|First,)/i.test(result)) {
    // Find the last occurrence of common "end of thinking" markers
    const endMarkers = [
      /\n\n(?=[A-Z][a-z]{2,}[^*\n:]*[.!])/g,  // Double newline before a sentence
      /(?:Here'?s|Here is) (?:the|your|a) (?:summary|response|answer)[:\s]*/gi,
      /(?:Output|Summary|Response)[:\s]*\n/gi,
    ];

    for (const marker of endMarkers) {
      const matches = [...result.matchAll(marker)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const afterMatch = result.substring(lastMatch.index! + lastMatch[0].length);
        // Only use this if there's substantial content after the marker
        if (afterMatch.trim().length > 50) {
          result = afterMatch;
          break;
        }
      }
    }
  }

  // Clean up any leading/trailing whitespace and multiple newlines
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
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baseUrl,
      apiKey,
      ...requestBody,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Proxy request failed' }));
    throw new Error(error.message || 'Proxy request failed');
  }

  return response.json();
}

/**
 * Create an AI service adapter that implements IAIService interface
 * This wraps the builder's AI configuration to provide runtime AI capabilities for AI beats
 */
function createAIServiceAdapter(): IAIService | null {
  const savedConfig = getSavedAIConfig();
  if (!savedConfig || !savedConfig.apiKey) {
    console.log('[StoryPreview] No AI configuration found');
    return null;
  }

  console.log('[StoryPreview] Creating AI service adapter for provider:', savedConfig.provider);

  // Use proxy when custom baseUrl is set (to avoid CORS)
  const useProxy = !!savedConfig.baseUrl;
  if (useProxy) {
    console.log('[StoryPreview] Using proxy for custom baseUrl:', savedConfig.baseUrl);
  }

  if (savedConfig.provider === 'claude') {
    const model = savedConfig.model || 'claude-sonnet-4-20250514';

    // Only create direct client if not using proxy
    const client = !useProxy ? new Anthropic({
      apiKey: savedConfig.apiKey,
      dangerouslyAllowBrowser: true,
    }) : null;

    return {
      async generateContent(prompt: string, options?: { maxTokens?: number; enableWebSearch?: boolean }): Promise<string> {
        console.log(`[AIServiceAdapter] generateContent called (provider: claude, model: ${model})`);

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
        if (content.type === 'text') {
          return content.text;
        }
        throw new Error('Unexpected response type from Claude');
      },

      async generateDialog(request: { prompt: string; format: 'dialogTree'; maxTurns?: number }): Promise<any> {
        console.log(`[AIServiceAdapter] generateDialog called (provider: claude, model: ${model})`);
        const systemPrompt = `You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format with the following structure:
{
  "id": "unique_id",
  "speaker": "Character Name",
  "text": "What the character says",
  "choices": [
    {
      "id": "choice_id",
      "text": "Player's choice text",
      "dialogNode": { ... nested dialog node ... } OR
      "target": "exit_target_id"
    }
  ]
}`;

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
        if (content.type !== 'text') {
          throw new Error('Unexpected response type from Claude');
        }

        // Extract JSON from response
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Could not extract JSON from response');
        }

        return JSON.parse(jsonMatch[0]);
      },

      async classifyContent(prompt: string, categories: string[]): Promise<string> {
        console.log(`[AIServiceAdapter] classifyContent called (provider: claude, model: ${model}) with categories:`, categories);
        const systemPrompt = `You are a classifier. Given a prompt, classify it into exactly ONE of these categories: ${categories.join(', ')}. Respond with ONLY the category name, nothing else.`;

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
          // Clean up response to get just the category
          const result = content.text.trim();
          // Find matching category (case-insensitive)
          const match = categories.find(c => c.toLowerCase() === result.toLowerCase());
          return match || categories[0];
        }
        return categories[0];
      },
    };
  } else {
    // OpenAI provider (also used for local/compatible APIs)
    const model = savedConfig.model || 'gpt-4';

    // Only create direct client if not using proxy
    const client = !useProxy ? new OpenAI({
      apiKey: savedConfig.apiKey,
      dangerouslyAllowBrowser: true,
    }) : null;

    return {
      async generateContent(prompt: string, options?: { maxTokens?: number; enableWebSearch?: boolean }): Promise<string> {
        console.log(`[AIServiceAdapter] generateContent called (provider: openai-compatible, model: ${model}, baseUrl: ${savedConfig.baseUrl || 'default'})`);

        // Use shared utility to build request with correct token parameter
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
          // Cast needed because buildChatRequestBody returns Record<string, any> for flexibility
          const response = await client!.chat.completions.create(requestBody as any);
          content = response.choices[0]?.message?.content || '';
        }

        // Strip thinking blocks from models like Kimi, DeepSeek that include <think> tags
        return stripThinkingBlocks(content);
      },

      async generateDialog(request: { prompt: string; format: 'dialogTree'; maxTurns?: number }): Promise<any> {
        console.log(`[AIServiceAdapter] generateDialog called (provider: openai-compatible, model: ${model})`);
        const systemPrompt = `You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format with the following structure:
{
  "id": "unique_id",
  "speaker": "Character Name",
  "text": "What the character says",
  "choices": [
    {
      "id": "choice_id",
      "text": "Player's choice text",
      "dialogNode": { ... nested dialog node ... } OR
      "target": "exit_target_id"
    }
  ]
}`;

        // Use shared utility to build request with correct token parameter
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

        // Strip thinking blocks before extracting JSON
        content = stripThinkingBlocks(content);

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Could not extract JSON from response');
        }

        return JSON.parse(jsonMatch[0]);
      },

      async classifyContent(prompt: string, categories: string[]): Promise<string> {
        console.log(`[AIServiceAdapter] classifyContent called (provider: openai-compatible, model: ${model}) with categories:`, categories);
        const systemPrompt = `You are a classifier. Given a prompt, classify it into exactly ONE of these categories: ${categories.join(', ')}. Respond with ONLY the category name, nothing else.`;

        // Use shared utility to build request with correct token parameter
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

        // Strip thinking blocks before matching category
        result = stripThinkingBlocks(result);

        // Find matching category (case-insensitive)
        const match = categories.find(c => c.toLowerCase() === result.toLowerCase());
        return match || categories[0];
      },
    };
  }
}

// Stage dimensions
const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 768;

interface StoryPreviewProps {
  story: Story;
  settings?: any;
  assets?: Asset[];
  characters?: Character[];
  themeAssets?: ThemeAssetUrls | null;
  onClose: () => void;
  loadAssetBlob?: (assetId: string) => Promise<Blob | null>;
}

export const StoryPreview: React.FC<StoryPreviewProps> = ({ story, settings, assets = [], characters = [], themeAssets, onClose, loadAssetBlob }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [activeTimers, setActiveTimers] = useState<any[]>([]);
  const [debugStartBeat, setDebugStartBeat] = useState<string | null>(null);
  const boxVisibility = settings?.textbox?.boxVisibility || 'all';
  const containerRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1); // Auto-calculated fit scale
  const [isAutoFit, setIsAutoFit] = useState(true); // Whether to use auto-fit or manual scale
  const [soundEnabled, setSoundEnabled] = useState(true); // Sound on/off toggle
  const [animationEnabled, setAnimationEnabled] = useState(true); // Text animation on/off toggle
  const [selectedStartBeat, setSelectedStartBeat] = useState<string | null>(null); // Beat to start preview from
  const [showBeatMenu, setShowBeatMenu] = useState(false); // Beat selection dropdown visibility

  // Handle sound toggle during playback - mutes/unmutes ALL sounds (beat sounds + background music)
  // Uses gain-based muting so sounds continue playing silently and resume when unmuted
  const handleSoundToggle = useCallback(() => {
    console.log('[StoryPreview] handleSoundToggle called, current soundEnabled:', soundEnabled);
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);

    try {
      const audioManager = getAudioManager();
      // Gain-based muting: sets master gain to 0 when muted, restores when unmuted
      // This allows sounds to continue playing and resume seamlessly
      console.log('[StoryPreview] Setting audio muted to:', !newSoundEnabled);
      audioManager.setMuted(!newSoundEnabled);
    } catch (error) {
      console.warn('[StoryPreview] Error toggling sound:', error);
    }
  }, [soundEnabled]);

  // Store as ReactRenderer, cast to any when passing to StoryEngine to bypass type checking
  const rendererRef = useRef<ReactRenderer | null>(null);
  const engineRef = useRef<StoryEngine | null>(null);
  const countersRef = useRef<Record<string, number>>({});  // Ref to hold latest counter values for resolver

  // State preset management
  const [activeTab, setActiveTab] = useState<'preview' | 'presets'>('preview');
  const [presets, setPresets] = useState<StatePreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<StatePreset | null>(null);
  const [editingPreset, setEditingPreset] = useState<StatePreset | null | undefined>(undefined);
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  // Inventory visibility - initialize based on first player character's showOnDemand setting
  const getInitialInventoryVisible = () => {
    const playerChar = characters?.find(c => c.role === 'player' && c.inventoryFrame);
    if (playerChar?.inventoryFrame) {
      return !playerChar.inventoryFrame.showOnDemand; // visible if NOT showOnDemand
    }
    return false; // default to hidden if no inventory frame configured
  };
  const [inventoryVisible, setInventoryVisible] = useState(getInitialInventoryVisible);

  // Load presets from localStorage
  useEffect(() => {
    const loadPresets = () => {
      const key = `story-presets-${story.getMetadata().title}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setPresets(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load presets:', e);
        }
      }
    };
    loadPresets();
  }, [story]);

  // Save presets to localStorage
  const savePresets = useCallback((newPresets: StatePreset[]) => {
    const key = `story-presets-${story.getMetadata().title}`;
    localStorage.setItem(key, JSON.stringify(newPresets));
    setPresets(newPresets);
  }, [story]);

  // Preset management handlers
  const handleCreatePreset = useCallback(() => {
    setEditingPreset(null);
    setShowPresetEditor(true);
  }, []);

  const handleEditPreset = useCallback((preset: StatePreset) => {
    setEditingPreset(preset);
    setShowPresetEditor(true);
  }, []);

  const handleSavePreset = useCallback((presetData: Omit<StatePreset, 'id' | 'createdAt' | 'modifiedAt'>) => {
    const now = new Date().toISOString();

    if (editingPreset) {
      // Update existing preset
      const updated = presets.map(p =>
        p.id === editingPreset.id
          ? { ...presetData, id: p.id, createdAt: p.createdAt, modifiedAt: now }
          : p
      );
      savePresets(updated);
    } else {
      // Create new preset
      const newPreset: StatePreset = {
        ...presetData,
        id: `preset_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        createdAt: now,
        modifiedAt: now
      };
      savePresets([...presets, newPreset]);
    }

    setShowPresetEditor(false);
    setEditingPreset(undefined);
  }, [editingPreset, presets, savePresets]);

  const handleDeletePreset = useCallback((presetId: string) => {
    const updated = presets.filter(p => p.id !== presetId);
    savePresets(updated);
    if (selectedPreset?.id === presetId) {
      setSelectedPreset(null);
    }
  }, [presets, savePresets, selectedPreset]);

  const handleLoadPreset = useCallback((preset: StatePreset) => {
    setSelectedPreset(preset);
    setActiveTab('preview');
    // We'll apply the preset when starting the preview
  }, []);

  // Calculate fit scale factor based on available preview area
  useLayoutEffect(() => {
    const calculateFitScale = () => {
      if (!previewAreaRef.current) return;

      const padding = 20; // Padding around the stage
      const availableWidth = previewAreaRef.current.clientWidth - (padding * 2);
      const availableHeight = previewAreaRef.current.clientHeight - (padding * 2);

      // Calculate scale to fit while maintaining aspect ratio
      const scaleX = availableWidth / STAGE_WIDTH;
      const scaleY = availableHeight / STAGE_HEIGHT;
      const newFitScale = Math.min(scaleX, scaleY, 1); // Don't scale up past 100%

      setFitScale(newFitScale);

      // If in auto-fit mode, update the active scale
      if (isAutoFit) {
        setScale(newFitScale);
      }
    };

    // Initial calculation
    calculateFitScale();

    // Recalculate on window resize
    const resizeObserver = new ResizeObserver(calculateFitScale);
    if (previewAreaRef.current) {
      resizeObserver.observe(previewAreaRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [activeTab, isAutoFit]); // Recalculate when switching tabs or auto-fit mode changes

  // Zoom control functions
  const handleZoomIn = useCallback(() => {
    setIsAutoFit(false);
    setScale(prev => Math.min(prev + 0.1, 2)); // Max 200%
  }, []);

  const handleZoomOut = useCallback(() => {
    setIsAutoFit(false);
    setScale(prev => Math.max(prev - 0.1, 0.25)); // Min 25%
  }, []);

  const handleFitToWindow = useCallback(() => {
    setIsAutoFit(true);
    setScale(fitScale);
  }, [fitScale]);

  // Keep countersRef updated with latest counter values for the counter resolver
  useEffect(() => {
    if (debugInfo.counters) {
      countersRef.current = debugInfo.counters;
    }
  }, [debugInfo.counters]);

  useEffect(() => {
    // Only initialize once when container is ready
    if (!containerRef.current) return;

    console.log('[StoryPreview] Effect running, current renderer:', !!rendererRef.current);

    if (!rendererRef.current) {
      console.log('[StoryPreview] Creating new renderer and engine');

      // Create renderer with the preview container
      const reactRenderer = new ReactRenderer({
        container: containerRef.current,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
      });

      // Set up asset resolver to provide URLs for assetIds
      if (assets && assets.length > 0) {
        reactRenderer.setAssetResolver((assetId: string) => {
          const asset = assets.find(a => a.id === assetId);
          return asset ? asset.url : undefined;
        });
        console.log('[StoryPreview] Asset resolver set up with', assets.length, 'assets');
      }

      // Set up character resolver to resolve characterId + stateId to image URL
      // Uses assetId first (for persistence), falls back to image URL
      if (characters && characters.length > 0) {
        (reactRenderer as any).setCharacterResolver((characterId: string, stateId?: string) => {
          const character = characters.find(c => c.id === characterId);
          if (!character) {
            console.log(`[StoryPreview] Character not found: ${characterId}`);
            return undefined;
          }

          // Helper to resolve image - prefers assetId over direct image URL
          const resolveImage = (visual: { assetId?: string; image?: string } | undefined): string | undefined => {
            if (!visual) return undefined;

            // First try assetId (preferred - works after import/reload)
            if (visual.assetId && assets) {
              const asset = assets.find(a => a.id === visual.assetId);
              if (asset?.url) {
                console.log(`[StoryPreview] Resolved via assetId ${visual.assetId} → ${asset.url.substring(0, 50)}...`);
                return asset.url;
              }
              console.log(`[StoryPreview] Asset not found for assetId: ${visual.assetId}`);
            }

            // Fall back to direct image URL (for legacy data or external URLs)
            if (visual.image && !visual.image.startsWith('blob:')) {
              console.log(`[StoryPreview] Using direct image URL: ${visual.image.substring(0, 50)}...`);
              return visual.image;
            }

            // Blob URLs without assetId won't work after reload - log warning
            if (visual.image?.startsWith('blob:')) {
              console.warn(`[StoryPreview] Stale blob URL detected (no assetId): ${visual.image.substring(0, 50)}...`);
            }

            return undefined;
          };

          // If stateId provided, look up that state's image
          if (stateId) {
            const state = character.states.find(s => s.id === stateId);
            const resolved = resolveImage(state?.visual);
            if (resolved) {
              console.log(`[StoryPreview] Resolved character ${character.name} state ${stateId}`);
              return resolved;
            }
          }

          // Fall back to default state
          const defaultState = character.states.find(s => s.id === character.defaultState);
          const resolvedDefault = resolveImage(defaultState?.visual);
          if (resolvedDefault) {
            console.log(`[StoryPreview] Resolved character ${character.name} default state`);
            return resolvedDefault;
          }

          // Fall back to character's default image (static) or spriteSheet (sprite)
          if (character.visual.type === 'sprite' && character.visual.spriteSheet?.url) {
            // For sprite characters, return the spriteSheet URL
            // Note: This returns the full spritesheet; frame extraction happens in renderer
            console.log(`[StoryPreview] Resolved sprite character ${character.name} → spriteSheet URL`);
            return character.visual.spriteSheet.url;
          }

          const resolvedCharDefault = resolveImage({
            assetId: character.visual.defaultAssetId,
            image: character.visual.defaultImage
          });
          if (resolvedCharDefault) {
            console.log(`[StoryPreview] Resolved character ${character.name} defaultImage`);
            return resolvedCharDefault;
          }

          console.log(`[StoryPreview] No image found for character ${character.name}`);
          return undefined;
        });
        console.log('[StoryPreview] Character resolver set up with', characters.length, 'characters');
      }

      // Set up counter resolver to get counter values for meter elements
      // Uses countersRef which is updated whenever counters change during playback
      if (characters && characters.length > 0) {
        (reactRenderer as any).setCounterResolver((counterName: string) => {
          // Get current counter value from ref (updated during playback)
          const value = countersRef.current[counterName] ?? 0;

          // Find counter definition from characters to get min/max
          const counterDef = characters.flatMap(c => c.counters || []).find(c => c.name === counterName);

          return {
            value,
            min: counterDef?.min ?? 0,
            max: counterDef?.max ?? 100,
          };
        });
        console.log('[StoryPreview] Counter resolver set up');
      }

      // Set up character meter frame resolver for HUD overlays
      if (characters && characters.length > 0) {
        (reactRenderer as any).setCharacterMeterFrameResolver((characterId: string) => {
          const character = characters.find(c => c.id === characterId);
          if (!character || !character.meterFrame) {
            return null;
          }

          // Filter to visible counters - when meter frame is enabled, show all visible counters
          const visibleCounters = character.counters.filter(c => c.visible);
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
        console.log('[StoryPreview] Character meter frame resolver set up');
      }

      // Set up character inventory resolver for HUD overlays
      if (characters && characters.length > 0) {
        // Build a map of prop names to their asset URLs from PickProp beats
        // This allows inventory items to display the prop's graphic
        const propAssetMap = new Map<string, string>();
        const allBeats = story.getAllBeats();
        for (const beat of allBeats) {
          if (beat.type === 'pickProp') {
            const props = (beat as any).props || [];
            for (const prop of props) {
              if (prop.name && prop.assetId) {
                // Resolve assetId to URL using assets array
                const asset = assets?.find(a => a.id === prop.assetId);
                if (asset?.url) {
                  propAssetMap.set(prop.name, asset.url);
                  propAssetMap.set(prop.name.toLowerCase(), asset.url);
                }
              }
            }
            // Also check beat locations for prop graphics
            const locations = Array.from(beat.locations?.values?.() || []);
            for (const loc of locations) {
              if (loc.kind === 'prop' && loc.name && loc.assetId) {
                const asset = assets?.find(a => a.id === loc.assetId);
                if (asset?.url) {
                  propAssetMap.set(loc.name, asset.url);
                  propAssetMap.set(loc.name.toLowerCase(), asset.url);
                }
              }
            }
          }
        }
        console.log('[StoryPreview] Built prop asset map with', propAssetMap.size, 'entries:', Array.from(propAssetMap.keys()));

        (reactRenderer as any).setCharacterInventoryResolver((characterId: string) => {
          console.log('[StoryPreview] Inventory resolver called for character:', characterId);
          const character = characters.find(c => c.id === characterId);
          console.log('[StoryPreview] Found character:', character?.name, 'has inventoryFrame:', !!character?.inventoryFrame);

          if (!character || !character.inventoryFrame) {
            console.log('[StoryPreview] No character or no inventoryFrame, returning null');
            return null;
          }

          // Get current inventory from runtime context
          // For player character, use main inventory; for others, use character-specific
          const ctx = engineRef.current?.getContext();
          if (!ctx) {
            console.log('[StoryPreview] No context available yet');
            return null;
          }

          const isPlayer = character.role === 'player';
          const runtimeInventory = isPlayer
            ? ctx.getInventory()  // Main player inventory
            : (ctx.getState().characterInventories[character.name] || []);

          console.log('[StoryPreview] Runtime inventory for', character.name, ':', runtimeInventory);

          if (runtimeInventory.length === 0) {
            console.log('[StoryPreview] No items in runtime inventory, returning null');
            return null;
          }

          // Build item data - look up details from character definition if available
          const itemDefinitions = character.inventory || [];
          const itemData = runtimeInventory.map((itemName: string) => {
            // Try to find item definition in character's inventory
            const definition = itemDefinitions.find(def => def.name === itemName);
            if (definition) {
              // For defined items, also try to resolve icon from prop assets if not set
              const icon = definition.icon || propAssetMap.get(itemName) || propAssetMap.get(itemName.toLowerCase()) || '';
              return {
                id: definition.id,
                name: definition.name,
                displayName: definition.displayName,
                description: definition.description || '',
                icon,
                quantity: definition.quantity,
                category: definition.category || '',
              };
            }
            // No definition found - try to get icon from prop assets
            const propIcon = propAssetMap.get(itemName) || propAssetMap.get(itemName.toLowerCase()) || '';
            console.log('[StoryPreview] Item', itemName, 'icon from prop map:', propIcon ? 'found' : 'not found');
            return {
              id: itemName,
              name: itemName,
              displayName: itemName,
              description: '',
              icon: propIcon,
              quantity: 1,
              category: '',
            };
          });

          console.log('[StoryPreview] Returning inventory data:', itemData.length, 'items');
          return {
            items: itemData,
            config: character.inventoryFrame,
          };
        });
        console.log('[StoryPreview] Character inventory resolver set up');
      }

      // Set up sprite data resolver to get sprite sheet config for character sprites
      if (characters && characters.length > 0) {
        (reactRenderer as any).setSpriteDataResolver((characterId: string) => {
          const character = characters.find(c => c.id === characterId);
          if (!character || character.visual.type !== 'sprite' || !character.visual.spriteSheet) {
            return null;
          }

          const sheet = character.visual.spriteSheet;
          // Don't set activeAnimation by default - sprites should be static until
          // explicitly animated by a path animation (onLoad or onClick trigger)
          // The path animation's waypoints specify which sprite animation to play

          const result = {
            frameWidth: sheet.frameWidth,
            frameHeight: sheet.frameHeight,
            imageWidth: sheet.imageWidth,  // Pass through for correct frame position calculation
            defaultFrame: 0, // First frame by default - static until animation triggers
            // Include animation data for sprite animation in preview
            // These are available for path animations to reference, but not auto-played
            animations: sheet.animations?.map(a => ({
              name: a.name,
              frames: a.frames,
              frameDuration: a.frameDuration,
              loop: a.loop,
            })),
            // No activeAnimation - sprite is static by default
            activeAnimation: undefined,
          };

          console.log('[StoryPreview] spriteDataResolver returning:', {
            characterId,
            hasAnimations: !!result.animations?.length,
            activeAnimation: result.activeAnimation,
            animationNames: result.animations?.map(a => a.name),
          });

          return result;
        });
        console.log('[StoryPreview] Sprite data resolver set up');
      }

      // Set up sound blob resolver to load sound assets from storage
      if (loadAssetBlob) {
        reactRenderer.setSoundBlobResolver(loadAssetBlob);
        console.log('[StoryPreview] Sound blob resolver set up');
      }

      // Create story engine - cast renderer to any to bypass type check
      // ReactRenderer DOES implement IRenderer, but TS can't see it across packages
      const engine = new StoryEngine(reactRenderer as any);

      rendererRef.current = reactRenderer;
      engineRef.current = engine;

      // Set up AI service for AI-powered beats (OnlineContent, AIDialogTree, AICondition, AISummary)
      const aiServiceAdapter = createAIServiceAdapter();
      if (aiServiceAdapter) {
        reactRenderer.setState('aiService', aiServiceAdapter);
        console.log('[StoryPreview] AI service adapter configured for runtime AI beats');
      } else {
        console.log('[StoryPreview] No AI configuration found - AI beats will show fallback messages');
      }

      console.log('[StoryPreview] Renderer and engine created');
    } else {
      console.log('[StoryPreview] Renderer exists, ensuring it is valid');
      const renderer = rendererRef.current as any;
      if (!renderer.root && renderer.initialize) {
        console.log('[StoryPreview] Re-initializing renderer for current container');
        renderer.context.container = containerRef.current;
        renderer.initialize();
      }
    }

    return () => {
      console.log('[StoryPreview] Cleanup - stopping engine');
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, [assets, characters, loadAssetBlob]); // Re-run if assets, characters, or loadAssetBlob change

  // Update renderer visibility settings when dropdown changes
  useEffect(() => {
    if (rendererRef.current) {
      const hideText = boxVisibility === 'hideText' || boxVisibility === 'hideAll';
      const hideButtons = boxVisibility === 'hideAll';

      if ('setHideTextBoxes' in rendererRef.current) {
        (rendererRef.current as any).setHideTextBoxes(hideText);
      }
      if ('setHideButtonBoxes' in rendererRef.current) {
        (rendererRef.current as any).setHideButtonBoxes(hideButtons);
      }

      console.log('[StoryPreview] Updated box visibility:', { hideText, hideButtons });
    }
  }, [boxVisibility]);

  // Update renderer theme when settings or animation toggle changes
  useEffect(() => {
    if (rendererRef.current && settings) {
      const baseTheme = convertGlobalSettingsToTheme(settings);
      // Override animation setting if disabled
      const theme = animationEnabled ? baseTheme : {
        ...baseTheme,
        textEffects: {
          ...baseTheme.textEffects,
          animation: 'none' as const,
        },
      };

      // Add theme asset URLs if available (e.g., textbox frame, button graphics from Ren'Py import)
      // Don't use button graphics if custom button colors are set (buttonBg/buttonBgColor)
      // This allows projects to override theme button styling with solid colors
      const hasCustomButtonColors = !!(settings.colors.buttonBg || settings.colors.buttonBgColor);
      const useButtonGraphics = settings.colors.useThemeButtonGraphics !== false && !hasCustomButtonColors;
      const themeWithAssets = {
        ...theme,
        textboxFrameUrl: themeAssets?.textboxFrame,
        buttonNormalUrl: useButtonGraphics ? themeAssets?.buttonNormal : undefined,
        buttonHoverUrl: useButtonGraphics ? themeAssets?.buttonHover : undefined,
        buttonLayout: useButtonGraphics ? themeAssets?.buttonLayout : undefined,
      };

      if ('setTheme' in rendererRef.current) {
        (rendererRef.current as any).setTheme(themeWithAssets);
      }
      console.log('[StoryPreview] Updated theme:', { ...themeWithAssets, animationEnabled, hasTextboxFrame: !!themeAssets?.textboxFrame, hasButtonGraphics: !!(themeAssets?.buttonNormal || themeAssets?.buttonHover), buttonLayout: themeAssets?.buttonLayout });
    }
  }, [settings, animationEnabled, themeAssets]);

  // Update renderer visited beats when debug info changes
  // This enables the "mark already visited choices" feature
  useEffect(() => {
    if (rendererRef.current && debugInfo.visitedBeats && 'setVisitedBeats' in rendererRef.current) {
      (rendererRef.current as any).setVisitedBeats(debugInfo.visitedBeats);
      console.log('[StoryPreview] Updated visitedBeats:', debugInfo.visitedBeats.length, 'beats');
    }
  }, [debugInfo.visitedBeats]);

  // Update renderer inventory visibility when toggled
  useEffect(() => {
    if (rendererRef.current && 'setInventoryVisible' in rendererRef.current) {
      (rendererRef.current as any).setInventoryVisible(inventoryVisible);
    }
  }, [inventoryVisible]);

  // Keyboard handler for Ctrl/Cmd+I to toggle inventory display
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+I (Windows/Linux) or Cmd+I (Mac) to toggle inventory
      // Check for both lowercase 'i' and uppercase 'I' since key value varies
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[StoryPreview] Ctrl/Cmd+I pressed, toggling inventory visibility');
        setInventoryVisible(prev => {
          console.log('[StoryPreview] Inventory visibility:', !prev);
          return !prev;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const startPreview = useCallback(async () => {
    if (!engineRef.current || !rendererRef.current) return;

    try {
      setIsRunning(true);

      // Set theme BEFORE starting preview to ensure settings are applied
      if (settings) {
        const baseTheme = convertGlobalSettingsToTheme(settings);
        // Override animation setting if disabled
        const theme = animationEnabled ? baseTheme : {
          ...baseTheme,
          textEffects: {
            ...baseTheme.textEffects,
            animation: 'none' as const,
          },
        };

        // Add theme asset URLs if available (e.g., textbox frame from Ren'Py import)
        // Don't use button graphics if custom button colors are set (buttonBg/buttonBgColor)
        const hasCustomButtonColors = !!(settings.colors.buttonBg || settings.colors.buttonBgColor);
        const useButtonGraphics = settings.colors.useThemeButtonGraphics !== false && !hasCustomButtonColors;
        const themeWithAssets = {
          ...theme,
          textboxFrameUrl: themeAssets?.textboxFrame,
          buttonNormalUrl: useButtonGraphics ? themeAssets?.buttonNormal : undefined,
          buttonHoverUrl: useButtonGraphics ? themeAssets?.buttonHover : undefined,
          buttonLayout: useButtonGraphics ? themeAssets?.buttonLayout : undefined,
        };

        if ('setTheme' in rendererRef.current) {
          (rendererRef.current as any).setTheme(themeWithAssets);
        }
      }

      // CRITICAL: Initialize beat locations from schema for beats that don't have them
      // This ensures proper positioned rendering instead of fallback centered components
      const allBeats = story.getAllBeats();
      console.log('[StoryPreview] Initializing locations for', allBeats.length, 'beats');
      initializeBeatLocations(allBeats, STAGE_WIDTH, STAGE_HEIGHT);

      // CRITICAL: Merge environment.nodes from both imported ASML and builder assets
      // This makes the Story object self-contained with all asset URLs, enabling:
      // 1. Beat.execute() to find background URLs via environment.nodes lookup
      // 2. Future standalone engine export where Story is the single source of truth
      const existingEnvironment = story.getEnvironment() || {};
      const existingNodes = existingEnvironment.nodes || [];

      // Convert builder assets to environment nodes format
      const assetNodes = (assets || []).map(asset => ({
        id: asset.id,
        url: asset.url,
        type: asset.type,
        name: asset.name,
        // Also store file path for legacy ASML compatibility
        file: asset.url
      }));

      // Merge: asset nodes take priority (newer), then existing nodes from import
      const nodeMap = new Map<string, any>();

      // First add existing nodes from ASML import
      for (const node of existingNodes) {
        if (node.id) {
          // Ensure node has url property (legacy ASML uses 'file')
          nodeMap.set(node.id, {
            ...node,
            url: node.url || node.file || node.path || node.src
          });
        }
      }

      // Then add/override with builder assets
      for (const node of assetNodes) {
        nodeMap.set(node.id, node);
      }

      const mergedNodes = Array.from(nodeMap.values());

      story.setEnvironment({
        ...existingEnvironment,
        nodes: mergedNodes
      });
      console.log('[StoryPreview] Merged environment.nodes:', mergedNodes.length,
        '(from assets:', assetNodes.length, ', from import:', existingNodes.length, ')');

      // Set up asset resolver for backgrounds (uses the populated environment.nodes)
      if (rendererRef.current && 'setAssetResolver' in rendererRef.current) {
        const environment = story.getEnvironment();
        (rendererRef.current as any).setAssetResolver((assetId: string) => {
          // Look up asset in environment.nodes (now populated from builder assets)
          const node = environment?.nodes?.find((n: any) => n.id === assetId);
          if (node) {
            return node.url || node.path || node.src;
          }
          // Also check story assets (legacy support)
          const asset = story.getAssets()?.find((a: any) => a.id === assetId);
          if (asset) {
            return asset.url || asset.path || asset.src;
          }
          return undefined;
        });
        console.log('[StoryPreview] Asset resolver configured');
      }

      await engineRef.current.loadStory(story);

      const context = engineRef.current.getContext();

      // Apply selected preset state if available
      if (selectedPreset) {
        console.log('[StoryPreview] Applying preset state:', selectedPreset.name);

        // Apply variables
        Object.entries(selectedPreset.state.variables).forEach(([key, value]) => {
          context.setVariable(key, value);
        });

        // Apply counters
        Object.entries(selectedPreset.state.counters).forEach(([key, value]) => {
          context.setCounter(key, value);
        });

        // Apply inventory
        selectedPreset.state.inventory.forEach(item => {
          context.addToInventory(item);
        });

        // Mark visited beats
        selectedPreset.state.visitedBeats.forEach(beatId => {
          context.markBeatVisited(beatId);
        });

        // Apply timers if provided
        if (selectedPreset.state.timers) {
          Object.entries(selectedPreset.state.timers).forEach(([name, timer]) => {
            const timerData = timer as { value: number; target?: string };
            context.setTimer(name, timerData.value, timerData.target);
          });
        }
      }
      
      // Listen to renderer state changes to track current beat
      // This is called at the START of beat execution (unlike markBeatVisited which is at the END)
      if (rendererRef.current && 'onStateChange' in rendererRef.current) {
        (rendererRef.current as any).onStateChange('currentBeatInfo', (beatInfo: { id: string; name: string; type: string } | null) => {
          if (beatInfo) {
            const beat = story.getBeat(beatInfo.id);
            setCurrentBeat(beat || null);
            // Update debug info with current state
            setDebugInfo({
              currentBeatId: beatInfo.id,
              visitedBeats: context.getVisitedBeats(),
              variables: context.getVariables(),
              counters: context.getCounters(),
              inventory: context.getInventory(),
              timers: context.getTimers(),
            });
          }
        });
      }

      // Also update debug info when beats are visited (for the visited beats list)
      const originalMarkVisited = context.markBeatVisited.bind(context);
      context.markBeatVisited = (beatId: string) => {
        originalMarkVisited(beatId);
        // Update only the visited beats list, currentBeat is handled by onStateChange
        setDebugInfo((prev: any) => ({
          ...prev,
          visitedBeats: context.getVisitedBeats(),
          variables: context.getVariables(),
          counters: context.getCounters(),
          inventory: context.getInventory(),
          timers: context.getTimers(),
        }));
      };
      
      // Listen for state changes to update debug info in real-time
      const updateDebugState = () => {
        setDebugInfo((prev: any) => ({
          ...prev,
          variables: context.getVariables(),
          counters: context.getCounters(),
          inventory: context.getInventory(),
          timers: context.getTimers(),
        }));
      };

      context.on('counterChanged', updateDebugState);
      context.on('inventoryChanged', updateDebugState);
      context.on('variableChanged', updateDebugState);

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
              rendererRef.current.setTimerState({
                totalTime: defaultTargetTimer.totalTime || defaultTargetTimer.remainingTime + 1,
                remainingTime: defaultTargetTimer.remainingTime,
                visible: true,
                label: undefined, // Could use beat name if desired
              });
            } else {
              rendererRef.current.setTimerState(undefined);
            }
          } else {
            // No active default target timer
            rendererRef.current.setTimerState(undefined);
          }
        }
      };

      timerManager.on('timerStarted', updateTimers);
      timerManager.on('timerTick', updateTimers);
      timerManager.on('timerStopped', updateTimers);
      
      timerManager.on('timerExpired', async ({ name, targetBeat }) => {
        if (targetBeat && rendererRef.current) {
          console.log(`Timer "${name}" expired, navigating to: ${targetBeat}`);
          const beat = story.getBeat(targetBeat);
          if (beat) {
            if (engineRef.current) {
              engineRef.current.stop();
            }
            context.markBeatVisited(targetBeat);
            try {
              // Cast to any to bypass type check
              const nextBeatId = await beat.execute(context, rendererRef.current as any);
              if (nextBeatId) {
                const nextBeat = story.getBeat(nextBeatId);
                if (nextBeat) {
                  context.markBeatVisited(nextBeatId);
                  await nextBeat.execute(context, rendererRef.current as any);
                }
              }
            } catch (error) {
              console.error('Error executing timer target beat:', error);
            }
          }
        }
      });

      // Check for debug start beat override (dropdown selection takes priority)
      const debugFirstBeat = settings?.debug?.firstbeat;
      const startBeatId = selectedStartBeat ||
        ((debugFirstBeat && debugFirstBeat.trim() !== '') ? debugFirstBeat.trim() : undefined);

      if (startBeatId && startBeatId !== story.getFirstBeatId()) {
        console.log(`[StoryPreview] Starting from beat "${startBeatId}" (Story normally starts at "${story.getFirstBeatId()}")`);
        setDebugStartBeat(startBeatId);
      } else {
        setDebugStartBeat(null);
      }

      // Start background music BEFORE engine.start() because engine.start() blocks until story ends
      const soundSettings = settings?.sound;
      console.log('[StoryPreview] Sound settings check:', {
        hasSettings: !!settings,
        hasSoundSettings: !!soundSettings,
        backgroundMusic: soundSettings?.backgroundMusic?.substring?.(0, 50) || soundSettings?.backgroundMusic,
        backgroundMusicName: soundSettings?.backgroundMusicName,
        mute: soundSettings?.mute,
        soundEnabled,
        willPlay: !!(soundSettings?.backgroundMusic && !soundSettings.mute && soundEnabled)
      });

      // Check if we have background music configured (either asset ID or URL)
      const backgroundMusicAssetId = soundSettings?.backgroundMusicAssetId;
      const backgroundMusicUrl = soundSettings?.backgroundMusic;

      if ((backgroundMusicAssetId || backgroundMusicUrl) && !soundSettings?.mute && soundEnabled) {
        try {
          const audioManager = getAudioManager();
          const volume = (soundSettings.backgroundVolume || 70) / 100;

          let audioBlob: Blob | null = null;
          let cacheKey: string | undefined;

          // First priority: use backgroundMusicAssetId if available
          if (backgroundMusicAssetId && loadAssetBlob) {
            console.log(`[StoryPreview] Loading background music from asset ID: ${backgroundMusicAssetId}`);
            audioBlob = await loadAssetBlob(backgroundMusicAssetId);
            cacheKey = backgroundMusicAssetId;
          }

          // Fallback: try to find asset by URL or name reference
          if (!audioBlob && backgroundMusicUrl && loadAssetBlob) {
            const audioAsset = assets?.find(a =>
              a.id === backgroundMusicUrl ||
              a.name === backgroundMusicUrl ||
              a.url === backgroundMusicUrl ||
              a.name?.replace(/\.[^/.]+$/, '') === backgroundMusicUrl
            );

            if (audioAsset) {
              console.log(`[StoryPreview] Loading background music from matched asset: ${audioAsset.id} (${audioAsset.name})`);
              audioBlob = await loadAssetBlob(audioAsset.id);
              cacheKey = audioAsset.id;
            }
          }

          if (audioBlob) {
            console.log(`[StoryPreview] Playing background music from blob at volume ${volume}`);
            await audioManager.playSoundFromBlob(audioBlob, volume, true, cacheKey); // true = loop
            console.log('[StoryPreview] Background music started successfully from blob');
          } else if (backgroundMusicUrl?.startsWith('http')) {
            // External URL - use regular playSound
            console.log(`[StoryPreview] Playing external background music: ${backgroundMusicUrl}`);
            await audioManager.playSound(backgroundMusicUrl, volume, true);
          } else {
            console.warn(`[StoryPreview] Could not resolve background music. AssetId: ${backgroundMusicAssetId}, URL: ${backgroundMusicUrl}`);
          }
        } catch (error) {
          console.warn('[StoryPreview] Failed to start background music:', error);
        }
      } else {
        console.log('[StoryPreview] Background music not started - conditions not met');
      }

      // engine.start() blocks until the story ends or is stopped
      await engineRef.current.start(startBeatId);

    } catch (error) {
      console.error('Preview error:', error);
      alert('Error during preview: ' + error);
    } finally {
      setIsRunning(false);
    }
  }, [story, settings, selectedPreset, assets, animationEnabled, selectedStartBeat]);

  const handleRestart = useCallback(() => {
    // Stop all sounds before restarting to prevent overlap
    try {
      const audioManager = getAudioManager();
      audioManager.stopAllSounds();
      audioManager.setMuted(false); // Reset mute state
      console.log('[StoryPreview] Stopped all sounds for restart');
    } catch (error) {
      console.warn('[StoryPreview] Error stopping sounds for restart:', error);
    }

    if (rendererRef.current) {
      rendererRef.current.clear();
    }
    setCurrentBeat(null);
    setDebugInfo({});
    setActiveTimers([]);
    setSoundEnabled(true); // Reset sound toggle state
    startPreview();
  }, [startPreview]);

  const stopPreview = useCallback(() => {
    // Stop background music and all sounds, reset muted state
    try {
      const audioManager = getAudioManager();
      audioManager.setMuted(false); // Reset muted state for next session
      audioManager.stopAllSounds();
      console.log('[StoryPreview] Stopped all sounds');
    } catch (error) {
      console.warn('[StoryPreview] Error stopping audio:', error);
    }

    if (engineRef.current) {
      const context = engineRef.current.getContext();
      const timerManager = context.getTimerManager();
      timerManager.stopAllTimers();
      engineRef.current.stop();
    }
    if (rendererRef.current) {
      rendererRef.current.clear();
    }
    setIsRunning(false);
    setCurrentBeat(null);
    setActiveTimers([]);
    setSoundEnabled(true); // Reset sound toggle for next session
  }, []);

  // Handle close - stop sounds and reset state before closing
  const handleClose = useCallback(() => {
    console.log('[StoryPreview] handleClose called');

    // Stop all audio and reset muted state
    try {
      const audioManager = getAudioManager();
      console.log('[StoryPreview] Stopping all sounds...');
      audioManager.setMuted(false); // Reset muted state
      audioManager.stopAllSounds();
      console.log('[StoryPreview] Closing - stopped all sounds');
    } catch (error) {
      console.warn('[StoryPreview] Error stopping audio on close:', error);
    }

    // Stop engine and timers
    if (engineRef.current) {
      try {
        console.log('[StoryPreview] Stopping engine and timers...');
        const context = engineRef.current.getContext();
        const timerManager = context.getTimerManager();
        timerManager.stopAllTimers();
        engineRef.current.stop();
        console.log('[StoryPreview] Engine stopped');
      } catch (error) {
        console.warn('[StoryPreview] Error stopping engine on close:', error);
      }
    }

    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Play className="w-5 h-5" />
            Story Preview
          </h2>
          <div className="flex items-center gap-2">
            {/* Beat Selection Dropdown - only show when not running */}
            {activeTab === 'preview' && !isRunning && (
              <div className="relative">
                <button
                  onClick={() => setShowBeatMenu(!showBeatMenu)}
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
                  title="Select starting beat"
                >
                  <List className="w-4 h-4" />
                  <span className="max-w-32 truncate">
                    {selectedStartBeat
                      ? story.getBeat(selectedStartBeat)?.name || selectedStartBeat
                      : 'Start from...'}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showBeatMenu && (
                  <div className="absolute right-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <button
                      onClick={() => {
                        setSelectedStartBeat(null);
                        setShowBeatMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                        !selectedStartBeat ? 'bg-blue-50 text-blue-700' : ''
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span className="font-medium">Start from beginning</span>
                    </button>
                    <div className="border-t border-gray-200" />
                    {story.getAllBeats().map((beat) => (
                      <button
                        key={beat.id}
                        onClick={() => {
                          setSelectedStartBeat(beat.id);
                          setShowBeatMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                          selectedStartBeat === beat.id ? 'bg-blue-50 text-blue-700' : ''
                        }`}
                      >
                        <div className="font-medium truncate">{beat.name}</div>
                        <div className="text-xs text-gray-500">{beat.type} • {beat.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'preview' && !isRunning && !currentBeat && (
              <button
                onClick={startPreview}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {selectedPreset ? `Start with "${selectedPreset.name}"` : 'Start Preview'}
              </button>
            )}
            {activeTab === 'preview' && isRunning && (
              <button
                onClick={stopPreview}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Stop
              </button>
            )}
            {activeTab === 'preview' && currentBeat && !isRunning && (
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'preview'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-gray-800'
            }`}
          >
            Preview
            {selectedPreset && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {selectedPreset.name}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'presets'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-gray-800'
            }`}
          >
            <Database className="w-4 h-4" />
            State Presets
            {presets.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {presets.length}
              </span>
            )}
          </button>
        </div>

        {/* Debug Mode Indicator */}
        {debugStartBeat && (
          <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 flex items-center gap-2 text-sm">
            <Info className="w-4 h-4 text-yellow-700" />
            <span className="text-yellow-900 font-medium">DEBUG MODE:</span>
            <span className="text-yellow-800">
              Starting from beat <code className="bg-yellow-200 px-1 rounded">{debugStartBeat}</code>
              {' '}(Story normally starts at <code className="bg-yellow-200 px-1 rounded">{story.getFirstBeatId()}</code>)
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'preview' ? (
            <>
              {/* Preview Area with Zoom Controls */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Stage Container */}
                <div
                  ref={previewAreaRef}
                  className="flex-1 bg-gray-100 flex items-center justify-center overflow-auto relative"
                >
                  {/* Placeholder shown before preview starts */}
                  {!currentBeat && !isRunning && (
                    <div className="text-gray-400 text-center absolute">
                      <Play className="w-16 h-16 mx-auto mb-4" />
                      <p>Click "Start Preview" to test your story</p>
                      {selectedPreset && (
                        <p className="text-sm mt-2 text-blue-600">
                          Preset "{selectedPreset.name}" will be loaded
                        </p>
                      )}
                    </div>
                  )}
                  {/* Stage wrapper - sized to match scaled dimensions for proper centering */}
                  <div
                    style={{
                      width: STAGE_WIDTH * scale,
                      height: STAGE_HEIGHT * scale,
                      visibility: (currentBeat || isRunning) ? 'visible' : 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {/* Stage container - scaled from top-left corner */}
                    <div
                      className="relative bg-white shadow-lg"
                      style={{
                        width: STAGE_WIDTH,
                        height: STAGE_HEIGHT,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <div
                        ref={containerRef}
                        className="absolute inset-0"
                      />
                    </div>
                  </div>
                </div>

                {/* Zoom Controls Bar */}
                <div className="bg-gray-200 border-t px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleZoomOut}
                      className="p-1.5 hover:bg-gray-300 rounded transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium w-14 text-center">
                      {Math.round(scale * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-1.5 hover:bg-gray-300 rounded transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-gray-400 mx-2" />
                    <button
                      onClick={handleFitToWindow}
                      className={`p-1.5 rounded transition-colors flex items-center gap-1 text-sm ${
                        isAutoFit ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-300'
                      }`}
                      title="Fit to Window"
                    >
                      <Maximize2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Fit</span>
                    </button>
                  </div>
                  {/* Controls: Animation, Sound, Stage info */}
                  <div className="flex items-center gap-2">
                    {/* Animation Toggle */}
                    <button
                      onClick={() => setAnimationEnabled(!animationEnabled)}
                      className={`p-1.5 rounded transition-colors flex items-center gap-1 text-sm ${
                        animationEnabled ? 'hover:bg-gray-300' : 'bg-yellow-100 text-yellow-700'
                      }`}
                      title={animationEnabled ? 'Disable Text Animation (faster)' : 'Enable Text Animation'}
                    >
                      {animationEnabled ? (
                        <Type className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </button>
                    {/* Sound Toggle */}
                    <button
                      onClick={handleSoundToggle}
                      className={`p-1.5 rounded transition-colors flex items-center gap-1 text-sm ${
                        soundEnabled ? 'hover:bg-gray-300' : 'bg-red-100 text-red-700'
                      }`}
                      title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
                    >
                      {soundEnabled ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </button>
                    {/* Inventory Toggle */}
                    <button
                      onClick={() => setInventoryVisible(prev => !prev)}
                      className={`p-1.5 rounded transition-colors flex items-center gap-1 text-sm ${
                        inventoryVisible ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-300'
                      }`}
                      title={inventoryVisible ? 'Hide Inventory (Ctrl/Cmd+I)' : 'Show Inventory (Ctrl/Cmd+I)'}
                    >
                      <Package className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-gray-400 mx-1" />
                    <div className="text-xs text-gray-500">
                      Stage: {STAGE_WIDTH} x {STAGE_HEIGHT}
                    </div>
                  </div>
                </div>
              </div>

          {/* Debug Panel */}
          <div className="w-80 bg-gray-100 p-4 border-l overflow-y-auto">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Debug Info
            </h3>
            
            {currentBeat && (
              <div className="space-y-3">
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-600">Current Beat</div>
                  <div className="font-semibold">{currentBeat.name}</div>
                  <div className="text-xs text-gray-500">{currentBeat.type} • {currentBeat.id}</div>
                </div>

                {debugInfo.visitedBeats && debugInfo.visitedBeats.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Visited Beats ({debugInfo.visitedBeats.length})</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {debugInfo.visitedBeats.map((beatId: string) => (
                        <div key={beatId} className="text-xs text-gray-600 flex items-center gap-1">
                          <ChevronRight className="w-3 h-3" />
                          {beatId}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

                {debugInfo.counters && Object.keys(debugInfo.counters).length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Counters</div>
                    <div className="space-y-2">
                      {Object.entries(debugInfo.counters).map(([key, value]) => {
                        // Find counter definition from characters
                        const counterDef = characters.flatMap(c => c.counters || []).find(c => c.name === key);
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

                {debugInfo.inventory && debugInfo.inventory.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Inventory</div>
                    <div className="space-y-1">
                      {debugInfo.inventory.map((item: string) => (
                        <div key={item} className="text-xs text-gray-600">
                          • {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
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
            )}

            {!currentBeat && !isRunning && (
              <div className="text-sm text-gray-500 text-center mt-8">
                <p>Debug information will appear here when the story is running.</p>
              </div>
            )}
          </div>
            </>
          ) : (
            /* Presets Tab */
            <div className="flex-1 p-4 overflow-y-auto">
              <StatePresetManager
                story={story}
                presets={presets}
                selectedPresetId={selectedPreset?.id}
                onLoad={handleLoadPreset}
                onEdit={handleEditPreset}
                onCreate={handleCreatePreset}
                onDelete={handleDeletePreset}
              />
            </div>
          )}
        </div>

        {/* Preset Editor Modal */}
        {showPresetEditor && (
          <StatePresetEditor
            story={story}
            preset={editingPreset || undefined}
            currentContext={engineRef.current?.getContext()}
            onSave={handleSavePreset}
            onCancel={() => {
              setShowPresetEditor(false);
              setEditingPreset(undefined);
            }}
          />
        )}
      </div>
    </div>
  );
};
