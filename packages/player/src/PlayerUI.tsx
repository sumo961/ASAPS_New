import React, { useState, useEffect, useCallback } from 'react';
import type { PlayerEngine } from './PlayerEngine';
import type { SaveSlot } from './SaveSystem';

/**
 * Player UI configuration
 */
export interface PlayerUIConfig {
  /** Show save/load buttons */
  showSaveLoad?: boolean;
  /** Show settings button */
  showSettings?: boolean;
  /** Show fullscreen button */
  showFullscreen?: boolean;
  /** Show play time */
  showPlayTime?: boolean;
  /** Custom CSS class for the UI container */
  className?: string;
  /** Position of the menu bar */
  menuPosition?: 'top' | 'bottom';
}

/**
 * Player settings state
 */
export interface PlayerSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  textSpeed: number; // 0-100, where 100 is instant
  autoAdvance: boolean;
  autoAdvanceDelay: number; // seconds
}

const DEFAULT_SETTINGS: PlayerSettings = {
  masterVolume: 100,
  musicVolume: 100,
  sfxVolume: 100,
  textSpeed: 50,
  autoAdvance: false,
  autoAdvanceDelay: 3,
};

interface PlayerUIProps {
  player: PlayerEngine;
  config?: PlayerUIConfig;
  onSettingsChange?: (settings: PlayerSettings) => void;
}

/**
 * PlayerUI provides an overlay UI for the standalone player
 * Includes save/load menu, settings, and controls
 */
export const PlayerUI: React.FC<PlayerUIProps> = ({
  player,
  config = {},
  onSettingsChange,
}) => {
  const {
    showSaveLoad = true,
    showSettings = true,
    showFullscreen = true,
    showPlayTime = true,
    className = '',
    menuPosition = 'top',
  } = config;

  // UI state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'none' | 'save' | 'load' | 'settings'>('none');
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [autoSave, setAutoSave] = useState<SaveSlot | null>(null);
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [playTime, setPlayTime] = useState('0:00');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('asaps-player-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.warn('Failed to load player settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('asaps-player-settings', JSON.stringify(settings));
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  // Update play time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPlayTime(player.getPlayTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [player]);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Load save slots when save/load panel opens
  const loadSaveSlots = useCallback(async () => {
    const slots = await player.getSaveSlots();
    setSaveSlots(slots);
    const auto = await player.getSaveSystem()?.getAutoSave() || null;
    setAutoSave(auto);
  }, [player]);

  useEffect(() => {
    if (activePanel === 'save' || activePanel === 'load') {
      loadSaveSlots();
    }
  }, [activePanel, loadSaveSlots]);

  // Handlers
  const handleSaveToSlot = async (slotId: number) => {
    try {
      await player.saveToSlot(slotId);
      await loadSaveSlots();
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleLoadFromSlot = async (slotId: number) => {
    try {
      await player.resumeFromSave(slotId);
      setActivePanel('none');
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Failed to load:', error);
    }
  };

  const handleLoadAutoSave = async () => {
    try {
      await player.resumeFromAutoSave();
      setActivePanel('none');
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Failed to load auto-save:', error);
    }
  };

  const handleDeleteSlot = async (slotId: number) => {
    try {
      await player.deleteSaveSlot(slotId);
      await loadSaveSlots();
    } catch (error) {
      console.error('Failed to delete save:', error);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const handlePauseResume = async () => {
    if (player.isPaused()) {
      await player.resume();
      setIsPaused(false);
    } else {
      player.pause();
      setIsPaused(true);
    }
  };

  const handleRestart = async () => {
    if (confirm('Are you sure you want to restart? Unsaved progress will be lost.')) {
      await player.restart();
      setActivePanel('none');
      setIsMenuOpen(false);
    }
  };

  const updateSetting = <K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatPlayTimeFromSeconds = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Styles
  const styles = {
    container: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none' as const,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 1000,
    },
    menuBar: {
      position: 'absolute' as const,
      [menuPosition]: 0,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 16px',
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0))',
      pointerEvents: isMenuOpen ? 'auto' as const : 'none' as const,
      opacity: isMenuOpen ? 1 : 0,
      transition: 'opacity 0.3s ease',
    },
    menuButton: {
      position: 'absolute' as const,
      [menuPosition]: '8px',
      right: '8px',
      padding: '8px 12px',
      background: 'rgba(0,0,0,0.5)',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      pointerEvents: 'auto' as const,
      fontSize: '14px',
    },
    button: {
      padding: '6px 12px',
      background: 'rgba(255,255,255,0.2)',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '13px',
      marginLeft: '8px',
    },
    panel: {
      position: 'absolute' as const,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(20, 20, 30, 0.95)',
      borderRadius: '8px',
      padding: '24px',
      minWidth: '400px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      overflow: 'auto',
      color: 'white',
      pointerEvents: 'auto' as const,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    },
    overlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      pointerEvents: 'auto' as const,
    },
    slotList: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      marginTop: '16px',
    },
    slotItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      background: 'rgba(255,255,255,0.1)',
      borderRadius: '4px',
      cursor: 'pointer',
    },
    slotThumbnail: {
      width: '80px',
      height: '45px',
      background: 'rgba(0,0,0,0.3)',
      borderRadius: '4px',
      objectFit: 'cover' as const,
    },
    slotInfo: {
      flex: 1,
    },
    slotTitle: {
      fontWeight: 'bold' as const,
      marginBottom: '4px',
    },
    slotMeta: {
      fontSize: '12px',
      color: 'rgba(255,255,255,0.7)',
    },
    settingsGroup: {
      marginBottom: '20px',
    },
    settingsLabel: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
    },
    slider: {
      width: '100%',
      accentColor: '#4a9eff',
    },
    playTime: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: '13px',
    },
  };

  return (
    <div style={styles.container} className={className}>
      {/* Menu toggle button */}
      <button
        style={styles.menuButton}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        onMouseEnter={() => setIsMenuOpen(true)}
      >
        {isMenuOpen ? 'Close' : 'Menu'}
      </button>

      {/* Menu bar */}
      <div
        style={styles.menuBar}
        onMouseLeave={() => activePanel === 'none' && setIsMenuOpen(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {showPlayTime && <span style={styles.playTime}>{playTime}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {showSaveLoad && (
            <>
              <button style={styles.button} onClick={() => setActivePanel('save')}>
                Save
              </button>
              <button style={styles.button} onClick={() => setActivePanel('load')}>
                Load
              </button>
            </>
          )}
          {showSettings && (
            <button style={styles.button} onClick={() => setActivePanel('settings')}>
              Settings
            </button>
          )}
          <button style={styles.button} onClick={handlePauseResume}>
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button style={styles.button} onClick={handleRestart}>
            Restart
          </button>
          {showFullscreen && (
            <button style={styles.button} onClick={toggleFullscreen}>
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          )}
        </div>
      </div>

      {/* Panels */}
      {activePanel !== 'none' && (
        <>
          <div style={styles.overlay} onClick={() => setActivePanel('none')} />

          <div style={styles.panel}>
            {/* Save Panel */}
            {activePanel === 'save' && (
              <>
                <h2 style={{ margin: '0 0 16px 0' }}>Save Game</h2>
                <div style={styles.slotList}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const slot = saveSlots.find(s => s.slotId === i);
                    return (
                      <div
                        key={i}
                        style={styles.slotItem}
                        onClick={() => handleSaveToSlot(i)}
                      >
                        {slot?.thumbnail ? (
                          <img src={slot.thumbnail} alt="" style={styles.slotThumbnail} />
                        ) : (
                          <div style={styles.slotThumbnail} />
                        )}
                        <div style={styles.slotInfo}>
                          <div style={styles.slotTitle}>
                            {slot ? `Slot ${i + 1}` : `Empty Slot ${i + 1}`}
                          </div>
                          {slot && (
                            <div style={styles.slotMeta}>
                              {formatDate(slot.timestamp)} - {formatPlayTimeFromSeconds(slot.playTime)}
                            </div>
                          )}
                        </div>
                        {slot && (
                          <button
                            style={{ ...styles.button, background: 'rgba(255,0,0,0.3)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSlot(i);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Load Panel */}
            {activePanel === 'load' && (
              <>
                <h2 style={{ margin: '0 0 16px 0' }}>Load Game</h2>
                <div style={styles.slotList}>
                  {/* Auto-save slot */}
                  {autoSave && (
                    <div
                      style={{ ...styles.slotItem, borderLeft: '3px solid #4a9eff' }}
                      onClick={handleLoadAutoSave}
                    >
                      {autoSave.thumbnail ? (
                        <img src={autoSave.thumbnail} alt="" style={styles.slotThumbnail} />
                      ) : (
                        <div style={styles.slotThumbnail} />
                      )}
                      <div style={styles.slotInfo}>
                        <div style={styles.slotTitle}>Auto-Save</div>
                        <div style={styles.slotMeta}>
                          {formatDate(autoSave.timestamp)} - {formatPlayTimeFromSeconds(autoSave.playTime)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Manual save slots */}
                  {saveSlots.length > 0 ? (
                    saveSlots.map(slot => (
                      <div
                        key={slot.slotId}
                        style={styles.slotItem}
                        onClick={() => handleLoadFromSlot(slot.slotId)}
                      >
                        {slot.thumbnail ? (
                          <img src={slot.thumbnail} alt="" style={styles.slotThumbnail} />
                        ) : (
                          <div style={styles.slotThumbnail} />
                        )}
                        <div style={styles.slotInfo}>
                          <div style={styles.slotTitle}>Slot {slot.slotId + 1}</div>
                          <div style={styles.slotMeta}>
                            {formatDate(slot.timestamp)} - {formatPlayTimeFromSeconds(slot.playTime)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    !autoSave && (
                      <div style={{ textAlign: 'center', padding: '20px', opacity: 0.7 }}>
                        No saved games found
                      </div>
                    )
                  )}
                </div>
              </>
            )}

            {/* Settings Panel */}
            {activePanel === 'settings' && (
              <>
                <h2 style={{ margin: '0 0 16px 0' }}>Settings</h2>

                <div style={styles.settingsGroup}>
                  <label style={styles.settingsLabel}>
                    Master Volume: {settings.masterVolume}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.masterVolume}
                    onChange={(e) => updateSetting('masterVolume', Number(e.target.value))}
                    style={styles.slider}
                  />
                </div>

                <div style={styles.settingsGroup}>
                  <label style={styles.settingsLabel}>
                    Music Volume: {settings.musicVolume}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.musicVolume}
                    onChange={(e) => updateSetting('musicVolume', Number(e.target.value))}
                    style={styles.slider}
                  />
                </div>

                <div style={styles.settingsGroup}>
                  <label style={styles.settingsLabel}>
                    Sound Effects: {settings.sfxVolume}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.sfxVolume}
                    onChange={(e) => updateSetting('sfxVolume', Number(e.target.value))}
                    style={styles.slider}
                  />
                </div>

                <div style={styles.settingsGroup}>
                  <label style={styles.settingsLabel}>
                    Text Speed: {settings.textSpeed === 100 ? 'Instant' : `${settings.textSpeed}%`}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.textSpeed}
                    onChange={(e) => updateSetting('textSpeed', Number(e.target.value))}
                    style={styles.slider}
                  />
                </div>

                <div style={styles.settingsGroup}>
                  <label style={{ ...styles.settingsLabel, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoAdvance}
                      onChange={(e) => updateSetting('autoAdvance', e.target.checked)}
                    />
                    Auto-advance text
                  </label>
                  {settings.autoAdvance && (
                    <div style={{ marginTop: '8px' }}>
                      <label style={styles.settingsLabel}>
                        Delay: {settings.autoAdvanceDelay}s
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={settings.autoAdvanceDelay}
                        onChange={(e) => updateSetting('autoAdvanceDelay', Number(e.target.value))}
                        style={styles.slider}
                      />
                    </div>
                  )}
                </div>

                <button
                  style={{ ...styles.button, marginTop: '16px' }}
                  onClick={() => setSettings(DEFAULT_SETTINGS)}
                >
                  Reset to Defaults
                </button>
              </>
            )}

            <button
              style={{ ...styles.button, marginTop: '16px', float: 'right' }}
              onClick={() => setActivePanel('none')}
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PlayerUI;
