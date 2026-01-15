import React, { useState, useCallback, useEffect } from 'react';
import { Settings, Palette, Type, Box, Sliders, Monitor, Music, Copyright, Maximize, X, Save, Brush, ChevronDown, Check, Variable, Plus, Trash2, FileArchive, Image } from 'lucide-react';
import type { Asset } from '../assets/AssetManager';
import { useFonts } from '../../hooks/useFonts';
import { useThemes } from '../../hooks/useThemes';
import RenpyThemeImporter from './RenpyThemeImporter';
import type { RenpyConversionResult } from '@asaps/core';
import { getThemeService } from '../../services/ThemeService';

interface GlobalSettings {
  project: {
    width: number;              // Project width in pixels
    height: number;             // Project height in pixels
    aspectRatio: string;        // Aspect ratio (e.g., "4:3", "16:9")
    scalingMode: 'none' | 'fit' | 'fill' | 'stretch';  // How to scale content
  };
  colors: {
    pcolor: string;         // Button/choice background color (player actions)
    palpha: number;         // Button/choice opacity (0-100)
    ptextcolor: string;     // Button/choice text color
    nonpcolor: string;      // NPC/narrator text box background color
    nonpalpha: number;      // NPC/narrator text box opacity (0-100)
    nonptextcolor: string;  // NPC/narrator text color
    bgColor: string;        // Stage background color
    textBoxBorder: string;  // Text box/button border color
  };
  fonts: {
    titleFont: string;
    textFont: string;
    btnFont: string;
    fontSize: {
      title: number;
      text: number;
      button: number;
    };
  };
  textbox: {
    radius: number;         // Corner radius
    padding: number;        // Internal padding
    borderWidth: number;    // Border width
    opacity: number;        // Background opacity
    position: 'bottom' | 'top' | 'center';
    boxVisibility: 'all' | 'hideText' | 'hideAll';  // Box visibility mode for editor
    hideTitleTextBox?: boolean;  // Hide text box background for title/author elements (VN style)
  };
  textEffects: {
    animation: 'none' | 'typewriter' | 'fade';
    typewriterSpeed: number; // Characters per second
    fadeInDuration: number;   // Milliseconds
  };
  hotspots: {
    visible: boolean;
    labels: boolean;
    highlightColor: string;
    opacity: number;  // 0-100 percentage
    showInPreview: 'visible' | 'onHover' | 'invisible';  // Preview mode visibility
  };
  sound: {
    backgroundMusic: string;       // Background music file/URL
    backgroundMusicName?: string;  // Original filename for display
    backgroundMusicAssetId?: string; // Asset ID for reference
    backgroundVolume: number;      // Volume 0-100
    mute: boolean;                 // Global mute
  };
  copyright: {
    notice: string;            // Copyright notice text
    year: string;              // Copyright year
    owner: string;             // Copyright owner
  };
  debug: {
    firstbeat: string;
    showvals: boolean;
  };
  variables?: {
    name: string;
    type: 'string' | 'number' | 'boolean';
    defaultValue?: string | number | boolean;
    description?: string;
  }[];
}

interface GlobalSettingsInspectorProps {
  settings: GlobalSettings;
  defaultSettings?: GlobalSettings;
  onUpdate: (settings: GlobalSettings) => void;
  onClose: () => void;
  assets?: Asset[];  // For accessing custom fonts
  /** Current theme ID (optional) */
  themeId?: string;
  /** Callback when theme is changed */
  onThemeChange?: (themeId: string | undefined) => void;
}

export const GlobalSettingsInspector: React.FC<GlobalSettingsInspectorProps> = ({
  settings: initialSettings,
  defaultSettings,
  onUpdate,
  onClose,
  assets = [],
  themeId: initialThemeId,
  onThemeChange,
}) => {
  const [settings, setSettings] = useState<GlobalSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'project' | 'colors' | 'fonts' | 'textbox' | 'effects' | 'sound' | 'copyright' | 'variables' | 'debug'>('project');
  const [hasChanges, setHasChanges] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [saveThemeDialogOpen, setSaveThemeDialogOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [showRenpyImporter, setShowRenpyImporter] = useState(false);

  // Filter audio assets for background music selection
  const audioAssets = assets.filter(a => a.type === 'audio');

  // Get available fonts (built-in + custom from assets)
  const { fonts, getFontFamily } = useFonts(assets);

  // Helper to determine contrasting text color based on background luminance
  const getContrastColor = (hexColor: string): string => {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Theme management
  const {
    themes,
    selectedThemeId,
    loading: themesLoading,
    applyThemeToSettings,
    saveAsTheme,
    isBuiltIn,
    refresh,
    loadThemeAssets,
    themeAssets,
  } = useThemes(initialThemeId);

  // Load theme assets when initially opening with a theme
  useEffect(() => {
    if (initialThemeId && !themesLoading) {
      loadThemeAssets(initialThemeId);
    }
  }, [initialThemeId, themesLoading, loadThemeAssets]);

  // Handle theme selection
  const handleThemeSelect = useCallback(async (newThemeId: string) => {
    const newSettings = await applyThemeToSettings(newThemeId, settings);
    if (newSettings) {
      setSettings(newSettings);
      setHasChanges(true);
      onThemeChange?.(newThemeId);
      // Load theme assets (fonts, graphics)
      await loadThemeAssets(newThemeId);
    }
    setShowThemeDropdown(false);
  }, [applyThemeToSettings, settings, onThemeChange, loadThemeAssets]);

  // Handle saving current settings as a theme
  const handleSaveAsTheme = useCallback(async () => {
    if (!newThemeName.trim()) return;
    try {
      const themeId = await saveAsTheme(settings, newThemeName.trim());
      console.log('[GlobalSettings] Saved theme:', themeId);
      setSaveThemeDialogOpen(false);
      setNewThemeName('');
    } catch (err) {
      console.error('[GlobalSettings] Failed to save theme:', err);
    }
  }, [saveAsTheme, settings, newThemeName]);

  // Handle Ren'Py theme import
  const handleRenpyImport = useCallback(async (result: RenpyConversionResult) => {
    const service = getThemeService();
    await service.initialize();

    // Get the theme ID from the result
    const themeId = result.theme.meta.id;

    // Save font assets first and build mapping of old ID -> new stored ID
    const fontIdMap = new Map<string, string>();
    for (const font of result.fontAssets) {
      const storedId = await service.saveThemeAsset(
        themeId,
        font.asset.data,
        font.asset.filename,
        font.role,
        'font'
      );
      fontIdMap.set(font.id, storedId);
    }

    // Save graphic assets and build mapping
    const graphicIdMap = new Map<string, string>();
    for (const graphic of result.graphicAssets) {
      const storedId = await service.saveThemeAsset(
        themeId,
        graphic.asset.data,
        graphic.asset.filename,
        graphic.role,
        'image'
      );
      graphicIdMap.set(graphic.id, storedId);
    }

    // Update theme definition with correct asset IDs
    const updatedTheme = { ...result.theme };
    if (updatedTheme.assets) {
      if (updatedTheme.assets.fonts) {
        updatedTheme.assets.fonts = updatedTheme.assets.fonts.map(f => ({
          ...f,
          id: fontIdMap.get(f.id) || f.id,
        }));
      }
      if (updatedTheme.assets.uiGraphics) {
        updatedTheme.assets.uiGraphics = updatedTheme.assets.uiGraphics.map(g => ({
          ...g,
          id: graphicIdMap.get(g.id) || g.id,
        }));
      }
    }

    // Update textBox.frameAssetId if it references a graphic
    if (updatedTheme.textBox.frameAssetId) {
      updatedTheme.textBox.frameAssetId =
        graphicIdMap.get(updatedTheme.textBox.frameAssetId) || updatedTheme.textBox.frameAssetId;
    }

    // Update button.backgroundImageId if it references a graphic
    if (updatedTheme.button.backgroundImageId) {
      updatedTheme.button.backgroundImageId =
        graphicIdMap.get(updatedTheme.button.backgroundImageId) || updatedTheme.button.backgroundImageId;
    }
    if (updatedTheme.button.hoverBackgroundImageId) {
      updatedTheme.button.hoverBackgroundImageId =
        graphicIdMap.get(updatedTheme.button.hoverBackgroundImageId) || updatedTheme.button.hoverBackgroundImageId;
    }

    // Create the theme with corrected asset references
    await service.createTheme(updatedTheme, 'imported');

    console.log('[GlobalSettings] Imported Ren\'Py theme:', updatedTheme.meta.name, themeId);
    console.log('[GlobalSettings] Fonts:', fontIdMap.size, 'Graphics:', graphicIdMap.size);

    // Refresh themes list
    await refresh();

    // Load theme assets FIRST (fonts into CSS @font-face, graphics as object URLs)
    // This must happen BEFORE applyThemeToSettings so fonts render correctly
    await loadThemeAssets(themeId);

    // Now apply theme to settings - fonts will be available for rendering
    const newSettings = await applyThemeToSettings(themeId, settings);
    if (newSettings) {
      setSettings(newSettings);
      setHasChanges(true);
      onThemeChange?.(themeId);
    }
  }, [refresh, applyThemeToSettings, settings, onThemeChange, loadThemeAssets]);

  // Get current theme name
  const currentThemeName = themes.find(t => t.id === selectedThemeId)?.name || 'Custom';

  const handleChange = (category: keyof GlobalSettings, field: string | undefined, value: any) => {
    if (field === undefined) {
      // Direct assignment for top-level arrays like 'variables'
      setSettings(prev => ({
        ...prev,
        [category]: value
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        [category]: {
          ...(prev[category] as Record<string, any>),
          [field]: value
        }
      }));
    }
    setHasChanges(true);
  };

  const handleNestedChange = (category: keyof GlobalSettings, subCategory: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [subCategory]: {
          ...(prev[category] as any)[subCategory],
          [field]: value
        }
      }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate(settings);
    setHasChanges(false);
  };

  const handleReset = () => {
    // Reset to default settings
    const defaults = defaultSettings || {
      project: {
        width: 1024,
        height: 768,
        aspectRatio: '4:3',
        scalingMode: 'fit',
      },
      colors: {
        pcolor: '#7D8DA3',
        palpha: 90,
        ptextcolor: '',
        nonpcolor: '#CCCCCC',
        nonpalpha: 90,
        nonptextcolor: '',
        bgColor: '#1a1a1a',
        textBoxBorder: '#333333',
      },
      fonts: {
        titleFont: 'Gothic',
        textFont: 'Handwriting2',
        btnFont: 'Handwriting2',
        fontSize: {
          title: 48,
          text: 18,
          button: 16,
        }
      },
      textbox: {
        radius: 20,
        padding: 20,
        borderWidth: 2,
        opacity: 80,
        position: 'bottom',
        boxVisibility: 'all',
      },
      textEffects: {
        animation: 'typewriter',
        typewriterSpeed: 30,
        fadeInDuration: 500,
      },
      hotspots: {
        visible: true,
        labels: true,
        highlightColor: '#ffff00',
        opacity: 30,
        showInPreview: 'visible',
      },
      sound: {
        backgroundMusic: '',
        backgroundVolume: 70,
        mute: false,
      },
      copyright: {
        notice: 'Copyright © 2025 Anonymous All Rights Reserved',
        year: new Date().getFullYear().toString(),
        owner: 'Anonymous',
      },
      debug: {
        firstbeat: '0',
        showvals: false,
      }
    };
    setSettings(defaults);
    setHasChanges(true);
  };

  // Fonts are now provided by useFonts hook (built-in + custom from assets)
  // getFontFamily is also provided by the hook

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[900px] h-[700px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Global Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Theme Selector */}
        <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Brush className="w-4 h-4" />
            <span>Theme:</span>
          </div>

          {/* Theme Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              disabled={themesLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-md hover:bg-gray-50 min-w-[180px] justify-between"
            >
              <span className="text-sm font-medium truncate">
                {themesLoading ? 'Loading...' : currentThemeName}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showThemeDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-auto">
                {/* Built-in Themes */}
                <div className="px-2 py-1 text-xs text-gray-500 font-medium bg-gray-50">
                  Built-in Themes
                </div>
                {themes.filter(t => t.source === 'built-in').map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeSelect(theme.id)}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2"
                  >
                    {selectedThemeId === theme.id && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                    <div className={selectedThemeId === theme.id ? 'font-medium' : ''}>
                      <div className="text-sm">{theme.name}</div>
                      {theme.description && (
                        <div className="text-xs text-gray-500 truncate">{theme.description}</div>
                      )}
                    </div>
                  </button>
                ))}

                {/* Custom Themes */}
                {themes.filter(t => t.source !== 'built-in').length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-gray-500 font-medium bg-gray-50 mt-1">
                      Custom Themes
                    </div>
                    {themes.filter(t => t.source !== 'built-in').map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => handleThemeSelect(theme.id)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2"
                      >
                        {selectedThemeId === theme.id && (
                          <Check className="w-4 h-4 text-blue-500" />
                        )}
                        <div className={selectedThemeId === theme.id ? 'font-medium' : ''}>
                          <div className="text-sm">{theme.name}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Save as Theme Button */}
          <button
            onClick={() => setSaveThemeDialogOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
          >
            <Save className="w-4 h-4" />
            Save as Theme
          </button>

          {/* Import Ren'Py Theme Button */}
          <button
            onClick={() => setShowRenpyImporter(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-md"
            title="Import a Ren'Py visual novel theme"
          >
            <FileArchive className="w-4 h-4" />
            Import Ren'Py
          </button>

          {/* Theme Assets Info */}
          {themeAssets && (themeAssets.fonts.size > 0 || themeAssets.graphics.size > 0) && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
              {themeAssets.fonts.size > 0 && (
                <span className="flex items-center gap-1">
                  <Type className="w-3 h-3" />
                  {themeAssets.fonts.size} font{themeAssets.fonts.size !== 1 ? 's' : ''}
                </span>
              )}
              {themeAssets.graphics.size > 0 && (
                <span className="flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  {themeAssets.graphics.size} graphic{themeAssets.graphics.size !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Current theme indicator */}
          {selectedThemeId && isBuiltIn(selectedThemeId) && hasChanges && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              Modified from {currentThemeName}
            </span>
          )}
        </div>

        {/* Save Theme Dialog */}
        {saveThemeDialogOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold mb-4">Save as Theme</h3>
              <p className="text-sm text-gray-600 mb-4">
                Save your current settings as a reusable theme.
              </p>
              <input
                type="text"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                placeholder="Enter theme name..."
                className="w-full px-3 py-2 border rounded-md mb-4"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setSaveThemeDialogOpen(false);
                    setNewThemeName('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsTheme}
                  disabled={!newThemeName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  Save Theme
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ren'Py Theme Importer Dialog */}
        {showRenpyImporter && (
          <RenpyThemeImporter
            onImport={handleRenpyImport}
            onClose={() => setShowRenpyImporter(false)}
            projectResolution={{ width: settings.project.width, height: settings.project.height }}
          />
        )}

        {/* Tabs */}
        <div className="flex border-b overflow-x-auto">
          <button
            onClick={() => setActiveTab('project')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'project' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Maximize className="w-4 h-4" />
            Project
          </button>
          <button
            onClick={() => setActiveTab('colors')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'colors' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Palette className="w-4 h-4" />
            Colors
          </button>
          <button
            onClick={() => setActiveTab('fonts')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'fonts' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Type className="w-4 h-4" />
            Fonts
          </button>
          <button
            onClick={() => setActiveTab('textbox')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'textbox' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Box className="w-4 h-4" />
            Text Box
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'effects' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Sliders className="w-4 h-4" />
            Effects
          </button>
          <button
            onClick={() => setActiveTab('sound')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sound' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Music className="w-4 h-4" />
            Sound
          </button>
          <button
            onClick={() => setActiveTab('copyright')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'copyright' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Copyright className="w-4 h-4" />
            Copyright
          </button>
          <button
            onClick={() => setActiveTab('variables')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'variables' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Variable className="w-4 h-4" />
            Variables
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'debug' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Monitor className="w-4 h-4" />
            Debug
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'project' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Project Settings</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Project Width (pixels)
                    </label>
                    <input
                      type="number"
                      value={settings.project.width}
                      onChange={(e) => {
                        const width = parseInt(e.target.value);
                        handleChange('project', 'width', width);
                        // Update aspect ratio
                        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                        const divisor = gcd(width, settings.project.height);
                        const ratio = `${width/divisor}:${settings.project.height/divisor}`;
                        handleChange('project', 'aspectRatio', ratio);
                      }}
                      min="320"
                      max="3840"
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Project Height (pixels)
                    </label>
                    <input
                      type="number"
                      value={settings.project.height}
                      onChange={(e) => {
                        const height = parseInt(e.target.value);
                        handleChange('project', 'height', height);
                        // Update aspect ratio
                        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                        const divisor = gcd(settings.project.width, height);
                        const ratio = `${settings.project.width/divisor}:${height/divisor}`;
                        handleChange('project', 'aspectRatio', ratio);
                      }}
                      min="240"
                      max="2160"
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Aspect Ratio
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.project.aspectRatio}
                      readOnly
                      className="flex-1 px-3 py-2 border rounded bg-gray-50"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          handleChange('project', 'width', 1024);
                          handleChange('project', 'height', 768);
                          handleChange('project', 'aspectRatio', '4:3');
                        }}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                        title="Classic 4:3 (1024x768)"
                      >
                        4:3
                      </button>
                      <button
                        onClick={() => {
                          handleChange('project', 'width', 1280);
                          handleChange('project', 'height', 720);
                          handleChange('project', 'aspectRatio', '16:9');
                        }}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                        title="Widescreen 16:9 (1280x720)"
                      >
                        16:9
                      </button>
                      <button
                        onClick={() => {
                          handleChange('project', 'width', 800);
                          handleChange('project', 'height', 600);
                          handleChange('project', 'aspectRatio', '4:3');
                        }}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                        title="Smaller 4:3 (800x600)"
                      >
                        800x600
                      </button>
                      <button
                        onClick={() => {
                          handleChange('project', 'width', 1920);
                          handleChange('project', 'height', 1080);
                          handleChange('project', 'aspectRatio', '16:9');
                        }}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                        title="Full HD 16:9 (1920x1080)"
                      >
                        1920x1080
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Common presets: 4:3 for classic, 16:9 for widescreen
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Scaling Mode
                  </label>
                  <select
                    value={settings.project.scalingMode}
                    onChange={(e) => handleChange('project', 'scalingMode', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="none">None (Original Size)</option>
                    <option value="fit">Fit (Maintain Aspect Ratio)</option>
                    <option value="fill">Fill (Crop to Fill)</option>
                    <option value="stretch">Stretch (Distort to Fill)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    How content scales when displayed in different sized windows
                  </p>
                </div>

                {/* Project Size Preview */}
                <div className="mt-6 p-4 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-600 mb-2">Project Canvas Preview</div>
                  <div className="flex justify-center items-center p-4">
                    <div className="relative bg-white border-2 border-gray-400 shadow-lg"
                         style={{
                           width: Math.min(400, settings.project.width / 4),
                           height: Math.min(300, settings.project.height / 4),
                         }}>
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                        <div className="text-center">
                          <div className="font-mono font-bold">
                            {settings.project.width} × {settings.project.height}
                          </div>
                          <div className="mt-1">
                            {settings.project.aspectRatio}
                          </div>
                          <div className="mt-1 text-gray-400">
                            {settings.project.scalingMode} scaling
                          </div>
                        </div>
                      </div>
                      <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 opacity-50" />
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 opacity-50" />
                      <div className="absolute top-0 left-0 h-full w-1 bg-blue-500 opacity-50" />
                      <div className="absolute top-0 right-0 h-full w-1 bg-blue-500 opacity-50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Color Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Button/Choice Background
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.pcolor}
                      onChange={(e) => handleChange('colors', 'pcolor', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.pcolor}
                      onChange={(e) => handleChange('colors', 'pcolor', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <input
                      type="number"
                      value={settings.colors.palpha}
                      onChange={(e) => handleChange('colors', 'palpha', parseInt(e.target.value))}
                      min="0"
                      max="100"
                      className="w-20 px-2 py-1 border rounded text-sm"
                      placeholder="Opacity %"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Button/Choice Text
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.ptextcolor || getContrastColor(settings.colors.pcolor)}
                      onChange={(e) => handleChange('colors', 'ptextcolor', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.ptextcolor || getContrastColor(settings.colors.pcolor)}
                      onChange={(e) => handleChange('colors', 'ptextcolor', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      placeholder="Auto"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{!settings.colors.ptextcolor && 'Auto-calculated from background'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    NPC/Narrator Background
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.nonpcolor}
                      onChange={(e) => handleChange('colors', 'nonpcolor', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.nonpcolor}
                      onChange={(e) => handleChange('colors', 'nonpcolor', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <input
                      type="number"
                      value={settings.colors.nonpalpha}
                      onChange={(e) => handleChange('colors', 'nonpalpha', parseInt(e.target.value))}
                      min="0"
                      max="100"
                      className="w-20 px-2 py-1 border rounded text-sm"
                      placeholder="Opacity %"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    NPC/Narrator Text
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.nonptextcolor || getContrastColor(settings.colors.nonpcolor)}
                      onChange={(e) => handleChange('colors', 'nonptextcolor', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.nonptextcolor || getContrastColor(settings.colors.nonpcolor)}
                      onChange={(e) => handleChange('colors', 'nonptextcolor', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      placeholder="Auto"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{!settings.colors.nonptextcolor && 'Auto-calculated from background'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Background Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.bgColor}
                      onChange={(e) => handleChange('colors', 'bgColor', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.bgColor}
                      onChange={(e) => handleChange('colors', 'bgColor', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Border Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.textBoxBorder}
                      onChange={(e) => handleChange('colors', 'textBoxBorder', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.textBoxBorder}
                      onChange={(e) => handleChange('colors', 'textBoxBorder', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Hotspot Highlight
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.hotspots.highlightColor}
                      onChange={(e) => handleChange('hotspots', 'highlightColor', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.hotspots.highlightColor}
                      onChange={(e) => handleChange('hotspots', 'highlightColor', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Color Preview */}
              <div className="mt-6 p-4 bg-gray-100 rounded">
                <div className="text-sm font-medium text-gray-600 mb-2">Preview</div>
                <div
                  className="p-4 rounded"
                  style={{ backgroundColor: settings.colors.bgColor }}
                >
                  <div className="space-y-3">
                    {/* NPC/Narrator text box - uses nonpcolor as background */}
                    <div>
                      <div className="text-xs text-gray-400 mb-1">NPC/Narrator text</div>
                      <div
                        style={{
                          border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                          backgroundColor: settings.colors.nonpcolor,
                          padding: `${settings.textbox.padding}px`,
                          borderRadius: `${settings.textbox.radius}px`,
                          opacity: settings.colors.nonpalpha / 100
                        }}
                      >
                        <p style={{
                          color: settings.colors.nonptextcolor || getContrastColor(settings.colors.nonpcolor),
                          margin: 0,
                          fontFamily: getFontFamily(settings.fonts.textFont),
                          fontSize: `${settings.fonts.fontSize.text}px`
                        }}>
                          NPC dialog text appears like this
                        </p>
                      </div>
                    </div>

                    {/* Player choices/buttons - uses pcolor as background */}
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Player choices</div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          style={{
                            border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                            backgroundColor: settings.colors.pcolor,
                            padding: `${settings.textbox.padding}px ${settings.textbox.padding * 1.5}px`,
                            borderRadius: `${settings.textbox.radius}px`,
                            opacity: settings.colors.palpha / 100,
                            color: settings.colors.ptextcolor || getContrastColor(settings.colors.pcolor),
                            fontFamily: getFontFamily(settings.fonts.btnFont),
                            fontSize: `${settings.fonts.fontSize.button}px`,
                            cursor: 'pointer'
                          }}
                        >
                          Choice 1
                        </button>
                        <button
                          style={{
                            border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                            backgroundColor: settings.colors.pcolor,
                            padding: `${settings.textbox.padding}px ${settings.textbox.padding * 1.5}px`,
                            borderRadius: `${settings.textbox.radius}px`,
                            opacity: settings.colors.palpha / 100,
                            color: settings.colors.ptextcolor || getContrastColor(settings.colors.pcolor),
                            fontFamily: getFontFamily(settings.fonts.btnFont),
                            fontSize: `${settings.fonts.fontSize.button}px`,
                            cursor: 'pointer'
                          }}
                        >
                          Choice 2
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fonts' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Font Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Title Font
                  </label>
                  <select
                    value={settings.fonts.titleFont}
                    onChange={(e) => handleChange('fonts', 'titleFont', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {/* Theme font (from imported theme) - show first if it's a custom font not in the list */}
                    {settings.fonts.titleFont && !fonts.some(f => f.displayName === settings.fonts.titleFont) && (
                      <optgroup label="Theme Font">
                        <option value={settings.fonts.titleFont}>{settings.fonts.titleFont}</option>
                      </optgroup>
                    )}
                    {fonts.filter(f => f.type === 'builtin').map(font => (
                      <option key={font.id} value={font.displayName}>{font.displayName}</option>
                    ))}
                    {fonts.filter(f => f.type === 'custom').length > 0 && (
                      <optgroup label="Custom Fonts">
                        {fonts.filter(f => f.type === 'custom').map(font => (
                          <option key={font.id} value={font.displayName}>{font.displayName}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Title Size
                  </label>
                  <input
                    type="number"
                    value={settings.fonts.fontSize.title}
                    onChange={(e) => handleNestedChange('fonts', 'fontSize', 'title', parseInt(e.target.value))}
                    min="12"
                    max="72"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Text Font
                  </label>
                  <select
                    value={settings.fonts.textFont}
                    onChange={(e) => handleChange('fonts', 'textFont', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {/* Theme font (from imported theme) - show first if it's a custom font not in the list */}
                    {settings.fonts.textFont && !fonts.some(f => f.displayName === settings.fonts.textFont) && (
                      <optgroup label="Theme Font">
                        <option value={settings.fonts.textFont}>{settings.fonts.textFont}</option>
                      </optgroup>
                    )}
                    {fonts.filter(f => f.type === 'builtin').map(font => (
                      <option key={font.id} value={font.displayName}>{font.displayName}</option>
                    ))}
                    {fonts.filter(f => f.type === 'custom').length > 0 && (
                      <optgroup label="Custom Fonts">
                        {fonts.filter(f => f.type === 'custom').map(font => (
                          <option key={font.id} value={font.displayName}>{font.displayName}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Text Size
                  </label>
                  <input
                    type="number"
                    value={settings.fonts.fontSize.text}
                    onChange={(e) => handleNestedChange('fonts', 'fontSize', 'text', parseInt(e.target.value))}
                    min="10"
                    max="36"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Button Font
                  </label>
                  <select
                    value={settings.fonts.btnFont}
                    onChange={(e) => handleChange('fonts', 'btnFont', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {/* Theme font (from imported theme) - show first if it's a custom font not in the list */}
                    {settings.fonts.btnFont && !fonts.some(f => f.displayName === settings.fonts.btnFont) && (
                      <optgroup label="Theme Font">
                        <option value={settings.fonts.btnFont}>{settings.fonts.btnFont}</option>
                      </optgroup>
                    )}
                    {fonts.filter(f => f.type === 'builtin').map(font => (
                      <option key={font.id} value={font.displayName}>{font.displayName}</option>
                    ))}
                    {fonts.filter(f => f.type === 'custom').length > 0 && (
                      <optgroup label="Custom Fonts">
                        {fonts.filter(f => f.type === 'custom').map(font => (
                          <option key={font.id} value={font.displayName}>{font.displayName}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Button Size
                  </label>
                  <input
                    type="number"
                    value={settings.fonts.fontSize.button}
                    onChange={(e) => handleNestedChange('fonts', 'fontSize', 'button', parseInt(e.target.value))}
                    min="10"
                    max="36"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>

              {/* Font Preview */}
              <div className="mt-6 p-4 bg-gray-100 rounded">
                <div className="text-sm font-medium text-gray-600 mb-2">Preview</div>
                <div
                  className="space-y-3 p-4 rounded"
                  style={{ backgroundColor: settings.colors.bgColor }}
                >
                  <h1 style={{
                    fontFamily: getFontFamily(settings.fonts.titleFont),
                    fontSize: `${settings.fonts.fontSize.title}px`,
                    margin: 0,
                    fontWeight: 'bold',
                    color: getContrastColor(settings.colors.bgColor)
                  }}>
                    Story Title
                  </h1>
                  {/* Text in a player-style box */}
                  <div
                    style={{
                      backgroundColor: settings.colors.pcolor,
                      padding: `${settings.textbox.padding}px`,
                      borderRadius: `${settings.textbox.radius}px`,
                      border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                      opacity: settings.colors.palpha / 100
                    }}
                  >
                    <p style={{
                      fontFamily: getFontFamily(settings.fonts.textFont),
                      fontSize: `${settings.fonts.fontSize.text}px`,
                      margin: 0,
                      color: getContrastColor(settings.colors.pcolor)
                    }}>
                      This is how regular text will appear in your story.
                    </p>
                  </div>
                  <button style={{
                    fontFamily: getFontFamily(settings.fonts.btnFont),
                    fontSize: `${settings.fonts.fontSize.button}px`,
                    padding: `${settings.textbox.padding}px ${settings.textbox.padding * 1.5}px`,
                    backgroundColor: settings.colors.pcolor,
                    color: settings.colors.ptextcolor || getContrastColor(settings.colors.pcolor),
                    border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                    borderRadius: `${settings.textbox.radius}px`,
                    cursor: 'pointer',
                    opacity: settings.colors.palpha / 100
                  }}>
                    Continue Button
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'textbox' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Text Box Appearance</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Corner Radius
                  </label>
                  <input
                    type="range"
                    value={settings.textbox.radius}
                    onChange={(e) => handleChange('textbox', 'radius', parseInt(e.target.value))}
                    min="0"
                    max="50"
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 text-center">{settings.textbox.radius}px</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Padding
                  </label>
                  <input
                    type="range"
                    value={settings.textbox.padding}
                    onChange={(e) => handleChange('textbox', 'padding', parseInt(e.target.value))}
                    min="5"
                    max="50"
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 text-center">{settings.textbox.padding}px</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Border Width
                  </label>
                  <input
                    type="range"
                    value={settings.textbox.borderWidth}
                    onChange={(e) => handleChange('textbox', 'borderWidth', parseInt(e.target.value))}
                    min="0"
                    max="10"
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 text-center">{settings.textbox.borderWidth}px</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Background Opacity
                  </label>
                  <input
                    type="range"
                    value={settings.textbox.opacity}
                    onChange={(e) => handleChange('textbox', 'opacity', parseInt(e.target.value))}
                    min="0"
                    max="100"
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 text-center">{settings.textbox.opacity}%</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Position
                  </label>
                  <select
                    value={settings.textbox.position}
                    onChange={(e) => handleChange('textbox', 'position', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Box Visibility (Editor & Preview)
                  </label>
                  <select
                    value={settings.textbox.boxVisibility}
                    onChange={(e) => handleChange('textbox', 'boxVisibility', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="all">Show All Boxes</option>
                    <option value="hideText">Hide Text/Dialog Boxes</option>
                    <option value="hideAll">Hide All Boxes</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Control whether text/button boxes are visible in the editor and preview. This is useful for visualizing final rendered text without backgrounds.
                  </p>
                </div>

                {/* Enhanced Text Box Preview */}
                <div className="mt-6 p-4 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    Preview
                    {themeAssets?.textboxFrame && (
                      <span className="text-xs text-purple-600 ml-2">(using theme frame)</span>
                    )}
                  </div>
                  <div
                    className="p-4 relative"
                    style={{
                      backgroundColor: settings.colors.bgColor,
                      minHeight: '200px',
                      display: 'flex',
                      alignItems: settings.textbox.position === 'top' ? 'flex-start' :
                                  settings.textbox.position === 'bottom' ? 'flex-end' : 'center',
                    }}
                  >
                    <div
                      style={{
                        ...(themeAssets?.textboxFrame ? {
                          backgroundImage: `url(${themeAssets.textboxFrame})`,
                          backgroundSize: '100% 100%',
                          backgroundRepeat: 'no-repeat',
                        } : {
                          backgroundColor: settings.colors.nonpcolor,
                          opacity: settings.colors.nonpalpha / 100,
                          border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                        }),
                        borderRadius: themeAssets?.textboxFrame ? 0 : `${settings.textbox.radius}px`,
                        padding: `${settings.textbox.padding}px`,
                        width: '100%',
                      }}
                    >
                      <p style={{
                        color: settings.colors.nonptextcolor || getContrastColor(settings.colors.nonpcolor),
                        fontFamily: getFontFamily(settings.fonts.textFont),
                        fontSize: `${settings.fonts.fontSize.text}px`,
                        margin: 0
                      }}>
                        This is how text will appear in the text box with your current settings.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'effects' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Text Effects</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Text Animation
                  </label>
                  <select
                    value={settings.textEffects.animation}
                    onChange={(e) => handleChange('textEffects', 'animation', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="none">None (Appear at once)</option>
                    <option value="typewriter">Typewriter</option>
                    <option value="fade">Fade In</option>
                  </select>
                </div>

                {settings.textEffects.animation === 'typewriter' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Typewriter Speed (characters/second)
                    </label>
                    <input
                      type="number"
                      value={settings.textEffects.typewriterSpeed}
                      onChange={(e) => handleChange('textEffects', 'typewriterSpeed', parseInt(e.target.value))}
                      min="1"
                      max="100"
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                )}

                {settings.textEffects.animation === 'fade' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Fade Duration (milliseconds)
                    </label>
                    <input
                      type="number"
                      value={settings.textEffects.fadeInDuration}
                      onChange={(e) => handleChange('textEffects', 'fadeInDuration', parseInt(e.target.value))}
                      min="100"
                      max="5000"
                      step="100"
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                )}

                <div className="pt-4 border-t">
                  <h4 className="font-medium text-gray-700 mb-3">Hotspot Settings</h4>

                  <div className="space-y-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.hotspots.visible}
                        onChange={(e) => handleChange('hotspots', 'visible', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Show hotspots</span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.hotspots.labels}
                        onChange={(e) => handleChange('hotspots', 'labels', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Show hotspot labels</span>
                    </label>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Hotspot Opacity
                      </label>
                      <input
                        type="range"
                        value={settings.hotspots.opacity ?? 30}
                        onChange={(e) => handleChange('hotspots', 'opacity', parseInt(e.target.value))}
                        min="0"
                        max="100"
                        className="w-full"
                      />
                      <div className="text-xs text-gray-500 text-center">{settings.hotspots.opacity ?? 30}%</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Preview Mode Visibility
                      </label>
                      <select
                        value={settings.hotspots.showInPreview ?? 'visible'}
                        onChange={(e) => handleChange('hotspots', 'showInPreview', e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="visible">Visible (always show colored area)</option>
                        <option value="onHover">On Hover (only show color when hovering)</option>
                        <option value="invisible">Invisible (no visual feedback - user must find them)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Controls how hotspots appear during story preview
                      </p>
                    </div>
                  </div>
                </div>

                {/* Effects Preview */}
                <div className="mt-6 p-4 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-600 mb-2">Animation Preview</div>
                  <div className="p-4 bg-white rounded">
                    <p className="text-gray-700">
                      {settings.textEffects.animation === 'typewriter' && 
                        `Text will appear one character at a time at ${settings.textEffects.typewriterSpeed} characters per second.`}
                      {settings.textEffects.animation === 'fade' && 
                        `Text will fade in over ${settings.textEffects.fadeInDuration} milliseconds.`}
                      {settings.textEffects.animation === 'none' && 
                        'Text will appear instantly without animation.'}
                    </p>
                    {settings.hotspots.visible && (
                      <div className="mt-3 space-y-2">
                        <div className="text-sm text-gray-600">Hotspot Preview (opacity: {settings.hotspots.opacity ?? 30}%)</div>
                        <div className="flex gap-4">
                          <div
                            className="px-4 py-2 rounded border-2"
                            style={{
                              borderColor: settings.hotspots.highlightColor,
                              backgroundColor: `${settings.hotspots.highlightColor}${Math.round((settings.hotspots.opacity ?? 30) * 2.55).toString(16).padStart(2, '0')}`,
                            }}
                          >
                            {settings.hotspots.labels ? 'Normal' : ''}
                          </div>
                          <div
                            className="px-4 py-2 rounded border-2"
                            style={{
                              borderColor: settings.hotspots.highlightColor,
                              backgroundColor: `${settings.hotspots.highlightColor}${Math.round(((settings.hotspots.opacity ?? 30) * 1.5) * 2.55).toString(16).padStart(2, '0')}`,
                            }}
                          >
                            {settings.hotspots.labels ? 'Hovered' : ''}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          Mode: {(settings.hotspots.showInPreview ?? 'visible') === 'visible' ? 'Always visible' :
                                 (settings.hotspots.showInPreview ?? 'visible') === 'onHover' ? 'Only on hover' : 'Invisible (no feedback)'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sound' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Sound Settings</h3>
              
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Background Music
                  </label>
                  {settings.sound.backgroundMusicAssetId || settings.sound.backgroundMusic ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-gray-50 border rounded text-sm truncate flex items-center gap-2">
                        <Music className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="truncate">
                          {settings.sound.backgroundMusicName ||
                           audioAssets.find(a => a.id === settings.sound.backgroundMusicAssetId)?.name ||
                           settings.sound.backgroundMusic}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowSoundPicker(true)}
                        className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                        title="Change music"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => {
                          handleChange('sound', 'backgroundMusic', '');
                          handleChange('sound', 'backgroundMusicName', '');
                          handleChange('sound', 'backgroundMusicAssetId', '');
                        }}
                        className="px-2 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        title="Remove music"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSoundPicker(true)}
                      className="w-full px-3 py-2 border border-dashed border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 flex items-center justify-center gap-2"
                    >
                      <Music className="w-4 h-4" />
                      Select Background Music
                    </button>
                  )}

                  {/* Sound Picker Dropdown */}
                  {showSoundPicker && (
                    <div className="absolute z-50 mt-1 w-80 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2 border-b bg-gray-50 flex justify-between items-center">
                        <span className="text-sm font-medium">Select Audio</span>
                        <button
                          onClick={() => setShowSoundPicker(false)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          ✕
                        </button>
                      </div>
                      {audioAssets.length === 0 ? (
                        <div className="p-4 text-sm text-gray-500 text-center">
                          No audio files found. Add audio files in the Asset Manager.
                        </div>
                      ) : (
                        <div className="p-1">
                          {audioAssets.map((asset) => (
                            <button
                              key={asset.id}
                              onClick={() => {
                                handleChange('sound', 'backgroundMusic', asset.url || asset.id);
                                handleChange('sound', 'backgroundMusicName', asset.name);
                                handleChange('sound', 'backgroundMusicAssetId', asset.id);
                                setShowSoundPicker(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 rounded flex items-center gap-2"
                            >
                              <Music className="w-4 h-4 text-blue-500" />
                              <span className="truncate">{asset.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Background Music Volume
                  </label>
                  <input
                    type="range"
                    value={settings.sound.backgroundVolume}
                    onChange={(e) => handleChange('sound', 'backgroundVolume', parseInt(e.target.value))}
                    min="0"
                    max="100"
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 text-center">{settings.sound.backgroundVolume}%</div>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.sound.mute}
                    onChange={(e) => handleChange('sound', 'mute', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Mute all sounds</span>
                </label>

                {/* Sound Preview */}
                <div className="mt-6 p-4 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-600 mb-2">Audio Configuration</div>
                  <div className="p-3 bg-white rounded space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-gray-500" />
                      <span>
                        {settings.sound.backgroundMusicName || settings.sound.backgroundMusic || 'No background music set'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Volume:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-full rounded-full"
                          style={{ width: `${settings.sound.mute ? 0 : settings.sound.backgroundVolume}%` }}
                        />
                      </div>
                      <span className="text-xs">
                        {settings.sound.mute ? 'Muted' : `${settings.sound.backgroundVolume}%`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'copyright' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Copyright Information</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Copyright Notice
                  </label>
                  <textarea
                    value={settings.copyright.notice}
                    onChange={(e) => handleChange('copyright', 'notice', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                    placeholder="Enter your copyright notice..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This will be displayed in your story's copyright information
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Copyright Year
                    </label>
                    <input
                      type="text"
                      value={settings.copyright.year}
                      onChange={(e) => handleChange('copyright', 'year', e.target.value)}
                      className="w-full px-3 py-2 border rounded"
                      placeholder={new Date().getFullYear().toString()}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Copyright Owner
                    </label>
                    <input
                      type="text"
                      value={settings.copyright.owner}
                      onChange={(e) => handleChange('copyright', 'owner', e.target.value)}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Your name or company"
                    />
                  </div>
                </div>

                {/* Copyright Preview */}
                <div className="mt-6 p-4 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-600 mb-2">Copyright Display</div>
                  <div className="p-3 bg-white rounded">
                    <div className="text-sm text-gray-700 font-mono">
                      {settings.copyright.notice || `Copyright © ${settings.copyright.year} ${settings.copyright.owner} All Rights Reserved`}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const defaultNotice = `Copyright © ${settings.copyright.year} ${settings.copyright.owner} All Rights Reserved`;
                      handleChange('copyright', 'notice', defaultNotice);
                    }}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                  >
                    Generate Default Notice
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'variables' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-700">Global Variables</h3>
                <button
                  onClick={() => {
                    const newVar = {
                      name: `variable_${(settings.variables?.length || 0) + 1}`,
                      type: 'string' as const,
                      defaultValue: '',
                      description: ''
                    };
                    handleChange('variables', undefined, [...(settings.variables || []), newVar]);
                  }}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  <Plus className="w-4 h-4" />
                  Add Variable
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Define global variables that can be used throughout your story. These will appear in dropdowns when selecting variables in beats.
              </p>

              {(!settings.variables || settings.variables.length === 0) ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                  <Variable className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No variables defined yet.</p>
                  <p className="text-sm">Click "Add Variable" to create one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {settings.variables.map((variable, index) => (
                    <div key={index} className="p-3 border rounded-lg bg-white">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                              <input
                                type="text"
                                value={variable.name}
                                onChange={(e) => {
                                  const updated = [...(settings.variables || [])];
                                  updated[index] = { ...variable, name: e.target.value };
                                  handleChange('variables', undefined, updated);
                                }}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="variableName"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                              <select
                                value={variable.type}
                                onChange={(e) => {
                                  const updated = [...(settings.variables || [])];
                                  const newType = e.target.value as 'string' | 'number' | 'boolean';
                                  let newDefault: string | number | boolean = '';
                                  if (newType === 'number') newDefault = 0;
                                  if (newType === 'boolean') newDefault = false;
                                  updated[index] = { ...variable, type: newType, defaultValue: newDefault };
                                  handleChange('variables', undefined, updated);
                                }}
                                className="w-full px-2 py-1 text-sm border rounded"
                              >
                                <option value="string">String (Text)</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean (True/False)</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Default Value</label>
                              {variable.type === 'boolean' ? (
                                <select
                                  value={String(variable.defaultValue ?? false)}
                                  onChange={(e) => {
                                    const updated = [...(settings.variables || [])];
                                    updated[index] = { ...variable, defaultValue: e.target.value === 'true' };
                                    handleChange('variables', undefined, updated);
                                  }}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                >
                                  <option value="false">False</option>
                                  <option value="true">True</option>
                                </select>
                              ) : (
                                <input
                                  type={variable.type === 'number' ? 'number' : 'text'}
                                  value={variable.type === 'number'
                                    ? (typeof variable.defaultValue === 'number' ? variable.defaultValue : 0)
                                    : (typeof variable.defaultValue === 'string' ? variable.defaultValue : '')}
                                  onChange={(e) => {
                                    const updated = [...(settings.variables || [])];
                                    const value = variable.type === 'number'
                                      ? (parseFloat(e.target.value) || 0)
                                      : e.target.value;
                                    updated[index] = { ...variable, defaultValue: value };
                                    handleChange('variables', undefined, updated);
                                  }}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                  placeholder={variable.type === 'number' ? '0' : 'default value'}
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                              <input
                                type="text"
                                value={variable.description || ''}
                                onChange={(e) => {
                                  const updated = [...(settings.variables || [])];
                                  updated[index] = { ...variable, description: e.target.value };
                                  handleChange('variables', undefined, updated);
                                }}
                                className="w-full px-2 py-1 text-sm border rounded"
                                placeholder="What is this variable for?"
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const updated = settings.variables?.filter((_, i) => i !== index) || [];
                            handleChange('variables', undefined, updated);
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Delete variable"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Debug Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    First Beat ID (for testing)
                  </label>
                  <input
                    type="text"
                    value={settings.debug.firstbeat}
                    onChange={(e) => handleChange('debug', 'firstbeat', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Override the starting beat for testing specific sections
                  </p>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.debug.showvals}
                    onChange={(e) => handleChange('debug', 'showvals', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Show variable/counter values during preview</span>
                </label>

                {/* Debug Preview */}
                <div className="mt-6 p-4 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-600 mb-2">Debug Display Preview</div>
                  {settings.debug.showvals ? (
                    <div className="p-3 bg-white rounded space-y-2 font-mono text-xs">
                      <div>health: 100</div>
                      <div>courage: 75</div>
                      <div>hasKey: true</div>
                      <div>questComplete: false</div>
                      <div className="text-gray-500">Debug values will appear like this during preview</div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded text-gray-500 text-sm">
                      Debug values are hidden
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            Reset to Defaults
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`px-4 py-2 text-sm rounded flex items-center gap-2 ${
                hasChanges
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalSettingsInspector;

// Export type for use in other components
export type { GlobalSettings };
