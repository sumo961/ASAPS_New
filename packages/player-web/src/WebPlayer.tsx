/**
 * WebPlayer - Simplified player component for HTML export
 * Self-contained player that can be embedded in any webpage
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PlayerEngine, PlayerUI, type PlayerSettings } from '@asaps/player';
import { ReactRenderer, type RenderContext } from '@asaps/renderer';
import { WebAIService } from './WebAIProvider';

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

  // Handle settings changes from PlayerUI
  const handleSettingsChange = useCallback((settings: PlayerSettings) => {
    if (playerRef.current) {
      // Apply mute state
      playerRef.current.setMuted(settings.muted);
      // Apply master volume
      playerRef.current.setMasterVolume(settings.masterVolume);
    }
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

        // Set up AI service if enabled
        if (enableAI) {
          console.log('[WebPlayer] Setting up AI service...');
          const aiService = new WebAIService();
          renderer.setState('aiService', aiService);
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

        // Set up timer state synchronization for default target countdown display
        const engine = player.getEngine();
        if (engine) {
          const context = engine.getContext();
          const timerManager = context.getTimerManager();
          const story = engine.getStory();

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
  }, [state, story, enableAI, onEnd, onError]);

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
            showSettings: true,
            showFullscreen: true,
            showPlayTime: true,
            menuPosition: 'top',
          }}
          onSettingsChange={handleSettingsChange}
        />
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
