import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayerEngine, PlayerUI } from '@asaps/player';
import { ReactRenderer, type RenderContext } from '@asaps/renderer';
import { SettingsModal } from './components/SettingsModal';
import { DesktopAIService } from './services/AIService';
import { LocalLLMService } from './services/LocalLLMProvider';
import { loadAISettings, type AISettings } from './services/AIConfig';

type AppState = 'scanning' | 'selecting' | 'loading' | 'playing' | 'error';

interface StoryFile {
  path: string;
  name: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('scanning');
  const [error, setError] = useState<string | null>(null);
  const [storyFiles, setStoryFiles] = useState<StoryFile[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [aiSettings, setAISettings] = useState<AISettings | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerEngine | null>(null);
  const rendererRef = useRef<ReactRenderer | null>(null);

  // Load AI settings on startup
  useEffect(() => {
    loadAISettings().then(setAISettings);
  }, []);

  // Create AI service based on settings
  const createAIService = useCallback((settings: AISettings) => {
    if (settings.provider === 'local') {
      return new LocalLLMService(settings.localModelId || 'gemma-3-4b');
    } else if (settings.apiKey) {
      return new DesktopAIService(settings);
    }
    return null;
  }, []);

  // Update AI service when settings change
  const handleSettingsChange = useCallback((settings: AISettings) => {
    setAISettings(settings);
    // Update the AI service on the current renderer if playing
    if (rendererRef.current) {
      const aiService = createAIService(settings);
      if (aiService) {
        rendererRef.current.setState('aiService', aiService);
      }
    }
  }, [createAIService]);

  // Scan for story files on startup
  useEffect(() => {
    const scanForStories = async () => {
      if (!window.__TAURI__) {
        setError('This player requires the Tauri desktop environment');
        setAppState('error');
        return;
      }

      try {
        const { readDir } = await import('@tauri-apps/plugin-fs');
        const { invoke } = await import('@tauri-apps/api/core');

        // Try multiple directories to find stories
        let stories: StoryFile[] = [];

        // Get all search directories from Tauri backend
        // On macOS .app bundles: containing folder, MacOS folder, Resources folder
        // Also includes working directory for dev/testing
        const dirsToTry: string[] = [];

        try {
          const searchDirs = await invoke<string[]>('get_search_directories');
          console.log('[App] Search directories from backend:', searchDirs);
          dirsToTry.push(...searchDirs);
        } catch (e) {
          console.log('[App] Could not get search directories:', e);
          // Fallback to old method
          try {
            const exeDir = await invoke<string>('get_executable_directory');
            dirsToTry.push(exeDir);
          } catch { /* ignore */ }
        }

        try {
          const workDir = await invoke<string>('get_working_directory');
          console.log('[App] Working directory:', workDir);
          // Only add if not already in list
          if (!dirsToTry.includes(workDir)) {
            dirsToTry.push(workDir);
          }
        } catch (e) {
          console.log('[App] Could not get working directory:', e);
        }

        console.log('[App] Directories to scan:', dirsToTry);

        // Scan each directory for stories
        for (const dir of dirsToTry) {
          try {
            console.log('[App] Scanning:', dir);
            const entries = await readDir(dir);

            for (const entry of entries) {
              if (entry.isFile && entry.name) {
                const name = entry.name.toLowerCase();
                if (name.endsWith('.asaps.zip') || name.endsWith('.asaps') ||
                    (name.endsWith('.zip') && !name.includes('player'))) {
                  stories.push({
                    path: `${dir}/${entry.name}`,
                    name: entry.name,
                  });
                  // Found story in: dir
                }
              }
            }

            if (stories.length > 0) {
              console.log('[App] Found stories in:', dir);
              break; // Stop at first directory with stories
            }
          } catch (e) {
            console.log('[App] Could not scan', dir, ':', e);
          }
        }

        console.log('[App] Found stories:', stories);

        if (stories.length === 0) {
          const scannedDirs = dirsToTry.join('\n');
          setError(`No story files found.\n\nScanned directories:\n${scannedDirs}\n\nPlace a .asaps.zip file next to the player.`);
          setAppState('error');
        } else if (stories.length === 1) {
          // Auto-play single story
          await loadAndPlayStory(stories[0]);
        } else {
          // Multiple stories - let user choose
          setStoryFiles(stories);
          setAppState('selecting');
        }
      } catch (err) {
        console.error('Failed to scan for stories:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Failed to scan for stories:\n\n${errorMsg}`);
        setAppState('error');
      }
    };

    scanForStories();
  }, []);

  const loadAndPlayStory = async (story: StoryFile) => {
    setAppState('loading');
    setError(null);

    // Wait for container to be available
    await new Promise(resolve => requestAnimationFrame(resolve));

    if (!containerRef.current) {
      setError('Player container not ready');
      setAppState('error');
      return;
    }

    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const { invoke } = await import('@tauri-apps/api/core');

      console.log('[App] Loading story:', story.path);
      const uint8Array = await readFile(story.path);
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset,
        uint8Array.byteOffset + uint8Array.byteLength
      );

      // Create renderer
      const rect = containerRef.current.getBoundingClientRect();
      const context: RenderContext = {
        container: containerRef.current,
        width: rect.width || 1280,
        height: rect.height || 720,
      };
      const renderer = new ReactRenderer(context);
      rendererRef.current = renderer;

      // Set up AI service if configured
      if (aiSettings) {
        const aiService = createAIService(aiSettings);
        if (aiService) {
          renderer.setState('aiService', aiService);
        }
      }

      // Create player
      const player = new PlayerEngine({
        container: containerRef.current,
        renderer,
      });
      playerRef.current = player;

      // Load the story
      await player.loadStory(arrayBuffer);

      // Update renderer with story's stage dimensions
      const stageDimensions = player.getStageDimensions();
      console.log('[App] Stage dimensions:', stageDimensions);
      renderer.setStageDimensions(stageDimensions.width, stageDimensions.height);

      // Resize window to match stage dimensions
      try {
        await invoke('resize_window', {
          width: stageDimensions.width,
          height: stageDimensions.height
        });
        console.log('[App] Window resized to:', stageDimensions);
      } catch (e) {
        console.warn('[App] Could not resize window:', e);
      }

      setAppState('playing');

      // Start the story
      player.start().catch(err => {
        console.error('Story execution error:', err);
        setError(err instanceof Error ? err.message : 'Story execution failed');
        setAppState('error');
      });

    } catch (err) {
      console.error('Failed to load story:', err);
      setError(err instanceof Error ? err.message : 'Failed to load story');
      setAppState('error');
    }
  };

  const handleSelectStory = (story: StoryFile) => {
    loadAndPlayStory(story);
  };

  const handleRetry = () => {
    // Cleanup
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
    if (rendererRef.current) {
      rendererRef.current.clear();
      rendererRef.current = null;
    }
    // Rescan
    setAppState('scanning');
    setError(null);
    window.location.reload();
  };

  return (
    <div className="app-container">
      {/* Settings button - shown on all screens */}
      <button
        className="settings-trigger"
        onClick={() => setShowSettings(true)}
        title="Settings"
      >
        ⚙️
      </button>

      {/* Settings modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsChange={handleSettingsChange}
      />

      {appState === 'scanning' && (
        <div className="loading-screen">
          <div className="spinner" />
          <div>Scanning for stories...</div>
        </div>
      )}

      {appState === 'selecting' && (
        <div className="selection-screen">
          <h1>Select a Story</h1>
          <p className="selection-hint">Multiple story files found. Choose one to play:</p>
          <div className="story-list">
            {storyFiles.map((story, index) => (
              <button
                key={index}
                className="story-button"
                onClick={() => handleSelectStory(story)}
              >
                {story.name.replace(/\.(asaps\.zip|asaps|zip)$/i, '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {appState === 'loading' && (
        <div className="loading-screen">
          <div className="spinner" />
          <div>Loading story...</div>
        </div>
      )}

      {appState === 'error' && (
        <div className="error-screen">
          <div className="error-icon">!</div>
          <div className="error-message">{error || 'An error occurred'}</div>
          <button className="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Player container - always mounted but hidden when not playing */}
      <div
        className="player-view"
        style={{ display: appState === 'playing' || appState === 'loading' ? 'block' : 'none' }}
      >
        <div ref={containerRef} className="player-container" />
        {playerRef.current && <PlayerUI player={playerRef.current} />}
      </div>
    </div>
  );
};

// Declare Tauri global
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export default App;
