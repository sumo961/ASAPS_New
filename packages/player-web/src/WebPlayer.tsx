/**
 * WebPlayer - Simplified player component for HTML export
 * Self-contained player that can be embedded in any webpage
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PlayerEngine, PlayerUI, type PlayerSettings } from '@asaps/player';
import { ReactRenderer, type RenderContext, OrientationGate, type OrientationPolicy, beatSuppressesScreenHuds, toMeterCounterData, resolveMeterFrame, countersPlacedOnBeat, isCounterPlaced, ScreenHudLayer, buildScreenHudLayout, type ScreenHudCharacter } from '@asaps/renderer';
import { setUIStrings, buildLoadingTranslationMap, translateLoadingMessage } from '@asaps/core';
import { WebAIService, getAIConfigStatus, showAISettings } from './WebAIProvider';
import { WebTTSService } from './WebTTSProvider';
import { WebSTTService } from './WebSTTProvider';

export interface WebPlayerProps {
  /** Story data as ArrayBuffer, base64 string, or URL */
  story: ArrayBuffer | string;
  /** Width of the player (default: '100%') */
  width?: string | number;
  /** Height of the player (default: '100%') */
  height?: string | number;
  /** Enable AI features (default: true) */
  enableAI?: boolean;
  /** Show UI overlay with save/load/settings (default: true) */
  showUI?: boolean;
  /** Enable mobile cover scaling (fills viewport, may crop edges) */
  mobileMode?: boolean;
  /** Font scale multiplier (pre-computed: > 1.0 on mobile, 1.0 on desktop) */
  mobileFontScale?: number;
  /** Language code for TTS (e.g., 'en', 'de', 'ja') — updated on translation switch */
  language?: string;
  /** Show session log export button in player menu */
  showSessionLog?: boolean;
  /** Callback when story ends */
  onEnd?: () => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
}

type PlayerState = 'splash' | 'loading' | 'playing' | 'error' | 'ended';


// Splash screen duration in milliseconds
const SPLASH_DURATION = 2000;

export const WebPlayer: React.FC<WebPlayerProps> = ({
  story,
  width = '100%',
  height = '100%',
  enableAI = true,
  showUI = true,
  mobileMode = false,
  mobileFontScale = 1.0,
  language,
  showSessionLog = false,
  onEnd,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerEngine | null>(null);
  const rendererRef = useRef<ReactRenderer | null>(null);
  const [state, setState] = useState<PlayerState>('splash');
  const [error, setError] = useState<string | null>(null);
  const [splashFading, setSplashFading] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [aiStatus, setAiStatus] = useState(() => getAIConfigStatus());
  // Bumped on every characterMoodChanged / characterVariantChanged event
  // so the HUD overlay re-renders with fresh values from the runtime
  // context. Same pattern PreviewWindow uses.
  const [hudTick, setHudTick] = useState(0);
  // Stage dimensions captured from the loaded story so the HUD overlay
  // can position screen-docked widgets correctly.
  const [stageDims, setStageDims] = useState<{ width: number; height: number } | null>(null);
  const [orientationPolicy, setOrientationPolicy] = useState<OrientationPolicy>('flexible');
  /* HUD explanation (overlay trigger) — mirrors the Preview Window. Beats
     carrying `explainHuds` annotate the live HUDs on entry and are held INERT
     until acknowledged; acknowledged beats are remembered for the playthrough
     so the tutorial doesn't re-fire on every visit. */
  const [explainAcknowledged, setExplainAcknowledged] = useState<Record<string, boolean>>({});
  const [currentBeatMeta, setCurrentBeatMeta] = useState<{ id: string; explainHuds?: boolean; placedMeters?: Set<string> } | null>(null);
  const explainOverlayActive = !!(
    currentBeatMeta?.explainHuds && !explainAcknowledged[currentBeatMeta.id]
  );

  /* `inert` blocks pointer, keyboard/Tab focus and screen-reader traversal in
     one attribute, so the interactor can't click past the explanation — and
     the screen stays fully legible (no dimming scrim). The callout layer sits
     outside this subtree, so its acknowledge button stays live. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (explainOverlayActive) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
    return () => { el.removeAttribute('inert'); };
  }, [explainOverlayActive]);

  // Handle settings changes from PlayerUI
  const handleSettingsChange = useCallback((settings: PlayerSettings) => {
    if (playerRef.current) {
      // Apply mute state
      playerRef.current.setMuted(settings.muted);
      // Apply master volume
      playerRef.current.setMasterVolume(settings.masterVolume);
    }
  }, []);

  // Handle AI settings button click
  const handleAISettings = useCallback(async () => {
    const configured = await showAISettings();
    setAiStatus({ configured, embedded: false });
  }, []);

  // Handle splash screen timing
  useEffect(() => {
    if (state !== 'splash') return;

    // Start fade-out animation before transitioning
    const fadeTimer = setTimeout(() => {
      setSplashFading(true);
    }, SPLASH_DURATION - 500); // Start fade 500ms before end

    const transitionTimer = setTimeout(() => {
      setState('loading');
    }, SPLASH_DURATION);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(transitionTimer);
    };
  }, [state]);

  // Initialize once the splash is done — and ONLY once. This effect used
  // to depend on `state` directly, so every later transition re-ran it
  // (with its cleanup): 'ended' re-initialized the player and RESTARTED
  // the story from the title (field bug: an exported story whose AI beat
  // failed with no fallback flipped to 'ended' → surprise restart).
  // `splashDone` flips false→true exactly once, so 'playing'/'ended'/
  // 'error' neither re-run init nor fire the teardown cleanup. Language
  // switches remount via a fresh ASAPSPlayer.init(), so they're unaffected.
  const splashDone = state !== 'splash';
  useEffect(() => {
    if (!splashDone) return;

    let mounted = true;

    const initPlayer = async () => {
      console.log('[WebPlayer] Initializing...', { story: typeof story, enableAI });
      // Tracks the Content-Type when we fetched the story over the
      // network. The magic-byte failure hint at the end keys off this
      // to emit server-config-specific guidance (the most common cause
      // of "not a valid zip" is a static host returning text/html for
      // a missing path).
      let fetchedContentType = '';

      if (!containerRef.current) {
        console.error('[WebPlayer] Container ref not ready');
        return;
      }

      try {
        // Convert story to ArrayBuffer if needed
        let storyData: ArrayBuffer;

        if (story instanceof ArrayBuffer) {
          console.log('[WebPlayer] Story is ArrayBuffer, size:', story.byteLength);
          storyData = story;
        } else if (typeof story === 'string') {
          if (story.startsWith('data:')) {
            // Base64 data URL
            console.log('[WebPlayer] Story is data URL, decoding...');
            const base64 = story.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            storyData = bytes.buffer;
            console.log('[WebPlayer] Decoded to ArrayBuffer, size:', storyData.byteLength);
          } else if (story.startsWith('http') || story.startsWith('/') || story.endsWith('.zip')) {
            // URL - fetch the story.
            //
            // Two failure modes seen in the wild that previously left the
            // spinner spinning forever:
            //   1. The fetch itself hangs (slow CDN / network / server) —
            //      we add a 30s timeout via AbortController so a hang
            //      surfaces as a clear error.
            //   2. The server returns 200 OK but the bytes are NOT a zip
            //      (typical SPA fallback: a 404 returns index.html with
            //      200 status, or the .zip path resolves to an HTML
            //      directory listing). We validate the first 2 bytes
            //      against the ZIP magic 'PK' below — see the post-fetch
            //      check after this if/else block.
            console.log('[WebPlayer] Fetching story from URL:', story);
            const FETCH_TIMEOUT_MS = 30000;
            const abortController = new AbortController();
            const timeoutId = window.setTimeout(
              () => abortController.abort(),
              FETCH_TIMEOUT_MS,
            );
            let response: Response;
            try {
              response = await fetch(story, { signal: abortController.signal });
            } catch (fetchErr) {
              window.clearTimeout(timeoutId);
              if ((fetchErr as Error)?.name === 'AbortError') {
                throw new Error(
                  `Story download timed out after ${FETCH_TIMEOUT_MS / 1000}s. ` +
                    `URL: ${story}. Check that the file is reachable and your server is responsive.`,
                );
              }
              throw fetchErr;
            }
            window.clearTimeout(timeoutId);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch story: HTTP ${response.status}. URL: ${story}. ` +
                  `Make sure '${story}' is present at the same path as your index.html.`,
              );
            }
            // Soft-validate content type — many static hosts mislabel .zip
            // as text/html when serving a soft-404 fallback. Warn but
            // continue; the magic-byte check below is the real gate.
            // Capture the value so the magic-byte failure hint below can
            // include it in the user-visible error.
            fetchedContentType = response.headers.get('content-type') ?? '';
            if (
              fetchedContentType &&
              !fetchedContentType.includes('zip') &&
              !fetchedContentType.includes('octet-stream') &&
              !fetchedContentType.includes('binary')
            ) {
              console.warn(
                `[WebPlayer] Unexpected Content-Type for story fetch: '${fetchedContentType}'. ` +
                  `Expected application/zip or application/octet-stream. ` +
                  `Server may be returning a fallback HTML page instead of the zip.`,
              );
            }
            storyData = await response.arrayBuffer();
            console.log('[WebPlayer] Fetched story, size:', storyData.byteLength);
          } else {
            // Assume raw base64
            console.log('[WebPlayer] Story is raw base64, length:', story.length);
            const binary = atob(story);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            storyData = bytes.buffer;
            console.log('[WebPlayer] Decoded to ArrayBuffer, size:', storyData.byteLength);
          }
        } else {
          throw new Error('Invalid story data type');
        }

        // Validate the storyData starts with the ZIP magic 'PK' (0x50 0x4B).
        // All zip variants begin with these two bytes. If the bytes are
        // something else, we know early that loadStory would fail (or
        // worse, hang) — instead we surface an actionable error.
        //
        // Common causes when this fires for a folder-export deployment:
        //   - server returned an HTML page (404 fallback / directory
        //     index) for a path it couldn't resolve, instead of the zip
        //   - story file is corrupted, partial, or empty
        //   - the file at the URL is not actually a zip
        //
        // Common causes for the data-URL / raw-base64 path:
        //   - the embedded base64 was truncated during HTML serialization
        //   - the source story zip was already broken
        if (storyData.byteLength < 4) {
          throw new Error(
            `Story file is too small (${storyData.byteLength} bytes) to be a valid zip. ` +
              `Check that the file was downloaded completely.`,
          );
        }
        const firstBytes = new Uint8Array(storyData, 0, 4);
        const isZip = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b;
        if (!isZip) {
          // Decode the first 16 bytes to a string so the user can see WHAT
          // came back. If it starts with '<' it's almost certainly an HTML
          // fallback from the server.
          const previewBytes = new Uint8Array(storyData, 0, Math.min(16, storyData.byteLength));
          let preview = '';
          for (let i = 0; i < previewBytes.length; i++) {
            const b = previewBytes[i];
            preview += b >= 32 && b < 127 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`;
          }
          const looksLikeHtml = preview.startsWith('<') || preview.toLowerCase().includes('<!doc');
          const serverReturnedHtml = looksLikeHtml || fetchedContentType.includes('text/html');
          let hint: string;
          if (serverReturnedHtml) {
            const ctNote = fetchedContentType
              ? ` (server reported Content-Type: '${fetchedContentType}')`
              : '';
            hint =
              `Your server returned an HTML page where the story zip was expected${ctNote}. ` +
              `This almost always means the .zip URL didn't resolve and the server fell back to index.html or a 404 page. To fix:\n\n` +
              `  1. Confirm 'story.asaps.zip' is uploaded next to your index.html (same folder, same URL path).\n` +
              `  2. Make sure your host serves .zip files with Content-Type 'application/zip' instead of falling back to HTML for unknown paths.\n\n` +
              `Common host configs:\n` +
              `  • Netlify: add a '_headers' file with '/*.zip\\n  Content-Type: application/zip'\n` +
              `  • Vercel: 'vercel.json' headers entry mapping '\\.zip$' to 'application/zip'\n` +
              `  • Apache: '.htaccess' with 'AddType application/zip .zip'\n` +
              `  • nginx: 'types { application/zip zip; }' in your server block\n` +
              `  • GitHub Pages / S3 static: usually correct by default — re-check the URL path.`;
          } else {
            hint =
              `Expected a zip file starting with 'PK' but got bytes starting with '${preview}'. ` +
              `The file may be corrupted or wasn't a zip to begin with.`;
          }
          throw new Error(`Story is not a valid zip file.\n\n${hint}`);
        }

        if (!mounted) return;

        // Create renderer
        console.log('[WebPlayer] Creating renderer...');
        const rect = containerRef.current.getBoundingClientRect();
        console.log('[WebPlayer] Container rect:', rect.width, 'x', rect.height);
        const context: RenderContext = {
          container: containerRef.current,
          width: rect.width || 1024,
          height: rect.height || 768,
        };
        const renderer = new ReactRenderer(context);
        rendererRef.current = renderer;

        // Configure mobile display mode (cover scaling)
        if (mobileMode) {
          renderer.setMobileMode(true);
        }
        // Font scale is pre-computed by HTML template (> 1.0 on mobile, 1.0 on desktop)
        if (mobileFontScale !== 1.0) {
          renderer.setMobileFontScale(mobileFontScale);
        }

        // Set up AI service if enabled
        if (enableAI) {
          console.log('[WebPlayer] Setting up AI service...');
          const aiService = new WebAIService();
          renderer.setState('aiService', aiService);
        }

        // Set up TTS service if configured
        const ttsService = new WebTTSService();
        if (ttsService.isConfigured()) {
          console.log('[WebPlayer] Setting up TTS service...');
          renderer.setTTSSpeakCallback((text, speaker) => {
            if (ttsService.isEnabled()) {
              ttsService.speak(text, speaker);
            }
          });
          renderer.setTTSStopCallback(() => ttsService.stop());
          // Set TTS language: use explicit language prop (from translation switch),
          // fall back to project config, then default to 'en'
          const ttsLang = language || (window as any).ASAPS_CONFIG?.ttsLanguage || 'en';
          ttsService.setLanguage(ttsLang);
          // Pass TTS service to renderer so ConversationInput can wait for TTS to finish
          renderer.setState('ttsService', ttsService);
        }

        // Set up STT service if available
        const sttService = new WebSTTService();
        if (sttService.isConfigured()) {
          console.log('[WebPlayer] Setting up STT service...');
          const sttLang = language || (window as any).ASAPS_CONFIG?.sttLanguage || 'en-US';
          sttService.setLanguage(sttLang);
          renderer.setState('sttService', sttService);
        }

        // Create player
        console.log('[WebPlayer] Creating player engine...');
        const player = new PlayerEngine({
          container: containerRef.current,
          renderer,
        });
        playerRef.current = player;

        // Load the story
        console.log('[WebPlayer] Loading story...');
        await player.loadStory(storyData);
        console.log('[WebPlayer] Story loaded successfully');

        // Set up stage dimensions
        const stageDimensions = player.getStageDimensions();
        console.log('[WebPlayer] Stage dimensions:', stageDimensions);
        renderer.setStageDimensions(stageDimensions.width, stageDimensions.height);
        setStageDims(stageDimensions);

        // Set up timer state synchronization and fictional time display
        const engine = player.getEngine();
        if (engine) {
          const context = engine.getContext();
          const timerManager = context.getTimerManager();
          const story = engine.getStory();

          // HUD overlay re-render trigger — subscribe to mood / variant
          // events so the screen-docked mood pad refreshes during play.
          const bumpHud = () => setHudTick((t) => t + 1);
          context.on('characterMoodChanged', bumpHud);
          context.on('characterVariantChanged', bumpHud);
          // Counter HUD (screen-docked meter frames) lives in the same
          // overlay — re-render it when counters move.
          context.on('counterChanged', bumpHud);
          // Beat changes flip HUD suppression (title screens are chrome-free),
          // so the overlay must repaint on every transition too.
          context.on('beatChanged', bumpHud);
          context.on('beatChanged', () => {
            const id = context.getCurrentBeatId?.();
            const b: any = id ? (story as any).getBeat?.(id) : null;
            setCurrentBeatMeta(b ? { id: b.id, explainHuds: b.explainHuds, placedMeters: countersPlacedOnBeat((b as any).locations) } : null);
          });

          // Set up global settings for layout and HUD
          const gs = player.getGlobalSettings?.() || (player as any).globalSettings;

          // Install runtime UI strings (translated exports carry a
          // translated globalSettings.uiStrings catalog; source-language
          // exports fall back to the English defaults) and wrap
          // renderLoading so the AI beats' hardcoded loading messages
          // ("Thinking...", "{name} is getting ready to speak...") show
          // in the story's language too — mirrors the Preview Window.
          setUIStrings((gs as any)?.uiStrings);
          if (renderer.renderLoading) {
            const loadingMap = buildLoadingTranslationMap();
            const originalRenderLoading = renderer.renderLoading.bind(renderer);
            renderer.renderLoading = (message: string, opts?: { subMessage?: string; spinnerType?: 'spinner' | 'dots' | 'pulse' }) => {
              originalRenderLoading(translateLoadingMessage(message, loadingMap), {
                ...opts,
                subMessage: opts?.subMessage ? translateLoadingMessage(opts.subMessage, loadingMap) : opts?.subMessage,
              });
            };
          }

          // P2.5 — project orientation policy drives the rotate-device gate.
          const orient = gs?.project?.orientation;
          setOrientationPolicy(
            orient === 'portrait' || orient === 'landscape' ? orient : 'flexible'
          );

          // Note: PlayerEngine.setupResolvers() handles theme (incl. speakerDisplay),
          // character portrait resolver, and asset resolver — no need to duplicate here.

          // Set stage size state (used by DialogTreeBeat for layout)
          renderer.setState('stageSize', {
            width: stageDimensions.width,
            height: stageDimensions.height,
          });

          // Set layout theme from global settings (ensures same layout as visual editor)
          renderer.setState('layoutTheme', {
            fontSize: gs?.fonts?.textFontSize || 16,
            fontFamily: gs?.fonts?.textFont || 'Arial',
            padding: gs?.textbox?.padding || 20,
            maxTextWidthRatio: 0.8,
            maxButtonWidthRatio: 0.6,
            textButtonGap: 20,
            buttonGap: 16,
            startY: 50,
          });
          const hudOverlays = gs?.hudOverlays;
          if (hudOverlays?.timerHud) {
            (renderer as any).setTimerHudConfig?.(hudOverlays.timerHud);
          }
          if (hudOverlays?.countdownMeter) {
            (renderer as any).setCountdownMeterConfig?.(hudOverlays.countdownMeter);
          }
          (renderer as any).setShowHudsOnTitleScreen?.(!!(hudOverlays as any)?.showOnTitleScreen);
          const ftConfig = hudOverlays?.fictionalTime;
          if (ftConfig?.enabled) {
            (renderer as any)._fictionalTimeConfig = ftConfig;
            // Initialize fictional time on context
            if (ftConfig.initialTime) {
              context.setFictionalTime(ftConfig.initialTime);
              if (ftConfig.showInTimerHud) {
                const formatted = context.formatFictionalTime(ftConfig.displayFormat, ftConfig.initialTime);
                (renderer as any).setFictionalTimeText?.(formatted);
              }
            }
            // Listen for fictional time changes and update renderer
            context.on('fictionalTimeChanged', () => {
              const cfg = (renderer as any)?._fictionalTimeConfig;
              if (cfg?.enabled && cfg.showInTimerHud) {
                const formatted = context.formatFictionalTime(cfg.displayFormat, cfg.initialTime);
                (renderer as any).setFictionalTimeText?.(formatted);
              }
            });
          }

          // Handle per-beat time display mode changes and refresh countdown meter
          context.on('beatChanged', ({ beatId }: any) => {
            if (!beatId || !story) return;
            const beat = story.getBeat(beatId);
            if (!beat) return;
            const cfg = (renderer as any)?._fictionalTimeConfig;
            const timeDisplayMode = (beat as any).timeDisplayMode || 'fictionalTime';
            const overrideCountdownMeter = (beat as any).overrideCountdownMeter || false;
            (renderer as any).setOverrideCountdownMeter?.(overrideCountdownMeter);

            // Refresh countdown meter value for the new beat
            updateCountdownMeter();

            if (timeDisplayMode === 'none') {
              (renderer as any).setTimerHudOverrideText?.(undefined);
              (renderer as any).setFictionalTimeText?.(undefined);
            } else if (timeDisplayMode === 'manual') {
              (renderer as any).setTimerHudOverrideText?.((beat as any).timeDisplayText || undefined);
              (renderer as any).setFictionalTimeText?.(undefined);
            } else {
              (renderer as any).setTimerHudOverrideText?.(undefined);
              if (cfg?.enabled && cfg.showInTimerHud) {
                const formatted = context.formatFictionalTime(cfg.displayFormat, cfg.initialTime);
                (renderer as any).setFictionalTimeText?.(formatted);
              }
            }
          });

          // Update timer HUD state for named timers
          const updateTimerHud = () => {
            if (!rendererRef.current) return;
            const hudConfig = (rendererRef.current as any).timerHudConfig;
            if (!hudConfig?.enabled) return;

            const timers = timerManager.getActiveTimers();
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
            let min = meterConfig.counterMin ?? 0;
            let max = meterConfig.counterMax ?? 100;
            // Try to get min/max from character counter definitions
            if (story) {
              const characters = story.getCharacters?.() || [];
              for (const char of characters) {
                const counter = (char as any).counters?.find((c: any) => c.name === counterName);
                if (counter) {
                  min = counter.min ?? min;
                  max = counter.max ?? max;
                  break;
                }
              }
            }
            (rendererRef.current as any).setCountdownMeterValue?.({ value, min, max });
          };

          const updateTimerState = () => {
            if (!rendererRef.current || !story) return;

            const timers = timerManager.getActiveTimers();
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
          };

          timerManager.on('timerStarted', updateTimerState);
          timerManager.on('timerTick', updateTimerState);
          timerManager.on('timerStopped', updateTimerState);

          // Wire timer HUD updates to timer events
          timerManager.on('timerStarted', updateTimerHud);
          timerManager.on('timerTick', updateTimerHud);

          // When timer expires, show 00:00 instead of hiding
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

          // Wire countdown meter updates to counter events
          context.on('counterChanged', updateCountdownMeter);
          updateCountdownMeter();

          // On in-story restart (EndScreen/AISummary → context.reset / selectiveReset),
          // clear stale timer HUD state and restore fictional-time display.
          const onStoryReset = () => {
            if (!rendererRef.current) return;
            (rendererRef.current as any).setTimerHudState?.(undefined);
            (rendererRef.current as any).setTimerHudOverrideText?.(undefined);
            const cfg = (rendererRef.current as any)?._fictionalTimeConfig;
            if (cfg?.enabled && cfg.initialTime) {
              context.setFictionalTime(cfg.initialTime);
              if (cfg.showInTimerHud) {
                const formatted = context.formatFictionalTime(cfg.displayFormat, cfg.initialTime);
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

          // Handle timer expiration - navigate to target beat
          // This is crucial for defaultTarget functionality when timer expires
          timerManager.on('timerExpired', async ({ name, targetBeat }: { name: string; targetBeat?: string }) => {
            if (targetBeat && rendererRef.current && story) {
              console.log(`[WebPlayer] Timer "${name}" expired, navigating to: ${targetBeat}`);
              const beat = story.getBeat(targetBeat);
              if (beat) {
                // Stop the current engine to interrupt any waiting beat
                engine.stop();
                context.markBeatVisited(targetBeat);
                try {
                  // Execute the target beat
                  const nextBeatId = await beat.execute(context, rendererRef.current as any);

                  // Continue with the next beat if there is one
                  if (nextBeatId && nextBeatId !== '__restart__') {
                    // Resume the engine from the next beat
                    await engine.start(nextBeatId);
                  } else if (nextBeatId === '__restart__') {
                    // Handle restart request from EndScreen
                    console.log('[WebPlayer] Restart requested');
                    await engine.start();
                  }
                } catch (error) {
                  console.error('[WebPlayer] Error executing timer target beat:', error);
                }
              }
            }
          });
        }

        if (!mounted) return;

        setState('playing');
        setPlayerReady(true);
        console.log('[WebPlayer] Starting story playback...');

        // Start the story
        player.start().then(() => {
          if (mounted) {
            setState('ended');
            onEnd?.();
          }
        }).catch((err: Error) => {
          if (mounted) {
            console.error('[WebPlayer] Story error:', err);
            setError(err.message);
            setState('error');
            onError?.(err);
          }
        });

      } catch (err) {
        if (mounted) {
          console.error('[WebPlayer] Init error:', err);
          const errorMsg = err instanceof Error ? err.message : 'Failed to load story';
          setError(errorMsg);
          setState('error');
          onError?.(err instanceof Error ? err : new Error(errorMsg));
        }
      }
    };

    initPlayer();

    return () => {
      mounted = false;
      setPlayerReady(false);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.clear();
        rendererRef.current = null;
      }
    };
  }, [splashDone, story, enableAI, mobileMode, mobileFontScale, language, onEnd, onError]);

  // Note: Container resize is handled internally by ScaledStage component
  // via its own ResizeObserver

  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '16px',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    textAlign: 'center',
    padding: '20px',
  };

  // Build the HUD overlay layer for screen-docked moodFrames. Mirrors the
  // PreviewWindow overlay: gates on hasExplicitlySetVariant so the HUD
  // stays hidden until the player picks a variant; reads merged
  // character (variant overlay applied) for name / portrait / color;
  // re-renders on every characterMoodChanged via hudTick.
  /**
   * Screen-docked HUDs, built by the shared builder so the exported player,
   * the preview and the Visual Editor agree on what exists and where it sits.
   * `hudTick` is the re-render dependency: it fires on every affect change,
   * which is when bound meters and mood tokens move.
   */
  const screenHud = (() => {
    void hudTick;
    const player = playerRef.current;
    const ctx = player?.getEngine()?.getContext();
    const story = player?.getEngine()?.getStory();
    if (!ctx || !story || !stageDims) return null;
    const beatNow = (story as any).getBeat?.(ctx.getCurrentBeatId?.());
    const gsNow: any = player?.getGlobalSettings?.() || (player as any)?.globalSettings;
    // Chrome-free beats (title screens by default) show no screen HUDs at all.
    if (beatSuppressesScreenHuds(beatNow?.type, {
      showOnTitleScreen: gsNow?.hudOverlays?.showOnTitleScreen,
    })) return null;

    const chars = (story as any).getCharacters?.() || [];
    const assetsList = (story as any).getAssets?.() || [];
    const placed = countersPlacedOnBeat((beatNow as any)?.locations);

    // A character with unchosen variants has not appeared yet; their HUD would
    // announce someone the interactor has not met.
    const hasExplicitVariant = (c: any): boolean =>
      (c.variants && c.variants.length > 0)
        ? !!(ctx as any).hasExplicitlySetVariant?.(c.id)
        : true;

    const hudChars: ScreenHudCharacter[] = chars.filter(hasExplicitVariant).map((c: any) => {
      const merged: any = (ctx as any).getMergedCharacter?.(c.id) || c;
      const portraitAsset = merged.portrait?.assetId
        ? assetsList.find((a: any) => a.id === merged.portrait.assetId)
        : undefined;
      const scoped = (ctx as any).getCharacterCountersFor?.(c.id) ?? {};
      const visibleCounters = (c.counters || []).filter(
        (k: any) => k.visible && !isCounterPlaced(placed, c.id, k.name),
      );
      return {
        id: c.id,
        name: merged.displayName || merged.name || c.id,
        color: merged.color,
        portraitUrl: portraitAsset?.url || merged.portrait?.image,
        meterFrame: resolveMeterFrame(c as any),
        counters: visibleCounters.map((counter: any) =>
          toMeterCounterData(counter, c.id, ctx as any, scoped, (n: string) => ctx.getCounter?.(n)),
        ),
        inventoryFrame: c.inventoryFrame,
        inventoryItems: (c.inventory || []).map((it: any) => ({
          id: it.id, name: it.name, displayName: it.displayName || it.name,
          description: it.description || '', icon: it.icon || '',
          quantity: it.quantity ?? 1, category: it.category || '',
        })),
        moodFrame: c.moodFrame,
        mood: ctx.getCharacterMood(c.id),
      };
    });

    return {
      layout: buildScreenHudLayout({
        characters: hudChars,
        hudOverlays: gsNow?.hudOverlays,
        stage: stageDims,
      }),
      palette: (story as any).getEmotionPalette?.(),
      beatNow,
      theme: gsNow?.theme,
    };
  })();

  const renderMoodHudOverlay = () => {
    if (!screenHud || !stageDims) return null;
    const { layout, palette, beatNow, theme } = screenHud;
    const showCallouts = (beatNow as any)?.type === 'explanation' || explainOverlayActive;
    return (
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0,
          width: stageDims.width, height: stageDims.height,
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        <ScreenHudLayer
          layout={layout}
          stage={stageDims}
          palette={palette}
          zIndex={0}
          explanation={showCallouts ? {
            captions: (beatNow as any)?.resolvedCaptions ?? (beatNow as any)?.captions,
            skipKinds: (beatNow as any)?.skipKinds,
            onAcknowledge: explainOverlayActive
              ? () => setExplainAcknowledged((m) => ({ ...m, [(beatNow as any).id]: true }))
              : undefined,
            accentColor: theme?.button?.backgroundColor,
            accentTextColor: theme?.button?.textColor,
            textColor: theme?.textBox?.textColor,
            backgroundColor: theme?.textBox?.backgroundColor,
            fontFamily: theme?.fonts?.textFont,
          } : undefined}
        />
      </div>
    );
  };

  // Reserve the packed HUD boxes so stage text is laid out clear of them.
  useEffect(() => {
    (rendererRef.current as any)?.setReservedHudRects?.(screenHud?.layout.rects);
  }, [screenHud]);


  return (
    <OrientationGate orientation={orientationPolicy}>
    <div className="asaps-player" style={containerStyle}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {renderMoodHudOverlay()}
      </div>

      {state === 'splash' && (
        <div style={{
          ...overlayStyle,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          opacity: splashFading ? 0 : 1,
          transition: 'opacity 0.5s ease-out',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
          }}>
            {/* ASAPS Logo/Icon */}
            <div style={{
              width: 80,
              height: 80,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
              animation: 'asaps-pulse 2s ease-in-out infinite',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                <line x1="12" y1="22" x2="12" y2="15.5" />
                <polyline points="22 8.5 12 15.5 2 8.5" />
                <polyline points="2 15.5 12 8.5 22 15.5" />
                <line x1="12" y1="2" x2="12" y2="8.5" />
              </svg>
            </div>
            <div style={{
              fontSize: '14px',
              color: '#a5b4fc',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
              Made with
            </div>
            <div style={{
              fontSize: '32px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '2px',
            }}>
              ASAPS
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6366f1',
              marginTop: '8px',
              opacity: 0.8,
            }}>
              Advanced Story Authoring and Presentation System
            </div>
          </div>
        </div>
      )}

      {state === 'loading' && (
        <div style={overlayStyle}>
          <div className="asaps-spinner" style={{
            width: 48,
            height: 48,
            border: '3px solid #4a4a8a',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'asaps-spin 1s linear infinite',
          }} />
          <div>Loading story...</div>
        </div>
      )}

      {state === 'error' && (
        <div style={overlayStyle}>
          <div style={{
            width: 64,
            height: 64,
            background: '#ff6b6b',
            color: 'white',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 'bold',
          }}>!</div>
          <div style={{ color: '#ff6b6b', maxWidth: 400 }}>
            {error || 'An error occurred'}
          </div>
        </div>
      )}

      {/* Player UI overlay with save/load/settings */}
      {showUI && playerReady && playerRef.current && (
        <PlayerUI
          player={playerRef.current}
          config={{
            showSaveLoad: true,
            showSessionLog,
            showSettings: true,
            showFullscreen: true,
            showPlayTime: true,
            menuPosition: 'top',
          }}
          onSettingsChange={handleSettingsChange}
        />
      )}

      {/* AI Settings button - shown when AI is enabled but NOT when creator embedded the API key */}
      {enableAI && playerReady && !aiStatus.embedded && (
        <button
          onClick={handleAISettings}
          title={aiStatus.configured ? 'AI Configured - Click to change' : 'Configure AI API Key'}
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            background: aiStatus.configured
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            zIndex: 100,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          }}
        >
          {/* AI brain icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
            <path d="M6 10a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4"/>
            <path d="M18 10a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4"/>
            <path d="M12 17v5"/>
            <path d="M8 17l-2 5"/>
            <path d="M16 17l2 5"/>
            {aiStatus.configured && <circle cx="19" cy="5" r="3" fill="#10b981" stroke="white"/>}
          </svg>
        </button>
      )}

      <style>{`
        @keyframes asaps-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes asaps-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
    </OrientationGate>
  );
};
