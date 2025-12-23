import React from 'react';
import ReactDOM from 'react-dom';
import type { Location } from '@asaps/core';
import { getPresetSound, isPresetSound } from '@asaps/core';
import { getAudioManager } from '../audio/AudioManager';

/**
 * Font name to CSS font-family mapping
 * Used to convert user-friendly font names to proper CSS values
 */
const FONT_FAMILIES: Record<string, string> = {
  'Arial': 'Arial, sans-serif',
  'Helvetica': 'Helvetica, Arial, sans-serif',
  'Times New Roman': 'Times New Roman, serif',
  'Courier New': 'Courier New, monospace',
  'Georgia': 'Georgia, serif',
  'Verdana': 'Verdana, sans-serif',
  'Gothic': 'Georgia, serif',
  'Handwriting': 'Brush Script MT, cursive',
  'Handwriting2': 'Lucida Handwriting, cursive',
  'Comic Sans MS': 'Comic Sans MS, cursive',
  'Impact': 'Impact, sans-serif',
  'Trebuchet MS': 'Trebuchet MS, sans-serif',
  'Palatino': 'Palatino Linotype, Book Antiqua, Palatino, serif',
};

/**
 * Convert font name to CSS font-family value
 */
function getFontFamily(fontName: string): string {
  return FONT_FAMILIES[fontName] || fontName;
}

/**
 * PositionedBeatView - React component for rendering positioned beat elements
 * 
 * This is the core rendering component used by BOTH:
 * - Preview (via ReactRenderer)
 * - Visual Editor (via VisualBeatEditor)
 * 
 * Key principle: Single source of truth for positioned element rendering
 * 
 * @packageDocumentation
 */

/** Hyperlink data for HyperText beat type */
export interface HyperlinkData {
  word: string;
  targetBeatId: string;
  style?: {
    color?: string;
    hoverColor?: string;
    underline?: boolean;
    bold?: boolean;
  };
}

export interface PositionedElementData {
  location: Location;
  content: string;
  assetUrl?: string;
  /** Optional action ID to return when this element is clicked (e.g., choice ID for movementChoice) */
  actionId?: string;
  /** Optional target beat ID for checking if this choice leads to a visited beat */
  targetBeatId?: string;
  /** Optional hyperlinks for HyperText beat type - words in the text that are clickable */
  hyperlinks?: HyperlinkData[];
}

/**
 * Theme settings for rendering elements
 * Maps directly to GlobalSettings from the builder
 */
export interface RenderThemeSettings {
  /** Stage/canvas background color (used when no background image is set) */
  backgroundColor?: string;
  /** Text box styling */
  textBox: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    padding: number;
    opacity: number;  // 0-100
  };
  /** Button styling */
  button: {
    backgroundColor: string;
    hoverBackgroundColor: string;
    textColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
  };
  /** Text colors */
  colors: {
    textColor: string;
    textAlpha: number;  // 0-100
  };
  /** Fonts */
  fonts: {
    titleFont: string;
    textFont: string;
    buttonFont: string;
  };
  /** Text effects (animations) */
  textEffects?: {
    animation: 'none' | 'typewriter' | 'fade';
    typewriterSpeed: number;  // Characters per second
    fadeInDuration: number;    // Milliseconds
  };
  /** Hotspot styling */
  hotspot?: {
    highlightColor: string;  // Color for hotspot fill (default yellow #ffff00)
    visible: boolean;        // Whether hotspots are visible at all
    showLabels: boolean;     // Whether to show text labels on hotspots
    opacity: number;         // Base opacity 0-1 (default 0.3)
    showInPreview: 'visible' | 'onHover' | 'invisible';  // Preview mode visibility
  };
}

export interface PositionedBeatViewProps {
  /** Width of the stage/canvas */
  stageWidth: number;
  /** Height of the stage/canvas */
  stageHeight: number;
  /** Background image URL */
  backgroundUrl?: string | null;
  /** Background color/gradient (used if no backgroundUrl) */
  backgroundColor?: string;
  /** Array of positioned elements to render */
  elements: PositionedElementData[];
  /** Callback when an interactive element (button/hotspot) is clicked */
  onAction?: (actionId: string) => void;
  /** Whether elements should be interactive (clickable) */
  interactive?: boolean;
  /** Whether to hide text box backgrounds (show only text content) */
  hideTextBoxes?: boolean;
  /** Whether to hide button box backgrounds (show only button content) */
  hideButtonBoxes?: boolean;
  /** Theme settings for styling elements */
  theme?: RenderThemeSettings;
  /** Enable preview mode - auto-sizes text boxes to fit content */
  previewMode?: boolean;
  /** Array of visited beat IDs (for marking visited choices) */
  visitedBeats?: string[];
  /** Only show choice text when hovering over the hotspot (for movementChoice) */
  showTextOnHover?: boolean;
}

// Default theme to use if none provided
const DEFAULT_THEME: RenderThemeSettings = {
  textBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,  // Match defaultSettings.textbox.padding in GlobalSettingsInspector
    opacity: 95,
  },
  button: {
    backgroundColor: '#3b82f6',
    hoverBackgroundColor: '#2563eb',
    textColor: '#FFFFFF',
    borderColor: '#2563eb',
    borderWidth: 2,
    borderRadius: 8,
  },
  colors: {
    textColor: '#000000',
    textAlpha: 100,
  },
  fonts: {
    titleFont: 'Arial',
    textFont: 'Arial',
    buttonFont: 'Arial',
  },
  hotspot: {
    highlightColor: '#ffff00',  // Yellow highlight color (default)
    visible: true,
    showLabels: true,
    opacity: 0.3,  // Default 30% opacity (normalized 0-1)
    showInPreview: 'visible',  // Default: always show hotspots
  },
};

/**
 * Main positioned beat view component
 */
export const PositionedBeatView: React.FC<PositionedBeatViewProps> = ({
  stageWidth,
  stageHeight,
  backgroundUrl,
  backgroundColor = 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
  elements,
  onAction,
  interactive = true,
  hideTextBoxes = false,
  hideButtonBoxes = false,
  theme = DEFAULT_THEME,
  previewMode = false,
  visitedBeats = [],
  showTextOnHover = false,
}) => {
  // FIX #3: Add debugging logs
  console.log('[PositionedBeatView] ============================================');
  console.log('[PositionedBeatView] Rendering');
  console.log('[PositionedBeatView]   - previewMode:', previewMode, '(type:', typeof previewMode, ')');
  console.log('[PositionedBeatView]   - backgroundUrl:', backgroundUrl);
  console.log('[PositionedBeatView]   - backgroundColor prop:', backgroundColor);
  console.log('[PositionedBeatView]   - elements count:', elements.length);
  console.log('[PositionedBeatView]   - stageSize:', { width: stageWidth, height: stageHeight });
  console.log('[PositionedBeatView]   - willUseImage:', !!backgroundUrl);
  console.log('[PositionedBeatView]   - willUseColor:', !backgroundUrl);
  console.log('[PositionedBeatView]   - BRANCH:', previewMode ? 'FLEX LAYOUT (previewMode=true)' : 'ABSOLUTE POSITIONING (previewMode=false)');
  console.log('[PositionedBeatView] ============================================');

  // State to manage input text value (for InputText beats)
  const [inputValue, setInputValue] = React.useState('');

  // Check if this beat has an input field (indicates it's an InputText beat)
  // Check for elements with 'input' in the name regardless of kind
  const hasInputField = elements.some(el =>
    el.location.name.toLowerCase().includes('input')
  );

  // Wrapped onAction that passes input value for submit buttons in InputText beats
  const handleAction = (actionId: string) => {
    console.log('[PositionedBeatView] handleAction called');
    console.log('[PositionedBeatView]   - actionId:', actionId);
    console.log('[PositionedBeatView]   - hasInputField:', hasInputField);
    console.log('[PositionedBeatView]   - inputValue:', inputValue);
    console.log('[PositionedBeatView]   - will pass:', hasInputField ? inputValue : actionId);
    if (onAction) {
      // If this beat has an input field, pass the input value; otherwise pass actionId
      onAction(hasInputField ? inputValue : actionId);
    }
  };

  // Build container style without mixing shorthand and individual properties
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${stageWidth}px`,
    height: `${stageHeight}px`,
    overflow: 'hidden',
  };

  // Apply background styles based on whether we have a background image
  console.log('[PositionedBeatView] Setting up background style:', {
    hasBackgroundUrl: !!backgroundUrl,
    backgroundUrl: backgroundUrl?.substring(0, 50),
    backgroundColor
  });
  if (backgroundUrl) {
    // Use individual properties for background image
    console.log('[PositionedBeatView] Applying background IMAGE');
    containerStyle.backgroundImage = `url(${backgroundUrl})`;
    containerStyle.backgroundSize = 'cover';
    containerStyle.backgroundPosition = 'center';
    containerStyle.backgroundRepeat = 'no-repeat';
    console.log('[PositionedBeatView] backgroundImage set to:', containerStyle.backgroundImage);
  } else {
    // Use individual properties for color/gradient
    console.log('[PositionedBeatView] Applying background COLOR');
    containerStyle.background = backgroundColor;
    console.log('[PositionedBeatView] background set to:', containerStyle.background);
  }

  // In preview mode, use a flex layout for text and buttons to auto-flow
  if (previewMode) {
    // Separate elements by type
    const textElements = elements.filter(el =>
      el.location.kind === 'text' || el.location.kind === 'dialog'
    );
    const buttonElements = elements.filter(el =>
      el.location.kind === 'button'
    );
    const otherElements = elements.filter(el =>
      el.location.kind !== 'text' && el.location.kind !== 'dialog' && el.location.kind !== 'button'
    );

    return (
      <div style={containerStyle}>
        {/* Render other elements (characters, props) with absolute positioning */}
        {otherElements.map((element, index) => (
          <PositionedElement
            key={`other-${index}-${element.location.name}`}
            element={element}
            index={index}
            onAction={handleAction}
            interactive={interactive}
            inputValue={inputValue}
            setInputValue={setInputValue}
            hideTextBoxes={hideTextBoxes}
            hideButtonBoxes={hideButtonBoxes}
            theme={theme}
            previewMode={false} // Keep absolute for assets
            visitedBeats={visitedBeats}
            showTextOnHover={showTextOnHover}
          />
        ))}

        {/* Flex container for text and buttons */}
        <div style={{
          position: 'absolute',
          top: textElements[0]?.location.y || 50,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          padding: '0 20px',
        }}>
          {/* Text elements */}
          {textElements.map((element, index) => (
            <div
              key={`text-${index}-${element.location.name}`}
              style={{
                width: `${element.location.width}px`,
                maxWidth: '90%',
              }}
            >
              <FlexTextElement
                element={element}
                hideTextBox={hideTextBoxes}
                theme={theme}
                onAction={handleAction}
              />
            </div>
          ))}

          {/* Buttons in a row */}
          {buttonElements.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: '16px',
              justifyContent: 'center',
              width: '100%',
            }}>
              {buttonElements.map((element, index) => {
                // Check if this button leads to a visited beat
                const isButtonVisited = element.targetBeatId ? visitedBeats.includes(element.targetBeatId) : false;
                return (
                  <FlexButtonElement
                    key={`btn-${index}-${element.location.name}`}
                    element={element}
                    onAction={handleAction}
                    interactive={interactive}
                    hideButtonBox={hideButtonBoxes}
                    theme={theme}
                    isVisited={isButtonVisited}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Non-preview mode: use absolute positioning for all elements
  return (
    <div style={containerStyle}>
      {elements.map((element, index) => (
        <PositionedElement
          key={`element-${index}-${element.location.name}`}
          element={element}
          index={index}
          onAction={handleAction}
          interactive={interactive}
          inputValue={inputValue}
          setInputValue={setInputValue}
          hideTextBoxes={hideTextBoxes}
          hideButtonBoxes={hideButtonBoxes}
          theme={theme}
          previewMode={previewMode}
          visitedBeats={visitedBeats}
          showTextOnHover={showTextOnHover}
        />
      ))}
    </div>
  );
};

/**
 * Individual positioned element renderer
 */
interface PositionedElementProps {
  element: PositionedElementData;
  index: number;
  onAction?: (actionId: string) => void;
  interactive: boolean;
  inputValue?: string;
  setInputValue?: (value: string) => void;
  hideTextBoxes?: boolean;
  hideButtonBoxes?: boolean;
  theme: RenderThemeSettings;
  previewMode?: boolean;
  visitedBeats?: string[];
  showTextOnHover?: boolean;
}

const PositionedElement: React.FC<PositionedElementProps> = ({
  element,
  index,
  onAction,
  interactive,
  inputValue = '',
  setInputValue,
  hideTextBoxes = false,
  hideButtonBoxes = false,
  theme,
  previewMode = false,
  visitedBeats = [],
  showTextOnHover = false,
}) => {
  const { location, content, assetUrl, hyperlinks } = element;

  // Check if element should be visible (Phase 5 - Optional Text Boxes)
  // If visible is explicitly set to false, don't render the element
  if (location.visible === false) {
    return null;
  }

  // Build transform string with rotation and scale
  const transforms: string[] = [];
  if (location.rotation) {
    transforms.push(`rotate(${location.rotation}deg)`);
  }
  if (location.scale && location.scale !== 1) {
    transforms.push(`scale(${location.scale})`);
  }

  // DEBUG: Log the position values being used for rendering
  console.log(`[PositionedBeatView] Rendering "${location.name}" (${location.kind}) at x=${location.x}, y=${location.y}, w=${location.width}, h=${location.height}, size=${(location as any).size}`);

  // For character/prop elements, use auto sizing to preserve natural image dimensions when:
  // 1. They have a size percentage specified, OR
  // 2. They have default/scaled default dimensions (100x100 or 128x128 from ASML import)
  // The size percentage will be applied as a CSS scale transform in AssetElement
  const hasDefaultDimensions = (location.width === 100 && location.height === 100) ||
                               (location.width === 128 && location.height === 128);
  const isAssetWithSize = (location.kind === 'character' || location.kind === 'prop') &&
                          ((location as any).size !== undefined || hasDefaultDimensions);

  // Ensure text/button/dialog elements always appear above characters/props
  // Characters and props get z-index 0-99, text/button/dialog get 100+
  const isTextOrUI = ['text', 'button', 'dialog', 'hotspot'].includes(location.kind);
  const baseZIndex = isTextOrUI ? 100 : 0;
  const effectiveZIndex = (location.zIndex || index) + baseZIndex;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${location.x}px`,
    top: `${location.y}px`,
    // For assets with size percentage, don't constrain dimensions - let image use natural size
    width: isAssetWithSize ? 'auto' : `${location.width}px`,
    height: isAssetWithSize ? 'auto' : `${location.height}px`,
    zIndex: effectiveZIndex,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    transformOrigin: 'center center',
  };

  // Special handling for input fields (detected by name containing 'input')
  // This works for both text and button kinds since inputText beats may use either
  if (location.name.toLowerCase().includes('input')) {
    return (
      <InputFieldElement
        style={baseStyle}
        content={content}
        location={location}
        onAction={onAction}
        interactive={interactive}
        inputValue={inputValue}
        setInputValue={setInputValue}
        theme={theme}
      />
    );
  }

  // Render based on element kind
  switch (location.kind) {
    case 'text': {
      // Use stored dimensions directly - auto-sizing happens at import time
      return (
        <TextElement
          style={baseStyle}
          content={content}
          location={location}
          hideTextBox={hideTextBoxes}
          theme={theme}
          previewMode={previewMode}
        />
      );
    }

    case 'button': {
      // Use stored dimensions directly - auto-sizing happens at import time
      // Check if this button leads to a visited beat
      const isButtonVisited = element.targetBeatId ? visitedBeats.includes(element.targetBeatId) : false;
      return (
        <ButtonElement
          style={baseStyle}
          content={content}
          location={location}
          actionId={element.actionId}
          onAction={onAction}
          interactive={interactive}
          hideButtonBox={hideButtonBoxes}
          theme={theme}
          isVisited={isButtonVisited}
        />
      );
    }

    case 'hotspot': {
      // Check if this hotspot leads to a visited beat
      const isHotspotVisited = element.targetBeatId ? visitedBeats.includes(element.targetBeatId) : false;
      return (
        <ButtonElement
          style={baseStyle}
          content={content}
          location={location}
          actionId={element.actionId}
          onAction={onAction}
          interactive={interactive}
          hideButtonBox={true} // Always hide button box for hotspots
          editorMode={!interactive} // Editor mode when not interactive
          theme={theme}
          isVisited={isHotspotVisited}
          showTextOnHover={showTextOnHover}
        />
      );
    }

    case 'input':
      return (
        <InputFieldElement
          style={baseStyle}
          content={content}
          location={location}
          onAction={onAction}
          interactive={interactive}
          inputValue={inputValue}
          setInputValue={setInputValue}
          theme={theme}
        />
      );

    case 'dialog':
      return (
        <DialogElement
          style={baseStyle}
          content={content}
          location={location}
          hideTextBox={hideTextBoxes}
          theme={theme}
          previewMode={previewMode}
          hyperlinks={hyperlinks}
          onAction={onAction}
        />
      );

    case 'character':
    case 'prop':
      return (
        <AssetElement
          style={baseStyle}
          assetUrl={assetUrl}
          assetId={location.assetId}
          name={location.name}
          kind={location.kind}
          size={location.size}
          interactive={interactive}
          actionId={element.actionId}
          onAction={onAction}
        />
      );

    default:
      return null;
  }
};

/**
 * Text element renderer with improved autosize calculation
 */
const TextElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
  previewMode?: boolean;
}> = ({ style, content, location, hideTextBox = false, theme, previewMode = false }) => {
  const [displayedText, setDisplayedText] = React.useState('');
  const [isAnimating, setIsAnimating] = React.useState(true);

  // Typewriter animation effect
  React.useEffect(() => {
    const animation = theme.textEffects?.animation || 'none';

    if (animation === 'typewriter') {
      setDisplayedText('');
      setIsAnimating(true);
      const speed = theme.textEffects?.typewriterSpeed || 30;
      const msPerChar = 1000 / speed;
      let currentIndex = 0;

      const interval = setInterval(() => {
        if (currentIndex < content.length) {
          setDisplayedText(content.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          setIsAnimating(false);
          clearInterval(interval);
        }
      }, msPerChar);

      return () => clearInterval(interval);
    } else {
      setDisplayedText(content);
      setIsAnimating(false);
    }
  }, [content, theme.textEffects?.animation, theme.textEffects?.typewriterSpeed]);

  // Use stored fontSize directly - auto-sizing happens at import time
  // Default to 16px if not set
  const computedFontSize = location.fontSize ?? 16;

  const computedTextAlign = location.textAlign || 'center';
  // Apply font mapping: element font takes priority, falls back to theme font
  // Title/author elements use titleFont, others use textFont
  const isTitleElement = location.name?.toLowerCase().includes('title') || location.name?.toLowerCase().includes('author');
  const defaultFont = isTitleElement ? theme.fonts.titleFont : theme.fonts.textFont;
  const computedFont = location.font ? getFontFamily(location.font) : defaultFont;

  // Use theme padding or calculate based on box size
  const padding = theme.textBox.padding;

  // Convert opacity from 0-100 to 0-1
  const opacityValue = theme.textBox.opacity / 100;

  // Parse background color and add opacity
  const bgColor = hideTextBox ? 'transparent' : (theme.textBox?.backgroundColor || '#000000');
  const bgWithOpacity = hideTextBox ? 'transparent' :
    (bgColor?.startsWith?.('#') ? `${bgColor}${Math.round(opacityValue * 255).toString(16).padStart(2, '0')}` : bgColor);

  // Parse text color and add opacity
  const textColor = theme.colors.textColor;
  const textAlpha = theme.colors.textAlpha / 100;

  // Determine animation style
  const animation = theme.textEffects?.animation || 'none';
  const fadeInDuration = theme.textEffects?.fadeInDuration || 500;

  const animationStyle: React.CSSProperties = animation === 'fade'
    ? { animation: `fadeIn ${fadeInDuration}ms ease-in` }
    : {};

  // In preview mode, use auto height with min/max constraints
  const heightStyle = previewMode
    ? { height: 'auto', minHeight: '60px', maxHeight: `${location.height}px` }
    : { height: style.height };

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: ${textAlpha}; }
          }
        `}
      </style>
      <div
        style={{
          ...style,
          ...animationStyle,
          ...heightStyle,
          backgroundColor: bgWithOpacity,
          padding: hideTextBox ? '0' : `${padding}px`,
          border: hideTextBox ? 'none' : `${theme.textBox.borderWidth}px solid ${theme.textBox.borderColor}`,
          borderRadius: hideTextBox ? '0' : `${theme.textBox.borderRadius}px`,
          fontSize: `${computedFontSize}px`,
          fontFamily: computedFont,
          fontWeight: '500',
          color: textColor,
          opacity: animation === 'fade' ? undefined : textAlpha,
          boxShadow: hideTextBox ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: computedTextAlign,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          overflow: 'auto', // Allow scrolling if text still doesn't fit
          lineHeight: '1.4',
          boxSizing: 'border-box',
          // Use CSS table-cell for vertical centering that clips from bottom, not center
          display: 'table',
        }}
      >
        <span style={{
          display: 'table-cell',
          verticalAlign: 'middle',
          textAlign: computedTextAlign,
        }}>
          {displayedText}
        </span>
      </div>
    </>
  );
};

/**
 * Convert hex color to rgba with opacity
 */
function hexToRgba(hex: string, opacity: number): string {
  // Handle invalid or non-hex values
  if (!hex || !hex.startsWith('#')) {
    return `rgba(255, 255, 0, ${opacity})`; // Default yellow
  }
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return `rgba(255, 255, 0, ${opacity})`; // Default yellow
  }
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Button element renderer
 */
const ButtonElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  actionId?: string; // Optional actionId to override location.name
  onAction?: (actionId: string) => void;
  interactive: boolean;
  hideButtonBox?: boolean;
  editorMode?: boolean;
  theme: RenderThemeSettings;
  isVisited?: boolean; // Whether this choice leads to an already-visited beat
  showTextOnHover?: boolean; // Only show text when hovering over the hotspot
}> = ({ style, content, location, actionId, onAction, interactive, hideButtonBox = false, editorMode = false, theme, isVisited = false, showTextOnHover = false }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Use stored fontSize directly - auto-sizing happens at import time
  // Default to 16px if not set
  const computedFontSize = location.fontSize ?? 16;

  const computedTextAlign = location.textAlign || 'center';
  const computedFont = location.font || theme.fonts.buttonFont;

  // Use fixed, compact padding for better appearance
  const paddingHorizontal = 12;
  const paddingVertical = 6;

  // Get hotspot settings from theme
  const hotspotColor = theme.hotspot?.highlightColor || '#ffff00';
  const hotspotOpacity = theme.hotspot?.opacity ?? 0.3;  // 0-1 normalized
  const showInPreview = theme.hotspot?.showInPreview ?? 'visible';
  const hotspotVisible = theme.hotspot?.visible ?? true;  // "Show hotspots" checkbox

  // Determine if this is preview mode (interactive but not in editor)
  const isPreviewMode = interactive && !editorMode;

  // Determine background color based on mode and visited state
  let backgroundColor: string;
  if (hideButtonBox) {
    // Hotspot mode: use highlight color with configurable opacity
    if (editorMode) {
      // Editor mode: always show with slightly reduced opacity
      const baseOpacity = hotspotOpacity * 0.7;
      const hoverOpacity = hotspotOpacity * 1.3;
      backgroundColor = hexToRgba(hotspotColor, isHovered ? hoverOpacity : baseOpacity);
    } else if (!hotspotVisible) {
      // "Show hotspots" unchecked: fully transparent but tooltips still work
      backgroundColor = 'transparent';
    } else if (showInPreview === 'invisible') {
      // Invisible mode: fully transparent (no tooltip either)
      backgroundColor = 'transparent';
    } else if (showInPreview === 'onHover') {
      // Only visible on hover
      backgroundColor = isHovered ? hexToRgba(hotspotColor, hotspotOpacity) : 'transparent';
    } else {
      // Normal visible mode
      const hoverOpacity = Math.min(hotspotOpacity * 1.5, 1);
      backgroundColor = hexToRgba(hotspotColor, isHovered ? hoverOpacity : hotspotOpacity);
    }
  } else if (isVisited) {
    // Visited state: use a dimmed gray color
    backgroundColor = isHovered ? '#c0c0c0' : '#e0e0e0';
  } else {
    backgroundColor = isHovered ? theme.button.hoverBackgroundColor : theme.button.backgroundColor;
  }

  // Determine border color based on mode
  let borderColor: string;
  let borderStyle: string;
  if (hideButtonBox) {
    // Hotspot: use highlight color for border in editor mode
    borderColor = hotspotColor;
    borderStyle = editorMode ? `2px dashed ${hexToRgba(hotspotColor, 0.7)}` : 'none';
  } else if (isVisited) {
    borderColor = '#999999';
    borderStyle = `${theme.button.borderWidth}px solid ${borderColor}`;
  } else {
    borderColor = theme.button.borderColor;
    borderStyle = `${theme.button.borderWidth}px solid ${borderColor}`;
  }

  // Determine if text should be visible inside the button
  // For hotspots in PREVIEW mode (interactive, not editorMode): hide text, use tooltip instead
  // For hotspots in EDITOR mode: show text inside so users can see/edit labels
  // For regular buttons: always show text
  const shouldShowText = !hideButtonBox || !isPreviewMode;

  const buttonStyle: React.CSSProperties = {
    ...style,
    backgroundColor,
    color: hideButtonBox ? theme.colors.textColor : (isVisited ? '#666666' : theme.button.textColor),
    border: borderStyle,
    opacity: isVisited ? 0.7 : 1,
    borderRadius: hideButtonBox ? '4px' : `${theme.button.borderRadius}px`,
    padding: hideButtonBox ? '8px 12px' : `${paddingVertical}px ${paddingHorizontal}px`,
    fontSize: `${computedFontSize}px`,
    fontFamily: computedFont,
    fontWeight: '600',
    textAlign: computedTextAlign,
    transition: 'all 0.2s',
    boxShadow: hideButtonBox ? 'none' : (isHovered ? '0 4px 8px rgba(0,0,0,0.12)' : '0 2px 4px rgba(0,0,0,0.08)'),
    transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
    cursor: interactive ? 'pointer' : 'default',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '1.2',
    overflow: 'hidden',
  };


  const handleClick = async () => {
    if (interactive) {
      // Play sound if assigned
      if (location.sound) {
        try {
          const audioManager = getAudioManager();

          // Check if it's a preset sound
          if (isPresetSound(location.sound)) {
            const preset = getPresetSound(location.sound);
            if (preset) {
              console.log(`[ButtonElement] Playing preset sound: ${preset.name}`);
              await audioManager.playSound(preset.url, preset.volume);
            }
          } else {
            // Custom asset - for now, assume it's a direct URL or will be resolved later
            console.log(`[ButtonElement] Playing custom sound: ${location.sound}`);
            await audioManager.playSound(location.sound);
          }
        } catch (error) {
          console.error('[ButtonElement] Error playing sound:', error);
          // Don't block the action if sound fails
        }
      }

      // Then call the action
      if (onAction) {
        // Use actionId if available (for movementChoice, pickProp, etc.), otherwise use location name
        const actionIdToPass = actionId || location.name || 'continue';
        onAction(actionIdToPass);
      }
    }
  };

  // Show custom tooltip in PREVIEW mode for hotspots (not in editor mode)
  // Don't show tooltip in invisible mode or when labels are disabled
  const showLabels = theme.hotspot?.showLabels ?? true;
  const showTooltip = hideButtonBox && isPreviewMode && showInPreview !== 'invisible' && showLabels && content && content.length > 0 && isHovered;

  // Handle mouse move to track cursor position for tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Tooltip styles using theme colors
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: mousePos.x + 12,
    top: mousePos.y - 8,
    backgroundColor: theme.button.backgroundColor,
    color: theme.button.textColor,
    padding: '6px 12px',
    borderRadius: `${theme.button.borderRadius}px`,
    fontSize: '14px',
    fontFamily: theme.fonts.buttonFont,
    fontWeight: '600',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    border: `1px solid ${theme.button.borderColor}`,
    pointerEvents: 'none',
    zIndex: 10000,
    whiteSpace: 'nowrap',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <>
      <button
        ref={buttonRef}
        style={buttonStyle}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseMove={handleMouseMove}
        disabled={!interactive}
      >
        {shouldShowText ? content : ''}
      </button>
      {showTooltip && ReactDOM.createPortal(
        <div style={tooltipStyle}>{content}</div>,
        document.body
      )}
    </>
  );
};

/**
 * Input field element renderer
 */
const InputFieldElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  onAction?: (actionId: string) => void;
  interactive: boolean;
  inputValue?: string;
  setInputValue?: (value: string) => void;
  theme: RenderThemeSettings;
}> = ({ style, content, location, onAction, interactive, inputValue = '', setInputValue, theme }) => {

  // Calculate font size based on autosize setting or explicit fontSize
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else if (location.autosize !== false) {
    // Auto-size for input fields - simpler logic
    computedFontSize = Math.min(Math.floor(location.height * 0.4), 24);
  } else {
    computedFontSize = 16;
  }

  const computedTextAlign = location.textAlign || 'left';
  const computedFont = location.font || 'Arial';

  // Calculate padding as percentage of box size
  const paddingHorizontal = Math.max(Math.floor(location.width * 0.03), 12);
  const paddingVertical = Math.max(Math.floor(location.height * 0.15), 8);

  const inputStyle: React.CSSProperties = {
    ...style,
    backgroundColor: '#fff',
    color: '#000',
    border: '2px solid #d1d5db',
    borderRadius: '8px',
    padding: `${paddingVertical}px ${paddingHorizontal}px`,
    fontSize: `${computedFontSize}px`,
    fontFamily: computedFont,
    textAlign: computedTextAlign,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    cursor: interactive ? 'text' : 'default',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <input
      type="text"
      style={inputStyle}
      placeholder={content}
      value={inputValue}
      onChange={(e) => setInputValue?.(e.target.value)}
      disabled={!interactive}
      data-input-field="true"
    />
  );
};

/**
 * HyperTextContent - renders text with clickable link words
 * Finds each hyperlink word in the text and wraps it in a clickable span
 */
const HyperTextContent: React.FC<{
  text: string;
  hyperlinks: HyperlinkData[];
  onLinkClick: (targetBeatId: string) => void;
  defaultLinkStyle?: React.CSSProperties;
}> = ({ text, hyperlinks, onLinkClick, defaultLinkStyle }) => {
  const [hoveredLink, setHoveredLink] = React.useState<string | null>(null);

  // If no hyperlinks, just return plain text
  if (!hyperlinks || hyperlinks.length === 0) {
    return <>{text}</>;
  }

  // Build segments: find each hyperlink word in the text and split around them
  // Sort hyperlinks by their position in the text (first occurrence)
  const sortedLinks = [...hyperlinks]
    .map(link => ({
      ...link,
      index: text.indexOf(link.word),
    }))
    .filter(link => link.index >= 0) // Only include links whose words are found in text
    .sort((a, b) => a.index - b.index);

  if (sortedLinks.length === 0) {
    return <>{text}</>;
  }

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedLinks.forEach((link, i) => {
    // Add text before this link
    if (link.index > lastIndex) {
      segments.push(
        <span key={`text-${i}`}>{text.substring(lastIndex, link.index)}</span>
      );
    }

    // Add the clickable link
    const isHovered = hoveredLink === link.word;
    const linkStyle: React.CSSProperties = {
      color: isHovered && link.style?.hoverColor ? link.style.hoverColor : (link.style?.color || '#3b82f6'),
      textDecoration: link.style?.underline !== false ? 'underline' : 'none',
      fontWeight: link.style?.bold ? 'bold' : 'inherit',
      cursor: 'pointer',
      ...defaultLinkStyle,
    };

    segments.push(
      <span
        key={`link-${i}`}
        style={linkStyle}
        onClick={(e) => {
          e.stopPropagation();
          console.log(`[HyperTextContent] Link clicked: "${link.word}" → ${link.targetBeatId}`);
          onLinkClick(link.targetBeatId);
        }}
        onMouseEnter={() => setHoveredLink(link.word)}
        onMouseLeave={() => setHoveredLink(null)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLinkClick(link.targetBeatId);
          }
        }}
      >
        {link.word}
      </span>
    );

    lastIndex = link.index + link.word.length;
  });

  // Add any remaining text after the last link
  if (lastIndex < text.length) {
    segments.push(
      <span key="text-end">{text.substring(lastIndex)}</span>
    );
  }

  return <>{segments}</>;
};

/**
 * Dialog element renderer
 */
const DialogElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
  previewMode?: boolean;
  hyperlinks?: HyperlinkData[];
  onAction?: (actionId: string) => void;
}> = ({ style, content, location, hideTextBox = false, theme, previewMode = false, hyperlinks, onAction }) => {
  // Calculate font size
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else if (location.autosize !== false) {
    computedFontSize = Math.min(Math.floor(location.height * 0.25), 24);
  } else {
    computedFontSize = 16;
  }

  const computedTextAlign = location.textAlign || 'left';
  const computedFont = location.font || 'Arial';

  // Calculate padding as percentage of box size
  const paddingHorizontal = Math.max(Math.floor(location.width * 0.04), 12);
  const paddingVertical = Math.max(Math.floor(location.height * 0.1), 12);

  // In preview mode, use auto height with min/max constraints
  const heightStyle = previewMode
    ? { height: 'auto', minHeight: '60px', maxHeight: `${location.height}px` }
    : { height: style.height };

  return (
    <div
      style={{
        ...style,
        ...heightStyle,
        backgroundColor: hideTextBox ? 'transparent' : 'rgba(255, 255, 255, 0.95)',
        borderRadius: hideTextBox ? '0' : '12px',
        padding: hideTextBox ? '0' : `${paddingVertical}px ${paddingHorizontal}px`,
        fontSize: `${computedFontSize}px`,
        fontFamily: computedFont,
        color: '#1f2937',
        boxShadow: hideTextBox ? 'none' : '0 4px 12px rgba(0,0,0,0.15)',
        textAlign: computedTextAlign,
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        boxSizing: 'border-box',
        display: 'block',
        lineHeight: '1.5',
        overflow: 'hidden',
      }}
    >
      {hyperlinks && hyperlinks.length > 0 && onAction ? (
        <HyperTextContent
          text={content}
          hyperlinks={hyperlinks}
          onLinkClick={onAction}
        />
      ) : (
        content
      )}
    </div>
  );
};

/**
 * Asset element renderer (character/prop)
 */
const AssetElement: React.FC<{
  style: React.CSSProperties;
  assetUrl?: string;
  assetId?: string;
  name: string;
  kind: string;
  size?: number;  // Character-specific: scale percentage (e.g., 90 = 90% scale)
  interactive?: boolean;
  actionId?: string;
  onAction?: (id: string) => void;
}> = ({ style, assetUrl, assetId, name, kind, size, interactive, actionId, onAction }) => {
  // Click handler for interactive props (PickProp beat)
  const handleClick = () => {
    if (interactive && actionId && onAction) {
      console.log(`[AssetElement] Clicked "${name}" with actionId: ${actionId}`);
      onAction(actionId);
    }
  };

  const isClickable = interactive && actionId && onAction;
  // Apply character-specific size scaling
  // size is a percentage (e.g., 90 means 90% of the original size, 115 means 115%)
  const finalStyle: React.CSSProperties = { ...style };

  // Always apply size scaling for character/prop elements when size is defined
  // This works with width/height: 'auto' to scale the natural image dimensions
  if (size !== undefined) {
    const scaleFactor = size / 100;
    // Add scale transform to existing transforms
    const existingTransform = finalStyle.transform || '';
    finalStyle.transform = existingTransform
      ? `${existingTransform} scale(${scaleFactor})`
      : `scale(${scaleFactor})`;
    // Keep the transform origin at top-left so position matches
    finalStyle.transformOrigin = 'top left';
  }

  if (assetUrl) {
    return (
      <img
        src={assetUrl}
        alt={name}
        style={{
          ...finalStyle,
          // Don't constrain image - let it render at natural size (scaled by size %)
          objectFit: 'none',
          maxWidth: 'none',
          maxHeight: 'none',
          // Make clickable props visually interactive
          cursor: isClickable ? 'pointer' : 'default',
          transition: isClickable ? 'transform 0.1s ease, filter 0.1s ease' : undefined,
        }}
        draggable={false}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (isClickable) {
            e.currentTarget.style.filter = 'brightness(1.1)';
            e.currentTarget.style.transform = (finalStyle.transform || '') + ' scale(1.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (isClickable) {
            e.currentTarget.style.filter = '';
            e.currentTarget.style.transform = finalStyle.transform || '';
          }
        }}
      />
    );
  }

  // Placeholder for missing asset - use reasonable default size
  const placeholderStyle: React.CSSProperties = {
    ...finalStyle,
    // Use explicit dimensions for placeholder when style has 'auto'
    width: style.width === 'auto' ? '150px' : style.width,
    height: style.height === 'auto' ? '200px' : style.height,
    backgroundColor: 'rgba(211, 211, 211, 0.5)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: '#6b7280',
    border: '2px dashed #9ca3af',
    padding: '8px',
    textAlign: 'center',
  };

  return (
    <div style={placeholderStyle}>
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{name}</div>
      <div style={{ fontSize: '10px', opacity: 0.7 }}>({kind})</div>
      {assetId && (
        <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', wordBreak: 'break-all' }}>
          Asset ID: {assetId}
        </div>
      )}
    </div>
  );
};

/**
 * Helper function to create positioned element data from locations and content
 * @param assetResolver Optional function to resolve asset IDs to URLs
 */
/**
 * Convert base64 data URL to blob URL (to avoid memory issues)
 */
function convertBase64ToBlob(base64: string): string {
  if (!base64.startsWith('data:')) {
    return base64; // Not a data URL, return as-is
  }
  try {
    const parts = base64.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    const blob = new Blob([u8arr], { type: mime });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('[PositionedBeatView] Error converting base64 to blob:', error);
    return base64; // Fallback to original
  }
}

export function createPositionedElementData(
  locations: Location[],
  content: Record<string, any>,
  beatType: string,
  assetResolver?: (assetId: string) => string | undefined,
  characterResolver?: (characterId: string, stateId?: string) => string | undefined
): PositionedElementData[] {
  console.log('[createPositionedElementData] Creating elements:', { beatType, content, locationCount: locations.length });

  return locations.map((location) => {
    const elementContent = getContentForLocation(location, content, beatType);
    console.log(`[createPositionedElementData] Location "${location.name}" (${location.kind}) → content: "${elementContent}"`);

    // Resolve asset URL: handle character elements specially
    let resolvedAssetUrl: string | undefined;

    // For character elements, use characterResolver to resolve characterId + stateId to image URL
    if (location.kind === 'character' && location.characterId && characterResolver) {
      resolvedAssetUrl = characterResolver(location.characterId, location.stateId);
      console.log(`[createPositionedElementData] Character "${location.name}" → resolved via characterResolver: ${resolvedAssetUrl ? 'found' : 'not found'}`);
    }

    // Fall back to assetId resolution for non-character elements or if character resolver didn't find anything
    if (!resolvedAssetUrl && location.assetId && assetResolver) {
      resolvedAssetUrl = assetResolver(location.assetId);
    }
    if (!resolvedAssetUrl && location.imageUrl) {
      resolvedAssetUrl = location.imageUrl;
      // Convert base64 to blob URL if needed
      if (resolvedAssetUrl.startsWith('data:')) {
        resolvedAssetUrl = convertBase64ToBlob(resolvedAssetUrl);
        console.log(`[createPositionedElementData] Converted base64 to blob URL for "${location.name}"`);
      }
    }

    // Extract actionId and targetBeatId for beats that have choice/option mappings
    // Only set targetBeatId when content.markVisited is true (per-beat toggle)
    let actionId: string | undefined;
    let targetBeatId: string | undefined;
    const markVisited = content.markVisited || false;

    // For movementChoice: match location.name to choice properties with multiple fallbacks
    if (beatType === 'movementChoice' && content.choices && Array.isArray(content.choices)) {
      // Try matching by text first (since SchemaLocationInitializer uses choice.text for location.name)
      let choice = content.choices.find((c: any) => c.text === location.name);
      // Fallback to location match
      if (!choice) {
        choice = content.choices.find((c: any) => c.location === location.name);
      }
      // Fallback to id match (for legacy imports where hotspot name matches choice id)
      if (!choice) {
        choice = content.choices.find((c: any) => c.id === location.name);
      }
      // Fallback to index match if location.name has numeric suffix (e.g., "hotspot_0" → choices[0])
      if (!choice && location.name) {
        const indexMatch = location.name.match(/[_-]?(\d+)$/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1], 10);
          if (index >= 0 && index < content.choices.length) {
            choice = content.choices[index];
            console.log(`[createPositionedElementData] MovementChoice: matched by index ${index}`);
          }
        }
      }
      // Fallback to case-insensitive partial match - ONLY for hotspot elements
      // Don't try to match text, character, or other non-interactive elements to choices
      if (!choice && location.name && location.kind === 'hotspot') {
        const locNameLower = location.name.toLowerCase();
        choice = content.choices.find((c: any) => {
          // Only match if both sides have content
          const choiceText = c.text?.toLowerCase();
          const choiceLoc = c.location?.toLowerCase();
          if (choiceText && choiceText.includes(locNameLower)) return true;
          if (choiceLoc && choiceLoc.includes(locNameLower)) return true;
          if (choiceText && locNameLower.includes(choiceText)) return true;
          if (choiceLoc && locNameLower.includes(choiceLoc)) return true;
          return false;
        });
        if (choice) {
          console.log(`[createPositionedElementData] MovementChoice: matched by partial/case-insensitive match`);
        }
      }
      if (choice) {
        actionId = choice.id;
        // Only set targetBeatId when markVisited is enabled for this beat
        if (markVisited) {
          targetBeatId = choice.target;
        }
        console.log(`[createPositionedElementData] MovementChoice: location "${location.name}" → choice ID "${actionId}", target "${targetBeatId}", markVisited=${markVisited}`);
      } else {
        console.warn(`[createPositionedElementData] MovementChoice: NO MATCH for location "${location.name}"`);
        console.log(`[createPositionedElementData] Available choices:`, content.choices.map((c: any) => ({ id: c.id, text: c.text, location: c.location })));
      }
    }

    // For dialogTree: match location.name to choice.text or index to get choice.id
    if (beatType === 'dialogTree' && content.choices && Array.isArray(content.choices)) {
      const locNameLower = location.name?.toLowerCase() || '';
      // Try exact text match first
      let choice = content.choices.find((c: any) => c.text === location.name);
      if (!choice) {
        // Try matching by index (e.g., "button1" → choices[0])
        const indexMatch = locNameLower.match(/button\s*(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1], 10) - 1;
          if (index >= 0 && index < content.choices.length) {
            choice = content.choices[index];
            console.log(`[createPositionedElementData] DialogTree: matched by index ${index}`);
          }
        }
      }
      // Fallback: use first choice for any button
      if (!choice && location.kind === 'button' && content.choices.length > 0) {
        choice = content.choices[0];
        console.log(`[createPositionedElementData] DialogTree: using first choice as fallback`);
      }
      if (choice) {
        actionId = choice.id;
        // DialogTree choices can have target (beat ID) or dialogNode (nested dialog)
        // Only set targetBeatId when markVisited is enabled for this beat
        if (markVisited) {
          targetBeatId = choice.target;
        }
        console.log(`[createPositionedElementData] DialogTree: location "${location.name}" → choice ID "${actionId}", target "${targetBeatId}", markVisited=${markVisited}`);
      }
    }

    // For pickProp: match location.name to prop.name to get prop.id
    if (beatType === 'pickProp' && content.props && Array.isArray(content.props)) {
      const prop = content.props.find((p: any) => p.name === location.name);
      if (prop) {
        actionId = prop.id;
        // Only set targetBeatId when markVisited is enabled for this beat
        if (markVisited) {
          targetBeatId = prop.target;
        }
        console.log(`[createPositionedElementData] PickProp: location "${location.name}" → prop ID "${actionId}", target "${targetBeatId}", markVisited=${markVisited}`);
      }
    }

    // For hyperText: include hyperlinks data for clickable text rendering
    // The links array may come from content.links (from renderHyperText) or content.hyperlinks (from beat params)
    let hyperlinks: HyperlinkData[] | undefined;
    if (beatType === 'hyperText') {
      const links = content.links || content.hyperlinks;
      if (links && Array.isArray(links)) {
        hyperlinks = links.map((link: any) => ({
          word: link.word,
          targetBeatId: link.targetBeatId || link.target,
          style: link.style,
        }));
        console.log(`[createPositionedElementData] HyperText: found ${hyperlinks.length} hyperlinks`);
      }
    }

    return {
      location,
      content: elementContent,
      assetUrl: resolvedAssetUrl,
      actionId,
      targetBeatId, // Include target beat ID for visited marking
      hyperlinks,
    };
  });
}

// Import beat definitions for schema-driven mapping
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

/**
 * Smart content resolution - finds the right content for each location
 * Uses schema-driven approach when possible, falls back to heuristics
 */
function getContentForLocation(
  loc: Location,
  content: Record<string, any>,
  beatType: string
): string {
  const nameLower = loc.name?.toLowerCase() || '';

  // ========================================
  // SCHEMA-DRIVEN MAPPING (highest priority)
  // Try to use locationMapping from beat schema
  // ========================================
  const beatDef = (beatDefinitions as any).beatTypes[beatType];
  if (beatDef?.locationMapping) {
    // Try to find a mapping for this location
    for (const [locationKey, paramKey] of Object.entries(beatDef.locationMapping)) {
      if (nameLower.includes(locationKey.toLowerCase())) {
        const value = content[paramKey as string];
        if (value !== undefined && value !== null) {
          console.log(`[getContentForLocation] Schema mapping: ${loc.name} → ${paramKey} = "${value}"`);
          return String(value);
        }
      }
    }
  }

  // ========================================
  // BEAT-TYPE-SPECIFIC CHECKS (fallback for legacy/complex cases)
  // These handle special cases not covered by simple schema mapping
  // ========================================

  // Title Screen specific elements
  if (beatType === 'titleScreen') {
    if (nameLower.includes('title') && !nameLower.includes('screen')) {
      return content.title || 'Untitled';
    }
    if (nameLower.includes('author')) {
      return content.author ? `by ${content.author}` : '';
    }
    if (nameLower === 'startbutton' || (nameLower.includes('start') && nameLower.includes('button'))) {
      return content.buttonText || 'Start';
    }
  }

  // Intro Text / Dur Screen specific elements
  if (beatType === 'introText' || beatType === 'durScreen') {
    if (nameLower.includes('text') || nameLower.includes('message')) {
      return content.text || '';
    }
    if (nameLower.includes('button') || nameLower.includes('continue')) {
      return content.buttonText || 'Continue';
    }
  }

  // Dialog Tree specific elements
  if (beatType === 'dialogTree') {
    // Text element for dialog content
    if (loc.kind === 'text' || nameLower.includes('text') || nameLower.includes('dialog')) {
      return content.text || '';
    }
    // Button elements - match by choice text or index
    if (loc.kind === 'button' && content.choices && content.choices.length > 0) {
      // Try exact match first
      const exactChoice = content.choices.find((c: any) => c.text === loc.name);
      if (exactChoice) {
        return exactChoice.text;
      }
      // Try matching by index (e.g., "button1" → choices[0], "button2" → choices[1])
      const indexMatch = nameLower.match(/button\s*(\d+)/);
      if (indexMatch) {
        const index = parseInt(indexMatch[1], 10) - 1; // button1 = index 0
        if (index >= 0 && index < content.choices.length) {
          return content.choices[index].text;
        }
      }
      // Fallback: return first choice text for any button
      return content.choices[0].text;
    }
  }

  // End Screen specific elements
  if (beatType === 'endScreen') {
    // Check for specific patterns first
    if (nameLower.includes('restart') || nameLower.includes('play') || nameLower.includes('again')) {
      return content.restartText || content.buttonText || 'Play Again';
    }
    if (nameLower.includes('credits')) {
      return content.creditsText || 'Credits';
    }
    if (nameLower.includes('message') || nameLower.includes('end') || nameLower.includes('text')) {
      return content.message || 'The End';
    }
    // Fallback based on element kind for legacy imports
    if (loc.kind === 'button') {
      // Any button on endScreen is likely restart or credits
      return content.restartText || content.buttonText || 'Play Again';
    }
    if (loc.kind === 'text') {
      // Any text on endScreen is likely the message
      return content.message || 'The End';
    }
  }

  // Movement Choice specific elements
  if (beatType === 'movementChoice') {
    if (nameLower.includes('question')) {
      return content.question || 'Where do you want to go?';
    }
    // Handle individual location hotspots - match by name or text first
    if (content.choices) {
      // Try exact match first (case-insensitive)
      const exactMatch = content.choices.find((c: any) =>
        (c.text && c.text.toLowerCase() === nameLower) ||
        (c.location && c.location.toLowerCase() === nameLower)
      );
      if (exactMatch) {
        return exactMatch.text || exactMatch.location;
      }
      // Try partial match
      const partialMatch = content.choices.find((c: any) =>
        (c.text && c.text.toLowerCase().includes(nameLower)) ||
        (c.location && c.location.toLowerCase().includes(nameLower)) ||
        (nameLower.includes(c.text?.toLowerCase())) ||
        (nameLower.includes(c.location?.toLowerCase()))
      );
      if (partialMatch) {
        return partialMatch.text || partialMatch.location;
      }
      // Try to match location number
      const locationNum = nameLower.match(/location\s*(\d+)/);
      if (locationNum && content.choices[parseInt(locationNum[1]) - 1]) {
        const choice = content.choices[parseInt(locationNum[1]) - 1];
        return choice.text || choice.location || `Location ${locationNum[1]}`;
      }
    }
  }

  // ========================================
  // GENERIC CHECKS (lower priority fallbacks)
  // ========================================

  // Button elements
  if (nameLower.includes('continue')) return content.buttonText || 'Continue';
  if (nameLower.includes('submit')) return content.buttonText || 'Continue';

  // Generic restart/credits buttons
  if (nameLower.includes('restart') || nameLower.includes('play again')) {
    return content.restartText || 'Play Again';
  }
  if (nameLower.includes('credits')) return content.creditsText || 'Credits';
  if (nameLower.includes('skip')) return 'Skip Video';
  
  // Dialog Tree elements
  if (nameLower.includes('dialog') || loc.kind === 'dialog') {
    return content.text || content.speaker || '';
  }
  
  // Choice buttons for DialogTree and Movement
  if (nameLower.includes('choice')) {
    const choiceNum = nameLower.match(/choice\s*(\d+)/);
    if (choiceNum && content.choices && content.choices[parseInt(choiceNum[1]) - 1]) {
      const choice = content.choices[parseInt(choiceNum[1]) - 1];
      return typeof choice === 'string' ? choice : (choice.text || choice.name || `Choice ${choiceNum[1]}`);
    }
  }
  
  // Location buttons for Movement beats
  if (nameLower.includes('location')) {
    const locNum = nameLower.match(/location\s*(\d+)/);
    if (locNum && content.choices && content.choices[parseInt(locNum[1]) - 1]) {
      const choice = content.choices[parseInt(locNum[1]) - 1];
      return typeof choice === 'string' ? choice : (choice.text || choice.location || `Location ${locNum[1]}`);
    }
  }
  
  // Prop buttons for PickProp beats
  if (nameLower.includes('prop')) {
    const propNum = nameLower.match(/prop\s*(\d+)/);
    if (propNum && content.props && content.props[parseInt(propNum[1]) - 1]) {
      const prop = content.props[parseInt(propNum[1]) - 1];
      return typeof prop === 'string' ? prop : (prop.name || prop.text || `Prop ${propNum[1]}`);
    }
  }
  
  // Question text for Movement and PickProp - check both 'question' name AND 'text' name
  if (nameLower.includes('question') || (nameLower === 'text' && (beatType === 'movementChoice' || beatType === 'pickProp'))) {
    return content.question || content.text || '';
  }
  
  // InputText elements
  if (nameLower.includes('prompt')) {
    return content.prompt || '';
  }
  if (nameLower.includes('input') && nameLower.includes('field')) {
    return content.placeholder || 'Type here...';
  }
  
  // HyperText - only render the text location, not the hyperlinks location
  if (nameLower.includes('hypertext') || (beatType === 'hyperText' && (nameLower.includes('main') || nameLower.includes('text')))) {
    return content.text || '';
  }

  // Skip hyperlinks location for hyperText - the links are rendered as part of the text element
  if (beatType === 'hyperText' && nameLower.includes('hyperlink')) {
    return ''; // Return empty to avoid duplicate text
  }

  // Skip "Main Text" elements - they are deprecated and cause duplication
  if (nameLower.includes('main') && nameLower.includes('text')) {
    return ''; // Return empty content to effectively hide this element
  }

  // Video placeholder
  if (nameLower.includes('video')) {
    return 'Video Player';
  }

  // Fallback for buttons/hotspots
  if (loc.kind === 'button' || loc.kind === 'hotspot') {
    return content.buttonText || loc.name || 'Continue';
  }
  
  // Fallback for text (dialog already handled above)
  if (loc.kind === 'text') {
    return content.text || '';
  }

  // Ultimate fallback
  return content.text || content.message || content.prompt || content.question || loc.name || '';
}

// ============================================
// FLEX LAYOUT COMPONENTS (for preview mode)
// These render without absolute positioning
// ============================================

/**
 * Text element for flex layout (no absolute positioning)
 */
const FlexTextElement: React.FC<{
  element: PositionedElementData;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
  onAction?: (actionId: string) => void;
}> = ({ element, hideTextBox = false, theme, onAction }) => {
  const { location, content, hyperlinks } = element;

  // Calculate font size
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else {
    // Default size for flex layout
    computedFontSize = 20;
  }

  const computedTextAlign = location.textAlign || 'center';
  // Title/author elements use titleFont, others use textFont
  const isTitleElement = location.name?.toLowerCase().includes('title') || location.name?.toLowerCase().includes('author');
  const defaultFont = isTitleElement ? theme.fonts.titleFont : theme.fonts.textFont;
  const computedFont = location.font || defaultFont;
  const padding = theme.textBox.padding;

  // Convert opacity from 0-100 to 0-1
  const opacityValue = theme.textBox.opacity / 100;
  const bgColor = hideTextBox ? 'transparent' : theme.textBox.backgroundColor;
  const bgWithOpacity = hideTextBox ? 'transparent' :
    (bgColor.startsWith('#') ? `${bgColor}${Math.round(opacityValue * 255).toString(16).padStart(2, '0')}` : bgColor);

  const textColor = theme.colors.textColor;
  const textAlpha = theme.colors.textAlpha / 100;

  return (
    <div
      style={{
        backgroundColor: bgWithOpacity,
        padding: hideTextBox ? '0' : `${padding}px`,
        border: hideTextBox ? 'none' : `${theme.textBox.borderWidth}px solid ${theme.textBox.borderColor}`,
        borderRadius: hideTextBox ? '0' : `${theme.textBox.borderRadius}px`,
        fontSize: `${computedFontSize}px`,
        fontFamily: computedFont,
        fontWeight: '500',
        color: textColor,
        opacity: textAlpha,
        boxShadow: hideTextBox ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
        textAlign: computedTextAlign,
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        lineHeight: '1.4',
        boxSizing: 'border-box',
      }}
    >
      {hyperlinks && hyperlinks.length > 0 && onAction ? (
        <HyperTextContent
          text={content}
          hyperlinks={hyperlinks}
          onLinkClick={onAction}
        />
      ) : (
        content
      )}
    </div>
  );
};

/**
 * Button element for flex layout (no absolute positioning)
 */
const FlexButtonElement: React.FC<{
  element: PositionedElementData;
  onAction?: (actionId: string) => void;
  interactive: boolean;
  hideButtonBox?: boolean;
  theme: RenderThemeSettings;
  isVisited?: boolean;
}> = ({ element, onAction, interactive, hideButtonBox = false, theme, isVisited = false }) => {
  const { location, content, actionId } = element;
  const [isHovered, setIsHovered] = React.useState(false);

  // Calculate font size
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else {
    computedFontSize = 18;
  }

  const computedTextAlign = location.textAlign || 'center';
  const computedFont = location.font || theme.fonts.buttonFont;

  // Determine background color based on visited state
  let backgroundColor: string;
  if (hideButtonBox) {
    backgroundColor = 'transparent';
  } else if (isVisited) {
    backgroundColor = isHovered ? '#c0c0c0' : '#e0e0e0';
  } else {
    backgroundColor = isHovered ? theme.button.hoverBackgroundColor : theme.button.backgroundColor;
  }

  // Determine border color based on visited state
  const borderColor = isVisited && !hideButtonBox ? '#999999' : theme.button.borderColor;

  const handleClick = async () => {
    if (interactive) {
      // Play sound if assigned
      if (location.sound) {
        try {
          const audioManager = getAudioManager();

          // Check if it's a preset sound
          if (isPresetSound(location.sound)) {
            const preset = getPresetSound(location.sound);
            if (preset) {
              console.log(`[FlexButtonElement] Playing preset sound: ${preset.name}`);
              await audioManager.playSound(preset.url, preset.volume);
            }
          } else {
            // Custom asset
            console.log(`[FlexButtonElement] Playing custom sound: ${location.sound}`);
            await audioManager.playSound(location.sound);
          }
        } catch (error) {
          console.error('[FlexButtonElement] Error playing sound:', error);
          // Don't block the action if sound fails
        }
      }

      // Then call the action
      if (onAction) {
        const actionIdToPass = actionId || location.name || 'continue';
        onAction(actionIdToPass);
      }
    }
  };

  return (
    <button
      style={{
        minWidth: `${Math.min(location.width, 200)}px`,
        padding: hideButtonBox ? '0' : '12px 24px',
        backgroundColor,
        color: hideButtonBox ? theme.colors.textColor : (isVisited ? '#666666' : theme.button.textColor),
        border: hideButtonBox ? 'none' : `${theme.button.borderWidth}px solid ${borderColor}`,
        borderRadius: hideButtonBox ? '4px' : `${theme.button.borderRadius}px`,
        fontSize: `${computedFontSize}px`,
        fontFamily: computedFont,
        fontWeight: '600',
        textAlign: computedTextAlign,
        transition: 'all 0.2s',
        boxShadow: hideButtonBox ? 'none' : (isHovered ? '0 6px 12px rgba(0,0,0,0.15)' : '0 4px 6px rgba(0,0,0,0.1)'),
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        cursor: interactive ? 'pointer' : 'default',
        opacity: isVisited ? 0.7 : 1,
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        boxSizing: 'border-box',
        lineHeight: '1.4',
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={!interactive}
    >
      {content}
    </button>
  );
};
