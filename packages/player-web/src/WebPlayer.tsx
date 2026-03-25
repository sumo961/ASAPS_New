/**
 * WebPlayer - Simplified player component for HTML export
 * Self-contained player that can be embedded in any webpage
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PlayerEngine, PlayerUI, type PlayerSettings } from '@asaps/player';
import { ReactRenderer, type RenderContext } from '@asaps/renderer';
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

  useEffect(() => {
    // Don't initialize until splash is done
    if (state === 'splash') return;

    let mounted = true;

    const initPlayer = async () => {
      console.log('[WebPlayer] Initializing...', { story: typeof story, enableAI });

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
            // URL - fetch the story
            console.log('[WebPlayer] Fetching story from URL:', story);
            const response = await fetch(story);
            if (!response.ok) {
              throw new Error(`Failed to fetch story: ${response.status}`);
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

        // Set up timer state synchronization and fictional time display
        const engine = player.getEngine();
        if (engine) {
          const context = engine.getContext();
          const timerManager = context.getTimerManager();
          const story = engine.getStory();

          // Set up global settings for layout and HUD
          const gs = player.getGlobalSettings?.() || (player as any).globalSettings;

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
  }, [state, story, enableAI, mobileMode, mobileFontScale, language, onEnd, onError]);

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

  return (
    <div className="asaps-player" style={containerStyle}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

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
  );
};
