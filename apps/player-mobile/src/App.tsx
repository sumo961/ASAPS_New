import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PlayerEngine } from '@asaps/player';
import { ReactRenderer, type RenderContext } from '@asaps/renderer';
import type { SaveSlot } from '@asaps/player';
import { MobileSaveAdapter } from './storage/MobileSaveAdapter';

type AppState = 'library' | 'loading' | 'playing' | 'error';
type MenuPanel = 'none' | 'main' | 'save' | 'load' | 'settings';

interface RecentStory {
  name: string;
  lastPlayed: Date;
  thumbnail?: string;
}

interface Settings {
  masterVolume: number;
  textSpeed: number;
  haptics: boolean;
  autoAdvance: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 100,
  textSpeed: 50,
  haptics: true,
  autoAdvance: false,
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('library');
  const [menuPanel, setMenuPanel] = useState<MenuPanel>('none');
  const [error, setError] = useState<string | null>(null);
  const [recentStories, setRecentStories] = useState<RecentStory[]>([]);
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [autoSave, setAutoSave] = useState<SaveSlot | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerEngine | null>(null);
  const rendererRef = useRef<ReactRenderer | null>(null);
  const saveAdapterRef = useRef<MobileSaveAdapter | null>(null);

  // Fix viewport height on mobile (accounts for browser chrome)
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize', setVH);
    return () => window.removeEventListener('resize', setVH);
  }, []);

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const result = await Preferences.get({ key: 'asaps-settings' });
        if (result.value) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(result.value) });
        }
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    };
    loadSettings();
  }, []);

  // Save settings when they change
  useEffect(() => {
    const saveSettings = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({
          key: 'asaps-settings',
          value: JSON.stringify(settings),
        });
      } catch (e) {
        console.warn('Failed to save settings:', e);
      }
    };
    saveSettings();
  }, [settings]);

  // Load recent stories
  useEffect(() => {
    const loadRecent = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const result = await Preferences.get({ key: 'asaps-recent' });
        if (result.value) {
          const stories = JSON.parse(result.value);
          setRecentStories(stories.map((s: RecentStory) => ({
            ...s,
            lastPlayed: new Date(s.lastPlayed),
          })));
        }
      } catch (e) {
        console.warn('Failed to load recent stories:', e);
      }
    };
    loadRecent();
  }, []);

  // Haptic feedback helper
  const haptic = useCallback(async (style: ImpactStyle = ImpactStyle.Light) => {
    if (settings.haptics && Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style });
      } catch {
        // Ignore haptic errors
      }
    }
  }, [settings.haptics]);

  const openStory = useCallback(async (data: File | ArrayBuffer, title: string = 'Story') => {
    if (!containerRef.current) return;

    try {
      setAppState('loading');
      setError(null);
      await haptic(ImpactStyle.Medium);

      // Clean up previous player
      if (playerRef.current) {
        playerRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.clear();
      }

      // Create save adapter
      const saveAdapter = new MobileSaveAdapter();
      saveAdapterRef.current = saveAdapter;

      // Create renderer
      const rect = containerRef.current.getBoundingClientRect();
      const context: RenderContext = {
        container: containerRef.current,
        width: rect.width || window.innerWidth,
        height: rect.height || window.innerHeight,
      };
      const renderer = new ReactRenderer(context);
      rendererRef.current = renderer;

      // Create player
      const player = new PlayerEngine({
        container: containerRef.current,
        renderer,
        saveAdapter,
      });
      playerRef.current = player;

      // Load and start
      await player.loadStory(data);
      await player.start();

      setAppState('playing');
      await haptic(ImpactStyle.Heavy);

      // Update recent stories
      const newRecent: RecentStory = {
        name: title,
        lastPlayed: new Date(),
      };
      setRecentStories(prev => {
        const filtered = prev.filter(s => s.name !== title);
        const updated = [newRecent, ...filtered].slice(0, 10);

        // Save to preferences
        import('@capacitor/preferences').then(({ Preferences }) => {
          Preferences.set({
            key: 'asaps-recent',
            value: JSON.stringify(updated),
          });
        });

        return updated;
      });
    } catch (err) {
      console.error('Failed to open story:', err);
      setError(err instanceof Error ? err.message : 'Failed to open story');
      setAppState('error');
    }
  }, [haptic]);

  const handleImport = useCallback(async () => {
    await haptic();

    // Use file input for importing
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.asaps,.asaps.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await openStory(file, file.name.replace(/\.(asaps\.)?zip$/, ''));
      }
    };
    input.click();
  }, [openStory, haptic]);

  const handleBack = useCallback(async () => {
    await haptic();

    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
    if (rendererRef.current) {
      rendererRef.current.clear();
      rendererRef.current = null;
    }
    setMenuPanel('none');
    setAppState('library');
    setError(null);
  }, [haptic]);

  const openMenu = useCallback(async (panel: MenuPanel) => {
    await haptic();
    setMenuPanel(panel);

    // Load saves when opening save/load panel
    if ((panel === 'save' || panel === 'load') && playerRef.current) {
      const slots = await playerRef.current.getSaveSlots();
      setSaveSlots(slots);
      const auto = await playerRef.current.getSaveSystem()?.getAutoSave() || null;
      setAutoSave(auto);
    }
  }, [haptic]);

  const handleSave = useCallback(async (slotId: number) => {
    if (!playerRef.current) return;
    await haptic(ImpactStyle.Medium);

    try {
      await playerRef.current.saveToSlot(slotId);
      const slots = await playerRef.current.getSaveSlots();
      setSaveSlots(slots);
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [haptic]);

  const handleLoad = useCallback(async (slotId: number) => {
    if (!playerRef.current) return;
    await haptic(ImpactStyle.Medium);

    try {
      await playerRef.current.resumeFromSave(slotId);
      setMenuPanel('none');
    } catch (err) {
      console.error('Load failed:', err);
    }
  }, [haptic]);

  const handleLoadAutoSave = useCallback(async () => {
    if (!playerRef.current) return;
    await haptic(ImpactStyle.Medium);

    try {
      await playerRef.current.resumeFromAutoSave();
      setMenuPanel('none');
    } catch (err) {
      console.error('Load auto-save failed:', err);
    }
  }, [haptic]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app-container">
      {/* Library View */}
      {appState === 'library' && (
        <div className="library-view">
          <div className="library-header">
            <h1>ASAPS Player</h1>
          </div>

          <div className="import-area" onClick={handleImport}>
            <div className="import-icon">📖</div>
            <div className="import-text">Tap to open a story</div>
          </div>

          {recentStories.length > 0 && (
            <>
              <h2 style={{ marginBottom: 12, fontSize: 16 }}>Recent</h2>
              <div className="story-grid">
                {recentStories.map((story, index) => (
                  <div
                    key={index}
                    className="story-card"
                    onClick={handleImport}
                  >
                    {story.thumbnail ? (
                      <img src={story.thumbnail} alt="" className="story-card-thumbnail" />
                    ) : (
                      <div className="story-card-thumbnail" />
                    )}
                    <div className="story-card-title">{story.name}</div>
                    <div className="story-card-meta">
                      {formatDate(story.lastPlayed)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading Screen */}
      {appState === 'loading' && (
        <div className="loading-screen">
          <div className="spinner" />
          <div>Loading story...</div>
        </div>
      )}

      {/* Error Screen */}
      {appState === 'error' && (
        <div className="error-screen">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error || 'An error occurred'}</div>
          <button className="button" onClick={handleBack}>
            Back
          </button>
        </div>
      )}

      {/* Player View */}
      {appState === 'playing' && (
        <div className="player-view">
          {/* Mobile Menu Bar */}
          <div className="mobile-menu">
            <button className="menu-button" onClick={handleBack}>
              ←
            </button>
            <button className="menu-button" onClick={() => openMenu('main')}>
              ☰
            </button>
          </div>

          {/* Player Container */}
          <div ref={containerRef} className="player-container" />

          {/* Menu Panel */}
          {menuPanel !== 'none' && (
            <div className="menu-panel">
              <div className="menu-panel-header">
                <span className="menu-panel-title">
                  {menuPanel === 'main' && 'Menu'}
                  {menuPanel === 'save' && 'Save Game'}
                  {menuPanel === 'load' && 'Load Game'}
                  {menuPanel === 'settings' && 'Settings'}
                </span>
                <button
                  className="menu-button"
                  onClick={() => setMenuPanel(menuPanel === 'main' ? 'none' : 'main')}
                >
                  ✕
                </button>
              </div>

              <div className="menu-list">
                {/* Main Menu */}
                {menuPanel === 'main' && (
                  <>
                    <div className="menu-item" onClick={() => openMenu('save')}>
                      <span className="menu-item-icon">💾</span>
                      <div className="menu-item-text">
                        <div className="menu-item-title">Save Game</div>
                        <div className="menu-item-subtitle">Save your progress</div>
                      </div>
                    </div>
                    <div className="menu-item" onClick={() => openMenu('load')}>
                      <span className="menu-item-icon">📂</span>
                      <div className="menu-item-text">
                        <div className="menu-item-title">Load Game</div>
                        <div className="menu-item-subtitle">Resume from a save</div>
                      </div>
                    </div>
                    <div className="menu-item" onClick={() => openMenu('settings')}>
                      <span className="menu-item-icon">⚙️</span>
                      <div className="menu-item-text">
                        <div className="menu-item-title">Settings</div>
                        <div className="menu-item-subtitle">Adjust preferences</div>
                      </div>
                    </div>
                    <div className="menu-item" onClick={handleBack}>
                      <span className="menu-item-icon">🏠</span>
                      <div className="menu-item-text">
                        <div className="menu-item-title">Exit Story</div>
                        <div className="menu-item-subtitle">Return to library</div>
                      </div>
                    </div>
                  </>
                )}

                {/* Save Panel */}
                {menuPanel === 'save' && (
                  <>
                    {Array.from({ length: 6 }, (_, i) => {
                      const slot = saveSlots.find(s => s.slotId === i);
                      return (
                        <div
                          key={i}
                          className="save-slot"
                          onClick={() => handleSave(i)}
                        >
                          {slot?.thumbnail ? (
                            <img src={slot.thumbnail} alt="" className="save-slot-thumbnail" />
                          ) : (
                            <div className="save-slot-thumbnail" />
                          )}
                          <div className="save-slot-info">
                            <div className="save-slot-title">
                              {slot ? `Slot ${i + 1}` : `Empty Slot ${i + 1}`}
                            </div>
                            {slot && (
                              <div className="save-slot-meta">
                                {formatDate(slot.timestamp)} · {formatTime(slot.playTime)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Load Panel */}
                {menuPanel === 'load' && (
                  <>
                    {autoSave && (
                      <div
                        className="save-slot"
                        style={{ borderLeft: '3px solid #6366f1' }}
                        onClick={handleLoadAutoSave}
                      >
                        {autoSave.thumbnail ? (
                          <img src={autoSave.thumbnail} alt="" className="save-slot-thumbnail" />
                        ) : (
                          <div className="save-slot-thumbnail" />
                        )}
                        <div className="save-slot-info">
                          <div className="save-slot-title">Auto-Save</div>
                          <div className="save-slot-meta">
                            {formatDate(autoSave.timestamp)} · {formatTime(autoSave.playTime)}
                          </div>
                        </div>
                      </div>
                    )}
                    {saveSlots.map(slot => (
                      <div
                        key={slot.slotId}
                        className="save-slot"
                        onClick={() => handleLoad(slot.slotId)}
                      >
                        {slot.thumbnail ? (
                          <img src={slot.thumbnail} alt="" className="save-slot-thumbnail" />
                        ) : (
                          <div className="save-slot-thumbnail" />
                        )}
                        <div className="save-slot-info">
                          <div className="save-slot-title">Slot {slot.slotId + 1}</div>
                          <div className="save-slot-meta">
                            {formatDate(slot.timestamp)} · {formatTime(slot.playTime)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {saveSlots.length === 0 && !autoSave && (
                      <div style={{ textAlign: 'center', padding: 20, opacity: 0.7 }}>
                        No saves found
                      </div>
                    )}
                  </>
                )}

                {/* Settings Panel */}
                {menuPanel === 'settings' && (
                  <>
                    <div className="settings-group">
                      <label className="settings-label">
                        Volume: {settings.masterVolume}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.masterVolume}
                        onChange={(e) => setSettings(s => ({ ...s, masterVolume: Number(e.target.value) }))}
                        className="settings-slider"
                      />
                    </div>

                    <div className="settings-group">
                      <label className="settings-label">
                        Text Speed: {settings.textSpeed === 100 ? 'Instant' : `${settings.textSpeed}%`}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.textSpeed}
                        onChange={(e) => setSettings(s => ({ ...s, textSpeed: Number(e.target.value) }))}
                        className="settings-slider"
                      />
                    </div>

                    <div className="settings-toggle" onClick={() => setSettings(s => ({ ...s, haptics: !s.haptics }))}>
                      <span>Haptic Feedback</span>
                      <div className={`toggle-switch ${settings.haptics ? 'active' : ''}`} />
                    </div>

                    <div className="settings-toggle" onClick={() => setSettings(s => ({ ...s, autoAdvance: !s.autoAdvance }))}>
                      <span>Auto-advance Text</span>
                      <div className={`toggle-switch ${settings.autoAdvance ? 'active' : ''}`} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden container when not playing */}
      {appState !== 'playing' && (
        <div ref={containerRef} style={{ display: 'none' }} />
      )}
    </div>
  );
};

export default App;
