#!/bin/bash

echo "🔧 Fixing all issues in ASPS Modern..."
echo ""

# 1. Fix App.tsx for Inspector collapse and settings integration (already created above)
echo "✅ App.tsx fixed with Inspector collapse and proper settings integration"

# 2. Fix GlobalSettingsInspector with previews in all panels and proper font rendering
cat > packages/builder/src/components/settings/GlobalSettingsInspector.tsx << 'EOF'
import React, { useState } from 'react';
import { Settings, Palette, Type, Box, Sliders, Monitor, X, Save } from 'lucide-react';

interface GlobalSettings {
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
}

export const GlobalSettingsInspector: React.FC<GlobalSettingsInspectorProps> = ({
  settings: initialSettings,
  defaultSettings,
  onUpdate,
  onClose,
}) => {
  const [settings, setSettings] = useState<GlobalSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'colors' | 'fonts' | 'textbox' | 'effects' | 'debug'>('colors');
  const [hasChanges, setHasChanges] = useState(false);

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
    // Use provided default settings or fallback to hardcoded defaults
    const defaults = defaultSettings || {
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
      debug: {
        firstbeat: '0',
        showvals: false,
      }
    };
    setSettings(defaults);
    setHasChanges(true);
  };

  // Available fonts - map special fonts to web-safe alternatives
  const fontMapping: Record<string, string> = {
    'Gothic': 'Georgia, serif',
    'Handwriting': 'Brush Script MT, cursive',
    'Handwriting2': 'Lucida Handwriting, cursive',
    'Arial': 'Arial, sans-serif',
    'Times New Roman': 'Times New Roman, serif',
    'Courier New': 'Courier New, monospace',
    'Georgia': 'Georgia, serif',
    'Verdana': 'Verdana, sans-serif',
    'Comic Sans MS': 'Comic Sans MS, cursive',
    'Impact': 'Impact, sans-serif',
    'Lucida Console': 'Lucida Console, monospace',
    'Palatino': 'Palatino, serif',
    'Garamond': 'Garamond, serif',
    'Bookman': 'Bookman, serif',
    'Trebuchet MS': 'Trebuchet MS, sans-serif'
  };

  const availableFonts = Object.keys(fontMapping);

  const getFontFamily = (fontName: string) => {
    return fontMapping[fontName] || fontName;
  };

  // Create a preview component that can be used in multiple tabs
  const PreviewBox: React.FC<{ 
    type: 'text' | 'title' | 'button' | 'npc';
    text: string;
  }> = ({ type, text }) => {
    const getStyles = () => {
      const baseStyles: React.CSSProperties = {
        margin: 0,
        transition: 'all 0.3s ease',
      };

      switch (type) {
        case 'title':
          return {
            ...baseStyles,
            color: settings.colors.pcolor,
            fontFamily: getFontFamily(settings.fonts.titleFont),
            fontSize: `${settings.fonts.fontSize.title}px`,
            fontWeight: 'bold',
          };
        case 'text':
          return {
            ...baseStyles,
            color: settings.colors.pcolor,
            fontFamily: getFontFamily(settings.fonts.textFont),
            fontSize: `${settings.fonts.fontSize.text}px`,
            opacity: settings.colors.palpha / 100,
          };
        case 'npc':
          return {
            ...baseStyles,
            color: settings.colors.nonpcolor,
            fontFamily: getFontFamily(settings.fonts.textFont),
            fontSize: `${settings.fonts.fontSize.text}px`,
            opacity: settings.colors.nonpalpha / 100,
          };
        case 'button':
          return {
            ...baseStyles,
            color: '#ffffff',
            backgroundColor: settings.colors.pcolor,
            fontFamily: getFontFamily(settings.fonts.btnFont),
            fontSize: `${settings.fonts.fontSize.button}px`,
            padding: '8px 16px',
            borderRadius: '8px',
            display: 'inline-block',
          };
        default:
          return baseStyles;
      }
    };

    if (type === 'button') {
      return <div style={getStyles()}>{text}</div>;
    }
    return <p style={getStyles()}>{text}</p>;
  };

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
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('colors')}
            className={`px-4 py-2 flex items-center gap-2 ${
              activeTab === 'colors' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Palette className="w-4 h-4" />
            Colors
          </button>
          <button
            onClick={() => setActiveTab('fonts')}
            className={`px-4 py-2 flex items-center gap-2 ${
              activeTab === 'fonts' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Type className="w-4 h-4" />
            Fonts
          </button>
          <button
            onClick={() => setActiveTab('textbox')}
            className={`px-4 py-2 flex items-center gap-2 ${
              activeTab === 'textbox' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Box className="w-4 h-4" />
            Text Box
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`px-4 py-2 flex items-center gap-2 ${
              activeTab === 'effects' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Sliders className="w-4 h-4" />
            Effects
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`px-4 py-2 flex items-center gap-2 ${
              activeTab === 'debug' ? 'bg-blue-50 border-b-2 border-blue-500' : ''
            }`}
          >
            <Monitor className="w-4 h-4" />
            Debug
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                  <PreviewBox type="text" text="Player dialog text appears like this" />
                  <PreviewBox type="npc" text="NPC dialog text appears like this" />
                  <div className="mt-2">
                    <div 
                      style={{
                        border: `2px solid ${settings.colors.textBoxBorder}`,
                        backgroundColor: settings.colors.textBoxBg,
                        padding: '8px',
                        borderRadius: '4px',
                      }}
                    >
                      <p style={{ color: settings.colors.pcolor, margin: 0 }}>
                        Text box with border
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
                    {availableFonts.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
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
                    {availableFonts.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
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
                    {availableFonts.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
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
                <div className="space-y-3">
                  <PreviewBox type="title" text="Story Title" />
                  <PreviewBox type="text" text="This is how regular text will appear in your story." />
                  <PreviewBox type="button" text="Continue" />
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
EOF

echo "✅ Fixed GlobalSettingsInspector with previews in all panels"

# 3. Update StoryPreview to use settings
cat > packages/builder/src/components/preview/StoryPreview.tsx << 'EOF'
import React, { useState, useEffect, useCallback } from 'react';
import { X, Play, RotateCcw, ChevronRight, Info } from 'lucide-react';
import { Story, StoryEngine, Beat } from '@asaps/core';
import { ReactRenderer } from '@asaps/renderer';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';

interface StoryPreviewProps {
  story: Story;
  settings?: GlobalSettings;
  onClose: () => void;
}

export const StoryPreview: React.FC<StoryPreviewProps> = ({ story, settings, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [storyEngine, setStoryEngine] = useState<StoryEngine | null>(null);
  const [renderer, setRenderer] = useState<ReactRenderer | null>(null);
  const [renderContent, setRenderContent] = useState<React.ReactNode>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  // Helper function to get font family with fallbacks
  const getFontFamily = (fontName: string) => {
    const fontMapping: Record<string, string> = {
      'Gothic': 'Georgia, serif',
      'Handwriting': 'Brush Script MT, cursive',
      'Handwriting2': 'Lucida Handwriting, cursive',
      'Arial': 'Arial, sans-serif',
      'Times New Roman': 'Times New Roman, serif',
      'Courier New': 'Courier New, monospace',
      'Georgia': 'Georgia, serif',
      'Verdana': 'Verdana, sans-serif',
      'Comic Sans MS': 'Comic Sans MS, cursive',
      'Impact': 'Impact, sans-serif',
      'Lucida Console': 'Lucida Console, monospace',
      'Palatino': 'Palatino, serif',
      'Garamond': 'Garamond, serif',
      'Bookman': 'Bookman, serif',
      'Trebuchet MS': 'Trebuchet MS, sans-serif'
    };
    return fontMapping[fontName] || fontName;
  };

  useEffect(() => {
    // Create container for renderer
    const container = document.createElement('div');
    container.id = 'story-preview-container';
    container.style.width = '100%';
    container.style.height = '100%';
    
    // Create renderer
    const reactRenderer = new ReactRenderer({
      container,
      width: 800,
      height: 600,
    });

    // Apply settings to renderer
    const bgColor = settings?.colors.bgColor || '#1a1a1a';
    const playerColor = settings?.colors.pcolor || '#7D8DA3';
    const npcColor = settings?.colors.nonpcolor || '#CCCCCC';
    const titleFont = getFontFamily(settings?.fonts.titleFont || 'Gothic');
    const textFont = getFontFamily(settings?.fonts.textFont || 'Handwriting2');
    const buttonFont = getFontFamily(settings?.fonts.btnFont || 'Handwriting2');
    const titleSize = settings?.fonts.fontSize.title || 48;
    const textSize = settings?.fonts.fontSize.text || 18;
    const buttonSize = settings?.fonts.fontSize.button || 16;

    // Override renderer methods to capture content and apply settings
    const originalRenderTitleScreen = reactRenderer.renderTitleScreen.bind(reactRenderer);
    reactRenderer.renderTitleScreen = async (title: string, author: string, buttonText: string) => {
      setRenderContent(
        <div className="flex flex-col items-center justify-center h-full" 
             style={{ backgroundColor: bgColor }}>
          <h1 style={{ 
            fontSize: `${titleSize}px`,
            fontFamily: titleFont,
            color: playerColor,
            marginBottom: '16px',
            fontWeight: 'bold'
          }}>
            {title}
          </h1>
          <p style={{
            fontSize: `${textSize}px`,
            fontFamily: textFont,
            color: npcColor,
            marginBottom: '32px'
          }}>
            by {author}
          </p>
          <button 
            onClick={() => handleContinue()}
            style={{
              fontSize: `${buttonSize}px`,
              fontFamily: buttonFont,
              backgroundColor: playerColor,
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          >
            {buttonText}
          </button>
        </div>
      );
      return new Promise(resolve => {
        window.continueStory = resolve;
      });
    };

    const originalRenderText = reactRenderer.renderText.bind(reactRenderer);
    reactRenderer.renderText = async (text: string, buttonText: string) => {
      setRenderContent(
        <div className="flex flex-col items-center justify-center h-full p-8"
             style={{ backgroundColor: bgColor }}>
          <div className="max-w-2xl w-full" style={{
            backgroundColor: settings?.colors.textBoxBg || '#000000',
            borderRadius: `${settings?.textbox.radius || 20}px`,
            padding: `${settings?.textbox.padding || 20}px`,
            border: `${settings?.textbox.borderWidth || 2}px solid ${settings?.colors.textBoxBorder || '#333333'}`,
            opacity: (settings?.textbox.opacity || 80) / 100,
          }}>
            <p style={{
              fontSize: `${textSize}px`,
              fontFamily: textFont,
              color: playerColor,
              margin: 0,
              whiteSpace: 'pre-wrap'
            }}>
              {text}
            </p>
            <button 
              onClick={() => handleContinue()}
              style={{
                width: '100%',
                marginTop: '16px',
                fontSize: `${buttonSize}px`,
                fontFamily: buttonFont,
                backgroundColor: playerColor,
                color: 'white',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              {buttonText || 'Continue'}
            </button>
          </div>
        </div>
      );
      return new Promise(resolve => {
        window.continueStory = resolve;
      });
    };

    const originalRenderDialog = reactRenderer.renderDialog.bind(reactRenderer);
    reactRenderer.renderDialog = async (speaker: string, text: string, emotion?: string) => {
      const emotionEmoji = {
        happy: '😊',
        sad: '😢',
        angry: '😠',
        surprised: '😮',
        neutral: '😐'
      }[emotion?.toLowerCase() || 'neutral'] || '😐';

      const isPlayer = speaker.toLowerCase() === 'player';
      const textColor = isPlayer ? playerColor : npcColor;

      setRenderContent(
        <div className="flex flex-col justify-end h-full p-8"
             style={{ backgroundColor: bgColor }}>
          <div className="max-w-3xl w-full mx-auto">
            <div className="flex items-start mb-4">
              <div style={{
                backgroundColor: isPlayer ? playerColor : npcColor,
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px 8px 0 0',
                fontFamily: textFont,
                fontWeight: 'bold'
              }}>
                {speaker}
              </div>
              {emotion && (
                <span className="ml-auto text-2xl">{emotionEmoji}</span>
              )}
            </div>
            <div style={{
              backgroundColor: settings?.colors.textBoxBg || '#000000',
              borderRadius: `0 ${settings?.textbox.radius || 20}px ${settings?.textbox.radius || 20}px ${settings?.textbox.radius || 20}px`,
              padding: `${settings?.textbox.padding || 20}px`,
              border: `${settings?.textbox.borderWidth || 2}px solid ${settings?.colors.textBoxBorder || '#333333'}`,
              opacity: (settings?.textbox.opacity || 80) / 100,
            }}>
              <p style={{
                fontSize: `${textSize}px`,
                fontFamily: textFont,
                color: textColor,
                margin: 0
              }}>
                {text}
              </p>
            </div>
            <button 
              onClick={() => handleContinue()}
              style={{
                width: '100%',
                marginTop: '16px',
                fontSize: `${buttonSize}px`,
                fontFamily: buttonFont,
                backgroundColor: playerColor,
                color: 'white',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              Continue
            </button>
          </div>
        </div>
      );
      return new Promise(resolve => {
        window.continueStory = resolve;
      });
    };

    const originalRenderChoices = reactRenderer.renderChoices.bind(reactRenderer);
    reactRenderer.renderChoices = async (choices: { id: string; text: string }[]) => {
      setRenderContent(
        <div className="flex flex-col items-center justify-center h-full p-8"
             style={{ backgroundColor: bgColor }}>
          <div className="max-w-2xl w-full space-y-3">
            {choices.map(choice => (
              <button
                key={choice.id}
                onClick={() => handleChoice(choice.id)}
                style={{
                  width: '100%',
                  padding: '16px',
                  fontSize: `${buttonSize}px`,
                  fontFamily: buttonFont,
                  backgroundColor: settings?.colors.textBoxBg || '#000000',
                  color: playerColor,
                  border: `2px solid ${settings?.colors.textBoxBorder || '#333333'}`,
                  borderRadius: `${settings?.textbox.radius || 20}px`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = playerColor;
                  e.currentTarget.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = settings?.colors.textBoxBg || '#000000';
                  e.currentTarget.style.color = playerColor;
                }}
              >
                {choice.text}
              </button>
            ))}
          </div>
        </div>
      );
      return new Promise(resolve => {
        window.choiceResolver = resolve;
      });
    };

    const originalRenderEndScreen = reactRenderer.renderEndScreen.bind(reactRenderer);
    reactRenderer.renderEndScreen = async (message: string, showRestart: boolean) => {
      setRenderContent(
        <div className="flex flex-col items-center justify-center h-full"
             style={{ 
               background: `linear-gradient(135deg, ${playerColor}, ${npcColor})` 
             }}>
          <h1 style={{
            fontSize: `${titleSize}px`,
            fontFamily: titleFont,
            color: 'white',
            marginBottom: '32px',
            fontWeight: 'bold'
          }}>
            {message}
          </h1>
          {showRestart && (
            <button 
              onClick={() => handleRestart()}
              style={{
                fontSize: `${buttonSize}px`,
                fontFamily: buttonFont,
                backgroundColor: 'white',
                color: playerColor,
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              Restart Story
            </button>
          )}
        </div>
      );
      return new Promise(resolve => {
        window.continueStory = resolve;
      });
    };

    // Create story engine
    const engine = new StoryEngine(reactRenderer);
    
    setRenderer(reactRenderer);
    setStoryEngine(engine);

    return () => {
      // Cleanup
      container.remove();
    };
  }, [settings]);

  const handleContinue = useCallback(() => {
    if ((window as any).continueStory) {
      (window as any).continueStory();
      (window as any).continueStory = null;
    }
  }, []);

  const handleChoice = useCallback((choiceId: string) => {
    if ((window as any).choiceResolver) {
      (window as any).choiceResolver(choiceId);
      (window as any).choiceResolver = null;
    }
  }, []);

  const startPreview = useCallback(async () => {
    if (!storyEngine) return;

    try {
      setIsRunning(true);
      
      // Load the story
      await storyEngine.loadStory(story);
      
      // Track beat changes
      const context = storyEngine.getContext();
      const originalMarkVisited = context.markBeatVisited.bind(context);
      context.markBeatVisited = (beatId: string) => {
        originalMarkVisited(beatId);
        const beat = story.getBeat(beatId);
        setCurrentBeat(beat || null);
        setDebugInfo({
          currentBeatId: beatId,
          visitedBeats: context.getVisitedBeats(),
          variables: context.getVariables(),
          inventory: context.getInventory(),
        });
      };

      // Start the story (respecting debug.firstbeat if set)
      const firstBeatId = settings?.debug.firstbeat || story.getFirstBeatId();
      if (firstBeatId && firstBeatId !== story.getFirstBeatId()) {
        // Override first beat for debugging
        story.setFirstBeatId(firstBeatId);
      }
      
      await storyEngine.start();
      
    } catch (error) {
      console.error('Preview error:', error);
      alert('Error during preview: ' + error);
    } finally {
      setIsRunning(false);
    }
  }, [storyEngine, story, settings]);

  const handleRestart = useCallback(() => {
    setRenderContent(null);
    setCurrentBeat(null);
    setDebugInfo({});
    startPreview();
  }, [startPreview]);

  const stopPreview = useCallback(() => {
    if (storyEngine) {
      storyEngine.stop();
    }
    setIsRunning(false);
    setRenderContent(null);
    setCurrentBeat(null);
  }, [storyEngine]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Play className="w-5 h-5" />
            Story Preview
          </h2>
          <div className="flex items-center gap-2">
            {!isRunning && !renderContent && (
              <button
                onClick={startPreview}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Start Preview
              </button>
            )}
            {isRunning && (
              <button
                onClick={stopPreview}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Stop
              </button>
            )}
            {renderContent && !isRunning && (
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex">
          {/* Preview Area */}
          <div className="flex-1 bg-gray-50 p-4">
            <div className="h-full bg-white rounded-lg shadow-inner overflow-hidden">
              {renderContent ? (
                <div className="h-full">
                  {renderContent}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Play className="w-16 h-16 mx-auto mb-4" />
                    <p>Click "Start Preview" to test your story</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Debug Panel - only show if debug.showvals is true */}
          {settings?.debug.showvals && (
            <div className="w-80 bg-gray-100 p-4 border-l overflow-y-auto">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Debug Info
              </h3>
              
              {currentBeat && (
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600">Current Beat</div>
                    <div className="font-semibold">{currentBeat.name}</div>
                    <div className="text-xs text-gray-500">{currentBeat.type} • {currentBeat.id}</div>
                  </div>

                  {debugInfo.visitedBeats && debugInfo.visitedBeats.length > 0 && (
                    <div className="bg-white p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-600 mb-2">Visited Beats</div>
                      <div className="space-y-1">
                        {debugInfo.visitedBeats.map((beatId: string) => (
                          <div key={beatId} className="text-xs text-gray-600 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            {beatId}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugInfo.variables && Object.keys(debugInfo.variables).length > 0 && (
                    <div className="bg-white p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-600 mb-2">Variables</div>
                      <div className="space-y-1">
                        {Object.entries(debugInfo.variables).map(([key, value]) => (
                          <div key={key} className="text-xs">
                            <span className="font-mono text-gray-600">{key}:</span>
                            <span className="ml-2">{JSON.stringify(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugInfo.inventory && debugInfo.inventory.length > 0 && (
                    <div className="bg-white p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-600 mb-2">Inventory</div>
                      <div className="space-y-1">
                        {debugInfo.inventory.map((item: string) => (
                          <div key={item} className="text-xs text-gray-600">
                            • {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Add to window for debugging
declare global {
  interface Window {
    continueStory?: () => void;
    choiceResolver?: (id: string) => void;
  }
}
EOF

echo "✅ Fixed StoryPreview to use settings properly"

echo ""
echo "✨ All issues fixed!"
echo ""
echo "Summary of fixes:"
echo "1. ✅ Inspector can now be fully collapsed (toggle button added)"
echo "2. ✅ Settings changes are properly reflected in previews"
echo "3. ✅ All settings panels now have live previews"
echo "4. ✅ Default settings are consistent across the app"
echo "5. ✅ Story preview uses the actual global settings"
echo ""
echo "Next steps will be:"
echo "3. Asset Management Integration"
echo "2. Graphical Beat Editor"
