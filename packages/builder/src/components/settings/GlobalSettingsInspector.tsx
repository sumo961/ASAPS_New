import React, { useState } from 'react';
import { Settings, Palette, Type, Box, Sliders, Monitor, Music, Copyright, Maximize, X, Save } from 'lucide-react';
import type { Asset } from '../assets/AssetManager';
import { useFonts } from '../../hooks/useFonts';

interface GlobalSettings {
  project: {
    width: number;              // Project width in pixels
    height: number;             // Project height in pixels
    aspectRatio: string;        // Aspect ratio (e.g., "4:3", "16:9")
    scalingMode: 'none' | 'fit' | 'fill' | 'stretch';  // How to scale content
  };
  colors: {
    pcolor: string;         // Player text color
    palpha: number;         // Player text alpha
    nonpcolor: string;      // Non-player text color
    nonpalpha: number;      // Non-player text alpha
    bgColor: string;        // Background color
    textBoxBg: string;      // Text box background
    textBoxBorder: string;  // Text box border
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
}

interface GlobalSettingsInspectorProps {
  settings: GlobalSettings;
  defaultSettings?: GlobalSettings;
  onUpdate: (settings: GlobalSettings) => void;
  onClose: () => void;
  assets?: Asset[];  // For accessing custom fonts
}

export const GlobalSettingsInspector: React.FC<GlobalSettingsInspectorProps> = ({
  settings: initialSettings,
  defaultSettings,
  onUpdate,
  onClose,
  assets = [],
}) => {
  const [settings, setSettings] = useState<GlobalSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'project' | 'colors' | 'fonts' | 'textbox' | 'effects' | 'sound' | 'copyright' | 'debug'>('project');
  const [hasChanges, setHasChanges] = useState(false);

  // Get available fonts (built-in + custom from assets)
  const { fonts, getFontFamily } = useFonts(assets);

  const handleChange = (category: keyof GlobalSettings, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
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
        nonpcolor: '#CCCCCC',
        nonpalpha: 90,
        bgColor: '#1a1a1a',
        textBoxBg: '#000000',
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
                    Player Text Color
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
                      placeholder="Alpha"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    NPC Text Color
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
                      placeholder="Alpha"
                    />
                  </div>
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
                    Text Box Background
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.colors.textBoxBg}
                      onChange={(e) => handleChange('colors', 'textBoxBg', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.colors.textBoxBg}
                      onChange={(e) => handleChange('colors', 'textBoxBg', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Text Box Border
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
                  <div className="space-y-2">
                    <p style={{ 
                      color: settings.colors.pcolor, 
                      opacity: settings.colors.palpha / 100,
                      margin: 0 
                    }}>
                      Player dialog text appears like this
                    </p>
                    <p style={{ 
                      color: settings.colors.nonpcolor,
                      opacity: settings.colors.nonpalpha / 100,
                      margin: 0 
                    }}>
                      NPC dialog text appears like this
                    </p>
                    <div 
                      style={{
                        border: `2px solid ${settings.colors.textBoxBorder}`,
                        backgroundColor: settings.colors.textBoxBg,
                        padding: '8px',
                        borderRadius: '4px',
                        marginTop: '8px'
                      }}
                    >
                      <p style={{ color: settings.colors.pcolor, margin: 0 }}>
                        Text box with border and background
                      </p>
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
                <div className="space-y-3 bg-white p-4 rounded">
                  <h1 style={{ 
                    fontFamily: getFontFamily(settings.fonts.titleFont),
                    fontSize: `${settings.fonts.fontSize.title}px`,
                    margin: 0,
                    fontWeight: 'bold'
                  }}>
                    Story Title
                  </h1>
                  <p style={{ 
                    fontFamily: getFontFamily(settings.fonts.textFont),
                    fontSize: `${settings.fonts.fontSize.text}px`,
                    margin: 0
                  }}>
                    This is how regular text will appear in your story.
                  </p>
                  <button style={{ 
                    fontFamily: getFontFamily(settings.fonts.btnFont),
                    fontSize: `${settings.fonts.fontSize.button}px`,
                    padding: '8px 16px',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
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
                  <div className="text-sm font-medium text-gray-600 mb-2">Preview</div>
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
                        backgroundColor: settings.colors.textBoxBg,
                        opacity: settings.textbox.opacity / 100,
                        borderRadius: `${settings.textbox.radius}px`,
                        padding: `${settings.textbox.padding}px`,
                        border: `${settings.textbox.borderWidth}px solid ${settings.colors.textBoxBorder}`,
                        width: '100%',
                      }}
                    >
                      <p style={{ 
                        color: settings.colors.pcolor,
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
                  
                  <div className="space-y-3">
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
                      <div className="mt-3 inline-block">
                        <div 
                          className="px-3 py-1 rounded border-2"
                          style={{ 
                            borderColor: settings.hotspots.highlightColor,
                            backgroundColor: `${settings.hotspots.highlightColor}22`
                          }}
                        >
                          {settings.hotspots.labels ? 'Hotspot with label' : 'Hotspot'}
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
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Background Music File
                  </label>
                  <input
                    type="text"
                    value={settings.sound.backgroundMusicName || settings.sound.backgroundMusic}
                    onChange={(e) => {
                      // When user types, update both name and URL (they're providing a new file reference)
                      handleChange('sound', 'backgroundMusic', e.target.value);
                      handleChange('sound', 'backgroundMusicName', e.target.value);
                    }}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="e.g., background-music.mp3"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the filename of your background music (mp3, ogg, wav)
                  </p>
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
