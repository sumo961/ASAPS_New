import React from 'react';
import type { Location } from '@asaps/core';
import { getPresetSound, isPresetSound } from '@asaps/core';
import { getAudioManager } from '../audio/AudioManager';

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

export interface PositionedElementData {
  location: Location;
  content: string;
  assetUrl?: string;
  /** Optional action ID to return when this element is clicked (e.g., choice ID for movementChoice) */
  actionId?: string;
}

/**
 * Theme settings for rendering elements
 * Maps directly to GlobalSettings from the builder
 */
export interface RenderThemeSettings {
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
    textFont: string;
    buttonFont: string;
  };
  /** Text effects (animations) */
  textEffects?: {
    animation: 'none' | 'typewriter' | 'fade';
    typewriterSpeed: number;  // Characters per second
    fadeInDuration: number;    // Milliseconds
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
}

// Default theme to use if none provided
const DEFAULT_THEME: RenderThemeSettings = {
  textBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
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
    textFont: 'Arial',
    buttonFont: 'Arial',
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
}) => {
  // FIX #3: Add debugging logs
  console.log('[PositionedBeatView] ============================================');
  console.log('[PositionedBeatView] Rendering');
  console.log('[PositionedBeatView]   - backgroundUrl:', backgroundUrl);
  console.log('[PositionedBeatView]   - backgroundColor prop:', backgroundColor);
  console.log('[PositionedBeatView]   - elements count:', elements.length);
  console.log('[PositionedBeatView]   - stageSize:', { width: stageWidth, height: stageHeight });
  console.log('[PositionedBeatView]   - willUseImage:', !!backgroundUrl);
  console.log('[PositionedBeatView]   - willUseColor:', !backgroundUrl);
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
}) => {
  const { location, content, assetUrl } = element;

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

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${location.x}px`,
    top: `${location.y}px`,
    width: `${location.width}px`,
    height: `${location.height}px`,
    zIndex: location.zIndex || index,
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
    case 'text':
      return (
        <TextElement
          style={baseStyle}
          content={content}
          location={location}
          hideTextBox={hideTextBoxes}
          theme={theme}
        />
      );

    case 'button':
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
        />
      );

    case 'hotspot':
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
        />
      );

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
}> = ({ style, content, location, hideTextBox = false, theme }) => {
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

  // Calculate font size based on autosize setting or explicit fontSize
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    // Explicit font size set
    computedFontSize = location.fontSize;
  } else if (location.autosize !== false) {
    // Auto-size based on box dimensions and content length
    const boxArea = location.width * location.height;
    const contentLength = content.length;

    // Smart autosize: smaller text for longer content, larger for short content
    if (contentLength < 20) {
      // Short text - use box height as primary factor
      computedFontSize = Math.min(Math.floor(location.height * 0.4), 48);
    } else if (contentLength < 50) {
      // Medium text
      computedFontSize = Math.min(Math.floor(location.height * 0.3), 32);
    } else {
      // Long text - prioritize fitting content
      const charsPerSqPx = contentLength / boxArea;
      computedFontSize = Math.max(Math.min(Math.floor(Math.sqrt(boxArea / contentLength) * 2), 24), 12);
    }
  } else {
    // Default size
    computedFontSize = 16;
  }

  const computedTextAlign = location.textAlign || 'center';
  const computedFont = location.font || theme.fonts.textFont;

  // Use theme padding or calculate based on box size
  const padding = theme.textBox.padding;

  // Convert opacity from 0-100 to 0-1
  const opacityValue = theme.textBox.opacity / 100;

  // Parse background color and add opacity
  const bgColor = hideTextBox ? 'transparent' : theme.textBox.backgroundColor;
  const bgWithOpacity = hideTextBox ? 'transparent' :
    (bgColor.startsWith('#') ? `${bgColor}${Math.round(opacityValue * 255).toString(16).padStart(2, '0')}` : bgColor);

  // Parse text color and add opacity
  const textColor = theme.colors.textColor;
  const textAlpha = theme.colors.textAlpha / 100;

  // Determine animation style
  const animation = theme.textEffects?.animation || 'none';
  const fadeInDuration = theme.textEffects?.fadeInDuration || 500;

  const animationStyle: React.CSSProperties = animation === 'fade'
    ? { animation: `fadeIn ${fadeInDuration}ms ease-in` }
    : {};

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
          overflow: 'hidden',
          lineHeight: '1.4',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: computedTextAlign === 'center' ? 'center' : (computedTextAlign === 'right' ? 'flex-end' : 'flex-start'),
        }}
      >
        {displayedText}
      </div>
    </>
  );
};

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
}> = ({ style, content, location, actionId, onAction, interactive, hideButtonBox = false, editorMode = false, theme }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  // Calculate font size based on autosize setting or explicit fontSize
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else if (location.autosize !== false) {
    // Auto-size for buttons - simpler logic than text
    computedFontSize = Math.min(Math.floor(location.height * 0.35), 32);
  } else {
    computedFontSize = 18;
  }

  const computedTextAlign = location.textAlign || 'center';
  const computedFont = location.font || theme.fonts.buttonFont;

  // Calculate padding as percentage of box size
  const paddingHorizontal = Math.max(Math.floor(location.width * 0.04), 12);
  const paddingVertical = Math.max(Math.floor(location.height * 0.15), 8);

  // Determine background color based on mode
  let backgroundColor: string;
  if (hideButtonBox) {
    // Hotspot mode: semi-transparent in editor, fully transparent in preview
    backgroundColor = editorMode ? 'rgba(59, 130, 246, 0.2)' : 'transparent'; // blue-500 at 20% opacity in editor
  } else {
    backgroundColor = isHovered ? theme.button.hoverBackgroundColor : theme.button.backgroundColor;
  }

  const buttonStyle: React.CSSProperties = {
    ...style,
    backgroundColor,
    color: hideButtonBox ? theme.colors.textColor : theme.button.textColor,
    border: hideButtonBox ? (editorMode ? '2px dashed rgba(59, 130, 246, 0.5)' : 'none') : `${theme.button.borderWidth}px solid ${theme.button.borderColor}`,
    borderRadius: hideButtonBox ? '4px' : `${theme.button.borderRadius}px`,
    padding: hideButtonBox ? '0' : `${paddingVertical}px ${paddingHorizontal}px`,
    fontSize: `${computedFontSize}px`,
    fontFamily: computedFont,
    fontWeight: '600',
    textAlign: computedTextAlign,
    transition: 'all 0.2s',
    boxShadow: hideButtonBox ? 'none' : (isHovered ? '0 6px 12px rgba(0,0,0,0.15)' : '0 4px 6px rgba(0,0,0,0.1)'),
    transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
    cursor: interactive ? 'pointer' : 'default',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    display: 'block',
    lineHeight: '1.4',
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

  return (
    <button
      style={buttonStyle}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={!interactive}
    >
      {content}
    </button>
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
 * Dialog element renderer
 */
const DialogElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
}> = ({ style, content, location, hideTextBox = false, theme }) => {
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

  return (
    <div
      style={{
        ...style,
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
      {content}
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
}> = ({ style, assetUrl, assetId, name, kind }) => {
  if (assetUrl) {
    return (
      <img
        src={assetUrl}
        alt={name}
        style={{
          ...style,
          objectFit: 'fill',
        }}
        draggable={false}
      />
    );
  }

  // Placeholder for missing asset
  return (
    <div
      style={{
        ...style,
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
      }}
    >
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
  assetResolver?: (assetId: string) => string | undefined
): PositionedElementData[] {
  console.log('[createPositionedElementData] Creating elements:', { beatType, content, locationCount: locations.length });

  return locations.map((location) => {
    const elementContent = getContentForLocation(location, content, beatType);
    console.log(`[createPositionedElementData] Location "${location.name}" (${location.kind}) → content: "${elementContent}"`);

    // Resolve asset URL: try assetId first, then fall back to direct imageUrl
    let resolvedAssetUrl: string | undefined;
    if (location.assetId && assetResolver) {
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

    // Extract actionId for beats that have choice/option mappings
    let actionId: string | undefined;

    // For movementChoice: match location.name to choice.location to get choice.id
    if (beatType === 'movementChoice' && content.choices && Array.isArray(content.choices)) {
      const choice = content.choices.find((c: any) => c.location === location.name);
      if (choice) {
        actionId = choice.id;
        console.log(`[createPositionedElementData] MovementChoice: location "${location.name}" → choice ID "${actionId}"`);
      }
    }

    // For pickProp: match location.name to prop.name to get prop.id
    if (beatType === 'pickProp' && content.props && Array.isArray(content.props)) {
      const prop = content.props.find((p: any) => p.name === location.name);
      if (prop) {
        actionId = prop.id;
        console.log(`[createPositionedElementData] PickProp: location "${location.name}" → prop ID "${actionId}"`);
      }
    }

    return {
      location,
      content: elementContent,
      assetUrl: resolvedAssetUrl,
      actionId,
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

  // End Screen specific elements
  if (beatType === 'endScreen') {
    if (nameLower.includes('restart') || nameLower.includes('play') || nameLower.includes('again')) {
      return content.restartText || content.buttonText || 'Play Again';
    }
    if (nameLower.includes('credits')) {
      return content.creditsText || 'Credits';
    }
    if (nameLower.includes('message') || nameLower.includes('end')) {
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
  
  // Question text for Movement and PickProp
  if (nameLower.includes('question')) {
    return content.question || '';
  }
  
  // InputText elements
  if (nameLower.includes('prompt')) {
    return content.prompt || '';
  }
  if (nameLower.includes('input') && nameLower.includes('field')) {
    return content.placeholder || 'Type here...';
  }
  
  // HyperText
  if (nameLower.includes('hypertext') || (beatType === 'hyperText' && (nameLower.includes('main') || nameLower.includes('text')))) {
    return content.text || '';
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
