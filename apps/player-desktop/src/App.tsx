import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PlayerEngine, PlayerUI } from '@asaps/player';
import { ReactRenderer, type RenderContext } from '@asaps/renderer';

type AppState = 'library' | 'loading' | 'playing' | 'error';

interface RecentStory {
  path: string;
  title: string;
  lastPlayed: Date;
  thumbnail?: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('library');
  const [error, setError] = useState<string | null>(null);
  const [recentStories, setRecentStories] = useState<RecentStory[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerEngine | null>(null);
  const rendererRef = useRef<ReactRenderer | null>(null);

  // Load recent stories from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('asaps-recent-stories');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRecentStories(parsed.map((s: RecentStory) => ({
          ...s,
          lastPlayed: new Date(s.lastPlayed),
        })));
      } catch (e) {
        console.warn('Failed to load recent stories:', e);
      }
    }
  }, []);

  // Save recent stories to localStorage
  const addRecentStory = useCallback((story: RecentStory) => {
    setRecentStories(prev => {
      const filtered = prev.filter(s => s.path !== story.path);
      const updated = [story, ...filtered].slice(0, 10); // Keep last 10
      localStorage.setItem('asaps-recent-stories', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Store pending story data while loading
  const pendingStoryRef = useRef<{ data: File | ArrayBuffer; title: string } | null>(null);

  const openStory = useCallback(async (data: File | ArrayBuffer, title: string = 'Story') => {
    try {
      setAppState('loading');
      setError(null);

      // Clean up previous player
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.clear();
        rendererRef.current = null;
      }

      // Store the data and transition to playing state
      // The actual loading will happen in useEffect when container is visible
      pendingStoryRef.current = { data, title };
      setAppState('playing');
    } catch (err) {
      console.error('Failed to open story:', err);
      setError(err instanceof Error ? err.message : 'Failed to open story');
      setAppState('error');
    }
  }, []);

  // Load story when we transition to playing state with pending data
  useEffect(() => {
    if (appState !== 'playing' || !pendingStoryRef.current || !containerRef.current) {
      return;
    }

    const { data, title } = pendingStoryRef.current;
    pendingStoryRef.current = null;

    // Use requestAnimationFrame to ensure DOM has updated and container is visible
    requestAnimationFrame(() => {
      const loadStory = async () => {
        if (!containerRef.current) return;

        try {
          // Now the container is visible, create renderer and player
          const rect = containerRef.current.getBoundingClientRect();
          console.log('[App] Container rect:', rect);

          const context: RenderContext = {
            container: containerRef.current,
            width: rect.width || 1280,
            height: rect.height || 720,
          };
          const renderer = new ReactRenderer(context);
          rendererRef.current = renderer;

          const player = new PlayerEngine({
            container: containerRef.current,
            renderer,
          });
          playerRef.current = player;

          // Load the story
          console.log('[App] Loading story...');
          await player.loadStory(data);
          console.log('[App] Story loaded, starting...');

          // Update renderer with story's stage dimensions
          const stageDimensions = player.getStageDimensions();
          console.log('[App] Stage dimensions from story:', stageDimensions);
          renderer.setStageDimensions(stageDimensions.width, stageDimensions.height);

          // Start the story (don't await - it runs until story ends)
          player.start().catch(err => {
            console.error('Story execution error:', err);
            setError(err instanceof Error ? err.message : 'Story execution failed');
            setAppState('error');
          });

          // Add to recent stories
          addRecentStory({
            path: data instanceof File ? data.name : 'story.asaps.zip',
            title,
            lastPlayed: new Date(),
          });
        } catch (err) {
          console.error('Failed to load story:', err);
          setError(err instanceof Error ? err.message : 'Failed to load story');
          setAppState('error');
        }
      };

      loadStory();
    });
  }, [appState, addRecentStory]);

  const handleOpenFile = useCallback(async () => {
    // Check if we're in Tauri environment
    if (window.__TAURI__) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readFile } = await import('@tauri-apps/plugin-fs');

        const selected = await open({
          multiple: false,
          filters: [{
            name: 'ASAPS Story',
            extensions: ['zip', 'asaps'],
          }],
        });

        if (selected) {
          const filePath = typeof selected === 'string' ? selected : selected[0];
          const uint8Array = await readFile(filePath);
          // Convert Uint8Array to ArrayBuffer
          const arrayBuffer = uint8Array.buffer.slice(
            uint8Array.byteOffset,
            uint8Array.byteOffset + uint8Array.byteLength
          );
          await openStory(arrayBuffer, filePath.split('/').pop() || 'Story');
        }
      } catch (err) {
        console.error('Tauri file open failed:', err);
        setError('Failed to open file dialog');
      }
    } else {
      // Web fallback - use file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,.asaps,.asaps.zip';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          await openStory(file, file.name);
        }
      };
      input.click();
    }
  }, [openStory]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.zip') || file.name.endsWith('.asaps'))) {
      await openStory(file, file.name);
    }
  }, [openStory]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleBack = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
    if (rendererRef.current) {
      rendererRef.current.clear();
      rendererRef.current = null;
    }
    setAppState('library');
    setError(null);
  }, []);

  return (
    <div className="app-container">
      {appState === 'library' && (
        <div className="library-view">
          <div className="library-header">
            <h1>ASAPS Player</h1>
            <button className="button button-primary" onClick={handleOpenFile}>
              Open Story
            </button>
          </div>

          <div
            className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleOpenFile}
          >
            <div className="drop-zone-icon">📖</div>
            <div className="drop-zone-text">
              Drop a story file here or click to browse
            </div>
          </div>

          {recentStories.length > 0 && (
            <>
              <h2 style={{ marginTop: 24, marginBottom: 16 }}>Recent Stories</h2>
              <div className="library-grid">
                {recentStories.map((story, index) => (
                  <div
                    key={index}
                    className="story-card"
                    onClick={() => {
                      // For recent stories, we'd need to re-open from the path
                      // This is a placeholder - in Tauri we'd use the filesystem
                      handleOpenFile();
                    }}
                  >
                    {story.thumbnail ? (
                      <img
                        src={story.thumbnail}
                        alt=""
                        className="story-card-thumbnail"
                      />
                    ) : (
                      <div className="story-card-thumbnail" />
                    )}
                    <div className="story-card-title">{story.title}</div>
                    <div className="story-card-meta">
                      {story.lastPlayed.toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
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
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div>{error || 'An error occurred'}</div>
          <button className="button" onClick={handleBack}>
            Back to Library
          </button>
        </div>
      )}

      {/* Player container - always mounted to preserve renderer root */}
      <div
        className="player-view"
        style={{ display: appState === 'playing' ? 'flex' : 'none' }}
      >
        <button className="back-button" onClick={handleBack}>
          ← Back
        </button>
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
