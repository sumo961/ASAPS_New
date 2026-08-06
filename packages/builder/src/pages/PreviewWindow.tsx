/**
 * PreviewWindow - Standalone page for story preview in a separate window
 *
 * This component receives story data via postMessage from the parent builder window
 * and renders the preview. It auto-reloads when the story changes.
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Type, Zap, ZoomIn, ZoomOut, Maximize2, Package, ChevronDown, ChevronRight, Database, RefreshCw, Info, PanelRightClose, PanelRightOpen, Speech, Download, Mic, MicOff } from 'lucide-react';
import { Story, StoryEngine, Beat, BeatTypeRegistry } from '@asaps/core';
import type { StatePreset, IAIService } from '@asaps/core';
import { UI_STRING_DEFAULTS, setUIStrings, translateLoadingMessage, type UIStringKey } from '@asaps/core';
import { ReactRenderer, getAudioManager, CharacterMoodFrame, MoodRail, type MoodRailEntry, CharacterMeterFrame } from '@asaps/renderer';
import { storyUsesAffect, anyLiveAffect } from '../utils/storyUsesAffect';
import { convertGlobalSettingsToTheme } from '../utils/themeConverter';
import { initializeBeatLocations } from '../utils/SchemaLocationInitializer';
import { resolveLayoutMode } from '../utils/projectLayoutMode';
import type { PreviewMessage, SerializedStoryData } from '../services/PreviewWindowManager';
import type { Asset } from '../components/assets/AssetManager';
import type { Character } from '../types/character';
import { generatePathPresets, groupPresetsByOutcome, type GeneratedPreset, type InputTextBeatInfo } from '../services/PathBasedPresetGenerator';
import { InputTextValuesModal } from '../components/preview/InputTextValuesModal';
import { getSavedAIConfig } from '../hooks/useAI';
import { getTTSService, WebSpeechProvider, OpenAITTSProvider, ElevenLabsProvider, CustomTTSProvider, LocalTTSProvider } from '../services/tts';
import { getSavedTTSConfig } from '../hooks/useTTS';
import { getSTTService, WebSpeechSTTProvider, WhisperSTTProvider, LocalSTTProvider, VoskSTTProvider, WhisperCppSTTProvider } from '../services/stt';
import { getSavedSTTConfig } from '../hooks/useSTT';
import { resolvePortraitUrl } from '../utils/speakerUtils';
import { CharacterAffectPanel } from '../components/characters/CharacterAffectPanel';
import { MockSensorPanel } from '../components/preview/MockSensorPanel';
import {
  createRuntimeAIService,
  createProxyTransport,
  createDirectAnthropicTransport,
  createDirectOpenAITransport,
} from '@asaps/core';

// Stage dimensions (matching StoryPreview)
const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 768;

/**
 * Phase 1 — viewport presets for the PW viewport switcher.
 * The dimensions are stage-canvas pixels (CSS px); the stage wrapper
 * clamps to these so responsive layouts reflow as they would on the
 * target device. Fixed-canvas projects render their design dims with
 * a CSS transform-scale fit (current behavior, no change).
 *
 * Each preset is orientation-aware: the orientation field lets the
 * project-level orientation lock filter the list. If the project
 * locks 'portrait', landscape presets are disabled (and the rotate-
 * device overlay would fire at runtime anyway — see P2.5-2). The
 * 'auto' preset always passes the filter.
 */
export const VIEWPORT_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  width: number;
  height: number;
  orientation: 'auto' | 'portrait' | 'landscape';
}> = [
  { id: 'auto',        label: 'Fit window',        width: 0,    height: 0,    orientation: 'auto' },
  { id: 'desktop',     label: 'Desktop · 1280×800', width: 1280, height: 800,  orientation: 'landscape' },
  { id: 'tablet-l',    label: 'Tablet landscape · 1024×768', width: 1024, height: 768, orientation: 'landscape' },
  { id: 'tablet-p',    label: 'Tablet portrait · 768×1024',  width: 768,  height: 1024, orientation: 'portrait' },
  { id: 'phone-l',     label: 'Phone landscape · 740×360',   width: 740,  height: 360,  orientation: 'landscape' },
  { id: 'phone-p',     label: 'Phone portrait · 390×740',    width: 390,  height: 740,  orientation: 'portrait' },
];

// Proxy endpoint for CORS-blocked requests (custom baseUrls)
// Match OpenAIProvider's logic: prefer same-origin proxy (Vite dev plugin
// at port 5173) over the legacy stand-alone api server on :3001 which
// requires a separate `npm run dev:api`. The hardcoded :3001 fallback
// caused ERR_CONNECTION_REFUSED at runtime when the user hadn't started
// dev:api, even though the same builder-side calls (story-gen, Ideator)
// worked fine through the Vite plugin.
//
// In production Electron the port is not 5173, so we fall back to :3001
// which the packaged build is expected to provide. (See
// OpenAIProvider.ts:41-43 — the same heuristic lives there.)
const isViteDev =
  typeof window !== 'undefined' && window.location?.port === '5173';
const CLAUDE_PROXY_ENDPOINT = isViteDev
  ? '/api/ai/claude'
  : 'http://localhost:3001/api/ai/claude';
const OPENAI_PROXY_ENDPOINT = isViteDev
  ? '/api/ai/openai'
  : 'http://localhost:3001/api/ai/openai';

/**
 * Create an AI service adapter that implements IAIService interface.
 *
 * The per-provider orchestration (request bodies, response parsing, JSON
 * extraction + repair, image analysis, thinking-block stripping) lives in
 * @asaps/core's shared runtime adapter — this function only maps the saved
 * builder AI config to a provider family + transport:
 *   - remote custom baseUrl → the builder CORS proxy (contract unchanged)
 *   - localhost / official endpoints → direct fetch
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
    const transport = useProxy
      ? createProxyTransport({
          endpoint: CLAUDE_PROXY_ENDPOINT,
          baseUrl: savedConfig.baseUrl!,
          apiKey: savedConfig.apiKey,
        })
      // Direct fetch — official Anthropic endpoint, or a local
      // Claude-compatible baseUrl.
      : createDirectAnthropicTransport({
          apiKey: savedConfig.apiKey,
          baseUrl: isLocalUrl ? savedConfig.baseUrl : undefined,
        });
    return createRuntimeAIService({
      family: 'anthropic',
      model: savedConfig.model,
      transport,
      logPrefix: '[PreviewWindow]',
    });
  }

  // OpenAI-compatible provider (also used for local/Ollama)
  const transport = useProxy
    ? createProxyTransport({
        endpoint: OPENAI_PROXY_ENDPOINT,
        baseUrl: savedConfig.baseUrl!,
        apiKey: savedConfig.apiKey,
      })
    : createDirectOpenAITransport({
        apiKey: savedConfig.apiKey || 'ollama', // Ollama doesn't need a real key
        baseUrl: isLocalUrl ? savedConfig.baseUrl : undefined,
      });
  return createRuntimeAIService({
    family: 'openai',
    model: savedConfig.model,
    transport,
    logPrefix: '[PreviewWindow]',
  });
}

interface PreviewData {
  storyData?: SerializedStoryData;
  beatId?: string;
  statePreset?: StatePreset;
  settings?: any;
  projectSettings?: { width: number; height: number };
  assets?: Asset[];
  characters?: Character[];
  emotionPalette?: import('@asaps/core').EmotionDefinition[];
  traitModulations?: import('@asaps/core').TraitEmotionWeight[];
  themeAssets?: any;
  activeLanguage?: string | null;
}

/** Convert a BCP 47 language code to a readable language name (e.g., 'es' → 'Spanish') */
function getLanguageName(code: string): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

/** Wrap an IAIService adapter to append language directives to all prompts */
function createLanguageAwareAdapter(
  adapter: IAIService,
  targetLanguageCode: string,
  sourceLanguageCode: string
): IAIService {
  const targetLang = getLanguageName(targetLanguageCode);
  const sourceLang = getLanguageName(sourceLanguageCode);

  return {
    async generateContent(prompt, options) {
      const directive = `\n\nYou MUST write your response entirely in ${targetLang}. The author's instructions are in ${sourceLang} — follow them but respond in ${targetLang}.`;
      return adapter.generateContent(prompt + directive, options);
    },

    async generateDialog(request) {
      const directive = `\n\nGenerate ALL dialog text, NPC speech, and player choice options in ${targetLang}.`;
      return adapter.generateDialog({
        ...request,
        prompt: request.prompt + directive,
      });
    },

    async generateConversationTurn(request) {
      if (!adapter.generateConversationTurn) throw new Error('generateConversationTurn not available');
      const directive = `\nYou MUST respond entirely in ${targetLang}.`;
      return adapter.generateConversationTurn({
        ...request,
        systemPrompt: request.systemPrompt + directive,
      });
    },

    async classifyContent(prompt, categories) {
      const directive = `\n\nThe player's context may be in ${targetLang}. The category names are in ${sourceLang}. Evaluate regardless of language. Respond with ONLY the category name.`;
      return adapter.classifyContent(prompt + directive, categories);
    },

    async analyzeImage(image, prompt, options) {
      if (!adapter.analyzeImage) throw new Error('analyzeImage not available');
      const directive = `\n\nYou MUST write your answer entirely in ${targetLang}.`;
      return adapter.analyzeImage(image, prompt + directive, options);
    },
  };
}

/**
 * Pre-translate the runtime UI-string catalog (loading messages, renderer
 * chrome, default button labels — see UI_STRING_DEFAULTS in @asaps/core)
 * via a single batch AI call. Returns:
 *   - byEnglish: english-template → translated (for translateLoadingMessage)
 *   - byKey:     catalog key → translated (for setUIStrings)
 */
async function preTranslateUIStrings(
  aiService: IAIService,
  targetLanguage: string,
): Promise<{ byEnglish: Map<string, string>; byKey: Partial<Record<UIStringKey, string>> }> {
  const keys = Object.keys(UI_STRING_DEFAULTS) as UIStringKey[];
  const allMessages = keys.map(k => UI_STRING_DEFAULTS[k]);
  const targetLang = getLanguageName(targetLanguage);

  try {
    const response = await aiService.generateContent(
      `Translate these UI strings to ${targetLang}. Keep {name}, {title} and {count} placeholders exactly as written. Keys containing button labels must be very short. Return ONLY a JSON array of translated strings in the same order, nothing else.\n\n${JSON.stringify(allMessages)}`,
      { maxTokens: 1000 },
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { byEnglish: new Map(), byKey: {} };

    const translations: string[] = JSON.parse(jsonMatch[0]);
    const byEnglish = new Map<string, string>();
    const byKey: Partial<Record<UIStringKey, string>> = {};
    keys.forEach((key, i) => {
      if (translations[i] && typeof translations[i] === 'string') {
        byEnglish.set(UI_STRING_DEFAULTS[key], translations[i]);
        byKey[key] = translations[i];
      }
    });

    console.log(`[PreviewWindow] Pre-translated ${byEnglish.size}/${allMessages.length} UI strings to ${targetLang}`);
    return { byEnglish, byKey };
  } catch (error) {
    console.warn('[PreviewWindow] Failed to pre-translate UI strings:', error);
    return { byEnglish: new Map(), byKey: {} };
  }
}

export const PreviewWindow: React.FC = () => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isWaitingToStart, setIsWaitingToStart] = useState(false); // Ready to preview but waiting for user click
  const [startBlockedReason, setStartBlockedReason] = useState<string | null>(null);
  // Set when the run loop ends on its own (not via Stop/Pause) — used to
  // show a visible "story ended here" notice instead of a silent stop,
  // which reads as a dead click on beats with no outgoing connection.
  const [endedNotice, setEndedNotice] = useState<string | null>(null);
  const stopRequestedRef = useRef(false);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [startBeatId, setStartBeatId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  // Phase 1 — viewport preset. `null` = no override; the stage takes
  // the project's design dimensions and the existing fit-to-window
  // logic handles sizing. When a preset is selected the stage wrapper
  // is clamped to those pixel dimensions so responsive layouts
  // reflow as they would on that device. Fixed-canvas projects still
  // render at their design dims (CSS transform scales them down to
  // fit the preset window, the legacy behavior).
  const [previewViewport, setPreviewViewport] = useState<
    null | { id: string; width: number; height: number; label: string }
  >(null);
  const [isAutoFit, setIsAutoFit] = useState(true);
  // Ref mirror so renderer-setup code (which runs outside React's render
  // cycle) always reads the current preset.
  const previewViewportRef = useRef<null | { id: string; width: number; height: number; label: string }>(null);
  useEffect(() => {
    previewViewportRef.current = previewViewport;
    (rendererRef.current as any)?.setViewportOverride?.(
      previewViewport ? { width: previewViewport.width, height: previewViewport.height } : undefined
    );
  }, [previewViewport]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('asaps_tts_enabled') !== 'false'; } catch { return true; }
  });
  const [sttEnabled, setSttEnabled] = useState(() => {
    try { return localStorage.getItem('asaps_stt_enabled') === 'true'; } catch { return false; }
  });
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [inventoryVisible, setInventoryVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [showBeatMenu, setShowBeatMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<StatePreset | null>(null);
  const [generatedPresets, setGeneratedPresets] = useState<GeneratedPreset[]>([]);
  const [totalPathCount, setTotalPathCount] = useState(0);
  const [isGeneratingPresets, setIsGeneratingPresets] = useState(false);
  // Input text values modal state
  const [showInputTextModal, setShowInputTextModal] = useState(false);
  const [pendingInputTextBeats, setPendingInputTextBeats] = useState<InputTextBeatInfo[]>([]);
  const [pendingPreset, setPendingPreset] = useState<StatePreset | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const [debugInfo, setDebugInfo] = useState<{
    visitedBeats?: string[];
    /** Beats injected by the start-state preset (mid-story start), NOT
     *  actually visited in this run — the debug panel badges them. */
    seededBeats?: string[];
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
  // Beat ids marked visited by the applied start-state preset rather than by
  // actual playthrough — lets the debug panel distinguish "seeded" from
  // "visited in this run". Reset on every (re)start.
  const seededBeatsRef = useRef<Set<string>>(new Set());
  const previewDataRef = useRef<PreviewData | null>(null);
  const loadingTranslationsRef = useRef<Map<string, string>>(new Map());
  const isElectronRef = useRef<boolean>(false);
  const stateChangeUnsubscribeRef = useRef<(() => void) | null>(null); // Cleanup previous listener
  const handleRestartRef = useRef<((beatId?: string, preset?: StatePreset | null, pauseOnStart?: boolean) => void) | null>(null);
  const navigatedBeatIdRef = useRef<string | null>(null); // Track manually navigated beat to prevent STORY_UPDATE from overwriting

  // Keep previewData ref in sync so resolver closures always access latest data
  useEffect(() => {
    previewDataRef.current = previewData;
  }, [previewData]);

  // Detect if running in Electron (synchronous, before effects)
  useEffect(() => {
    isElectronRef.current = typeof window !== 'undefined' &&
      !!(window as any).electronAPI?.onPreviewMessage;
  }, []);

  // Ref-based message handler so the IPC callback always uses the latest state
  // This avoids the need to tear down and re-register the IPC listener when state changes
  const handleMessageRef = useRef<(event: MessageEvent) => void>();

  // Update the message handler whenever relevant state changes
  useEffect(() => {
    handleMessageRef.current = (event: MessageEvent) => {
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
              // Use the selected beat if one was explicitly provided, otherwise fall back to the story's first beat
              const targetBeatId = payloadBeatId != null ? payloadBeatId : firstBeatId;
              if (targetBeatId != null) {
                setStartBeatId(String(targetBeatId));
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
  }, [isRunning, isPaused, isWaitingToStart]);

  // Register message listeners ONCE (stable across state changes)
  // The handler ref ensures we always process with latest state
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      handleMessageRef.current?.(event);
    };

    // Web: postMessage
    window.addEventListener('message', handleMessage);

    // Send PING to parent to indicate we're ready (web)
    if (window.opener) {
      window.opener.postMessage({ type: 'PING' }, window.location.origin);
      console.log('[PreviewWindow] Sent PING to parent');
    }

    // Electron: IPC listener (registered once, never torn down until unmount)
    const isElectron = typeof window !== 'undefined' &&
      !!(window as any).electronAPI?.onPreviewMessage;
    let unsubscribeIPC: (() => void) | undefined;

    if (isElectron) {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.onPreviewMessage) {
        unsubscribeIPC = electronAPI.onPreviewMessage((message: PreviewMessage) => {
          handleMessage({ data: message, origin: window.location.origin } as MessageEvent);
        });

        // Send PING to main window (via main process relay) to indicate we're ready
        electronAPI.preview?.ping?.();
        console.log('[PreviewWindow] Sent PING to main window via IPC');
      }
      isElectronRef.current = true;
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      unsubscribeIPC?.();
    };
  }, []); // Empty deps: register once, never re-register

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

      // Apply project-level emotion palette so runtime fireEmotion uses the
      // author's weights / decay rates rather than core defaults.
      if (previewData.emotionPalette && previewData.emotionPalette.length > 0) {
        newStory.setEmotionPalette(previewData.emotionPalette);
      }
      // Apply trait → emotion modulations so per-character traits scale
      // incoming deltas (Step 6).
      if (previewData.traitModulations) {
        newStory.setTraitModulations(previewData.traitModulations);
      }

      // Register characters on the runtime story. Without this,
      // getMergedCharacter / variant lookups can't find Alex (or any
      // character with variants), so setCharacterVariant fires but the
      // merged character is undefined and seedCharacterAffectFor early-
      // returns — leaving the variant's initialMood unapplied.
      if (previewData.characters && previewData.characters.length > 0) {
        newStory.setCharacters(previewData.characters as any[]);
      }

      // Forward project-level GlobalSettings onto the runtime story.
      // XR beats (GpsLocationBeat, IndoorLocationBeat) read
      // settings.location at performAction time for permission policy,
      // default radius, mock location seed, and venue.beacons. Without
      // this call the beats see {} and silently fall back to defaults
      // — including showing "target beacon not configured" even when
      // beacons ARE authored.
      if (previewData.settings) {
        newStory.setSettings(previewData.settings);
      }

      // Reconstruct beats from serialized data
      for (const beatData of storyData.beats) {
        if (beatData.type === 'panorama') {
          console.log(`[PreviewWindow] Reconstructing panorama beat "${beatData.id}" — hotspots in parameters:`, beatData.parameters?.hotspots?.length ?? 0, beatData.parameters?.hotspots);
        }
        const beat = registry.createBeat(beatData.type, {
          ...beatData,
          parameters: beatData.parameters,
          connections: beatData.connections,
        });
        if (beatData.type === 'panorama') {
          console.log(`[PreviewWindow] After createBeat — hotspots on instance:`, (beat as any).hotspots?.length ?? 0, (beat as any).hotspots);
        }

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

  // Auto-generate presets when story or start beat changes
  useEffect(() => {
    setSelectedPreset(null);

    if (!story || !startBeatId) {
      setGeneratedPresets([]);
      setTotalPathCount(0);
      return;
    }

    // Check if this is the first beat - no paths needed
    const firstBeatId = story.getMetadata().firstBeatId;
    if (startBeatId === firstBeatId) {
      setGeneratedPresets([]);
      setTotalPathCount(0);
      return;
    }

    setIsGeneratingPresets(true);

    // Run in a timeout to avoid blocking UI
    setTimeout(() => {
      try {
        const result = generatePathPresets(story, startBeatId);
        setGeneratedPresets(result.presets);
        setTotalPathCount(result.totalPaths);
        console.log('[PreviewWindow] Generated', result.presets.length, 'unique states from', result.totalPaths, 'paths for beat:', startBeatId);

        // Auto-select first preset if there's only one path
        if (result.presets.length === 1) {
          const preset: StatePreset = {
            ...result.presets[0].preset,
            id: 'auto_0',
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
          };
          setSelectedPreset(preset);
        }
      } catch (error) {
        console.error('[PreviewWindow] Failed to generate presets:', error);
        setGeneratedPresets([]);
        setTotalPathCount(0);
      } finally {
        setIsGeneratingPresets(false);
      }
    }, 0);
  }, [story, startBeatId]);

  // Manual refresh handler for the refresh button
  const handleGeneratePresets = () => {
    if (!story || !startBeatId) return;
    setSelectedPreset(null);

    const firstBeatId = story.getMetadata().firstBeatId;
    if (startBeatId === firstBeatId) {
      setGeneratedPresets([]);
      setTotalPathCount(0);
      return;
    }

    setIsGeneratingPresets(true);
    setTimeout(() => {
      try {
        const result = generatePathPresets(story, startBeatId);
        setGeneratedPresets(result.presets);
        setTotalPathCount(result.totalPaths);
        if (result.presets.length === 1) {
          const preset: StatePreset = {
            ...result.presets[0].preset,
            id: 'auto_0',
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
          };
          setSelectedPreset(preset);
        }
      } catch (error) {
        console.error('[PreviewWindow] Failed to generate presets:', error);
        setGeneratedPresets([]);
        setTotalPathCount(0);
      } finally {
        setIsGeneratingPresets(false);
      }
    }, 0);
  };

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

      // Set up asset resolver - uses ref so it always accesses latest assets
      reactRenderer.setAssetResolver((assetId: string) => {
        const asset = previewDataRef.current?.assets?.find(a => a.id === assetId);
        return asset ? asset.url : undefined;
      });

      // Phase 3.3 — variants resolver. Pair each variant entry with
      // the target asset's URL so the renderer can hand SpatialFlowView
      // a self-contained list (no further asset-table reads at render
      // time). Returns undefined when the base has no variants — the
      // renderer treats that as "no variant override".
      (reactRenderer as any).setAssetVariantsResolver?.((assetId: string) => {
        const all = previewDataRef.current?.assets;
        if (!all) return undefined;
        const base = all.find(a => a.id === assetId) as any;
        const vs = base?.variants as
          | ReadonlyArray<{ assetId: string; orientation?: 'portrait' | 'landscape'; deviceClass?: 'phone' | 'tablet' | 'desktop' }>
          | undefined;
        if (!vs || vs.length === 0) return undefined;
        const out: Array<{ assetId: string; orientation?: 'portrait' | 'landscape'; deviceClass?: 'phone' | 'tablet' | 'desktop'; url: string }> = [];
        for (const v of vs) {
          const tgt = all.find(a => a.id === v.assetId);
          if (tgt) out.push({ ...v, url: tgt.url });
        }
        return out;
      });

      // Set up portrait resolver for speaker portraits in dialog
      reactRenderer.setCharacterPortraitResolver((speakerName: string) => {
        const pd = previewDataRef.current;
        if (!pd?.characters?.length) return undefined;
        return resolvePortraitUrl(speakerName, pd.characters, pd.assets || []);
      });

      // Set up sound blob resolver for beat sounds
      // This fetches audio from URLs and converts to blobs for the audio manager
      // Uses ref so it always accesses latest assets
      reactRenderer.setSoundBlobResolver(async (assetIdOrUrl: string): Promise<Blob | null> => {
        try {
          // First try to find asset by ID
          const asset = previewDataRef.current?.assets?.find(a => a.id === assetIdOrUrl);
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

      // HUD overlay configs must be (re)attached HERE, alongside the
      // resolvers: the renderer instance is recreated at story start, and
      // the config set at previewData-receipt time dies with the old
      // instance — enabled HUDs silently never rendered on a fresh window.
      const hudOverlays = previewDataRef.current?.settings?.hudOverlays;
      if (hudOverlays?.timerHud) {
        (reactRenderer as any).setTimerHudConfig?.(hudOverlays.timerHud);
      }
      if (hudOverlays?.countdownMeter) {
        (reactRenderer as any).setCountdownMeterConfig?.(hudOverlays.countdownMeter);
      }
      if (hudOverlays) {
        console.log('[PreviewWindow] HUD overlay configs attached to renderer');
      }

      // Device-size preset → flow views size against the emulated frame
      // instead of the window (see viewportOverride in ReactRenderer).
      (reactRenderer as any).setViewportOverride?.(
        previewViewportRef.current
          ? { width: previewViewportRef.current.width, height: previewViewportRef.current.height }
          : undefined
      );

      // Set up character resolver - uses ref so it always accesses latest data
      (reactRenderer as any).setCharacterResolver((characterId: string, stateId?: string) => {
          const pd = previewDataRef.current;
          const character = pd?.characters?.find(c => c.id === characterId);
          if (!character) return undefined;

          const resolveImage = (visual: { assetId?: string; image?: string } | undefined): string | undefined => {
            if (!visual) return undefined;
            if (visual.assetId && pd?.assets) {
              const asset = pd.assets.find(a => a.id === visual.assetId);
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

      // Set up counter resolver - uses ref for latest data
      (reactRenderer as any).setCounterResolver?.((counterName: string) => {
        const value = countersRef.current[counterName] ?? 0;
        const counterDef = previewDataRef.current?.characters
          ?.flatMap(c => c.counters || [])
          .find(c => c.name === counterName);
        return {
          value,
          min: counterDef?.min ?? 0,
          max: counterDef?.max ?? 100,
        };
      });

      // Set up character meter frame resolver for HUD overlays
      // Uses ref so it always accesses latest data (for folder-based projects where data arrives later)
      (reactRenderer as any).setCharacterMeterFrameResolver?.((characterId: string) => {
        const pd = previewDataRef.current;
        const character = pd?.characters?.find(c => c.id === characterId);
        if (!character || !character.meterFrame) {
          return null;
        }
        // Screen-docked frames are rendered by the top-level HUD overlay
        // (mode-independent); this resolver only feeds the
        // character-anchored variant inside PositionedBeatView.
        if ((character.meterFrame as any).dockMode === 'screen') {
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

      // Set up character inventory resolver for HUD overlays
      // Uses ref so it always accesses latest data (for folder-based projects where data arrives later)
      (reactRenderer as any).setCharacterInventoryResolver?.((characterId: string) => {
        const pd = previewDataRef.current;
        const character = pd?.characters?.find(c => c.id === characterId);
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

        // Build prop asset map from PickProp beats (uses fresh asset data from ref)
        const propAssetMap = new Map<string, string>();
        if (story) {
          const allBeats = story.getAllBeats();
          for (const beat of allBeats) {
            if (beat.type === 'pickProp') {
              const props = (beat as any).props || [];
              for (const prop of props) {
                if (prop.name && prop.assetId) {
                  const asset = pd?.assets?.find(a => a.id === prop.assetId);
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
                  const asset = pd?.assets?.find(a => a.id === (loc as any).assetId);
                  if (asset?.url) {
                    propAssetMap.set((loc as any).name, asset.url);
                    propAssetMap.set((loc as any).name.toLowerCase(), asset.url);
                  }
                }
              }
            }
          }
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

      // Mood-frame resolver — when a character has `moodFrame.enabled`, the
      // renderer mounts a compact 2D mood pad next to (or fixed near) them.
      // Looks up live mood from the StoryContext on each render so the dot
      // tracks runtime updates.
      (reactRenderer as any).setCharacterMoodFrameResolver?.((characterId: string) => {
        const pd = previewDataRef.current;
        const character = pd?.characters?.find((c) => c.id === characterId);
        if (!character || !(character as any).moodFrame || !(character as any).moodFrame.enabled) {
          return null;
        }
        const ctx = engineRef.current?.getContext();
        if (!ctx) return null;
        // Hide HUD until the player has explicitly picked a variant —
        // engine-applied defaults from Character.defaultVariantId don't
        // count, so the pre-picker scenes stay uncluttered.
        const variants = (character as any).variants;
        if (variants && variants.length > 0) {
          const explicit = (ctx as any).hasExplicitlySetVariant?.(character.id);
          if (!explicit) return null;
        }
        const mood = ctx.getCharacterMood(characterId);
        const merged: any = (ctx as any).getMergedCharacter?.(characterId) || character;
        const portraitAsset = merged.portrait?.assetId
          ? pd?.assets?.find((a: any) => a.id === merged.portrait.assetId)
          : undefined;
        return {
          valence: mood.valence,
          arousal: mood.arousal,
          config: (character as any).moodFrame,
          palette: pd?.emotionPalette,
          characterName: merged.displayName || merged.name || characterId,
          characterPortraitUrl: portraitAsset?.url || merged.portrait?.image,
          characterColor: merged.color,
        };
      });
      console.log('[PreviewWindow] Character mood frame resolver set up');

      // Set up sprite data resolver for character spritesheets
      // Uses ref so it always accesses latest data (for folder-based projects where data arrives later)
      (reactRenderer as any).setSpriteDataResolver?.((characterId: string) => {
        const pd = previewDataRef.current;
        const character = pd?.characters?.find(c => c.id === characterId);
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

      // Initialize TTS service — restore saved provider or fall back to Web Speech
      const ttsService = getTTSService();
      if (ttsService.getAvailableProviders().length === 0) {
        const savedTTS = getSavedTTSConfig();
        let provider;

        if (savedTTS?.providerType === 'openai' && savedTTS.apiKey) {
          provider = new OpenAITTSProvider();
        } else if (savedTTS?.providerType === 'elevenlabs' && savedTTS.apiKey) {
          provider = new ElevenLabsProvider();
        } else if (savedTTS?.providerType === 'custom' && savedTTS.baseUrl) {
          provider = new CustomTTSProvider();
        } else if (savedTTS?.providerType === 'local' && savedTTS.baseUrl) {
          provider = new LocalTTSProvider();
        } else {
          provider = new WebSpeechProvider();
        }

        const configType = savedTTS?.providerType && provider.name !== 'Web Speech'
          ? savedTTS.providerType : 'web-speech';
        provider.configure({
          provider: configType,
          apiKey: savedTTS?.apiKey,
          model: savedTTS?.model,
          baseUrl: savedTTS?.baseUrl,
          defaultVoiceId: savedTTS?.defaultVoiceId,
          localPreset: savedTTS?.localPreset,
        });
        ttsService.registerProvider(provider);
        ttsService.setProvider(provider.name);

        if (savedTTS?.defaultVoiceId) {
          ttsService.setDefaultVoiceConfig({ voiceId: savedTTS.defaultVoiceId });
        }

        console.log(`[PreviewWindow] TTS initialized with ${provider.name}`);
      }
      ttsService.setEnabled(ttsEnabled);

      // Wire TTS callbacks to renderer
      // Determine the player character's speaker key (their displayName, or 'Interactor' fallback)
      const playerChar = previewData.characters?.find(c => c.role === 'player');
      const playerSpeakerKey = playerChar ? (playerChar.displayName || playerChar.name) : 'Interactor';

      reactRenderer.setTTSSpeakCallback((text, speaker, isPrompt) => {
        const svc = getTTSService();
        console.log(`[PreviewWindow] TTS callback fired: speaker="${speaker}", isPrompt=${isPrompt}, enabled=${svc.isEnabled()}, text="${text.substring(0, 50)}..."`);
        if (!svc.isEnabled()) return;
        // Player character is silent by default — skip TTS unless a voice is explicitly assigned
        if ((speaker === playerSpeakerKey || speaker === 'Interactor') && !svc.getSpeakerVoice(playerSpeakerKey)?.voiceId) {
          console.log(`[PreviewWindow] Skipping TTS for player character "${speaker}" (no voice assigned)`);
          return;
        }
        if (isPrompt) {
          svc.speakPrompt(text, speaker);
        } else {
          svc.speak(text, speaker);
        }
      });
      reactRenderer.setTTSStopCallback(() => getTTSService().stop());

      // Resolve speaker names to translated display names when a language is active
      if (previewData.activeLanguage && previewData.characters?.length) {
        const lang = previewData.activeLanguage;
        const chars = previewData.characters;
        reactRenderer.setSpeakerNameResolver((speaker: string) => {
          const lowerSpeaker = speaker.toLowerCase();
          const char = chars.find(
            (c: any) => c.displayName?.toLowerCase() === lowerSpeaker || c.name?.toLowerCase() === lowerSpeaker
          );
          return char?.translations?.[lang]?.displayName || speaker;
        });
      }

      // Speak clicked choice text with player character voice when enabled
      reactRenderer.setTTSChoiceSpeakCallback((text: string) => {
        const svc = getTTSService();
        if (!svc.isEnabled()) return;
        const voice = svc.getSpeakerVoice(playerSpeakerKey);
        if (!voice?.voiceId) return;
        console.log(`[PreviewWindow] Speaking choice text as player character: "${text.substring(0, 50)}..."`);
        svc.speak(text, playerSpeakerKey);
      });

      // Initialize STT service — restore saved provider or fall back to Web Speech
      const sttService = getSTTService();
      if (sttService.getAvailableProviders().length === 0) {
        const savedSTT = getSavedSTTConfig();
        let sttProvider;

        if (savedSTT?.providerType === 'whisper-cpp' && savedSTT.baseUrl) {
          sttProvider = new WhisperCppSTTProvider();
        } else if (savedSTT?.providerType === 'vosk' && savedSTT.baseUrl) {
          sttProvider = new VoskSTTProvider();
        } else if (savedSTT?.providerType === 'whisper' && savedSTT.apiKey) {
          sttProvider = new WhisperSTTProvider();
        } else if (savedSTT?.providerType === 'local' && savedSTT.baseUrl) {
          sttProvider = new LocalSTTProvider();
        } else if (window.SpeechRecognition || (window as any).webkitSpeechRecognition) {
          sttProvider = new WebSpeechSTTProvider();
        }

        if (sttProvider) {
          sttProvider.configure({
            provider: savedSTT?.providerType || 'web-speech',
            apiKey: savedSTT?.apiKey,
            model: savedSTT?.model,
            baseUrl: savedSTT?.baseUrl,
            language: savedSTT?.language,
          });
          sttService.registerProvider(sttProvider);
          sttService.setProvider(sttProvider.name);
          console.log(`[PreviewWindow] STT initialized with ${sttProvider.name}`);
        }
      }
      sttService.setEnabled(sttEnabled);

      // Pass STT and TTS services to renderer state so AIConversationBeat can coordinate them
      reactRenderer.setState('sttService', sttService);
      reactRenderer.setState('ttsService', getTTSService());

      // v0.9.48+ — mockMode: true so XR beats hit MockSensorService
      // (PreviewWindow runs on desktop with no real GPS / device-orientation
      // hardware). Authors drive simulated readings via MockSensorPanel.
      const engine = new StoryEngine(reactRenderer as any, { mockMode: true });
      rendererRef.current = reactRenderer;
      engineRef.current = engine;

      // playSound Effect bridge: core emits the signal, the renderer owns
      // the audio pipeline (preset/asset/URL resolution + mute state).
      engine.getContext().on('playSound', ({ sound, volume }: { sound: string; volume?: number }) => {
        void (reactRenderer as any).playEffectSound?.(sound, volume);
      });

      // Push the SensorService into renderer state right after engine
      // construction so spatial sounds, the GPS beat's renderMap, and
      // anything else that needs sensor access can read from
      // renderer.getState('sensorService') uniformly. Same pattern as
      // ttsService / sttService above.
      const sensorSvc = engine.getContext().getSensorService();
      reactRenderer.setState('sensorService', sensorSvc);

      // Seed MockSensorService from project's LocationSettings.mockLocation
      // so the map opens with the player marker at the configured location
      // instead of defaulting to the target position. StoryContext can't do
      // this itself — globalSettings live on previewData, not on the Story
      // object passed to the engine.
      const mockLoc = (previewData?.settings as any)?.location?.mockLocation;
      if (mockLoc && typeof mockLoc.lat === 'number' && typeof mockLoc.lng === 'number'
          && typeof (sensorSvc as any).setMockLocation === 'function') {
        (sensorSvc as any).setMockLocation({
          lat: mockLoc.lat,
          lng: mockLoc.lng,
          accuracy: 5,
          timestamp: Date.now(),
        });
        console.log('[PreviewWindow] seeded MockSensorService from settings:', mockLoc);
      }
    }

    // Set TTS language from translation settings
    {
      const ttsLang = previewData.activeLanguage || previewData.settings?.translation?.sourceLanguage || 'en';
      getTTSService().setLanguage(ttsLang);
      // Also set STT language
      getSTTService().setLanguage(ttsLang);
    }

    // Apply persisted speaker voices from global settings (provider-scoped)
    {
      const allVoices = previewData.settings?.tts?.speakerVoices as Record<string, Record<string, string>> | undefined;
      const providerKey = getSavedTTSConfig()?.providerType || previewData.settings?.tts?.providerType || 'web-speech';
      const persistedVoices = allVoices?.[providerKey];
      if (persistedVoices && Object.keys(persistedVoices).length > 0) {
        const ttsService = getTTSService();
        for (const [speaker, voiceId] of Object.entries(persistedVoices)) {
          if (voiceId) {
            ttsService.setSpeakerVoice(speaker, { voiceId });
          }
        }
        console.log('[PreviewWindow] Applied persisted speaker voices for', providerKey + ':', Object.keys(persistedVoices).length);
      }
    }

    // Set up AI service for AI-powered beats (update on every previewData change)
    if (rendererRef.current) {
      let aiServiceAdapter = createAIServiceAdapter();
      if (aiServiceAdapter) {
        if (previewData.activeLanguage) {
          const sourceLanguage = previewData.settings?.translation?.sourceLanguage || 'en';
          aiServiceAdapter = createLanguageAwareAdapter(aiServiceAdapter, previewData.activeLanguage, sourceLanguage);
          console.log('[PreviewWindow] AI service adapter wrapped with language directives:', previewData.activeLanguage);
        }
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

      // Pre-translate loading messages and wrap renderLoading for language-aware display
      if (!previewData.activeLanguage) {
        // Source-language preview — clear any UI-string translations left
        // over from a previous language session in this window.
        setUIStrings(null);
        loadingTranslationsRef.current = new Map();
      }
      if (previewData.activeLanguage && aiServiceAdapter) {
        // Use the raw (unwrapped) adapter for translating UI strings — the language directive
        // would interfere since we're explicitly asking for a specific target language
        const rawAdapter = createAIServiceAdapter();
        if (rawAdapter) {
          preTranslateUIStrings(rawAdapter, previewData.activeLanguage)
            .then(({ byEnglish, byKey }) => {
              loadingTranslationsRef.current = byEnglish;
              // Renderer chrome (input placeholders, HUD titles, image
              // picker, default buttons) reads uiString() live.
              setUIStrings(byKey);
              console.log(`[PreviewWindow] UI-string translations ready (${byEnglish.size} entries)`);
            });
        }

        // Wrap renderer methods to substitute translated messages and UI strings
        const renderer = rendererRef.current;
        const t = loadingTranslationsRef;

        const originalRenderLoading = renderer.renderLoading.bind(renderer);
        renderer.renderLoading = (message: string, options?: { subMessage?: string; spinnerType?: 'spinner' | 'dots' | 'pulse' }) => {
          const translatedMsg = translateLoadingMessage(message, t.current);
          const translatedSub = options?.subMessage
            ? translateLoadingMessage(options.subMessage, t.current)
            : options?.subMessage;
          originalRenderLoading(translatedMsg, { ...options, subMessage: translatedSub });
        };

        // Wrap renderAISummary to translate button texts
        if (renderer.renderAISummary) {
          const originalRenderAISummary = renderer.renderAISummary.bind(renderer);
          renderer.renderAISummary = (data: any, locations?: any) => {
            return originalRenderAISummary({
              ...data,
              restartText: translateLoadingMessage(data.restartText || 'Play Again', t.current),
              creditsText: translateLoadingMessage(data.creditsText || 'Credits', t.current),
              title: translateLoadingMessage(data.title || '', t.current) || data.title,
            }, locations);
          };
        }

        // Wrap renderEndScreen to translate button texts (via renderer state)
        const originalRenderEndScreen = renderer.renderEndScreen.bind(renderer);
        renderer.renderEndScreen = (message: string, showRestart: boolean, showCredits: boolean, locations?: any) => {
          // EndScreen reads restartText/creditsText from renderer state
          const currentRestart = renderer.getState('restartText') as string;
          const currentCredits = renderer.getState('creditsText') as string;
          if (currentRestart) renderer.setState('restartText', translateLoadingMessage(currentRestart, t.current));
          if (currentCredits) renderer.setState('creditsText', translateLoadingMessage(currentCredits, t.current));
          return originalRenderEndScreen(message, showRestart, showCredits, locations);
        };

        console.log('[PreviewWindow] Renderer methods wrapped for language-aware display');
      }
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

      // Initialize fictional time from global settings
      if (hudOverlays?.fictionalTime?.enabled) {
        const ftConfig = hudOverlays.fictionalTime;
        // We need the context to set fictional time - it's done after loadStory below
        // Store config reference for use in startPreview
        (rendererRef.current as any)._fictionalTimeConfig = ftConfig;
      }
    }

    // Update TTS language on every previewData change (e.g., language switch)
    // This runs outside the renderer init block so it applies even when the
    // renderer already exists
    {
      const ttsLang = previewData.activeLanguage || previewData.settings?.translation?.sourceLanguage || 'en';
      getTTSService().setLanguage(ttsLang);
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
    if (!engineRef.current || !rendererRef.current || !story || !previewData) {
      // Previously a SILENT early-return — clicking "Click to preview…"
      // did nothing when an init race left the engine unready. Name the
      // missing piece so the author sees why instead of a dead click.
      const missing = [
        !engineRef.current && 'engine',
        !rendererRef.current && 'renderer',
        !story && 'story',
        !previewData && 'preview data',
      ].filter(Boolean).join(', ');
      console.error('[PreviewWindow] startPreview blocked — not ready:', missing);
      setStartBlockedReason(
        `Preview isn't ready yet (${missing} still initializing). Wait a moment and click again — if this persists, close and reopen the preview window.`
      );
      return;
    }
    setStartBlockedReason(null);
    setEndedNotice(null);
    stopRequestedRef.current = false;

    try {
      // Stop any previous run and clear renderer
      if (engineRef.current) {
        engineRef.current.stop();
      }
      rendererRef.current.clear();
      setIsRunning(true);

      // Initialize beat locations. Pass the project's resolved layout
      // mode so dual-mode beats (dialogTree) get a fixed bake in fixed
      // projects and stay empty (→ spatial path) in responsive ones.
      const allBeats = story.getAllBeats();
      const projectLayoutMode = resolveLayoutMode(previewData?.settings, allBeats);
      initializeBeatLocations(allBeats, STAGE_WIDTH, STAGE_HEIGHT, projectLayoutMode);
      // Surface the resolved project layout mode to the renderer so its
      // routing (slot vs absolute) can treat the project flag as
      // authoritative for slot/spatial beats — leftover baked locations
      // from a prior fixed-mode session shouldn't strand the runtime on
      // the absolute path when the author has switched to responsive.
      rendererRef.current?.setState('projectLayoutMode', projectLayoutMode);

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

      // Initialize fictional time from global settings
      const ftConfig = (rendererRef.current as any)?._fictionalTimeConfig;
      if (ftConfig?.enabled && ftConfig.initialTime) {
        context.setFictionalTime(ftConfig.initialTime);
        // Set initial formatted text
        if (ftConfig.showInTimerHud) {
          const formatted = context.formatFictionalTime(ftConfig.displayFormat, ftConfig.initialTime);
          (rendererRef.current as any).setFictionalTimeText?.(formatted);
        }
      }

      // Apply selected preset (use override if provided, otherwise use state)
      const presetToApply = overridePreset !== undefined ? overridePreset : selectedPreset;
      if (presetToApply) {
        Object.entries(presetToApply.state.variables).forEach(([key, value]) => context.setVariable(key, value));
        Object.entries(presetToApply.state.counters).forEach(([key, value]) => context.setCounter(key, value));
        presetToApply.state.inventory.forEach(item => context.addToInventory(item));
        presetToApply.state.visitedBeats.forEach(beatId => context.markBeatVisited(beatId));
        // The start beat itself IS genuinely visited in this run — only the
        // simulated path leading up to it counts as seeded.
        const runStartBeat = overrideBeatId || startBeatId;
        seededBeatsRef.current = new Set(
          presetToApply.state.visitedBeats.filter(id => id !== runStartBeat),
        );
      } else {
        seededBeatsRef.current = new Set();
      }

      // Set up beat tracking and debug info updates
      const updateDebugInfo = () => {
        const ctx = engineRef.current?.getContext();
        if (!ctx) return;

        // Get all state info from context (these methods return Records)
        const variables = ctx.getVariables();
        const counters = ctx.getCounters();
        const timers = ctx.getTimers();

        // Replace countersRef with current context state (ensures reset clears old values)
        countersRef.current = { ...counters };

        const visitedBeats = ctx.getVisitedBeats();
        const currentBeatId = ctx.getCurrentBeatId() || null;

        // Include the current beat in the visited list so the flowchart paints
        // it as soon as the player ENTERS it. The engine only records
        // `visitedBeats` at the END of Beat.execute(), which without this
        // augmentation would mean the red trace always lagged one beat behind.
        const paintedBeats = currentBeatId && !visitedBeats.includes(currentBeatId)
          ? [...visitedBeats, currentBeatId]
          : visitedBeats;

        setDebugInfo({
          visitedBeats,
          seededBeats: Array.from(seededBeatsRef.current),
          variables,
          counters,
          inventory: ctx.getInventoryEntries(),
          timers,
        });

        // Echo visited-beats + current-beat back to the builder so it can
        // paint the flowchart (we fire on every state change — the opener
        // dedupes). The builder uses `currentBeatId` to draw the active beat
        // more prominently than past-visited beats.
        try {
          const payload = { visitedBeats: paintedBeats, currentBeatId };
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: 'VISITED_BEATS_UPDATE', payload },
              window.location.origin,
            );
          } else if (isElectronRef.current) {
            (window as any).electronAPI?.preview?.sendToMain?.({
              type: 'VISITED_BEATS_UPDATE',
              payload,
            });
          }
        } catch (err) {
          console.warn('[PreviewWindow] Failed to post VISITED_BEATS_UPDATE:', err);
        }

        // Update renderer with visited state for blocking/dimming visited choices
        if (rendererRef.current && 'setVisitedBeats' in rendererRef.current) {
          (rendererRef.current as any).setVisitedBeats(visitedBeats);
        }
        if (rendererRef.current && 'setVisitedChoiceIds' in rendererRef.current) {
          const currentBeatId = ctx.getCurrentBeatId();
          (rendererRef.current as any).setVisitedChoiceIds(
            ctx.getVisitedChoicesForBeat(currentBeatId)
          );
        }

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

      // Set per-beat timer HUD override text and countdown meter visibility BEFORE performAction renders
      const onBeatChanged = ({ beatId }: { beatId: string }) => {
        const beat = story.getBeat(beatId);
        if (rendererRef.current && beat) {
          const timeDisplayMode = (beat as any)?.timeDisplayMode || 'fictionalTime';
          const overrideCountdownMeter = (beat as any)?.overrideCountdownMeter || false;
          (rendererRef.current as any).setOverrideCountdownMeter?.(overrideCountdownMeter);

          const ftCfg = (rendererRef.current as any)?._fictionalTimeConfig;

          if (timeDisplayMode === 'none') {
            // Hide timer HUD content for this beat
            (rendererRef.current as any).setTimerHudOverrideText?.(undefined);
            (rendererRef.current as any).setFictionalTimeText?.(undefined);
          } else if (timeDisplayMode === 'manual') {
            // Use manual text override
            const overrideText = (beat as any)?.timeDisplayText || undefined;
            (rendererRef.current as any).setTimerHudOverrideText?.(overrideText);
            (rendererRef.current as any).setFictionalTimeText?.(undefined);
          } else {
            // Default 'fictionalTime' mode: clear override, show fictional time
            (rendererRef.current as any).setTimerHudOverrideText?.(undefined);
            if (ftCfg?.enabled && ftCfg.showInTimerHud) {
              const formatted = context.formatFictionalTime(ftCfg.displayFormat, ftCfg.initialTime);
              (rendererRef.current as any).setFictionalTimeText?.(formatted);
            }
          }
        }
      };
      context.on('beatChanged', onBeatChanged);

      const unsubscribe = (rendererRef.current as any).onStateChange?.('currentBeatInfo', (beatInfo: { id: string; name: string; type: string } | null) => {
        if (beatInfo) {
          const beat = story.getBeat(beatInfo.id);
          setCurrentBeat(beat || null);
          // Update debug info when beat changes
          updateDebugInfo();
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
      context.on('reset', updateDebugInfo);
      context.on('selectiveReset', updateDebugInfo);
      // Step 4 / Phase 2: re-render the affect panel when mood / sentiment
      // changes via UpdateAffect beats or future emotion firings.
      context.on('characterMoodChanged', updateDebugInfo);
      context.on('characterSentimentChanged', updateDebugInfo);
      // Step 5: emotion firings + per-beat decay also re-render the panel.
      context.on('characterEmotionChanged', updateDebugInfo);

      // On in-story restart (EndScreen/AISummary → context.reset / selectiveReset),
      // the renderer's HUD state is not cleared automatically. Clear stale timer
      // HUD state and restore the fictional-time display from global config.
      const onStoryReset = () => {
        if (!rendererRef.current) return;
        (rendererRef.current as any).setTimerHudState?.(undefined);
        (rendererRef.current as any).setTimerHudOverrideText?.(undefined);
        const ftCfg = (rendererRef.current as any)?._fictionalTimeConfig;
        if (ftCfg?.enabled && ftCfg.initialTime) {
          context.setFictionalTime(ftCfg.initialTime);
          if (ftCfg.showInTimerHud) {
            const formatted = context.formatFictionalTime(ftCfg.displayFormat, ftCfg.initialTime);
            (rendererRef.current as any).setFictionalTimeText?.(formatted);
          } else {
            (rendererRef.current as any).setFictionalTimeText?.(undefined);
          }
        } else {
          (rendererRef.current as any).setFictionalTimeText?.(undefined);
        }
      };
      context.on('reset', onStoryReset);
      context.on('selectiveReset', (options: any) => {
        if (options?.timers || options?.fictionalTime) onStoryReset();
      });

      // Listen for fictional time changes and update renderer
      context.on('fictionalTimeChanged', () => {
        if (!rendererRef.current) return;
        const ftCfg = (rendererRef.current as any)?._fictionalTimeConfig;
        if (ftCfg?.enabled && ftCfg.showInTimerHud) {
          const formatted = context.formatFictionalTime(ftCfg.displayFormat, ftCfg.initialTime);
          (rendererRef.current as any).setFictionalTimeText?.(formatted);
        }
      });

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

      // Update timer HUD state for named timers (auto-detect: always supply timer data when available)
      const updateTimerHud = () => {
        if (!rendererRef.current) return;
        const hudConfig = (rendererRef.current as any).timerHudConfig;
        if (!hudConfig?.enabled) return;

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
        // Use config values as defaults, then try to override from character definitions
        let min = meterConfig.counterMin ?? 0;
        let max = meterConfig.counterMax ?? 100;
        if (previewData.characters) {
          for (const char of previewData.characters) {
            const counter = char.counters?.find((c: any) => c.name === counterName);
            if (counter) {
              min = counter.min ?? min;
              max = counter.max ?? max;
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

      // When timer expires, show 00:00 instead of hiding — the HUD should persist
      // until the story restarts (clear() resets it)
      timerManager.on('timerExpired', ({ name }: { name: string }) => {
        if (!rendererRef.current) return;
        const hudConfig = (rendererRef.current as any).timerHudConfig;
        if (!hudConfig?.enabled) return;
        const matchesName = !hudConfig.timerName || hudConfig.timerName === name;
        if (matchesName) {
          const currentState = (rendererRef.current as any).timerHudState;
          (rendererRef.current as any).setTimerHudState?.({
            totalTime: currentState?.totalTime || 1,
            remainingTime: 0,
          });
        }
      });

      // On timerStopped (manual stop or cleanup), don't clear if timer just expired
      // — the timerExpired handler above already set remainingTime to 0
      // Only clear if the stop is from a restart (which also calls renderer.clear())
      // So we intentionally do NOT call updateTimerHud on timerStopped.

      // Wire countdown meter updates to counter events
      context.on('counterChanged', updateCountdownMeter);
      // Initial counter meter state
      updateCountdownMeter();

      // Handle timer expiration - cancel pending action so the engine can process the interrupt.
      // The engine's built-in timerInterruptBeat mechanism handles navigation to the target beat.
      // cancelPendingAction resolves the pending promise so beat.execute() returns,
      // and the engine loop picks up timerInterruptBeat for the next beat.
      timerManager.on('timerExpired', ({ name, targetBeat }: { name: string; targetBeat?: string }) => {
        if (targetBeat && rendererRef.current) {
          console.log(`[PreviewWindow] Timer "${name}" expired → target: ${targetBeat}. Cancelling pending action for engine interrupt.`);
          (rendererRef.current as any).cancelPendingAction?.();
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
      // The run loop resolving WITHOUT a Stop/Pause request means the story
      // ended on its own. Ending anywhere but an endScreen is almost always
      // a dead end the author should know about.
      if (!stopRequestedRef.current && engineRef.current) {
        try {
          const lastId = engineRef.current.getContext().getCurrentBeatId();
          const lastBeat = lastId ? story?.getBeat(lastId) : null;
          if (lastBeat && lastBeat.type !== 'endScreen') {
            setEndedNotice(
              `Story ended at "${lastBeat.name || lastId}" — this beat has no outgoing connection. Wire it onward in the flowchart (or make it an End Screen).`
            );
          }
        } catch { /* engine already torn down — nothing to report */ }
      }
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
    getTTSService().stop();

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
      stopRequestedRef.current = true;
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
      stopRequestedRef.current = true;
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

  const handleTTSToggle = useCallback(() => {
    const newEnabled = !ttsEnabled;
    setTtsEnabled(newEnabled);
    try {
      getTTSService().setEnabled(newEnabled);
      localStorage.setItem('asaps_tts_enabled', String(newEnabled));
      if (!newEnabled) getTTSService().stop();
    } catch (error) {
      console.warn('[PreviewWindow] Error toggling TTS:', error);
    }
  }, [ttsEnabled]);

  const handleSTTToggle = useCallback(() => {
    const newEnabled = !sttEnabled;
    setSttEnabled(newEnabled);
    try {
      getSTTService().setEnabled(newEnabled);
      localStorage.setItem('asaps_stt_enabled', String(newEnabled));
      if (!newEnabled) getSTTService().stopListening();
    } catch (error) {
      console.warn('[PreviewWindow] Error toggling STT:', error);
    }
  }, [sttEnabled]);

  // Export play session log
  const exportSessionLog = useCallback(() => {
    const context = engineRef.current?.getContext();
    if (!context) return;

    const storyObj = context.getStory();
    const timeline = context.getTimeline();
    const variables = context.getVariables();
    const counters = context.getCounters();
    const inventory = context.getInventoryEntries();
    const visitedBeats = context.getVisitedBeats();
    const timers = context.getTimers();
    const fictionalTime = context.getFictionalTime?.();

    const lines: string[] = [];
    const now = new Date().toISOString();
    const storyTitle = previewData?.storyData?.title || 'Untitled';
    const fmt = (ts: number) => new Date(ts).toLocaleTimeString();

    lines.push(`ASAPS Play Session Log`);
    lines.push(`======================`);
    lines.push(`Story: ${storyTitle}`);
    lines.push(`Exported: ${now}`);
    lines.push(`Current Beat: ${currentBeat?.name || 'none'} (${currentBeat?.id || '-'})`);
    lines.push(``);

    // ── SECTION 1: OVERVIEW ──────────────────────────────
    lines.push(`════════════════════════════════════════════`);
    lines.push(`OVERVIEW`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(``);

    // Beat path (compact) — include current beat even if not yet in timeline
    const beatEvents = timeline.filter(e => e.type === 'beat-enter');
    const currentBeatInTimeline = currentBeat && beatEvents.some(e => e.beatId === currentBeat.id);
    const totalBeats = beatEvents.length + (currentBeat && !currentBeatInTimeline ? 1 : 0);
    lines.push(`Beat Path (${totalBeats} beats)`);
    lines.push(`-------------------------------------------`);
    beatEvents.forEach((e, i) => {
      lines.push(`  ${i + 1}. [${fmt(e.timestamp)}] [${e.beatType}] ${e.beatName || e.beatId}`);
    });
    if (currentBeat && !currentBeatInTimeline) {
      lines.push(`  ${beatEvents.length + 1}. [${fmt(Date.now())}] [${currentBeat.type}] ${currentBeat.name} (current)`);
    }
    lines.push(``);

    // Final state
    const varEntries = Object.entries(variables);
    const counterEntries = Object.entries(counters);
    if (varEntries.length > 0 || counterEntries.length > 0 || inventory.length > 0) {
      lines.push(`Final State`);
      lines.push(`-------------------------------------------`);
      varEntries.forEach(([k, v]) => lines.push(`  var  ${k} = ${JSON.stringify(v)}`));
      counterEntries.forEach(([k, v]) => lines.push(`  ctr  ${k} = ${v}`));
      inventory.forEach(item => lines.push(`  inv  ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`));
      const timerEntries = Object.entries(timers);
      timerEntries.forEach(([k, t]) => lines.push(`  tmr  ${k}: ${(t as any).value}s${(t as any).target ? ` -> ${(t as any).target}` : ''}`));
      if (fictionalTime) lines.push(`  time ${JSON.stringify(fictionalTime)}`);
      lines.push(``);
    }

    // Summary stats
    const choiceCount = timeline.filter(e => e.type === 'choice').length;
    const branchCount = timeline.filter(e => e.type === 'branch').length;
    const aiCount = timeline.filter(e => e.type === 'ai-output').length;
    lines.push(`Statistics`);
    lines.push(`-------------------------------------------`);
    lines.push(`  Unique beats visited: ${visitedBeats.length}`);
    lines.push(`  Total beat transitions: ${beatEvents.length}`);
    lines.push(`  Choices made: ${choiceCount}`);
    lines.push(`  Branch decisions: ${branchCount}`);
    lines.push(`  AI outputs: ${aiCount}`);
    lines.push(``);

    // ── SECTION 2: DETAILED TIMELINE ─────────────────────
    lines.push(`════════════════════════════════════════════`);
    lines.push(`DETAILED TIMELINE`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(``);

    let eventNum = 0;
    for (const event of timeline) {
      eventNum++;
      const time = fmt(event.timestamp);

      switch (event.type) {
        case 'beat-enter':
          lines.push(`${eventNum}. [${time}] [${event.beatType}] ${event.beatName || event.beatId} (${event.beatId})`);
          break;

        case 'choice':
          lines.push(`${eventNum}. [${time}] CHOICE at ${event.beatName || event.beatId}`);
          if (event.choiceContext) {
            lines.push(`     Q: ${event.choiceContext}`);
          }
          lines.push(`     -> "${event.choiceText}"`);
          break;

        case 'branch': {
          const target = event.targetBeatName || event.targetBeatId || '?';
          lines.push(`${eventNum}. [${time}] [${event.beatType}] ${event.beatName || event.beatId} branched to ${target}`);
          if (event.reason) {
            lines.push(`     because: ${event.reason}`);
          }
          break;
        }

        case 'ai-output': {
          // Skip raw dialog tree JSON — internal structure, not useful in log
          if (event.text?.startsWith('{"id":')) {
            eventNum--;
            break;
          }
          // Skip per-turn NPC speech from aiDialogTree — already visible in choice context
          if (event.beatType === 'aiDialogTree' && event.text && !event.text.startsWith('[Routing Plan]')) {
            eventNum--;
            break;
          }
          // Label routing plans distinctly
          const isRoutingPlan = event.text?.startsWith('[Routing Plan]');
          const label = isRoutingPlan ? 'routing plan' : 'generated';
          lines.push(`${eventNum}. [${time}] [${event.beatType}] ${event.beatName || event.beatId} ${label}:`);
          if (event.text) {
            // Full text — no truncation, for quality assessment
            event.text.split('\n').forEach(line => {
              lines.push(`     ${line}`);
            });
          }
          break;
        }

        case 'state-change':
          lines.push(`${eventNum}. [${time}] STATE: ${event.stateChange}`);
          break;
      }
    }
    lines.push(``);

    // Download as text file
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-log-${storyTitle.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentBeat, previewData]);

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

  // v0.9.48+ — Mock sensor panel: collapsible overlay shown when the
  // project has any LocationSettings configured (origin or mockLocation).
  // Lets authors simulate GPS / orientation while testing on desktop.
  // Hidden by default to keep the preview chrome clean; toggle button
  // sits in the bottom-right.
  const locationSettings = (previewData?.settings as any)?.location as
    | { originLat?: number; originLng?: number; mockLocation?: { lat: number; lng: number }; venue?: unknown }
    | undefined;
  const hasLocationSettings = !!(
    locationSettings &&
    (locationSettings.originLat !== undefined ||
      locationSettings.originLng !== undefined ||
      locationSettings.mockLocation ||
      // Indoor-only projects (venue + beacons, no GPS origin) need the
      // panel too — its beacon distance sliders are the ONLY way to
      // exercise indoorLocation beats without hardware.
      locationSettings.venue)
  );
  const sensorService = engineRef.current?.getContext()?.getSensorService();
  // Player-position semantics: mockLocation is "where the simulated player
  // is right now" (used for desktop testing). originLat/Lng is the project's
  // geographical anchor (venue center, e.g.) — meaningful for relative-coord
  // beats but NOT a starting position. Prefer mockLocation; fall back to
  // origin only when no mock is set.
  const storyOrigin =
    locationSettings?.mockLocation
      ?? (locationSettings?.originLat !== undefined && locationSettings?.originLng !== undefined
        ? { lat: locationSettings.originLat, lng: locationSettings.originLng }
        : undefined);

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
                    `Select state (${generatedPresets.length})`
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
                      {totalPathCount} {totalPathCount === 1 ? 'path' : 'paths'} → {generatedPresets.length} unique {generatedPresets.length === 1 ? 'state' : 'states'}
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
                    Array.from(presetsByOutcome.entries()).map(([outcome, presets]) => {
                      const groupPathCount = presets.reduce((sum, p) => sum + p.pathCount, 0);
                      return (
                      <div key={outcome}>
                        <div className="px-3 py-1 bg-gray-50 text-xs font-medium text-gray-600 border-t border-gray-200">
                          → {outcome} ({presets.length} {presets.length === 1 ? 'state' : 'states'} from {groupPathCount} {groupPathCount === 1 ? 'path' : 'paths'})
                        </div>
                        {presets.map((genPreset, idx) => {
                          const { variables, counters, inventory } = genPreset.preset.state;
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
                                {summaryParts.length > 0 ? summaryParts.join(' • ') : genPreset.pathDescription}
                                {hasInputText && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                    {genPreset.inputTextBeats.length} input{genPreset.inputTextBeats.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 truncate mt-0.5">
                                {genPreset.pathCount} {genPreset.pathCount === 1 ? 'path' : 'paths'}
                                {summaryParts.length > 0 && ` · ${genPreset.pathDescription}`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      );
                    })
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
              <button
                onClick={exportSessionLog}
                className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 flex items-center gap-2"
                title="Save play session log"
              >
                <Download className="w-4 h-4" />
                Save Log
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
              <button
                onClick={exportSessionLog}
                className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 flex items-center gap-2"
                title="Save play session log"
              >
                <Download className="w-4 h-4" />
                Save Log
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
          {/* Stage wrapper - sized to scaled dimensions.
              Phase 1 — when a viewport preset is selected, the stage
              snaps to the preset's pixel dimensions instead of the
              design canvas. The renderer's responsive flow reflows
              against these dims (via the existing P2.5-3 resize
              listener); fixed-canvas projects scale-fit into the
              preset window via transform:scale (their previous
              behavior, just inside a smaller box).
              IMPORTANT — keep the containerRef-bearing div stable
              across preset changes. Earlier I had two parallel
              branches each with its own `<div ref={containerRef}>`,
              and swapping presets mid-preview unmounted the React
              renderer's mount node ("No root available" warning,
              blank stage). Now there's exactly ONE mount node; only
              its wrapping changes. */}
          <div
            style={{
              width: previewViewport ? previewViewport.width : STAGE_WIDTH * scale,
              height: previewViewport ? previewViewport.height : STAGE_HEIGHT * scale,
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <div
              className={`relative bg-white shadow-lg transition-all duration-200 ${
                (isPaused || isWaitingToStart) ? 'ring-4 ring-amber-400 ring-offset-2' : ''
              }`}
              style={previewViewport ? {
                width: previewViewport.width,
                height: previewViewport.height,
                overflow: 'hidden',
              } : {
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                overflow: 'hidden',
              }}
            >
              {/* Renderer container - SINGLE mount point, lives in
                  one place regardless of preset to keep the React
                  renderer's root attached across viewport changes. */}
              <div ref={containerRef} className="absolute inset-0" />
              {previewViewport && (
                <div
                  className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-white pointer-events-none select-none z-10"
                  title="Preview viewport (Phase 1)"
                >
                  {previewViewport.width}×{previewViewport.height}
                </div>
              )}

              {/* Mood-pad HUD overlay — top-level layer for screen-docked
                  HUDs that don't depend on the character being placed on
                  stage as a character-type location. Anchored-to-character
                  HUDs are still mounted from PositionedBeatView when the
                  character is on stage. The `debugInfo` state already
                  subscribes to characterMoodChanged events, so this layer
                  re-renders whenever mood updates. */}
              {(() => {
                const ctx = engineRef.current?.getContext();
                if (!ctx) return null;
                const chars = previewDataRef.current?.characters;
                const palette = previewDataRef.current?.emotionPalette;
                const assetsList = previewDataRef.current?.assets || [];
                if (!chars) return null;
                // Just touch debugInfo so the linter / React knows we
                // depend on it for re-renders. Read is cheap.
                void debugInfo;
                const stageDim = { width: STAGE_WIDTH, height: STAGE_HEIGHT };
                // Token-style screen HUDs group into a per-corner MoodRail
                // (no overlap when several characters are on screen); disc-
                // style ones stay individual cards.
                const railGroups: Record<string, MoodRailEntry[]> = {};
                const discFrames: React.ReactNode[] = [];
                chars.forEach((c) => {
                  const mf: any = (c as any).moodFrame;
                  if (!mf || !mf.enabled || mf.dockMode !== 'screen') return;
                  const variants = (c as any).variants;
                  if (variants && variants.length > 0) {
                    const explicit = (ctx as any).hasExplicitlySetVariant?.(c.id);
                    if (!explicit) return;
                  }
                  const merged: any = (ctx as any).getMergedCharacter?.(c.id) || c;
                  const mood = ctx.getCharacterMood(c.id);
                  const portraitAsset = merged.portrait?.assetId
                    ? assetsList.find((a: any) => a.id === merged.portrait.assetId)
                    : undefined;
                  const portraitUrl = portraitAsset?.url || merged.portrait?.image;
                  const name = merged.displayName || merged.name || c.id;
                  if ((mf.displayStyle ?? 'token') === 'disc') {
                    discFrames.push(
                      <CharacterMoodFrame
                        key={`mood-hud-${c.id}`}
                        valence={mood.valence} arousal={mood.arousal} config={mf} palette={palette}
                        characterName={name} characterPortraitUrl={portraitUrl} characterColor={merged.color}
                        characterPosition={{ x: 0, y: 0 }} characterDimensions={{ width: 0, height: 0 }}
                        containerDimensions={stageDim}
                      />,
                    );
                  } else {
                    const corner = mf.screenPosition || 'screen-top-right';
                    (railGroups[corner] ||= []).push({
                      key: c.id, valence: mood.valence, arousal: mood.arousal,
                      characterName: name, characterPortraitUrl: portraitUrl, characterColor: merged.color,
                      showLabel: mf.showQualitativeLabel !== false,
                    });
                  }
                });
                return (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40 }}>
                    {Object.entries(railGroups).map(([corner, entries]) => (
                      <MoodRail key={`mood-rail-${corner}`} entries={entries}
                        screenPosition={corner as any} containerDimensions={stageDim} />
                    ))}
                    {discFrames}
                    {/* Counter (meter-frame) HUD — same hoist as the mood
                        pad above: screen-docked frames render here so they
                        show in BOTH layout modes and on beats where the
                        character isn't placed on stage. Character-anchored
                        frames still come from PositionedBeatView. Values
                        re-render via debugInfo (counterChanged events). */}
                    {chars.map((c) => {
                      const frame: any = (c as any).meterFrame;
                      if (!frame || frame.dockMode !== 'screen') return null;
                      const variants = (c as any).variants;
                      if (variants && variants.length > 0) {
                        const explicit = (ctx as any).hasExplicitlySetVariant?.(c.id);
                        if (!explicit) return null;
                      }
                      const visibleCounters = (c.counters || []).filter((k: any) => k.visible);
                      if (visibleCounters.length === 0) return null;
                      const counters = visibleCounters.map((counter: any) => ({
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
                      return (
                        <CharacterMeterFrame
                          key={`meter-hud-${c.id}`}
                          counters={counters}
                          config={frame}
                          characterPosition={{ x: 0, y: 0 }}
                          characterDimensions={{ width: 0, height: 0 }}
                          containerDimensions={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
              {startBlockedReason && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] max-w-[80%] px-3 py-2 rounded bg-red-600 text-white text-sm shadow-lg">
                  {startBlockedReason}
                </div>
              )}
              {endedNotice && !isRunning && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] max-w-[80%] px-3 py-2 rounded bg-amber-500 text-white text-sm shadow-lg flex items-start gap-2">
                  <span>{endedNotice}</span>
                  <button
                    onClick={() => setEndedNotice(null)}
                    className="font-bold px-1 hover:opacity-70"
                    title="Dismiss"
                  >×</button>
                </div>
              )}
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

                {/* Character Affect (Step 4 Phase 2) — current mood + top
                    sentiments per defined character. Updates live as the
                    story plays, driven by characterMoodChanged /
                    characterSentimentChanged events on the StoryContext. */}
                {(() => {
                  const ctx = engineRef.current?.getContext();
                  const chars = previewDataRef.current?.characters;
                  if (!ctx || !chars || chars.length === 0) return null;
                  // Only render the mood tracker when the story actually
                  // uses the affect system — otherwise it's dead space.
                  // Authored signals OR (fallback) affect that moved at
                  // runtime, e.g. AI-conversation sentiment extraction.
                  const usesAffect =
                    storyUsesAffect(chars, story?.getAllBeats?.() || []) ||
                    anyLiveAffect(chars, {
                      getCharacterMood: (id: string) => ctx.getCharacterMood(id),
                      getCharacterSentiments: (id: string) => ctx.getCharacterSentiments(id),
                      getCharacterEmotions: (id: string) => ctx.getCharacterEmotions(id),
                    });
                  if (!usesAffect) return null;
                  return (
                    <CharacterAffectPanel
                      characters={chars}
                      context={{
                        getCharacterMood: (id: string) => ctx.getCharacterMood(id),
                        getCharacterSentiments: (id: string) => ctx.getCharacterSentiments(id),
                        getCharacterEmotions: (id: string) => ctx.getCharacterEmotions(id),
                      }}
                      emotionPalette={previewDataRef.current?.emotionPalette}
                    />
                  );
                })()}

                {/* Visited Beats — beats injected by a mid-story start preset are
                    badged "seeded": visited-beat conditions treat them as visited,
                    but the player never saw them in this run. */}
                {debugInfo.visitedBeats && debugInfo.visitedBeats.length > 0 && (() => {
                  const seededSet = new Set(debugInfo.seededBeats || []);
                  const seededCount = debugInfo.visitedBeats.filter((b: string) => seededSet.has(b)).length;
                  return (
                    <div className="bg-white p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-600 mb-2">
                        Visited Beats ({debugInfo.visitedBeats.length})
                        {seededCount > 0 && (
                          <span
                            className="ml-1 font-normal text-xs text-amber-600"
                            title="Seeded beats were injected by the start-from-beat state, not visited in this run"
                          >
                            — {seededCount} seeded by start state
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {debugInfo.visitedBeats.map((beatId: string, idx: number) => {
                          const beat = story?.getBeat(beatId);
                          const seeded = seededSet.has(beatId);
                          return (
                            <div key={`${beatId}-${idx}`} className="text-xs text-gray-600 flex items-center gap-1">
                              <ChevronRight className="w-3 h-3" />
                              {beat?.name || beatId}
                              {seeded && (
                                <span
                                  className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded"
                                  title="Not visited in this run — injected by the start-from-beat state so visited-beat conditions behave as if the player took this path"
                                >
                                  seeded
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

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
                      {debugInfo.inventory.map((item: { name: string; quantity: number }) => {
                        // Look up translated displayName from character inventory definitions
                        const invDef = previewData?.characters
                          ?.flatMap(c => c.inventory || [])
                          .find((inv: any) => inv.name === item.name);
                        return (
                          <div key={item.name} className="text-xs text-gray-600 flex justify-between">
                            <span>• {invDef?.displayName || item.name}</span>
                            <span className="font-mono text-gray-500">×{item.quantity}</span>
                          </div>
                        );
                      })}
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

          {/* Phase 1 — viewport preset switcher. Auto = no override
              (stage takes design dims, fits to window). Other presets
              clamp the stage to those pixel dims so responsive layouts
              reflow as on the target device. Filtered against the
              project's orientation lock (no portrait presets in a
              landscape-locked project, and vice versa). */}
          <div className="w-px h-5 bg-gray-400 mx-2" />
          <select
            value={previewViewport?.id ?? 'auto'}
            onChange={(e) => {
              const id = e.target.value;
              if (id === 'auto') {
                setPreviewViewport(null);
                return;
              }
              const preset = VIEWPORT_PRESETS.find(p => p.id === id);
              if (preset) {
                setPreviewViewport({
                  id: preset.id,
                  width: preset.width,
                  height: preset.height,
                  label: preset.label,
                });
              }
            }}
            className="text-xs bg-gray-100 border border-gray-300 rounded px-2 py-1"
            title="Preview at a specific device size — responsive layouts reflow live"
          >
            {VIEWPORT_PRESETS.filter(p => {
              const lock = (previewData?.settings as any)?.project?.orientation;
              if (!lock || lock === 'flexible') return true;
              return p.orientation === 'auto' || p.orientation === lock;
            }).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
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
            onClick={handleTTSToggle}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${ttsEnabled ? 'bg-green-100 text-green-700' : 'hover:bg-gray-300'}`}
            title={ttsEnabled ? 'Disable Text-to-Speech' : 'Enable Text-to-Speech'}
          >
            <Speech className="w-4 h-4" />
          </button>
          <button
            onClick={handleSTTToggle}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${sttEnabled ? 'bg-rose-100 text-rose-700' : 'hover:bg-gray-300'}`}
            title={sttEnabled ? 'Disable Speech-to-Text' : 'Enable Speech-to-Text'}
          >
            {sttEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
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

      {/* Mock sensor panel — only when the project has location settings.
          Floats bottom-right so it doesn't interfere with story content. */}
      {hasLocationSettings && sensorService && (
        <MockSensorPanelToggle
          sensorService={sensorService}
          storyOrigin={storyOrigin}
          venueBeacons={(previewData?.settings as any)?.location?.venue?.beacons}
        />
      )}
    </div>
  );
};

/**
 * Tiny wrapper to provide a show/hide toggle for the MockSensorPanel.
 * Default-hidden so the panel doesn't impose on author attention.
 */
const MockSensorPanelToggle: React.FC<{
  sensorService: any;
  storyOrigin?: { lat: number; lng: number };
  venueBeacons?: Array<{ uuid: string; displayName?: string; x: number; y: number }>;
}> = ({ sensorService, storyOrigin, venueBeacons }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? (
        <div className="w-72 shadow-xl">
          <div className="flex items-center justify-between bg-purple-700 text-white px-2 py-1 rounded-t-lg">
            <span className="text-xs font-medium">Mock Sensors (XR)</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white text-sm"
              aria-label="Hide mock sensor panel"
            >
              ×
            </button>
          </div>
          <div className="rounded-b-lg overflow-hidden">
            <MockSensorPanel sensorService={sensorService} storyOrigin={storyOrigin} venueBeacons={venueBeacons} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-purple-700 text-white text-xs px-3 py-2 rounded-lg shadow hover:bg-purple-800"
        >
          📍 Mock Sensors
        </button>
      )}
    </div>
  );
};

export default PreviewWindow;
