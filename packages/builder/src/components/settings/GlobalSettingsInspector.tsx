import React, { useState, useCallback, useEffect } from 'react';
import { Settings, Palette, Type, Box, Sliders, Monitor, Music, Copyright, Maximize, X, Save, Brush, ChevronDown, Check, Variable, Plus, Trash2, FileArchive, Image, Languages, Search, MapPin } from 'lucide-react';
import type { Asset } from '../assets/AssetManager';
import { useFonts } from '../../hooks/useFonts';
import { useThemes } from '../../hooks/useThemes';
import RenpyThemeImporter from './RenpyThemeImporter';
import type { RenpyConversionResult } from '@asaps/core';
import { CultureSettingFields } from './CultureSettingFields';
import { getThemeService } from '../../services/ThemeService';
import { validateProjectAssets, type AssetValidationResult } from '../../utils/assetValidator';
import { MissingAssetsDialog } from './MissingAssetsDialog';
import { normalizeSpeakerDisplay } from '../../utils/themeConverter';
import { COMMON_LANGUAGES } from '../../utils/languageCatalog';

interface GlobalSettings {
  project: {
    width: number;              // Project width in pixels
    height: number;             // Project height in pixels
    aspectRatio: string;        // Aspect ratio (e.g., "4:3", "16:9")
    scalingMode: 'none' | 'fit' | 'fill' | 'stretch';  // How to scale content
    mobileScalingMode?: 'auto' | 'fit' | 'cover' | 'native';  // Mobile display mode
    orientation?: 'flexible' | 'portrait' | 'landscape';  // Device orientation policy (P2.5)
    mobileFontScale?: number;   // Font scale multiplier for mobile (1.0-2.0)
    showMobileSafeZone?: boolean;  // Show mobile crop safe zone overlay in editor
    // Phase 1 — project-level layout mode. See packages/builder/src/
    // storage/types.ts for the full doc. Mirrored here because App and
    // GlobalSettingsInspector import this inline type; keep in sync.
    layoutMode?: 'fixed' | 'responsive';
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
    buttonBg?: string;      // Optional explicit button background color
    buttonBgColor?: string; // Alternative button background color field
    useThemeButtonGraphics?: boolean; // Whether to use button graphics from theme (default: true)
  };
  fonts: {
    titleFont: string;
    textFont: string;
    btnFont: string;
    buttonFont?: string;    // Alternative button font field (may override btnFont)
    fontSize: {
      title: number;
      text: number;
      button: number;
    };
  };
  textbox: {
    radius: number;         // Corner radius
    buttonRadius?: number;  // Button/choice corner radius (unset ⇒ follows radius; 999 ⇒ pill)
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
    showInPreview: 'visible' | 'onHover' | 'invisible';  // Hotspot area visibility in preview
    labelDisplay: 'none' | 'hover' | 'always';  // Label display mode in preview
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
  tts?: {
    provider?: 'web-speech' | 'openai' | 'elevenlabs' | 'custom';
    providerType?: 'web-speech' | 'openai' | 'elevenlabs' | 'custom';
    model?: string;
    baseUrl?: string;
    defaultVoiceId?: string;
    readPrompts?: boolean;
    speakerVoices?: Record<string, Record<string, string>>;
  };
  translation?: {
    sourceLanguage: string;  // BCP 47 code, default 'en'
  };
  hudOverlays?: {
    timerHud?: {
      enabled: boolean;
      mode?: 'timer' | 'static'; // Deprecated: HUD auto-detects
      timerName: string;
      staticText: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      style: 'digital' | 'minimal';
      fontSize: number;
      textColor: string;
      backgroundColor: string;
      backgroundOpacity: number;
      borderRadius: number;
      padding: number;
      showLabel: boolean;
      label: string;
      showWhenInactive: boolean;
    };
    fictionalTime?: {
      enabled: boolean;
      initialTime: { year: number; month: number; day: number; hour: number; minute: number };
      displayFormat: 'time-12h' | 'time-24h' | 'date' | 'datetime-12h' | 'datetime-24h' | 'day-number' | 'year';
      showInTimerHud: boolean;
    };
    countdownMeter?: {
      enabled: boolean;
      counterName: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
      label: string;
      showLabel: boolean;
      showNumericValue: boolean;
      numericFormat: 'value' | 'fraction' | 'percentage';
      meterColor: string;
      meterBackgroundColor: string;
      meterHeight: number;
      meterWidth: number; // Percentage of stage width (10-90)
      backgroundColor: string;
      backgroundOpacity: number;
      borderRadius: number;
      warningThreshold: number;
      warningColor: string;
      criticalThreshold: number;
      criticalColor: string;
      showByDefault?: boolean; // When true (default), meter shows on all beats unless overridden per-beat
      counterMin?: number; // Counter minimum value (default 0)
      counterMax?: number; // Counter maximum value (default 100)
    };
  };
  speakerDisplay?: {
    showNames?: boolean;                       // Master toggle: show speaker names globally
    showGraphics?: boolean;                    // Master toggle: show speaker portraits globally
    nameStyle: 'off' | 'label' | 'inline';   // Off / label above text box / bold first line inside text box
    namePosition: 'left' | 'right';           // Which side the name appears on
    nameColor?: string;                       // Custom color for inline name (default: inherit)
    graphicPosition: 'off' | 'inside-left' | 'inside-right' | 'above-left' | 'above-right';  // Portrait placement
    graphicSize?: number;                     // Portrait size in px (default 48 inside, 80 above)
  };
  // Experimental capability toggles, hidden by default. Mirrored from
  // storage/types.ts; keep in sync.
  features?: {
    showKnowledgeGraph?: boolean;             // Reveal the Knowledge Graph view (default off)
  };
  // Cultural setting — distinct from translation.sourceLanguage. Mirrored from
  // storage/types.ts; keep in sync.
  culture?: {
    label?: string;
    region?: string;
    language?: string;
    profileId?: string;
    derivedFrom?: { projectId?: string; sourceCulture?: string; targetCulture?: string };
  };
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
  /** Available beats for the first beat dropdown */
  beats?: Array<{ id: string; name: string; type: string }>;
  /** External assets folder path (Electron only, IndexedDB projects) */
  assetsPath?: string | null;
  /** Callback when assets folder path changes */
  onAssetsPathChange?: (path: string | null) => void;
  /** Filesystem path for directory-format projects (Electron only) */
  directoryPath?: string | null;
  /** Characters for portrait display in speaker settings */
  characters?: Array<{ displayName: string; name: string; portrait?: { image?: string; assetId?: string } }>;
  /**
   * Phase 1 — request a layout-mode switch. The setting itself can't
   * be changed inline (it requires a migration step with confirm), so
   * the inspector emits the desired target and the parent (App.tsx)
   * runs the migrator + commits.
   */
  onRequestLayoutModeChange?: (target: 'fixed' | 'responsive') => void;
  /** Currently-resolved mode for display (handles undefined-on-load). */
  resolvedLayoutMode?: 'fixed' | 'responsive';
}

export const GlobalSettingsInspector: React.FC<GlobalSettingsInspectorProps> = ({
  settings: initialSettings,
  defaultSettings,
  onUpdate,
  onClose,
  assets = [],
  themeId: initialThemeId,
  onThemeChange,
  beats = [],
  assetsPath,
  onAssetsPathChange,
  directoryPath,
  characters = [],
  onRequestLayoutModeChange,
  resolvedLayoutMode,
}) => {
  const [settings, setSettings] = useState<GlobalSettings>(() => {
    // Normalize speakerDisplay on load to migrate old format to new
    if (initialSettings.speakerDisplay && !initialSettings.speakerDisplay.nameStyle) {
      return {
        ...initialSettings,
        speakerDisplay: normalizeSpeakerDisplay(initialSettings.speakerDisplay) as GlobalSettings['speakerDisplay'],
      };
    }
    return initialSettings;
  });
  const [activeTab, setActiveTab] = useState<'project' | 'colors' | 'fonts' | 'textbox' | 'effects' | 'hud' | 'sound' | 'xr' | 'copyright' | 'variables' | 'translation' | 'debug'>('project');
  const [hasChanges, setHasChanges] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [saveThemeDialogOpen, setSaveThemeDialogOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [showRenpyImporter, setShowRenpyImporter] = useState(false);
  const [missingAssetsResult, setMissingAssetsResult] = useState<AssetValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidateAssets = useCallback(async () => {
    const path = directoryPath || assetsPath;
    if (!path) return;
    setIsValidating(true);
    try {
      const result = await validateProjectAssets(path);
      if (result.missing.length > 0) {
        setMissingAssetsResult(result);
      } else {
        // Brief success feedback — no missing assets
        alert(`All ${result.valid.length} assets are present.`);
      }
    } catch (err) {
      console.error('[GlobalSettingsInspector] Asset validation failed:', err);
    } finally {
      setIsValidating(false);
    }
  }, [directoryPath, assetsPath]);

  // Filter audio assets for background music selection
  const audioAssets = assets.filter(a => a.type === 'audio');

  // Get available fonts (built-in + custom from assets)
  const { fonts, getFontFamily } = useFonts(assets);

  // Helper to determine contrasting text color based on background luminance
  const getContrastColor = (hexColor: string): string => {
    // Handle 'transparent' or invalid colors
    if (!hexColor || hexColor === 'transparent') return '#ffffff';
    // Remove # if present
    const hex = hexColor.replace('#', '');
    if (hex.length < 6) return '#ffffff';
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Helper to convert hex color to rgba with alpha (handles 'transparent')
  const hexToRgba = (hexColor: string, alpha: number): string => {
    if (!hexColor || hexColor === 'transparent') {
      return `rgba(0, 0, 0, 0)`;
    }
    const hex = hexColor.replace('#', '');
    if (hex.length < 6) return `rgba(0, 0, 0, ${alpha})`;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    clearSelection,
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

  // Handle clearing theme (use custom settings without a base theme)
  const handleClearTheme = useCallback(() => {
    // Clear theme selection - keep current settings but disassociate from theme
    clearSelection(); // Clear local hook state (selectedThemeId, themeAssets)
    onThemeChange?.(undefined); // Update parent state
    setShowThemeDropdown(false);
  }, [clearSelection, onThemeChange]);

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

  const handleReset = async () => {
    // Reset to currently selected theme's defaults, preserving critical settings
    const currentFirstBeat = settings.debug?.firstbeat || 'beat_0';
    const currentShowVals = settings.debug?.showvals || false;

    if (selectedThemeId) {
      // Apply the selected theme's settings
      const themeSettings = await applyThemeToSettings(selectedThemeId, settings);
      if (themeSettings) {
        // Preserve debug settings (firstbeat, showvals) - don't reset these
        themeSettings.debug = {
          firstbeat: currentFirstBeat,
          showvals: currentShowVals,
        };
        setSettings(themeSettings);
        setHasChanges(true);
        return;
      }
    }

    // Fallback to defaultSettings if provided, or use sensible defaults
    const defaults = defaultSettings || {
      project: {
        width: 1024,
        height: 768,
        aspectRatio: '4:3',
        scalingMode: 'fit',
      },
      colors: {
        pcolor: '#3d3d5c',      // Muted purple (VN style)
        palpha: 100,
        ptextcolor: '#ffffff',  // White text
        nonpcolor: '#0d0d1a',   // Dark navy
        nonpalpha: 92,
        nonptextcolor: '#ffffff', // White text
        bgColor: '#1a1a2e',     // Dark navy background
        textBoxBorder: '#6666aa', // Soft purple border
      },
      fonts: {
        titleFont: 'Noto Serif',
        textFont: 'Noto Sans',
        btnFont: 'Noto Sans',
        fontSize: {
          title: 42,
          text: 20,
          button: 18,
        }
      },
      textbox: {
        radius: 0,
        padding: 24,
        borderWidth: 2,
        opacity: 92,
        position: 'bottom',
        boxVisibility: 'all',
      },
      textEffects: {
        animation: 'none',      // No typewriter by default
        typewriterSpeed: 40,
        fadeInDuration: 300,
      },
      hotspots: {
        visible: true,
        labels: true,
        highlightColor: '#ff99cc', // Soft pink
        opacity: 25,
        showInPreview: 'onHover',
        labelDisplay: 'hover',
      },
      sound: {
        backgroundMusic: '',
        backgroundVolume: 70,
        mute: false,
      },
      copyright: {
        notice: `Copyright © ${new Date().getFullYear()} All Rights Reserved`,
        year: new Date().getFullYear().toString(),
        owner: '',
      },
      debug: {
        firstbeat: currentFirstBeat,  // Preserve current start beat
        showvals: currentShowVals,
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
                {/* Clear Theme Option */}
                <button
                  onClick={handleClearTheme}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 border-b"
                >
                  {!selectedThemeId && (
                    <Check className="w-4 h-4 text-blue-500" />
                  )}
                  <div className={!selectedThemeId ? 'font-medium' : ''}>
                    <div className="text-sm text-gray-600">Custom (No Theme)</div>
                    <div className="text-xs text-gray-400">Use current settings without a base theme</div>
                  </div>
                </button>

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
            title="Project dimensions, aspect ratio, and scaling mode"
          >
            <Maximize className="w-4 h-4" />
            Project
          </button>
          <button
            onClick={() => setActiveTab('colors')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'colors' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Button colors, text box colors, and background color"
          >
            <Palette className="w-4 h-4" />
            Colors
          </button>
          <button
            onClick={() => setActiveTab('fonts')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'fonts' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Font families and sizes for titles, text, and buttons"
          >
            <Type className="w-4 h-4" />
            Fonts
          </button>
          <button
            onClick={() => setActiveTab('textbox')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'textbox' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Text box appearance: corners, padding, borders, and position"
          >
            <Box className="w-4 h-4" />
            Text Box
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'effects' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Text animations (typewriter, fade) and hotspot visibility"
          >
            <Sliders className="w-4 h-4" />
            Effects
          </button>
          <button
            onClick={() => setActiveTab('hud')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'hud' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="HUD overlays: timer display, countdown meters"
          >
            <Monitor className="w-4 h-4" />
            HUD
          </button>
          <button
            onClick={() => setActiveTab('sound')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sound' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Background music and volume settings"
          >
            <Music className="w-4 h-4" />
            Sound
          </button>
          <button
            onClick={() => setActiveTab('xr')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'xr' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Location & XR — story origin, mock location for desktop testing, default proximity radius, permission-denied policy"
          >
            <MapPin className="w-4 h-4" />
            Location & XR
          </button>
          <button
            onClick={() => setActiveTab('copyright')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'copyright' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Copyright notice displayed at the end of your story"
          >
            <Copyright className="w-4 h-4" />
            Copyright
          </button>
          <button
            onClick={() => setActiveTab('variables')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'variables' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Define global variables for tracking story state (use Set Variable beats to modify them)"
          >
            <Variable className="w-4 h-4" />
            Variables
          </button>
          <button
            onClick={() => setActiveTab('translation')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'translation' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Translation settings: source language and translation management"
          >
            <Languages className="w-4 h-4" />
            Translation
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'debug' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
            title="Testing options: start beat override and variable display"
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

                {/* Mobile Display Settings */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Mobile Display</h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Mobile Scaling
                      </label>
                      <select
                        value={settings.project.mobileScalingMode || 'auto'}
                        onChange={(e) => handleChange('project', 'mobileScalingMode', e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="auto">Auto (Fit + font scaling on mobile)</option>
                        <option value="fit">Fit (Same on all devices, no font scaling)</option>
                        <option value="cover">Cover (Fill on mobile, may crop edges)</option>
                        <option value="native">Native Mobile (No mobile adaptations)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Auto uses fit mode with enlarged text on mobile for readability. Cover fills the mobile screen but may crop stage edges. Fit keeps identical behavior on all devices. Native is for projects already designed at mobile dimensions — disables all mobile detection.
                      </p>
                    </div>

                    {/* Phase 1 — project layout mode picker. Triggers
                        the migrator via the parent (App.tsx) rather than
                        mutating the field directly, because switching is
                        a destructive op (strips pixel positions or bakes
                        them) and needs author confirmation. */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Layout Mode
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (resolvedLayoutMode === 'responsive') return;
                            onRequestLayoutModeChange?.('responsive');
                          }}
                          className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                            resolvedLayoutMode === 'responsive'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Responsive layout
                          {resolvedLayoutMode === 'responsive' && <span className="ml-2 text-xs">✓ current</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (resolvedLayoutMode === 'fixed') return;
                            onRequestLayoutModeChange?.('fixed');
                          }}
                          className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                            resolvedLayoutMode === 'fixed'
                              ? 'bg-amber-50 border-amber-300 text-amber-800 font-medium'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Fixed canvas
                          {resolvedLayoutMode === 'fixed' && <span className="ml-2 text-xs">✓ current</span>}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Responsive: slot/spatial flow, reflows on any viewport.
                        Fixed canvas: pixel-positioned at the project's design size.
                        Switching runs a one-shot migrator with preview.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Orientation
                      </label>
                      <select
                        value={settings.project.orientation || 'flexible'}
                        onChange={(e) => handleChange('project', 'orientation', e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="flexible">Flexible (adapt to portrait or landscape)</option>
                        <option value="portrait">Portrait only (lock — prompt to rotate)</option>
                        <option value="landscape">Landscape only (lock — prompt to rotate)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Layout stays width-responsive either way; this only locks the orientation axis. A locked project shows a "rotate your device" prompt when held the wrong way, so the layout is never drawn in the unsupported orientation.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Mobile Font Scale: {(settings.project.mobileFontScale || 1.0).toFixed(1)}x
                      </label>
                      <input
                        type="range"
                        min="1.0"
                        max="2.0"
                        step="0.1"
                        value={settings.project.mobileFontScale || 1.0}
                        onChange={(e) => handleChange('project', 'mobileFontScale', parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enlarge text on mobile devices for better readability (1.0 = normal). Only applies when mobile is detected.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showMobileSafeZone"
                        checked={settings.project.showMobileSafeZone || false}
                        onChange={(e) => handleChange('project', 'showMobileSafeZone', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="showMobileSafeZone" className="text-sm text-gray-600">
                        Show Mobile Safe Zone in Editor
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      Highlights areas that may be cropped on mobile devices (16:9 and 19.5:9 ratios)
                    </p>
                  </div>
                </div>
              </div>

              {/* Project Directory (directory-format projects, Electron only) */}
              {directoryPath && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Project Directory</h4>
                  <p className="text-xs text-gray-500 mb-2">
                    This project is saved as a folder on disk. Assets are stored alongside the project file.
                  </p>
                  <input
                    type="text"
                    value={directoryPath}
                    readOnly
                    className="w-full px-3 py-2 border rounded bg-gray-50 text-sm text-gray-600 truncate"
                    title={directoryPath}
                  />
                </div>
              )}

              {/* External Assets Folder (Electron only, IndexedDB projects) */}
              {!!(window as any).electronAPI?.fs && onAssetsPathChange && !directoryPath && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">External Assets Folder</h4>
                  <p className="text-xs text-gray-500 mb-2">
                    Large files (&gt;5 MB) are stored in an external folder on disk. Choose a folder to enable importing large assets.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={assetsPath || ''}
                      readOnly
                      placeholder="(none — choose a folder for large assets)"
                      className="flex-1 px-3 py-2 border rounded bg-gray-50 text-sm text-gray-600 truncate"
                    />
                    <button
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        const result = await api.dialog?.open?.({
                          properties: ['openDirectory', 'createDirectory'],
                        });
                        if (!result?.canceled && result?.filePaths?.[0]) {
                          onAssetsPathChange(result.filePaths[0]);
                        }
                      }}
                      className="px-3 py-2 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded whitespace-nowrap"
                    >
                      Choose Folder
                    </button>
                    {assetsPath && (
                      <button
                        onClick={() => onAssetsPathChange(null)}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded whitespace-nowrap"
                        title="Remove folder association (does not delete files)"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Validate Assets button (when any asset path exists) */}
              {!!(window as any).electronAPI?.fs && (directoryPath || assetsPath) && (
                <div className="border-t pt-4 mt-4">
                  <button
                    onClick={handleValidateAssets}
                    disabled={isValidating}
                    className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    {isValidating ? 'Validating...' : 'Validate Assets'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Missing Assets Dialog */}
          {missingAssetsResult && missingAssetsResult.missing.length > 0 && (
            <MissingAssetsDialog
              isOpen={true}
              missing={missingAssetsResult.missing}
              assetsPath={(directoryPath || assetsPath)!}
              onClose={() => setMissingAssetsResult(null)}
              onRepaired={() => setMissingAssetsResult(null)}
            />
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
                          // Use rgba so opacity only affects background, not text
                          backgroundColor: hexToRgba(settings.colors.nonpcolor, settings.colors.nonpalpha / 100),
                          padding: `${settings.textbox.padding}px`,
                          borderRadius: `${settings.textbox.radius}px`,
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
                            // Use rgba so opacity only affects background, not text
                            backgroundColor: hexToRgba(settings.colors.pcolor, settings.colors.palpha / 100),
                            padding: `${settings.textbox.padding}px ${settings.textbox.padding * 1.5}px`,
                            borderRadius: `${settings.textbox.radius}px`,
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
                            // Use rgba so opacity only affects background, not text
                            backgroundColor: hexToRgba(settings.colors.pcolor, settings.colors.palpha / 100),
                            padding: `${settings.textbox.padding}px ${settings.textbox.padding * 1.5}px`,
                            borderRadius: `${settings.textbox.radius}px`,
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
                    Button Corner Radius
                  </label>
                  <input
                    type="range"
                    value={Math.min(settings.textbox.buttonRadius ?? settings.textbox.radius, 51)}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      // Right end of the slider = pill (999); stored value is capped
                      // display-side so the thumb doesn't vanish off-scale.
                      handleChange('textbox', 'buttonRadius', v > 50 ? 999 : v);
                    }}
                    min="0"
                    max="51"
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 text-center">
                    {(settings.textbox.buttonRadius ?? settings.textbox.radius) > 50
                      ? 'Pill'
                      : `${settings.textbox.buttonRadius ?? settings.textbox.radius}px`}
                  </div>
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
                    Box Visibility
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
                    Control whether text/button boxes are visible everywhere the story renders — editor, preview, and exported HTML. Useful for showing text without backgrounds.
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
                          // Use rgba for background so opacity doesn't affect text
                          backgroundColor: hexToRgba(settings.colors.nonpcolor, settings.colors.nonpalpha / 100),
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
                        Hotspot Area Visibility
                      </label>
                      <select
                        value={settings.hotspots.showInPreview ?? 'visible'}
                        onChange={(e) => handleChange('hotspots', 'showInPreview', e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="visible">Always visible (show colored area)</option>
                        <option value="onHover">On hover (show area when hovering)</option>
                        <option value="invisible">Invisible (no visual feedback)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Controls visibility of the clickable hotspot area
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Label Display
                      </label>
                      <select
                        value={settings.hotspots.labelDisplay ?? 'hover'}
                        onChange={(e) => handleChange('hotspots', 'labelDisplay', e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="none">None (no labels)</option>
                        <option value="hover">On hover (tooltip)</option>
                        <option value="always">Always (permanent label)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Controls how location descriptions appear
                      </p>
                    </div>
                  </div>
                </div>

                {/* Speaker Display Settings */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-gray-700">Speaker Display</h4>
                  <p className="text-xs text-gray-500">Controls how speaker names and portrait graphics appear during playback. Individual beats can override these settings.</p>

                  {/* Global toggles */}
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.speakerDisplay?.showNames ?? false}
                        onChange={(e) => {
                          const on = e.target.checked;
                          handleChange('speakerDisplay', 'showNames', on);
                          // Sync nameStyle: turning off → 'off'; turning on with 'off' → 'label'
                          if (!on) {
                            handleChange('speakerDisplay', 'nameStyle', 'off');
                          } else if ((settings.speakerDisplay?.nameStyle ?? 'off') === 'off') {
                            handleChange('speakerDisplay', 'nameStyle', 'label');
                            if (!settings.speakerDisplay?.namePosition) {
                              handleChange('speakerDisplay', 'namePosition', 'left');
                            }
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span>Show speaker names</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.speakerDisplay?.showGraphics ?? false}
                        onChange={(e) => {
                          const on = e.target.checked;
                          handleChange('speakerDisplay', 'showGraphics', on);
                          // Sync graphicPosition: turning off → 'off'; turning on with 'off' → 'inside-left'
                          if (!on) {
                            handleChange('speakerDisplay', 'graphicPosition', 'off');
                          } else if ((settings.speakerDisplay?.graphicPosition ?? 'off') === 'off') {
                            handleChange('speakerDisplay', 'graphicPosition', 'inside-left');
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span>Show speaker portraits</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Name Style */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Name Style
                      </label>
                      <select
                        value={settings.speakerDisplay?.nameStyle ?? 'off'}
                        onChange={(e) => {
                          const val = e.target.value as 'off' | 'label' | 'inline';
                          handleChange('speakerDisplay', 'nameStyle', val);
                          // Sync showNames toggle with nameStyle
                          handleChange('speakerDisplay', 'showNames', val !== 'off');
                          // Ensure namePosition has a default when enabling
                          if (val !== 'off' && !settings.speakerDisplay?.namePosition) {
                            handleChange('speakerDisplay', 'namePosition', 'left');
                          }
                        }}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="off">Off</option>
                        <option value="label">Label (above text box)</option>
                        <option value="inline">Inline (bold in text box)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        How the speaker name is displayed
                      </p>
                    </div>

                    {/* Name Position - shown when name style is not off */}
                    {(settings.speakerDisplay?.nameStyle ?? 'off') !== 'off' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Name Position
                        </label>
                        <select
                          value={settings.speakerDisplay?.namePosition ?? 'left'}
                          onChange={(e) => handleChange('speakerDisplay', 'namePosition', e.target.value)}
                          className="w-full px-3 py-2 border rounded"
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    )}

                    {/* Name Color - shown when inline */}
                    {settings.speakerDisplay?.nameStyle === 'inline' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Name Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={settings.speakerDisplay?.nameColor ?? '#ffffff'}
                            onChange={(e) => handleChange('speakerDisplay', 'nameColor', e.target.value)}
                            className="w-10 h-10 rounded border cursor-pointer"
                          />
                          <span className="text-xs text-gray-500">{settings.speakerDisplay?.nameColor ?? 'inherit'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {/* Graphic Position */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Portrait Position
                      </label>
                      <select
                        value={settings.speakerDisplay?.graphicPosition ?? 'off'}
                        onChange={(e) => {
                          handleChange('speakerDisplay', 'graphicPosition', e.target.value);
                          // Sync showGraphics toggle with graphicPosition
                          handleChange('speakerDisplay', 'showGraphics', e.target.value !== 'off');
                        }}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="off">Off</option>
                        <option value="inside-left">Inside text box (left)</option>
                        <option value="inside-right">Inside text box (right)</option>
                        <option value="above-left">Above text box (left)</option>
                        <option value="above-right">Above text box (right)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Where speaker portrait appears
                      </p>
                    </div>

                    {/* Graphic Size - shown when graphic is not off */}
                    {(settings.speakerDisplay?.graphicPosition ?? 'off') !== 'off' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Portrait Size (px)
                        </label>
                        <input
                          type="number"
                          min={24}
                          max={200}
                          value={settings.speakerDisplay?.graphicSize ?? ((settings.speakerDisplay?.graphicPosition ?? '').startsWith('above') ? 80 : 48)}
                          onChange={(e) => handleChange('speakerDisplay', 'graphicSize', parseInt(e.target.value) || 48)}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                    )}
                  </div>

                  {/* Character Portraits overview */}
                  {characters.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2">Character Portraits</p>
                      <div className="grid grid-cols-4 gap-2">
                        {characters.map((c) => (
                          <div key={c.name} className="flex flex-col items-center gap-1 text-center">
                            {c.portrait?.image || c.portrait?.assetId ? (
                              <img
                                src={c.portrait.assetId ? (assets?.find(a => a.id === c.portrait!.assetId) as any)?.url || c.portrait.image : c.portrait.image}
                                alt={c.displayName}
                                className="w-10 h-10 rounded-full object-cover border border-gray-300"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs border border-gray-300">
                                ?
                              </div>
                            )}
                            <span className="text-xs text-gray-600 truncate w-full">{c.displayName}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Manage portraits in Character Editor → Visual tab
                      </p>
                    </div>
                  )}
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
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>
                            Hotspot: {(settings.hotspots.showInPreview ?? 'visible') === 'visible' ? 'Always visible' :
                                   (settings.hotspots.showInPreview ?? 'visible') === 'onHover' ? 'On hover' : 'Invisible'}
                          </div>
                          <div>
                            Labels: {(settings.hotspots.labelDisplay ?? 'hover') === 'none' ? 'Hidden' :
                                   (settings.hotspots.labelDisplay ?? 'hover') === 'hover' ? 'On hover (tooltip)' : 'Always visible'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hud' && (
            <div className="space-y-6">
              <h3 className="font-medium text-gray-700 mb-3">HUD Overlays</h3>
              <p className="text-xs text-gray-500">Configure persistent HUD elements that overlay the stage during playback.</p>

              {/* Timer HUD Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-700">Timer / Time Display</h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hudOverlays?.timerHud?.enabled || false}
                      onChange={(e) => {
                        const current = settings.hudOverlays?.timerHud || {
                          // Defaults harmonized with the Ink & Brass theme
                          // (was green-on-black digital) — keep in sync with
                          // the renderer fallbacks in TimerHudDisplay.
                          enabled: false, timerName: '', staticText: '',
                          position: 'top-right' as const, style: 'minimal' as const, fontSize: 24,
                          textColor: '#eae7de', backgroundColor: '#1b1f2b', backgroundOpacity: 80,
                          borderRadius: 10, padding: 12, showLabel: false, label: 'Time',
                          showWhenInactive: false,
                        };
                        setSettings({
                          ...settings,
                          hudOverlays: {
                            ...settings.hudOverlays,
                            timerHud: { ...current, enabled: e.target.checked },
                          },
                        });
                        setHasChanges(true);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>

                {settings.hudOverlays?.timerHud?.enabled && (() => {
                  const timerHud = settings.hudOverlays!.timerHud!;
                  const updateTimerHud = (updates: Partial<typeof timerHud>) => {
                    setSettings({
                      ...settings,
                      hudOverlays: {
                        ...settings.hudOverlays,
                        timerHud: { ...timerHud, ...updates },
                      },
                    });
                    setHasChanges(true);
                  };
                  return (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs text-gray-500">
                        Auto-detects what to show: active timer countdown takes priority, then per-beat time text, then default text below.
                      </p>

                      {/* Timer settings */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Timer Name</label>
                        <input
                          type="text"
                          value={timerHud.timerName}
                          onChange={(e) => updateTimerHud({ timerName: e.target.value })}
                          placeholder="Leave empty for first active timer"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={timerHud.showWhenInactive}
                          onChange={(e) => updateTimerHud({ showWhenInactive: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">Show "00:00" when no timer active</span>
                      </label>

                      {/* Default static text */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Default Text</label>
                        <input
                          type="text"
                          value={timerHud.staticText}
                          onChange={(e) => updateTimerHud({ staticText: e.target.value })}
                          placeholder="e.g. 9:00 AM, Day 1, 2h left"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">Shown when no timer is running. Per-beat overrides can be set in beat inspector's Advanced section.</p>
                      </div>

                      {/* Position */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Position</label>
                        <select
                          value={timerHud.position}
                          onChange={(e) => updateTimerHud({ position: e.target.value as typeof timerHud.position })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="top-left">Top Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      </div>

                      {/* Style */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Style</label>
                        <select
                          value={timerHud.style}
                          onChange={(e) => updateTimerHud({ style: e.target.value as 'digital' | 'minimal' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="digital">Digital (monospace)</option>
                          <option value="minimal">Minimal (clean)</option>
                        </select>
                      </div>

                      {/* Font Size */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Font Size: {timerHud.fontSize}px</label>
                        <input
                          type="range"
                          min="12"
                          max="48"
                          value={timerHud.fontSize}
                          onChange={(e) => updateTimerHud({ fontSize: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>

                      {/* Colors */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Text Color</label>
                          <input
                            type="color"
                            value={timerHud.textColor}
                            onChange={(e) => updateTimerHud({ textColor: e.target.value })}
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Background</label>
                          <input
                            type="color"
                            value={timerHud.backgroundColor}
                            onChange={(e) => updateTimerHud({ backgroundColor: e.target.value })}
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Background Opacity */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Background Opacity: {timerHud.backgroundOpacity}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={timerHud.backgroundOpacity}
                          onChange={(e) => updateTimerHud({ backgroundOpacity: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>

                      {/* Border Radius & Padding */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Corner Radius</label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={timerHud.borderRadius}
                            onChange={(e) => updateTimerHud({ borderRadius: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Padding</label>
                          <input
                            type="number"
                            min="4"
                            max="32"
                            value={timerHud.padding}
                            onChange={(e) => updateTimerHud({ padding: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      {/* Label */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={timerHud.showLabel}
                          onChange={(e) => updateTimerHud({ showLabel: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">Show label</span>
                      </label>
                      {timerHud.showLabel && (
                        <input
                          type="text"
                          value={timerHud.label}
                          onChange={(e) => updateTimerHud({ label: e.target.value })}
                          placeholder="e.g. Time, Chapter"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Fictional Time Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-700">Fictional Time</h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hudOverlays?.fictionalTime?.enabled || false}
                      onChange={(e) => {
                        const current = settings.hudOverlays?.fictionalTime || {
                          enabled: false,
                          initialTime: { year: 2024, month: 1, day: 1, hour: 9, minute: 0 },
                          displayFormat: 'datetime-12h' as const,
                          showInTimerHud: true,
                        };
                        setSettings({
                          ...settings,
                          hudOverlays: {
                            ...settings.hudOverlays,
                            fictionalTime: { ...current, enabled: e.target.checked },
                          },
                        });
                        setHasChanges(true);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>

                {settings.hudOverlays?.fictionalTime?.enabled && (() => {
                  const ft = settings.hudOverlays!.fictionalTime!;
                  const updateFT = (updates: Partial<typeof ft>) => {
                    setSettings({
                      ...settings,
                      hudOverlays: {
                        ...settings.hudOverlays,
                        fictionalTime: { ...ft, ...updates },
                      },
                    });
                    setHasChanges(true);
                  };
                  const updateInitialTime = (updates: Partial<typeof ft.initialTime>) => {
                    updateFT({ initialTime: { ...ft.initialTime, ...updates } });
                  };
                  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
                  return (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs text-gray-500">
                        Set up in-story time progression. Use SetVariable beats with type "Fictional Time" to advance or set time during the story.
                      </p>

                      {/* Initial Date & Time */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Initial Date</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={ft.initialTime.day}
                            onChange={(e) => updateInitialTime({ day: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                            min={1} max={31}
                            title="Day"
                          />
                          <select
                            value={ft.initialTime.month}
                            onChange={(e) => updateInitialTime({ month: parseInt(e.target.value) })}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            {monthNames.map((name, i) => (
                              <option key={i + 1} value={i + 1}>{name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={ft.initialTime.year}
                            onChange={(e) => updateInitialTime({ year: parseInt(e.target.value) || 2024 })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            title="Year"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Initial Time</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            value={ft.initialTime.hour}
                            onChange={(e) => updateInitialTime({ hour: Math.max(0, Math.min(23, parseInt(e.target.value) || 0)) })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                            min={0} max={23}
                            title="Hour (0-23)"
                          />
                          <span className="text-gray-500">:</span>
                          <input
                            type="number"
                            value={ft.initialTime.minute}
                            onChange={(e) => updateInitialTime({ minute: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                            min={0} max={59}
                            title="Minute (0-59)"
                          />
                        </div>
                      </div>

                      {/* Display Format */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Display Format</label>
                        <select
                          value={ft.displayFormat}
                          onChange={(e) => updateFT({ displayFormat: e.target.value as typeof ft.displayFormat })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="time-12h">Time only (9:00 AM)</option>
                          <option value="time-24h">Time only 24h (09:00)</option>
                          <option value="date">Date only (15 January 1929)</option>
                          <option value="datetime-12h">Date and time (15 January 1929, 9:00 AM)</option>
                          <option value="datetime-24h">Date and time 24h (15 January 1929, 09:00)</option>
                          <option value="day-number">Day number (Day 1, Day 2...)</option>
                          <option value="year">Year only (1929)</option>
                        </select>
                      </div>

                      {/* Show in Timer HUD */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ft.showInTimerHud}
                          onChange={(e) => updateFT({ showInTimerHud: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">Show in Timer HUD</span>
                      </label>
                      <p className="text-xs text-gray-400">
                        When enabled, the Timer HUD auto-displays the formatted time. Per-beat text overrides and active timer countdowns still take priority.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Countdown Meter Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-700">Countdown Meter</h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hudOverlays?.countdownMeter?.enabled || false}
                      onChange={(e) => {
                        const current = settings.hudOverlays?.countdownMeter || {
                          // Defaults harmonized with the Ink & Brass theme:
                          // slate frame (was old-navy #1a1a2e) + a softened
                          // steel-blue fill that stays clearly distinct from
                          // the amber warning and red critical states.
                          enabled: false, counterName: '', position: 'top-center' as const,
                          label: '', showLabel: true, showNumericValue: true,
                          numericFormat: 'fraction' as const, meterColor: '#5B8DEF',
                          meterBackgroundColor: 'rgba(255,255,255,0.25)', meterHeight: 12,
                          // 60% leaves the top corners free for the timer HUD
                          meterWidth: 60, backgroundColor: '#1b1f2b', backgroundOpacity: 85,
                          borderRadius: 10, warningThreshold: 33, warningColor: '#EAB308',
                          criticalThreshold: 15, criticalColor: '#EF4444',
                        };
                        setSettings({
                          ...settings,
                          hudOverlays: {
                            ...settings.hudOverlays,
                            countdownMeter: { ...current, enabled: e.target.checked },
                          },
                        });
                        setHasChanges(true);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>

                {settings.hudOverlays?.countdownMeter?.enabled && (() => {
                  const meter = settings.hudOverlays!.countdownMeter!;
                  const updateMeter = (updates: Partial<typeof meter>) => {
                    setSettings({
                      ...settings,
                      hudOverlays: {
                        ...settings.hudOverlays,
                        countdownMeter: { ...meter, ...updates },
                      },
                    });
                    setHasChanges(true);
                  };
                  return (
                    <div className="space-y-3 pt-2">
                      {/* Counter Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Counter Name</label>
                        <input
                          type="text"
                          value={meter.counterName}
                          onChange={(e) => updateMeter({ counterName: e.target.value })}
                          placeholder="Name of the counter to track"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>

                      {/* Counter Range */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Min Value</label>
                          <input
                            type="number"
                            value={meter.counterMin ?? 0}
                            onChange={(e) => updateMeter({ counterMin: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Max Value</label>
                          <input
                            type="number"
                            value={meter.counterMax ?? 100}
                            onChange={(e) => updateMeter({ counterMax: parseInt(e.target.value) || 100 })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Range for the meter bar. E.g. 0–24 for hours in a day, 0–100 for health.
                        Overridden by character counter definitions if they specify min/max.
                      </p>

                      {/* Default Visibility */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Default Visibility</label>
                        <select
                          value={meter.showByDefault !== false ? 'show' : 'hide'}
                          onChange={(e) => updateMeter({ showByDefault: e.target.value === 'show' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="show">Show on all beats (hide on individual beats)</option>
                          <option value="hide">Hide on all beats (show on individual beats)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Each beat can override this default in its Advanced settings.
                        </p>
                      </div>

                      {/* Position */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Position</label>
                        <select
                          value={meter.position}
                          onChange={(e) => updateMeter({ position: e.target.value as typeof meter.position })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="top-left">Top Left</option>
                          <option value="top-center">Top Center</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-center">Bottom Center</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      </div>

                      {/* Label */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={meter.showLabel}
                          onChange={(e) => updateMeter({ showLabel: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">Show label</span>
                      </label>
                      {meter.showLabel && (
                        <input
                          type="text"
                          value={meter.label}
                          onChange={(e) => updateMeter({ label: e.target.value })}
                          placeholder="e.g. Health, Energy"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      )}

                      {/* Numeric Value */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={meter.showNumericValue}
                          onChange={(e) => updateMeter({ showNumericValue: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">Show numeric value</span>
                      </label>
                      {meter.showNumericValue && (
                        <select
                          value={meter.numericFormat}
                          onChange={(e) => updateMeter({ numericFormat: e.target.value as typeof meter.numericFormat })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="value">Value only (e.g. 75)</option>
                          <option value="fraction">Fraction (e.g. 75/100)</option>
                          <option value="percentage">Percentage (e.g. 75%)</option>
                        </select>
                      )}

                      {/* Meter Colors */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Meter Color</label>
                          <input
                            type="color"
                            value={meter.meterColor}
                            onChange={(e) => updateMeter({ meterColor: e.target.value })}
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Background</label>
                          <input
                            type="color"
                            value={meter.backgroundColor}
                            onChange={(e) => updateMeter({ backgroundColor: e.target.value })}
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Meter Dimensions */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Width: {meter.meterWidth}%</label>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            value={meter.meterWidth}
                            onChange={(e) => updateMeter({ meterWidth: parseInt(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Height: {meter.meterHeight}px</label>
                          <input
                            type="range"
                            min="4"
                            max="32"
                            value={meter.meterHeight}
                            onChange={(e) => updateMeter({ meterHeight: parseInt(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Background Opacity */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Background Opacity: {meter.backgroundOpacity}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={meter.backgroundOpacity}
                          onChange={(e) => updateMeter({ backgroundOpacity: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>

                      {/* Warning / Critical Thresholds */}
                      <div className="border-t pt-3 mt-3">
                        <h5 className="text-sm font-medium text-gray-600 mb-2">Color Thresholds</h5>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={meter.warningColor}
                              onChange={(e) => updateMeter({ warningColor: e.target.value })}
                              className="w-8 h-8 border border-gray-300 rounded cursor-pointer flex-shrink-0"
                            />
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500">Warning below {meter.warningThreshold}%</label>
                              <input
                                type="range"
                                min="10"
                                max="50"
                                value={meter.warningThreshold}
                                onChange={(e) => updateMeter({ warningThreshold: parseInt(e.target.value) })}
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={meter.criticalColor}
                              onChange={(e) => updateMeter({ criticalColor: e.target.value })}
                              className="w-8 h-8 border border-gray-300 rounded cursor-pointer flex-shrink-0"
                            />
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500">Critical below {meter.criticalThreshold}%</label>
                              <input
                                type="range"
                                min="5"
                                max="30"
                                value={meter.criticalThreshold}
                                onChange={(e) => updateMeter({ criticalThreshold: parseInt(e.target.value) })}
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
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

          {/* Location & XR — v0.9.48 / S4+. Project-level location settings
              that XR beats (GpsLocationBeat etc.) read at runtime: story
              origin, mock location for desktop authoring, default
              proximity radius, permission-denied policy. */}
          {activeTab === 'xr' && (() => {
            // Read the location block defensively — older projects load
            // with `location` undefined.
            const loc = (settings as any).location || {};
            // All three helpers mark the settings dirty so the Save button
            // becomes pressable — same contract as handleChange /
            // handleNestedChange. Without this, edits in the XR tab save
            // silently on dialog close but the Save button stays disabled.
            const writeLoc = (patch: Record<string, any>) => {
              setSettings((prev) => ({
                ...prev,
                location: { ...((prev as any).location || {}), ...patch },
              } as any));
              setHasChanges(true);
            };
            const writeMockLocation = (patch: Record<string, any>) => {
              setSettings((prev) => ({
                ...prev,
                location: {
                  ...((prev as any).location || {}),
                  mockLocation: { ...((prev as any).location?.mockLocation || {}), ...patch },
                },
              } as any));
              setHasChanges(true);
            };
            const writeVenue = (patch: Record<string, any>) => {
              setSettings((prev) => ({
                ...prev,
                location: {
                  ...((prev as any).location || {}),
                  venue: { ...((prev as any).location?.venue || {}), ...patch },
                },
              } as any));
              setHasChanges(true);
            };
            return (
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location & XR Settings
                  </h3>
                  <p className="text-xs text-gray-500">
                    Project-level location settings used by XR beats (GpsLocation, IndoorLocation, ARDisplay).
                    Optional — projects without XR beats can leave everything unset.
                    See <code className="bg-gray-100 px-1 rounded">docs/XR-Roadmap.md</code> for the bigger picture.
                  </p>
                </div>

                {/* Story origin */}
                <section className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-sm text-gray-800">Story origin</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      A single GPS anchor point used by XR beats as the story's "centre."
                      The map beat defaults to centring here when no target is given;
                      AR beats use it as the yaw=0 reference. Leave blank if the story isn't location-anchored.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Origin latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={loc.originLat ?? ''}
                        onChange={(e) => writeLoc({ originLat: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')) })}
                        placeholder="e.g. 51.5074"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Origin longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={loc.originLng ?? ''}
                        onChange={(e) => writeLoc({ originLng: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')) })}
                        placeholder="e.g. -0.1278"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default proximity radius (metres)</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={loc.defaultProximityRadiusM ?? ''}
                      onChange={(e) => writeLoc({ defaultProximityRadiusM: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                      placeholder="e.g. 25"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Used by XR beats and the gpsProximity Condition when no per-beat radius is set.
                      Typical values: 5m room-scale, 25m "you've arrived at the building", 100m neighbourhood.
                    </p>
                  </div>
                </section>

                {/* Mock location for desktop testing */}
                <section className="border border-purple-200 bg-purple-50/30 rounded-lg p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-sm text-purple-900">Mock location (desktop authoring)</h4>
                    <p className="text-xs text-gray-600 mt-0.5">
                      The PreviewWindow's MockSensorPanel seeds from this value. Authors can simulate
                      "the player is here" while testing XR beats on a desktop without real GPS hardware.
                      In production playback (PWA / mobile), the WebSensorService uses the real device
                      Geolocation API instead and ignores this value.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Mock latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={loc.mockLocation?.lat ?? ''}
                        onChange={(e) => writeMockLocation({ lat: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')) })}
                        placeholder="e.g. 51.5"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Mock longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={loc.mockLocation?.lng ?? ''}
                        onChange={(e) => writeMockLocation({ lng: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')) })}
                        placeholder="e.g. -0.1"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Mock floor (indoor)</label>
                      <input
                        type="number"
                        step={1}
                        value={loc.mockLocation?.floor ?? ''}
                        onChange={(e) => writeMockLocation({ floor: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                        placeholder="e.g. 1 = ground floor"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    {loc.originLat !== undefined && loc.originLng !== undefined && (
                      <button
                        type="button"
                        onClick={() => writeMockLocation({ lat: loc.originLat, lng: loc.originLng })}
                        className="px-3 py-1.5 text-xs border border-purple-300 text-purple-800 rounded hover:bg-purple-100"
                        title="Copy lat/lng from the story origin above"
                      >
                        Snap to origin
                      </button>
                    )}
                  </div>
                </section>

                {/* Permission-denied fallback */}
                <section className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-sm text-gray-800">Permission-denied fallback</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      What to do when an XR beat needs a permission (GPS / camera / etc.) and the player denies it.
                      'Skip' silently advances to the next beat. 'Fallback' redirects to a specific beat — typically
                      a non-XR alternative ("we couldn't get your location, so here's a description of the place").
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">On permission denied</label>
                    <select
                      value={loc.onPermissionDenied || 'fallback'}
                      onChange={(e) => writeLoc({ onPermissionDenied: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="fallback">Fallback — redirect to fallback beat</option>
                      <option value="skip">Skip — advance to next beat silently</option>
                    </select>
                  </div>
                  {(loc.onPermissionDenied || 'fallback') === 'fallback' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fallback beat ID</label>
                      <input
                        type="text"
                        value={loc.fallbackBeatId || ''}
                        onChange={(e) => writeLoc({ fallbackBeatId: e.target.value || undefined })}
                        placeholder="e.g. beat_no_gps_alternative"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Beat the engine routes to when permission is denied.
                        Leave blank to degrade to silent skip in that case.
                      </p>
                    </div>
                  )}
                </section>

                {/* Indoor venue */}
                <section className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-sm text-gray-800">Indoor venue (optional)</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      For stories that use IndoorLocationBeat with Bluetooth beacons.
                      The floorplan asset is rendered at scale on top of the player's
                      known beacon position. Leave blank if your story doesn't use indoor positioning.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Venue name</label>
                    <input
                      type="text"
                      value={loc.venue?.name || ''}
                      onChange={(e) => writeVenue({ name: e.target.value })}
                      placeholder="e.g. Acme Museum, Hall A"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Floor width (metres)</label>
                      <input
                        type="number"
                        min={1}
                        step={0.1}
                        value={loc.venue?.floorWidth ?? ''}
                        onChange={(e) => writeVenue({ floorWidth: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')) })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Floor height (metres)</label>
                      <input
                        type="number"
                        min={1}
                        step={0.1}
                        value={loc.venue?.floorHeight ?? ''}
                        onChange={(e) => writeVenue({ floorHeight: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')) })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Floor plan asset ID</label>
                    <input
                      type="text"
                      value={loc.venue?.floorPlan || ''}
                      onChange={(e) => writeVenue({ floorPlan: e.target.value || undefined })}
                      placeholder="(asset id from the asset manager)"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Used by IndoorLocationBeat as the background of the floor plan view.
                    </p>
                  </div>

                  {/* Beacon definitions (v0.9.49+) — IndoorLocationBeat references
                      these by UUID; the renderer reads x/y from here to place
                      markers on the floor plan. */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-600">Bluetooth beacons</label>
                      <button
                        type="button"
                        onClick={() => {
                          const existing = loc.venue?.beacons || [];
                          const next = [
                            ...existing,
                            { uuid: '', displayName: '', x: 0, y: 0 },
                          ];
                          writeVenue({ beacons: next });
                        }}
                        className="text-[11px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        + Add beacon
                      </button>
                    </div>
                    {(!loc.venue?.beacons || loc.venue.beacons.length === 0) && (
                      <p className="text-[11px] text-gray-500 italic">
                        No beacons configured. Add one per physical Bluetooth beacon you've deployed in
                        the venue. Authors reference beacons by UUID from IndoorLocationBeat.
                      </p>
                    )}
                    {loc.venue?.beacons?.map((beacon: { uuid: string; displayName?: string; x: number; y: number }, idx: number) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-start border border-gray-200 rounded p-2 bg-white">
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={beacon.displayName || ''}
                            onChange={(e) => {
                              const next = [...(loc.venue?.beacons || [])];
                              next[idx] = { ...next[idx], displayName: e.target.value };
                              writeVenue({ beacons: next });
                            }}
                            placeholder="Display name (e.g. Reception desk)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={beacon.uuid}
                              onChange={(e) => {
                                const next = [...(loc.venue?.beacons || [])];
                                next[idx] = { ...next[idx], uuid: e.target.value.trim() };
                                writeVenue({ beacons: next });
                              }}
                              placeholder="UUID (e.g. f7826da6-4fa2-4e98-8024-bc5b71e0893e)"
                              className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                // crypto.randomUUID is available in all modern browsers + Electron.
                                // Fall back to a manual v4-style generator just in case.
                                const fresh =
                                  typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
                                    ? (crypto as any).randomUUID()
                                    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                                        const r = (Math.random() * 16) | 0;
                                        const v = c === 'x' ? r : (r & 0x3) | 0x8;
                                        return v.toString(16);
                                      });
                                const next = [...(loc.venue?.beacons || [])];
                                next[idx] = { ...next[idx], uuid: fresh };
                                writeVenue({ beacons: next });
                              }}
                              className="shrink-0 px-2 py-1 text-[11px] border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded"
                              title="Generate a random UUID for testing"
                            >
                              Generate
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[11px] text-gray-600">
                              x (metres from left)
                              <input
                                type="number"
                                step="0.1"
                                value={beacon.x}
                                onChange={(e) => {
                                  const next = [...(loc.venue?.beacons || [])];
                                  next[idx] = { ...next[idx], x: parseFloat(e.target.value.replace(',', '.')) || 0 };
                                  writeVenue({ beacons: next });
                                }}
                                className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                                title="Metres from floor-plan left edge"
                              />
                            </label>
                            <label className="text-[11px] text-gray-600">
                              y (metres from top)
                              <input
                                type="number"
                                step="0.1"
                                value={beacon.y}
                                onChange={(e) => {
                                  const next = [...(loc.venue?.beacons || [])];
                                  next[idx] = { ...next[idx], y: parseFloat(e.target.value.replace(',', '.')) || 0 };
                                  writeVenue({ beacons: next });
                                }}
                                className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                                title="Metres from floor-plan top edge"
                              />
                            </label>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = (loc.venue?.beacons || []).filter((_: any, i: number) => i !== idx);
                            writeVenue({ beacons: next.length ? next : undefined });
                          }}
                          className="text-xs px-2 py-0.5 text-red-600 hover:bg-red-50 border border-red-200 rounded"
                          title="Remove beacon"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            );
          })()}

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

          {activeTab === 'translation' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Translation Settings</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Source Language
                  </label>
                  <select
                    value={settings.translation?.sourceLanguage || 'en'}
                    onChange={(e) => {
                      const translation = { ...(settings.translation || { sourceLanguage: 'en' }), sourceLanguage: e.target.value };
                      handleChange('translation' as keyof GlobalSettings, undefined, translation);
                    }}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="en">English (en)</option>
                    {COMMON_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.code})
                      </option>
                    ))}
                    {/* Keep a legacy 'zh' selection readable even though the
                        catalog uses zh-Hans/zh-Hant */}
                    {settings.translation?.sourceLanguage === 'zh' && (
                      <option value="zh">Chinese (zh)</option>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    The language your story is authored in. Translation resources will be
                    generated relative to this source language.
                  </p>
                </div>

                {settings.features?.showKnowledgeGraph && (
                  <div className="p-4 bg-rose-50 rounded border border-rose-200">
                    <h4 className="text-sm font-medium text-rose-800 mb-1">Cultural setting</h4>
                    <p className="text-xs text-gray-600 mb-2">
                      The culture this project is set in — <em>independent of the language above</em>
                      (e.g. English language · New Zealand culture). Drives the Knowledge Graph's
                      cultural extraction and adaptation.
                    </p>
                    <CultureSettingFields
                      value={settings.culture}
                      onChange={(next) => {
                        setSettings((prev) => ({ ...prev, culture: next }));
                        setHasChanges(true);
                      }}
                    />
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">Translation Management</h4>
                  <p className="text-xs text-blue-700 mb-3">
                    Use the language selector in the toolbar to add translations and switch between languages.
                    Translations can be AI-generated or created manually for human translators.
                  </p>
                  <div className="text-xs text-blue-600">
                    Translation resource files (.strings.json) are stored in the <code className="bg-blue-100 px-1 rounded">translations/</code> folder
                    of your project and can be edited with any text editor.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700 mb-3">Debug Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    First Beat (for testing)
                  </label>
                  <select
                    value={settings.debug.firstbeat}
                    onChange={(e) => handleChange('debug', 'firstbeat', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Story default (auto-detect)</option>
                    {beats.map(beat => (
                      <option key={beat.id} value={beat.id}>
                        {beat.name || beat.id} ({beat.type})
                      </option>
                    ))}
                  </select>
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

                <div className="mt-2 pt-4 border-t">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.features?.showKnowledgeGraph ?? false}
                      onChange={(e) => handleChange('features', 'showKnowledgeGraph', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Show Knowledge Graph view (experimental)</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Adds a Knowledge Graph tab that maps the project's structure (and,
                    later, its cultural content) for querying and cultural adaptation.
                    The project's <strong>Cultural setting</strong> is configured under the
                    Translation tab.
                  </p>
                </div>

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
