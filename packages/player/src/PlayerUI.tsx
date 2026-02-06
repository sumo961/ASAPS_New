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
  muted: boolean;              // Global mute toggle
}

const DEFAULT_SETTINGS: PlayerSettings = {
  masterVolume: 100,
  musicVolume: 100,
  sfxVolume: 100,
  muted: false,
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
  const [confirmOverwrite, setConfirmOverwrite] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

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
  const handleSaveToSlot = async (slotId: number, force: boolean = false) => {
    // Check if slot is occupied and show confirmation
    const existingSlot = saveSlots.find(s => s.slotId === slotId);
    if (existingSlot && !force) {
      setConfirmOverwrite(slotId);
      return;
    }

    try {
      await player.saveToSlot(slotId);
      await loadSaveSlots();
      setConfirmOverwrite(null);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleConfirmSave = async () => {
    if (confirmOverwrite !== null) {
      await handleSaveToSlot(confirmOverwrite, true);
    }
  };

  const handleCancelSave = () => {
    setConfirmOverwrite(null);
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

  const handleDeleteSlot = async (slotId: number, force: boolean = false) => {
    if (!force) {
      setConfirmDelete(slotId);
      return;
    }

    try {
      await player.deleteSaveSlot(slotId);
      await loadSaveSlots();
      setConfirmDelete(null);
    } catch (error) {
      console.error('Failed to delete save:', error);
    }
  };

  const handleConfirmDelete = async () => {
    if (confirmDelete !== null) {
      await handleDeleteSlot(confirmDelete, true);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  // Calculate relative time (e.g., "2 min ago")
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDate(date);
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

                {/* Overwrite Confirmation Dialog */}
                {confirmOverwrite !== null && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                  }}>
                    <div style={{ marginBottom: '12px', fontWeight: 500 }}>
                      Overwrite Slot {confirmOverwrite + 1}?
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '12px' }}>
                      This will replace the existing save. This action cannot be undone.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        style={{ ...styles.button, background: 'rgba(239, 68, 68, 0.4)', flex: 1 }}
                        onClick={handleConfirmSave}
                      >
                        Overwrite
                      </button>
                      <button
                        style={{ ...styles.button, flex: 1 }}
                        onClick={handleCancelSave}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Delete Confirmation Dialog */}
                {confirmDelete !== null && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                  }}>
                    <div style={{ marginBottom: '12px', fontWeight: 500 }}>
                      Delete Slot {confirmDelete + 1}?
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '12px' }}>
                      This will permanently delete this save. This action cannot be undone.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        style={{ ...styles.button, background: 'rgba(239, 68, 68, 0.4)', flex: 1 }}
                        onClick={handleConfirmDelete}
                      >
                        Delete
                      </button>
                      <button
                        style={{ ...styles.button, flex: 1 }}
                        onClick={handleCancelDelete}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div style={styles.slotList}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const slot = saveSlots.find(s => s.slotId === i);
                    const isSelected = confirmOverwrite === i || confirmDelete === i;
                    return (
                      <div
                        key={i}
                        style={{
                          ...styles.slotItem,
                          border: isSelected ? '2px solid #6366f1' : 'none',
                          opacity: (confirmOverwrite !== null || confirmDelete !== null) && !isSelected ? 0.5 : 1,
                        }}
                        onClick={() => confirmOverwrite === null && confirmDelete === null && handleSaveToSlot(i)}
                      >
                        {slot?.thumbnail ? (
                          <img src={slot.thumbnail} alt="" style={styles.slotThumbnail} />
                        ) : (
                          <div style={{
                            ...styles.slotThumbnail,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.4)',
                          }}>
                            {slot ? 'No preview' : 'Empty'}
                          </div>
                        )}
                        <div style={styles.slotInfo}>
                          <div style={styles.slotTitle}>
                            Slot {i + 1}
                            {!slot && <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 'normal' }}> - Empty</span>}
                          </div>
                          {slot && (
                            <>
                              <div style={styles.slotMeta}>
                                {formatRelativeTime(slot.timestamp)}
                              </div>
                              <div style={{ ...styles.slotMeta, fontSize: '11px' }}>
                                Play time: {formatPlayTimeFromSeconds(slot.playTime)}
                              </div>
                            </>
                          )}
                          {!slot && (
                            <div style={{ ...styles.slotMeta, color: '#6366f1' }}>
                              Save here
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {slot && (
                            <button
                              style={{ ...styles.button, fontSize: '11px', padding: '4px 8px', background: 'rgba(255,0,0,0.2)' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSlot(i);
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
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
                  {/* Auto-save slot - highlighted at top */}
                  {autoSave && (
                    <div
                      style={{
                        ...styles.slotItem,
                        borderLeft: '4px solid #6366f1',
                        background: 'rgba(99, 102, 241, 0.15)',
                      }}
                      onClick={handleLoadAutoSave}
                    >
                      {autoSave.thumbnail ? (
                        <img src={autoSave.thumbnail} alt="" style={styles.slotThumbnail} />
                      ) : (
                        <div style={{
                          ...styles.slotThumbnail,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          color: 'rgba(255,255,255,0.4)',
                        }}>
                          Auto
                        </div>
                      )}
                      <div style={styles.slotInfo}>
                        <div style={{ ...styles.slotTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                            <path d="M12 2v10l4 4" />
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          Auto-Save
                        </div>
                        <div style={styles.slotMeta}>
                          {formatRelativeTime(autoSave.timestamp)}
                        </div>
                        <div style={{ ...styles.slotMeta, fontSize: '11px' }}>
                          Play time: {formatPlayTimeFromSeconds(autoSave.playTime)}
                        </div>
                      </div>
                      <button style={{ ...styles.button, fontSize: '12px' }}>
                        Load
                      </button>
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
                          <div style={{
                            ...styles.slotThumbnail,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.4)',
                          }}>
                            No preview
                          </div>
                        )}
                        <div style={styles.slotInfo}>
                          <div style={styles.slotTitle}>Slot {slot.slotId + 1}</div>
                          <div style={styles.slotMeta}>
                            {formatRelativeTime(slot.timestamp)}
                          </div>
                          <div style={{ ...styles.slotMeta, fontSize: '11px' }}>
                            Play time: {formatPlayTimeFromSeconds(slot.playTime)}
                          </div>
                        </div>
                        <button style={{ ...styles.button, fontSize: '12px' }}>
                          Load
                        </button>
                      </div>
                    ))
                  ) : (
                    !autoSave && (
                      <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        opacity: 0.7,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                      }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <div>No saved games found</div>
                        <div style={{ fontSize: '12px' }}>Save your game to see it here</div>
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
                  <button
                    onClick={() => updateSetting('muted', !settings.muted)}
                    style={{
                      ...styles.button,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      justifyContent: 'center',
                      background: settings.muted ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.2)',
                      border: settings.muted ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.3)',
                    }}
                  >
                    {settings.muted ? (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <line x1="23" y1="9" x2="17" y2="15" />
                          <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                        Muted
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                        Sound On
                      </>
                    )}
                  </button>
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
