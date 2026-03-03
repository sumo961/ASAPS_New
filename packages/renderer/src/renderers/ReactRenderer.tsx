import React from 'react';
import ReactDOM from 'react-dom/client';
import { BaseRenderer } from './BaseRenderer';
import type { Location, AnimationPath } from '@asaps/core';
import type { RenderContext, RenderOptions } from '../types';
import { PositionedBeatView, createPositionedElementData, type PositionedElementData, type RenderThemeSettings } from '../components/PositionedBeatView';
import type { MeterCounterData, MeterFrameConfig } from '../components/CharacterMeterFrame';
import type { InventoryItemData, InventoryFrameConfig } from '../components/CharacterInventoryFrame';
import { ChatDialogView, type ChatMessage } from '../components/ChatDialogView';
import { generateDefaultLocations } from '../utils/DefaultLocationGenerator';
import { isMobileDevice } from '../utils/mobileDetection';
import { PanoramaView } from '../components/PanoramaView';

// ============= SCALED STAGE COMPONENT =============
// Handles viewport-responsive scaling for the story stage
// Defined at module level to prevent recreation on each render

interface ScaledStageProps {
  children: React.ReactNode;
  width: number;
  height: number;
  /** When true, skip internal scaling (parent handles it) */
  disableScaling?: boolean;
  /** Scaling strategy: 'fit' = letterbox (default), 'cover' = fill/crop */
  scalingMode?: 'fit' | 'cover';
  /** Background URL for the viewport-filling layer (cover mode) */
  backgroundUrl?: string | null;
  /** Fallback background color/gradient for the viewport-filling layer */
  backgroundColor?: string;
}

const ScaledStage: React.FC<ScaledStageProps> = ({
  children,
  width,
  height,
  disableScaling = false,
  scalingMode = 'fit',
  backgroundUrl,
  backgroundColor,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState<number | null>(disableScaling ? 1 : null);

  // Use useLayoutEffect to calculate scale synchronously before paint
  React.useLayoutEffect(() => {
    // Skip scaling calculation if disabled (parent handles it)
    if (disableScaling) {
      setScale(1);
      return;
    }

    const updateScale = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const availableWidth = parent.clientWidth;
          const availableHeight = parent.clientHeight;
          const scaleX = availableWidth / width;
          const scaleY = availableHeight / height;

          let newScale: number;
          if (scalingMode === 'cover') {
            // Cover mode: fill viewport entirely, cropping edges
            newScale = Math.max(scaleX, scaleY);
          } else {
            // Fit mode: letterbox to fit entirely within viewport (allow up to 2x for larger screens)
            newScale = Math.min(scaleX, scaleY, 2);
          }

          console.log(`[ScaledStage] container: ${availableWidth}x${availableHeight}, stage: ${width}x${height}, mode: ${scalingMode}, scaleX: ${scaleX.toFixed(4)}, scaleY: ${scaleY.toFixed(4)}, scale: ${newScale.toFixed(4)}`);
          // If very close to 1, use exactly 1 to avoid sub-pixel letterboxing
          if (newScale > 0.99 && newScale < 1.01) {
            newScale = 1;
          }
          setScale(newScale);
        }
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [width, height, disableScaling, scalingMode]);

  // Don't render until scale is calculated to prevent flash
  if (scale === null) {
    return <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', visibility: 'hidden' }}>{children}</div>;
  }

  // Cover mode: two-layer architecture with viewport-filling background
  if (scalingMode === 'cover') {
    // Build background style for the viewport-filling layer
    const bgLayerStyle: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
    };
    if (backgroundUrl) {
      bgLayerStyle.backgroundImage = `url(${backgroundUrl})`;
      bgLayerStyle.backgroundSize = 'cover';
      bgLayerStyle.backgroundPosition = 'center';
      bgLayerStyle.backgroundRepeat = 'no-repeat';
    } else if (backgroundColor) {
      bgLayerStyle.background = backgroundColor;
    }

    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Layer 0: Background fills entire viewport */}
        <div style={bgLayerStyle} />
        {/* Layer 1: Cover-scaled content stage */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: width,
            height: height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Fit mode (default): single-layer with uniform scale
  // Use absolute positioning to prevent layout overflow clipping
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: width,
          height: height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ============= REACT COMPONENTS (Centered Layouts) =============
// These are fallback components when no positioning data is available

interface ScreenProps {
  onAction?: (id: string) => void;
}

// Title Screen Component
const TitleScreen: React.FC<{ title: string; author: string; buttonText: string } & ScreenProps> = 
  ({ title, author, buttonText, onAction }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-blue-900 to-blue-700 text-white">
      <h1 className="text-6xl font-bold mb-4">{title}</h1>
      <p className="text-2xl mb-12">by {author}</p>
      <button 
        onClick={() => onAction?.('start')}
        className="px-8 py-4 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-semibold transition-colors"
      >
        {buttonText}
      </button>
    </div>
  );

// Text Display Component
const TextDisplay: React.FC<{ text: string; buttonText: string } & ScreenProps> = 
  ({ text, buttonText, onAction }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-8">
      <div className="max-w-3xl w-full bg-white rounded-lg shadow-lg p-8">
        <p className="text-lg text-gray-800 mb-8 whitespace-pre-wrap">{text}</p>
        <button 
          onClick={() => onAction?.('continue')}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );

// Dialog Component
const DialogDisplay: React.FC<{ speaker: string; text: string; emotion?: string } & ScreenProps> = 
  ({ speaker, text, emotion, onAction }) => {
    const emotionEmoji = {
      happy: '😊',
      sad: '😢',
      angry: '😠',
      surprised: '😮',
      neutral: '😐'
    }[emotion?.toLowerCase() || 'neutral'] || '😐';

    return (
      <div className="flex flex-col justify-end h-screen bg-gray-100 p-8">
        <div className="max-w-4xl w-full mx-auto">
          <div className="flex items-start mb-4">
            <div className="bg-gray-700 text-white px-4 py-2 rounded-t-lg font-bold">
              {speaker}
            </div>
            {emotion && (
              <span className="ml-auto text-3xl">{emotionEmoji}</span>
            )}
          </div>
          <div className="bg-white rounded-lg rounded-tl-none shadow-lg p-6">
            <p className="text-lg text-gray-800">{text}</p>
          </div>
        </div>
      </div>
    );
  };

// Choice Component (standalone - used when no dialog context)
const ChoiceDisplay: React.FC<{ choices: Array<{ id: string; text: string }> } & ScreenProps> =
  ({ choices, onAction }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-8">
      <div className="max-w-2xl w-full space-y-4">
        {choices.map(choice => (
          <button
            key={choice.id}
            onClick={() => onAction?.(choice.id)}
            className="w-full p-4 bg-white hover:bg-blue-50 border-2 border-gray-300 hover:border-blue-500 rounded-lg text-lg transition-all"
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );

// Combined Dialog + Choices Component (fallback when no positioned locations)
// Styled version that respects background and theme settings
const DialogWithChoicesDisplay: React.FC<{
  text: string;
  choices: Array<{ id: string; text: string }>;
  backgroundUrl?: string | null;
  theme?: RenderThemeSettings;
} & ScreenProps> = ({ text, choices, onAction, backgroundUrl, theme }) => {
  // Use theme settings or defaults (matches Visual Novel preset style)
  const textBox = theme?.textBox || {
    backgroundColor: '#16213e',  // Dark blue surface
    borderColor: '#4a90d9',      // Blue border
    borderWidth: 2,
    borderRadius: 8,
    padding: 16,
    opacity: 90,
  };
  const button = theme?.button || {
    backgroundColor: '#0f3460',       // Dark blue button
    hoverBackgroundColor: '#1a4a7a',  // Lighter on hover
    textColor: '#ffffff',             // White text
    borderColor: '#4a90d9',           // Blue border
    borderWidth: 1,
    borderRadius: 4,
  };
  const colors = theme?.colors || {
    textColor: '#ffffff',  // White text
    textAlpha: 100,
  };
  const fonts = theme?.fonts || {
    textFont: 'sans-serif',
    buttonFont: 'sans-serif',
  };

  // Convert opacity (0-100) to CSS value
  const bgOpacity = textBox.opacity / 100;

  // Parse background color and apply opacity
  const textBoxBg = textBox.backgroundColor.startsWith('#')
    ? `rgba(${parseInt(textBox.backgroundColor.slice(1,3), 16)}, ${parseInt(textBox.backgroundColor.slice(3,5), 16)}, ${parseInt(textBox.backgroundColor.slice(5,7), 16)}, ${bgOpacity})`
    : textBox.backgroundColor;

  // Use textbox frame image if available (from theme assets, e.g., Ren'Py import)
  const hasFrameImage = !!theme?.textboxFrameUrl;

  return (
    <div
      className="flex flex-col items-center justify-center h-screen p-8"
      style={{
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="max-w-2xl w-full">
        {/* Dialog text box */}
        <div
          className="shadow-lg mb-4"
          style={{
            // Use frame image if available, otherwise use solid background
            ...(hasFrameImage ? {
              backgroundImage: `url(${theme!.textboxFrameUrl})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
              backgroundColor: 'transparent',
            } : {
              backgroundColor: textBoxBg,
            }),
            border: hasFrameImage ? 'none' : `${textBox.borderWidth}px solid ${textBox.borderColor}`,
            borderRadius: hasFrameImage ? '0' : `${textBox.borderRadius}px`,
            padding: `${textBox.padding}px`,
          }}
        >
          <p
            className="text-lg text-center"
            style={{
              color: colors.textColor,
              opacity: colors.textAlpha / 100,
              fontFamily: fonts.textFont,
            }}
          >
            {text}
          </p>
        </div>

        {/* Player Choices */}
        <div className="space-y-2">
          {choices.map(choice => (
            <button
              key={choice.id}
              onClick={() => onAction?.(choice.id)}
              className="w-full p-3 text-center transition-all"
              style={{
                backgroundColor: button.backgroundColor,
                color: button.textColor,
                border: `${button.borderWidth}px solid ${button.borderColor}`,
                borderRadius: `${button.borderRadius}px`,
                fontFamily: fonts.buttonFont,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = button.hoverBackgroundColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = button.backgroundColor;
              }}
            >
              {choice.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Movement Choice Component
const MovementDisplay: React.FC<{
  question: string;
  choices: Array<{ id: string; text: string; location: string }>
  backgroundUrl?: string | null
} & ScreenProps> = ({ question, choices, onAction, backgroundUrl }) => (
  <div className="relative flex flex-col items-center h-screen p-8" style={{
    backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }}>
    {/* Dim overlay to ensure text readability */}
    <div className="absolute inset-0 bg-black bg-opacity-30"></div>
    <div className="relative z-10">
      <h2 className="text-3xl font-bold text-white mb-8 mt-12 drop-shadow-lg">{question}</h2>
      <div className="max-w-3xl w-full space-y-4">
        {choices.map(choice => (
          <button
            key={choice.id}
            onClick={() => onAction?.(choice.id)}
            className="w-full p-6 bg-white bg-opacity-90 hover:bg-opacity-100 hover:scale-105 border-2 border-blue-300 hover:border-blue-500 rounded-lg transition-all"
          >
            <div className="flex items-center">
              <span className="text-3xl mr-4">📍</span>
              <div className="text-left">
                <div className="text-lg font-semibold text-gray-800">{choice.text}</div>
                <div className="text-sm text-gray-600">{choice.location}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// Prop Selection Component
const PropDisplay: React.FC<{ 
  question: string; 
  props: Array<{ id: string; name: string; description: string }> 
} & ScreenProps> = ({ question, props, onAction }) => (
  <div className="flex flex-col items-center h-screen bg-yellow-50 p-8">
    <h2 className="text-3xl font-bold text-gray-800 mb-8 mt-8">{question}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full">
      {props.map(prop => (
        <button
          key={prop.id}
          onClick={() => onAction?.(prop.id)}
          className="p-6 bg-white hover:bg-yellow-100 border-2 border-yellow-300 hover:border-yellow-500 rounded-lg transition-all"
        >
          <div className="text-center">
            <span className="text-5xl block mb-3">🎒</span>
            <h3 className="text-lg font-bold mb-2">{prop.name}</h3>
            <p className="text-sm text-gray-600">{prop.description}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

// End Screen Component
const EndScreen: React.FC<{ 
  message: string; 
  showRestart: boolean; 
  showCredits: boolean 
} & ScreenProps> = ({ message, showRestart, showCredits, onAction }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-purple-600 to-pink-600 text-white">
    <h1 className="text-6xl font-bold mb-12">{message}</h1>
    <div className="flex gap-4 justify-center">
      {showRestart && (
        <button 
          onClick={() => onAction?.('restart')}
          className="px-8 py-4 bg-white text-purple-600 hover:bg-gray-100 rounded-lg text-xl font-semibold transition-colors"
        >
          Restart
        </button>
      )}
      {showCredits && (
        <button 
          onClick={() => onAction?.('credits')}
          className="px-8 py-4 bg-white text-purple-600 hover:bg-gray-100 rounded-lg text-xl font-semibold transition-colors"
        >
          Credits
        </button>
      )}
    </div>
  </div>
);

// Input Text Component
const InputText: React.FC<{
  prompt: string;
  placeholder?: string;
  buttonText?: string;
  options?: {
    validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  };
} & ScreenProps> = ({ prompt, placeholder, buttonText = 'Continue', options = {}, onAction }) => {
  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState('');

  const validateInput = (value: string): boolean => {
    if (options.required !== false && !value.trim()) {
      setError('This field is required');
      return false;
    }
    if (!value.trim()) return true;
    if (options.minLength && value.length < options.minLength) {
      setError(`Minimum ${options.minLength} characters required`);
      return false;
    }
    if (options.maxLength && value.length > options.maxLength) {
      setError(`Maximum ${options.maxLength} characters allowed`);
      return false;
    }
    switch (options.validation) {
      case 'numeric':
        if (!/^\d+$/.test(value)) {
          setError('Please enter numbers only');
          return false;
        }
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          setError('Please enter a valid email address');
          return false;
        }
        break;
      case 'alphanumeric':
        if (!/^[a-zA-Z0-9]+$/.test(value)) {
          setError('Please enter letters and numbers only');
          return false;
        }
        break;
    }
    return true;
  };

  const handleSubmit = () => {
    setError('');
    if (validateInput(inputValue)) {
      onAction?.(inputValue);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-indigo-500 to-purple-600 p-8">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-2xl p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">{prompt}</h2>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(''); }}
          onKeyPress={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder={placeholder}
          autoFocus
          className={`w-full px-4 py-3 text-lg border-2 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          onClick={handleSubmit}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-lg font-semibold transition-colors"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

// Hyper Text Component
const HyperText: React.FC<{
  data: {
    text: string;
    links: Array<{
      word: string;
      targetBeatId: string;
      style: {
        color: string;
        hoverColor: string;
        underline: boolean;
        bold: boolean;
      };
    }>;
    allowMultiple: boolean;
  };
} & ScreenProps> = ({ data, onAction }) => {
  const [clickedLinks, setClickedLinks] = React.useState<Set<string>>(new Set());
  const [hoveredLink, setHoveredLink] = React.useState<string | null>(null);

  const handleLinkClick = (link: typeof data.links[0]) => {
    if (!data.allowMultiple) {
      onAction?.(link.targetBeatId);
    } else {
      setClickedLinks(prev => new Set(prev).add(link.word));
    }
  };

  const renderTextWithLinks = () => {
    const text = data.text;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    const sortedLinks = [...data.links].sort((a, b) => b.word.length - a.word.length);
    const linkPositions: Array<{ start: number; end: number; link: typeof data.links[0] }> = [];
    
    sortedLinks.forEach(link => {
      const regex = new RegExp(`\\b${link.word}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const overlaps = linkPositions.some(
          pos => (match!.index >= pos.start && match!.index < pos.end) ||
                 (match!.index + link.word.length > pos.start && match!.index + link.word.length <= pos.end)
        );
        if (!overlaps) {
          linkPositions.push({ start: match.index, end: match.index + link.word.length, link });
        }
      }
    });

    linkPositions.sort((a, b) => a.start - b.start);

    linkPositions.forEach((pos, index) => {
      if (pos.start > lastIndex) {
        elements.push(<span key={`text-${index}`}>{text.substring(lastIndex, pos.start)}</span>);
      }
      const isHovered = hoveredLink === pos.link.word;
      const isClicked = clickedLinks.has(pos.link.word);
      elements.push(
        <span
          key={`link-${index}`}
          onClick={() => handleLinkClick(pos.link)}
          onMouseEnter={() => setHoveredLink(pos.link.word)}
          onMouseLeave={() => setHoveredLink(null)}
          style={{
            color: isHovered ? pos.link.style.hoverColor : pos.link.style.color,
            textDecoration: pos.link.style.underline ? 'underline' : 'none',
            fontWeight: pos.link.style.bold ? 'bold' : 'normal',
            cursor: 'pointer',
            opacity: isClicked ? 0.5 : 1,
            transition: 'all 0.2s'
          }}
          className="hover:scale-105 inline-block"
        >
          {text.substring(pos.start, pos.end)}
        </span>
      );
      lastIndex = pos.end;
    });

    if (lastIndex < text.length) {
      elements.push(<span key="text-end">{text.substring(lastIndex)}</span>);
    }
    return elements;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-teal-400 to-blue-500 p-8">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-2xl p-10">
        <div className="text-xl text-gray-800 leading-relaxed">{renderTextWithLinks()}</div>
        {data.allowMultiple && clickedLinks.size > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-2">Explored links:</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(clickedLinks).map(word => (
                <span key={word} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{word}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Loading Display Component for AI-powered beats
// Uses theme styling for consistent look with the rest of the story
const LoadingDisplay: React.FC<{
  message: string;
  subMessage?: string;
  spinnerType?: 'spinner' | 'dots' | 'pulse';
  backgroundUrl?: string | null;
  theme?: RenderThemeSettings;
}> = ({ message, subMessage, spinnerType = 'spinner', backgroundUrl, theme }) => {
  // Animation states for dots
  const [dotCount, setDotCount] = React.useState(1);

  React.useEffect(() => {
    if (spinnerType === 'dots') {
      const interval = setInterval(() => {
        setDotCount(prev => (prev % 3) + 1);
      }, 400);
      return () => clearInterval(interval);
    }
  }, [spinnerType]);

  // Get theme values with defaults
  const textBox = theme?.textBox || {
    backgroundColor: '#16213e',
    borderColor: '#4a90d9',
    borderWidth: 2,
    borderRadius: 8,
    padding: 24,
    opacity: 90,
  };
  const colors = theme?.colors || {
    textColor: '#ffffff',
    textAlpha: 100,
  };
  const fonts = theme?.fonts || {
    textFont: 'sans-serif',
    textFontSize: 18,
  };

  // Convert textBox opacity (0-100) to CSS value
  const bgOpacity = (textBox.opacity || 90) / 100;

  // Parse background color and apply opacity
  const textBoxBg = textBox.backgroundColor?.startsWith('#')
    ? `rgba(${parseInt(textBox.backgroundColor.slice(1,3), 16)}, ${parseInt(textBox.backgroundColor.slice(3,5), 16)}, ${parseInt(textBox.backgroundColor.slice(5,7), 16)}, ${bgOpacity})`
    : (textBox.backgroundColor || 'rgba(22, 33, 62, 0.9)');

  const textColor = colors.textColor || '#ffffff';
  const textAlpha = (colors.textAlpha || 100) / 100;

  const renderSpinner = () => {
    switch (spinnerType) {
      case 'dots':
        return (
          <div className="flex items-center justify-center space-x-3 mb-4">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-3 h-3 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: i < dotCount ? textColor : `${textColor}33`,
                  transform: i < dotCount ? 'scale(1.3)' : 'scale(1)',
                  opacity: i < dotCount ? textAlpha : textAlpha * 0.3,
                }}
              />
            ))}
          </div>
        );
      case 'pulse':
        return (
          <div className="mb-4 flex justify-center">
            <div
              className="w-12 h-12 rounded-full animate-pulse"
              style={{
                backgroundColor: theme?.button?.backgroundColor || textBox.borderColor || '#4a90d9',
                boxShadow: `0 0 15px ${theme?.button?.backgroundColor || textBox.borderColor || '#4a90d9'}`,
              }}
            />
          </div>
        );
      case 'spinner':
      default:
        return (
          <div className="mb-4 flex justify-center">
            <div
              className="w-10 h-10 border-3 rounded-full animate-spin"
              style={{
                borderWidth: '3px',
                borderColor: `${textColor}33`,
                borderTopColor: textColor,
              }}
            />
          </div>
        );
    }
  };

  // Determine page background
  const defaultGradient = 'linear-gradient(to bottom, #1e3a8a, #1e40af)';
  const pageBackground = backgroundUrl
    ? 'transparent'
    : (theme?.backgroundColor || defaultGradient);

  return (
    <div
      className="flex flex-col items-center justify-center h-screen"
      style={{
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: backgroundUrl ? 'transparent' : undefined,
        background: !backgroundUrl ? pageBackground : undefined,
      }}
    >
      {/* Semi-transparent overlay for readability when there's a background image */}
      {backgroundUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
          }}
        />
      )}

      {/* Content box using theme textbox styling */}
      <div
        className="relative z-10 flex flex-col items-center text-center"
        style={{
          backgroundColor: textBoxBg,
          border: `${textBox.borderWidth || 2}px solid ${textBox.borderColor || '#4a90d9'}`,
          borderRadius: `${textBox.borderRadius || 8}px`,
          padding: `${(textBox.padding || 24) + 8}px ${(textBox.padding || 24) + 16}px`,
          minWidth: '300px',
          maxWidth: '500px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        {renderSpinner()}
        <h2
          style={{
            color: textColor,
            opacity: textAlpha,
            fontFamily: fonts.textFont || 'sans-serif',
            fontSize: `${(fonts.textFontSize || 18) + 2}px`,
            fontWeight: 500,
            marginBottom: subMessage ? '8px' : '0',
            lineHeight: 1.4,
          }}
        >
          {message}
        </h2>
        {subMessage && (
          <p
            style={{
              color: textColor,
              opacity: textAlpha * 0.7,
              fontFamily: fonts.textFont || 'sans-serif',
              fontSize: `${(fonts.textFontSize || 18) - 2}px`,
              margin: 0,
            }}
          >
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );
};

// ============= REACT RENDERER CLASS =============

export class ReactRenderer extends BaseRenderer {
  private _root: ReactDOM.Root | null = null;
  protected resolveAction: ((value: string) => void) | null = null;  // Changed to protected
  private _originalHandleAction: ((id: string) => void) | null = null;  // Saved for cancellation
  private instanceId: string;
  protected backgroundImageUrl: string | null = null;  // Changed to protected
  private assetResolver: ((assetId: string) => string | undefined) | null = null;  // NEW: Asset resolver function
  private characterResolver: ((characterId: string, stateId?: string) => string | undefined) | null = null;  // NEW: Character state resolver
  private counterResolver: ((counterName: string) => { value: number; min: number; max: number } | null) | null = null;  // NEW: Counter value resolver
  private characterMeterFrameResolver: ((characterId: string) => { counters: MeterCounterData[]; config: MeterFrameConfig } | null) | null = null;  // NEW: Character meter frame resolver
  private characterInventoryResolver: ((characterId: string) => { items: InventoryItemData[]; config: InventoryFrameConfig } | null) | null = null;  // NEW: Character inventory resolver
  protected inventoryVisible: boolean = false;  // NEW: Whether inventory is currently visible (controlled by Ctrl/Cmd+I)
  private spriteDataResolver: ((characterId: string) => { frameWidth: number; frameHeight: number; defaultFrame?: number; imageWidth?: number; animations?: Array<{ name: string; frames: number[]; frameDuration: number; loop: boolean }>; activeAnimation?: string } | null) | null = null;  // NEW: Sprite sheet data resolver
  // soundBlobResolver is inherited from BaseRenderer
  protected hideTextBoxes: boolean = false;  // NEW: Whether to hide text box backgrounds
  protected hideButtonBoxes: boolean = false;  // NEW: Whether to hide button box backgrounds
  protected theme: RenderThemeSettings | undefined = undefined;  // NEW: Theme settings for styling
  protected visitedBeats: string[] = [];  // NEW: Array of visited beat IDs for marking visited choices
  protected visitedChoiceIds: string[] = [];  // Per-choice visited tracking for recursive dialogs
  protected chatMessages: ChatMessage[] = [];  // NEW: Accumulated messages for chat mode
  protected currentPresentationMode: 'positioned' | 'chat-scroll' | 'chat-bubble' = 'positioned';  // NEW: Current dialog presentation mode
  protected currentShowAvatars: boolean = true;  // NEW: Whether to show avatars in chat mode
  private characterAvatarResolver: ((characterId: string) => string | undefined) | null = null;  // NEW: Character avatar resolver
  protected timerState: { totalTime: number; remainingTime: number; visible: boolean; label?: string } | undefined;  // NEW: Timer state for progress bar
  private timerStateListeners: Set<(state: typeof this.timerState) => void> = new Set();  // Listeners for timer state changes
  protected timerHudConfig: import('../components/TimerHudDisplay').TimerHudConfig | undefined;  // Timer HUD config from global settings
  protected timerHudOverrideText: string | undefined;  // Per-beat static time display override
  protected timerHudState: { remainingTime: number; totalTime: number } | undefined;  // Timer HUD time state (separate from progress bar)
  private timerHudStateListeners: Set<(state: typeof this.timerHudState) => void> = new Set();
  private timerHudOverrideTextListeners: Set<(text: string | undefined) => void> = new Set();
  protected countdownMeterConfig: import('../components/CountdownMeterHud').CountdownMeterConfig | undefined;  // Countdown meter HUD config
  protected countdownMeterValue: { value: number; min: number; max: number } | undefined;  // Current countdown meter value
  protected overrideCountdownMeter: boolean = false;  // Per-beat flag to override default countdown meter visibility
  protected fictionalTimeText: string | undefined;  // Formatted fictional time text for Timer HUD
  private fictionalTimeTextListeners: Set<(text: string | undefined) => void> = new Set();
  protected mobileMode: boolean = false;  // Whether mobile display adaptation is active
  protected mobileFontScale: number = 1.0;  // Font scale multiplier for mobile (1.0-2.0)

  private get root(): ReactDOM.Root | null {
    return this._root;
  }
  
  private set root(value: ReactDOM.Root | null) {
    console.log(`[ReactRenderer ${this.instanceId}] Setting root:`, !!value, 'was:', !!this._root);
    this._root = value;
  }
  
  constructor(context: RenderContext, options?: RenderOptions) {
    super(context, options);
    this.instanceId = Math.random().toString(36).substring(7);
    console.log(`[ReactRenderer ${this.instanceId}] Constructor called`);
  }

  protected initialize(): void {
    console.log(`[ReactRenderer ${this.instanceId}] initialize() called`);
    if (!this.context.container) {
      throw new Error('ReactRenderer requires a container element');
    }

    if (this.root) {
      console.log(`[ReactRenderer ${this.instanceId}] Root already exists for this instance`);
      return;
    }

    const containerAny = this.context.container as any;
    console.log(`[ReactRenderer ${this.instanceId}] Checking for existing root on container`);

    if (containerAny.__reactRoot) {
      console.log(`[ReactRenderer ${this.instanceId}] Reusing existing root from container`);
      this.root = containerAny.__reactRoot;
    } else {
      console.log(`[ReactRenderer ${this.instanceId}] Creating new root`);
      this.root = ReactDOM.createRoot(this.context.container);
      containerAny.__reactRoot = this.root;
      console.log(`[ReactRenderer ${this.instanceId}] Root created and stored on container`);
    }
  }

  // Store pending transition type for coordinating prepare/apply
  private pendingTransitionType: string | null = null;

  // Prepare transition - set initial hidden state BEFORE rendering
  prepareTransition(transition: { type: string; duration: number }): void {
    if (!this.context.container || transition.type === 'none') return;

    const container = this.context.container;
    this.pendingTransitionType = transition.type;
    this.pendingTransitionDuration = transition.duration || 500;
    this.transitionStartedByRender = false;

    // Set initial hidden state based on transition type
    switch (transition.type) {
      case 'fade':
      case 'dissolve':
        container.style.opacity = '0';
        break;
      case 'slide':
        container.style.transform = 'translateX(100%)';
        container.style.opacity = '0';
        break;
      case 'zoom':
        container.style.transform = 'scale(0.8)';
        container.style.opacity = '0';
        break;
    }
  }

  // Override transition methods - return immediately, animation is triggered by renderComponent
  protected async fadeTransition(duration: number, direction?: 'in' | 'out' | 'both'): Promise<void> {
    return Promise.resolve();
  }

  protected async dissolveTransition(duration: number): Promise<void> {
    // Dissolve uses fade effect
    return this.fadeTransition(duration, 'in');
  }

  protected async slideTransition(duration: number, direction?: 'in' | 'out' | 'both'): Promise<void> {
    // Return immediately - animation is triggered by renderComponent
    return Promise.resolve();
  }

  protected async zoomTransition(duration: number, direction?: 'in' | 'out' | 'both'): Promise<void> {
    // Return immediately - animation is triggered by renderComponent
    return Promise.resolve();
  }

  protected renderComponent(component: React.ReactElement): void {
    if (!this.root) {
      console.warn(`[ReactRenderer] No root available, attempting to reinitialize`);
      try {
        this.initialize();
        if (!this.root) {
          console.error(`[ReactRenderer] Reinitialization failed!`);
          return;
        }
      } catch (error) {
        console.error(`[ReactRenderer] Failed to reinitialize:`, error);
        return;
      }
    }

    this.root.render(component);

    // If there's a pending transition, apply it now that content is rendered
    if (this.pendingTransitionType && this.context.container) {
      this.applyPendingTransition();
    }
  }

  /**
   * Apply the pending transition after content has been rendered
   * This is called from renderComponent to trigger the fade-in animation
   */
  private applyPendingTransition(): void {
    if (!this.pendingTransitionType || !this.context.container) return;

    const container = this.context.container;
    const transitionType = this.pendingTransitionType;
    const duration = this.pendingTransitionDuration || 500;

    // Clear pending state immediately to prevent re-triggering
    this.pendingTransitionType = null;

    // Force reflow to ensure browser recognizes the initial state
    void container.offsetHeight;

    // Set up transition
    container.style.transition = `opacity ${duration}ms ease-in-out, transform ${duration}ms ease-out`;

    // Use double requestAnimationFrame for reliable CSS transitions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.style.opacity = '1';
        if (transitionType === 'slide') {
          container.style.transform = 'translateX(0)';
        } else if (transitionType === 'zoom') {
          container.style.transform = 'scale(1)';
        }

        // Clean up after animation completes
        setTimeout(() => {
          container.style.transition = '';
          container.style.transform = '';
        }, duration);
      });
    });
  }

  // Track if transition was already started by renderComponent
  private transitionStartedByRender: boolean = false;
  private pendingTransitionDuration: number = 500;

  protected handleAction = (id: string): void => {
    if (this.resolveAction) {
      this.resolveAction(id);
      this.resolveAction = null;
    } else {
      console.warn(`[ReactRenderer ${this.instanceId}] handleAction called but no resolveAction pending!`);
    }
  };

  /**
   * Cancel any pending action (e.g., when a timer interrupt fires a new beat).
   * Restores the original handleAction if it was wrapped by keypad/inputText,
   * and resolves the pending promise so the engine's beat loop can continue
   * (the engine will check timerInterruptBeat and use the timer's target instead).
   */
  cancelPendingAction(): void {
    if (this._originalHandleAction) {
      this.handleAction = this._originalHandleAction;
      this._originalHandleAction = null;
    }
    if (this.resolveAction) {
      // Resolve (not just null) so the engine's beat.execute() can return
      // and the engine loop can process the timer interrupt
      this.resolveAction('__timer_interrupt__');
    }
    this.resolveAction = null;
  }

  /**
   * Set the asset resolver function
   * This allows the renderer to convert asset IDs to URLs
   */
  setAssetResolver(resolver: (assetId: string) => string | undefined): void {
    this.assetResolver = resolver;
  }

  /**
   * Set the character resolver function
   * This allows the renderer to convert characterId + stateId to an image URL
   * The resolver should look up the character, find the state, and return the image URL
   */
  setCharacterResolver(resolver: (characterId: string, stateId?: string) => string | undefined): void {
    this.characterResolver = resolver;
  }

  /**
   * Set the counter resolver function
   * This allows the renderer to get counter values for meter elements
   * The resolver should look up the counter and return { value, min, max }
   */
  setCounterResolver(resolver: (counterName: string) => { value: number; min: number; max: number } | null): void {
    this.counterResolver = resolver;
  }

  /**
   * Disable internal scaling (when parent handles scaling via CSS transforms)
   */
  setDisableScaling(disable: boolean): void {
    this.setState('disableScaling', disable);
  }

  /**
   * Set the character meter frame resolver function
   * This allows the renderer to get meter frame data for character HUD overlays
   * The resolver should look up the character and return { counters, config }
   */
  setCharacterMeterFrameResolver(resolver: (characterId: string) => { counters: MeterCounterData[]; config: MeterFrameConfig } | null): void {
    this.characterMeterFrameResolver = resolver;
  }

  /**
   * Set the character inventory resolver function
   * This allows the renderer to get inventory data for character HUD overlays
   * The resolver should look up the character and return { items, config }
   */
  setCharacterInventoryResolver(resolver: (characterId: string) => { items: InventoryItemData[]; config: InventoryFrameConfig } | null): void {
    this.characterInventoryResolver = resolver;
  }

  /**
   * Set inventory visibility (for Ctrl/Cmd+I toggle)
   */
  setInventoryVisible(visible: boolean): void {
    this.inventoryVisible = visible;
  }

  /**
   * Get current inventory visibility
   */
  getInventoryVisible(): boolean {
    return this.inventoryVisible;
  }

  /**
   * Set the sprite data resolver function
   * This allows the renderer to get sprite sheet data for character sprites
   * The resolver should look up the character and return sprite sheet config if it's a sprite type
   */
  setSpriteDataResolver(resolver: (characterId: string) => { frameWidth: number; frameHeight: number; defaultFrame?: number; imageWidth?: number; animations?: Array<{ name: string; frames: number[]; frameDuration: number; loop: boolean }>; activeAnimation?: string } | null): void {
    this.spriteDataResolver = resolver;
  }

  /**
   * Set the character avatar resolver function
   * This allows the renderer to get avatar images for chat mode dialogs
   * The resolver should look up the character and return an avatar URL
   */
  setCharacterAvatarResolver(resolver: (characterId: string) => string | undefined): void {
    this.characterAvatarResolver = resolver;
  }

  /**
   * Set the presentation mode for dialogs
   * 'positioned' uses traditional positioned rendering
   * 'chat-scroll' shows scrollable chat history
   * 'chat-bubble' shows single message bubble
   */
  setPresentationMode(mode: 'positioned' | 'chat-scroll' | 'chat-bubble'): void {
    // If switching to chat mode, clear previous message history
    if (mode !== 'positioned' && this.currentPresentationMode === 'positioned') {
      this.chatMessages = [];
    }
    this.currentPresentationMode = mode;
  }

  /**
   * Set whether to show avatars in chat mode
   */
  setShowAvatars(show: boolean): void {
    this.currentShowAvatars = show;
  }

  /**
   * Clear chat message history (call when starting a new dialog tree)
   */
  clearChatHistory(): void {
    this.chatMessages = [];
  }

  /**
   * Set the sound blob resolver function
   * This allows the renderer to load sound blobs from storage for playback
   * Avoids stale blob URL issues by loading fresh blob data when needed
   */
  // Override to call parent implementation (soundBlobResolver is on parent class)
  override setSoundBlobResolver(resolver: (assetId: string) => Promise<Blob | null>): void {
    super.setSoundBlobResolver(resolver);
  }

  /**
   * Get the sound blob resolver (for passing to components)
   */
  getSoundBlobResolver(): ((assetId: string) => Promise<Blob | null>) | null {
    return this.soundBlobResolver;
  }

  /**
   * Resolve an asset ID to a URL using the asset resolver
   */
  protected resolveAssetUrl(assetId: string | undefined | null): string | null {
    if (!assetId) return null;
    if (!this.assetResolver) return null;
    return this.assetResolver(assetId) || null;
  }

  /**
   * Set whether to hide text box backgrounds
   * When true, only the text content is visible (no background, border, shadow)
   */
  setHideTextBoxes(hide: boolean): void {
    this.hideTextBoxes = hide;
  }

  /**
   * Set whether to hide button box backgrounds
   * When true, only the button text is visible (no background, border, shadow)
   */
  setHideButtonBoxes(hide: boolean): void {
    this.hideButtonBoxes = hide;
  }

  /**
   * Set the theme for rendering
   * Theme settings control colors, fonts, borders, etc. for all rendered elements
   */
  setTheme(theme: RenderThemeSettings | undefined): void {
    this.theme = theme;
  }

  /**
   * Set the array of visited beat IDs
   * Used for marking choices that lead to already-visited beats
   */
  setVisitedBeats(visitedBeats: string[]): void {
    this.visitedBeats = visitedBeats;
  }

  /**
   * Set the array of visited choice IDs for per-choice tracking
   * Used by recursive dialog trees to grey out already-selected choices
   */
  setVisitedChoiceIds(choiceIds: string[]): void {
    this.visitedChoiceIds = choiceIds;
  }

  /**
   * Set the timer state for the progress bar display
   * Used when a beat has showTimer: true and a defaultTargetDelay
   */
  setTimerState(state: { totalTime: number; remainingTime: number; visible: boolean; label?: string } | undefined): void {
    this.timerState = state;
    // Notify all listeners of the change
    this.timerStateListeners.forEach(listener => listener(state));
  }

  /**
   * Set the timer HUD configuration from global settings
   */
  setTimerHudConfig(config: import('../components/TimerHudDisplay').TimerHudConfig | undefined): void {
    this.timerHudConfig = config;
  }

  /**
   * Set per-beat override text for static timer HUD mode
   */
  setTimerHudOverrideText(text: string | undefined): void {
    this.timerHudOverrideText = text;
    this.timerHudOverrideTextListeners.forEach(listener => listener(text));
  }

  /**
   * Subscribe to timer HUD override text changes
   */
  subscribeToTimerHudOverrideText(listener: (text: string | undefined) => void): () => void {
    this.timerHudOverrideTextListeners.add(listener);
    listener(this.timerHudOverrideText);
    return () => this.timerHudOverrideTextListeners.delete(listener);
  }

  /**
   * Set the timer HUD time state (separate from progress bar timer state)
   */
  setTimerHudState(state: { remainingTime: number; totalTime: number } | undefined): void {
    this.timerHudState = state;
    this.timerHudStateListeners.forEach(listener => listener(state));
  }

  /**
   * Subscribe to timer HUD state changes
   */
  subscribeToTimerHudState(listener: (state: { remainingTime: number; totalTime: number } | undefined) => void): () => void {
    this.timerHudStateListeners.add(listener);
    listener(this.timerHudState);
    return () => this.timerHudStateListeners.delete(listener);
  }

  /**
   * Set the countdown meter HUD configuration from global settings
   */
  setCountdownMeterConfig(config: import('../components/CountdownMeterHud').CountdownMeterConfig | undefined): void {
    this.countdownMeterConfig = config;
  }

  /**
   * Set the current countdown meter value
   */
  setCountdownMeterValue(value: { value: number; min: number; max: number } | undefined): void {
    this.countdownMeterValue = value;
  }

  /**
   * Set per-beat override for countdown meter visibility
   */
  setOverrideCountdownMeter(override: boolean): void {
    this.overrideCountdownMeter = override;
  }

  /**
   * Set the formatted fictional time text for the Timer HUD
   */
  setFictionalTimeText(text: string | undefined): void {
    this.fictionalTimeText = text;
    this.fictionalTimeTextListeners.forEach(listener => listener(text));
  }

  /**
   * Subscribe to fictional time text changes
   */
  subscribeToFictionalTimeText(listener: (text: string | undefined) => void): () => void {
    this.fictionalTimeTextListeners.add(listener);
    listener(this.fictionalTimeText);
    return () => this.fictionalTimeTextListeners.delete(listener);
  }

  /**
   * Set mobile display mode
   * When true, uses cover scaling (fills viewport, crops edges) instead of fit scaling (letterboxes)
   * Set to 'auto' via project settings to auto-detect mobile devices
   */
  setMobileMode(enabled: boolean): void {
    this.mobileMode = enabled;
  }

  /**
   * Get current mobile mode state
   */
  getMobileMode(): boolean {
    return this.mobileMode;
  }

  /**
   * Set the mobile font scale multiplier (1.0 to 2.0)
   * Applied on top of cover scaling to further boost readability on small screens
   */
  setMobileFontScale(scale: number): void {
    this.mobileFontScale = Math.max(1.0, Math.min(2.0, scale));
  }

  /**
   * Subscribe to timer state changes
   * Returns an unsubscribe function
   */
  subscribeToTimerState(listener: (state: typeof this.timerState) => void): () => void {
    this.timerStateListeners.add(listener);
    // Immediately call with current state
    listener(this.timerState);
    return () => this.timerStateListeners.delete(listener);
  }

  // ============= UNIFIED POSITIONED RENDERING SYSTEM =============
  
  /**
   * Render a beat using positioned layout with PositionedBeatView component
   * This is now the SAME rendering used by the visual editor!
   * Protected so child classes can use it
   */
  protected renderPositionedBeat(
    beatType: string,
    content: Record<string, any>,
    locations: Location[],
    waitForAction: boolean = true,
    animations?: AnimationPath[]
  ): Promise<string> {
    console.log(`[ReactRenderer ${this.instanceId}] Rendering positioned ${beatType} with ${locations.length} elements`);

    // Debug: Log all character/prop locations and their assetIds
    const charPropLocations = locations.filter(loc => loc.kind === 'character' || loc.kind === 'prop');
    if (charPropLocations.length > 0) {
      console.log(`[ReactRenderer ${this.instanceId}] Character/Prop locations:`, charPropLocations.map(loc => ({
        name: loc.name,
        kind: loc.kind,
        assetId: loc.assetId,
        hasAssetResolver: !!this.assetResolver
      })));
    }

    return new Promise(resolve => {
      if (waitForAction) {
        this.resolveAction = (id: string) => {
          this.resolveAction = null;
          resolve(id);
        };
      } else {
        resolve('');
      }

      // Create element data using the shared helper, passing the asset, character, counter, and sprite resolvers
      const elements: PositionedElementData[] = createPositionedElementData(
        locations,
        content,
        beatType,
        this.assetResolver || undefined,
        this.characterResolver || undefined,
        this.counterResolver || undefined,
        this.spriteDataResolver || undefined
      );

      // Determine background - consistent for all beat types
      // Use the beat's background image if available, otherwise use theme background color or default gradient
      const defaultGradient = 'linear-gradient(to bottom, #1e3a8a, #1e40af)';
      const backgroundColor = this.backgroundImageUrl
        ? 'transparent'
        : (this.theme?.backgroundColor || defaultGradient);

      // Get showTextOnHover from renderer state (set by MovementChoiceBeat)
      const showTextOnHover = this.getState('showTextOnHover') || false;

      // Get animations from parameter or renderer state (set by beat)
      const effectiveAnimations = animations || (this.getState('animations') as AnimationPath[] | undefined);
      console.log(`[ReactRenderer] renderPositionedBeat animations:`, effectiveAnimations?.length || 0, effectiveAnimations);

      // Render using the shared PositionedBeatView component
      // NOTE: previewMode=false uses absolute positioning from Visual Editor
      // with smart collision detection for auto-height text boxes
      // Use project's stage dimensions from context
      const stageWidth = this.context.width;
      const stageHeight = this.context.height;
      const disableScaling = this.getState('disableScaling') as boolean | undefined;

      // Determine scaling mode for mobile
      const scalingMode = this.mobileMode ? 'cover' as const : 'fit' as const;
      const useMobileBg = this.mobileMode && scalingMode === 'cover';

      this.renderComponent(
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ScaledStage
            width={stageWidth}
            height={stageHeight}
            disableScaling={disableScaling}
            scalingMode={scalingMode}
            backgroundUrl={useMobileBg ? this.backgroundImageUrl : undefined}
            backgroundColor={useMobileBg ? backgroundColor : undefined}
          >
            <PositionedBeatView
              stageWidth={stageWidth}
              stageHeight={stageHeight}
              backgroundUrl={this.backgroundImageUrl}
              backgroundColor={backgroundColor}
              elements={elements}
              onAction={this.handleAction}
              interactive={true}
              hideTextBoxes={this.hideTextBoxes}
              hideButtonBoxes={this.hideButtonBoxes}
              theme={this.theme}
              previewMode={false}
              visitedBeats={this.visitedBeats}
              visitedChoiceIds={this.visitedChoiceIds}
              showTextOnHover={showTextOnHover}
              soundBlobResolver={this.soundBlobResolver || undefined}
              animations={effectiveAnimations}
              characterMeterFrameResolver={this.characterMeterFrameResolver || undefined}
              characterInventoryResolver={this.characterInventoryResolver || undefined}
              inventoryVisible={this.inventoryVisible}
              timerState={this.timerState}
              onSubscribeTimerState={(listener) => this.subscribeToTimerState(listener)}
              beatType={beatType}
              timerHudConfig={this.timerHudConfig}
              timerHudOverrideText={this.timerHudOverrideText}
              timerHudState={this.timerHudState}
              onSubscribeTimerHudState={(listener) => this.subscribeToTimerHudState(listener)}
              onSubscribeTimerHudOverrideText={(listener) => this.subscribeToTimerHudOverrideText(listener)}
              countdownMeterConfig={this.countdownMeterConfig}
              countdownMeterValue={this.countdownMeterValue}
              overrideCountdownMeter={this.overrideCountdownMeter}
              fictionalTimeText={this.fictionalTimeText}
              onSubscribeFictionalTimeText={(listener) => this.subscribeToFictionalTimeText(listener)}
              externalBackground={useMobileBg}
              mobileFontScale={this.mobileFontScale}
            />
          </ScaledStage>
        </div>
      );
    });
  }

  // ============= RENDER METHODS (All use unified positioning system) =============

  async renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void> {
    console.log(`[ReactRenderer ${this.instanceId}] renderTitleScreen called`);
    console.log(`[ReactRenderer ${this.instanceId}]   - title: "${title}"`);
    console.log(`[ReactRenderer ${this.instanceId}]   - locations:`, locations?.length || 0);

    // Get background - try state first (asset URL), then try to resolve from state (asset ID)
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);
    console.log(`[ReactRenderer ${this.instanceId}]   - backgroundAssetId:`, backgroundAssetId);
    console.log(`[ReactRenderer ${this.instanceId}]   - backgroundImageUrl:`, this.backgroundImageUrl);

    // Use provided locations or generate default locations from schema
    const content = { title, author, buttonText };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('titleScreen', content);

    console.log(`[ReactRenderer ${this.instanceId}] ✅ Using POSITIONED rendering with ${effectiveLocations.length} locations`);
    await this.renderPositionedBeat('titleScreen', content, effectiveLocations);
  }

  async renderText(text: string, buttonText: string, locations?: Location[]): Promise<void> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Use currentBeatType from state if set (for AI beats), otherwise default to infoText
    const beatType = (this.getState('currentBeatType') as string) || 'infoText';

    console.log(`[ReactRenderer.renderText] beatType=${beatType}, text.length=${text.length}, locations provided=${!!locations}, count=${locations?.length || 0}`);

    // Use provided locations or generate default locations from schema
    const content = { text, buttonText };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations(beatType === 'onlineContent' ? 'infoText' : beatType, content);

    // Log each location's position and dimensions
    effectiveLocations.forEach((loc, i) => {
      console.log(`[ReactRenderer.renderText] Location[${i}] "${loc.name}" (${loc.kind}): x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height}, content="${(loc as any).content?.substring?.(0, 50) || 'N/A'}..."`);
    });

    await this.renderPositionedBeat(beatType, content, effectiveLocations);
  }

  async renderDialog(speaker: string, text: string, emotion?: string, locations?: Location[]): Promise<void> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Get presentation mode from renderer state (set by DialogTreeBeat)
    const presentationMode = this.getState('presentationMode') as 'positioned' | 'chat-scroll' | 'chat-bubble' | undefined;
    const showAvatars = this.getState('showAvatars') as boolean | undefined;

    if (presentationMode) {
      this.currentPresentationMode = presentationMode;
    }
    if (showAvatars !== undefined) {
      this.currentShowAvatars = showAvatars;
    }

    // Store dialog context for renderChoices to use later
    this.setState('dialogContext', { speaker, text, emotion });

    // If in chat mode, add this message to the history
    if (this.currentPresentationMode !== 'positioned') {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Get avatar URL if available
      let avatarUrl: string | undefined;
      if (this.characterAvatarResolver) {
        // Try to resolve avatar using speaker name as character ID
        avatarUrl = this.characterAvatarResolver(speaker.toLowerCase().replace(/\s+/g, '_'));
      }

      const newMessage: ChatMessage = {
        id: messageId,
        speaker,
        text,
        emotion,
        isPlayer: false, // NPC message
        avatarUrl,
      };

      this.chatMessages.push(newMessage);

      // Render chat view immediately (without choices for now)
      this.renderChatDialog([]);
      return;
    }

    // Positioned mode - render as before
    // Render dialog immediately WITHOUT choices (don't wait for action)
    // This ensures the dialog text, background, and characters are visible
    // even if there's a choiceDelay before showing the choice buttons
    if (locations && locations.length > 0) {
      // Filter out button locations - only render text, characters, props, etc.
      const nonButtonLocations = locations.filter(loc => loc.kind !== 'button');
      if (nonButtonLocations.length > 0) {
        const content = { text, speaker, emotion, choices: [] };
        // Use currentBeatType from state if set (for AI beats), otherwise default to dialogTree
        const beatType = (this.getState('currentBeatType') as string) || 'dialogTree';
        // waitForAction=false means render and return immediately
        await this.renderPositionedBeat(beatType, content, nonButtonLocations, false);
      }
    }
  }

  /**
   * Render the chat dialog view with current messages and optional choices
   * Choices can include an isExit flag to indicate the choice exits to another beat
   */
  private renderChatDialog(choices: Array<{ id: string; text: string; isExit?: boolean }>): Promise<string> {
    return new Promise(resolve => {
      // Get response delay from renderer state (set by DialogTreeBeat)
      const responseDelay = (this.getState('responseDelay') as number) || 0;

      this.resolveAction = async (id: string) => {
        // When a choice is selected, add it as a player message
        const selectedChoice = choices.find(c => c.id === id);
        if (selectedChoice) {
          // Get player name from state (set by beat from context), default to "You"
          const playerName = (this.getState('playerName') as string) || 'You';
          // Use first name or initial if full name is too long
          const displayName = playerName.length > 12
            ? (playerName.split(' ')[0] || playerName.charAt(0))
            : playerName;

          const playerMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          this.chatMessages.push({
            id: playerMessageId,
            speaker: displayName,
            text: selectedChoice.text,
            isPlayer: true,
          });

          // Always show player's message briefly before transitioning
          // Re-render to show player's choice (without choices available)
          this.renderChatView([], false);

          // Brief delay to let player see their selection (minimum 500ms)
          await new Promise(r => setTimeout(r, 500));

          // If there's a response delay AND this choice continues the dialog (not an exit),
          // show typing indicator for NPC follow-up
          const isExitChoice = (selectedChoice as any).isExit === true;
          if (responseDelay > 0 && !isExitChoice) {
            // Show typing indicator
            this.renderChatView([], true);

            // Wait for the response delay
            await new Promise(r => setTimeout(r, responseDelay * 1000));
          }
        }
        this.resolveAction = null;
        resolve(id);
      };

      // Render initial view with choices
      this.renderChatView(choices, false);
    });
  }

  /**
   * Helper to render the chat view with current state
   */
  private renderChatView(
    choices: Array<{ id: string; text: string }>,
    showTypingIndicator: boolean
  ): void {
    // Determine background
    const defaultGradient = 'linear-gradient(to bottom, #1e3a8a, #1e40af)';
    const backgroundColor = this.backgroundImageUrl
      ? 'transparent'
      : (this.theme?.backgroundColor || defaultGradient);

    const stageWidth = this.context.width;
    const stageHeight = this.context.height;
    const disableScaling = this.getState('disableScaling') as boolean | undefined;

    // Determine scaling mode for mobile
    const scalingMode = this.mobileMode ? 'cover' as const : 'fit' as const;
    const useMobileBg = this.mobileMode && scalingMode === 'cover';

    this.renderComponent(
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <ScaledStage
          width={stageWidth}
          height={stageHeight}
          disableScaling={disableScaling}
          scalingMode={scalingMode}
          backgroundUrl={useMobileBg ? this.backgroundImageUrl : undefined}
          backgroundColor={useMobileBg ? backgroundColor : undefined}
        >
          <ChatDialogView
            messages={[...this.chatMessages]}
            choices={choices}
            mode={this.currentPresentationMode as 'chat-scroll' | 'chat-bubble'}
            showAvatars={this.currentShowAvatars}
            theme={this.theme}
            backgroundUrl={this.backgroundImageUrl}
            backgroundColor={backgroundColor}
            onChoiceSelect={this.handleAction}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            characterAvatarResolver={this.characterAvatarResolver || undefined}
            showTypingIndicator={showTypingIndicator}
            fontScale={this.mobileFontScale}
          />
        </ScaledStage>
      </div>
    );
  }

  async renderChoices(choices: { id: string; text: string }[], locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Get dialog context from prior renderDialog call
    const dialogContext = this.getState('dialogContext') || {};

    // Get markVisited from renderer state (set by the beat)
    const markVisited = this.getState('markVisited') || false;

    // Log choice rendering info
    console.log(`[renderChoices] Rendering ${choices.length} choices:`, choices.map(c => c.text).join(', '));
    if (locations) {
      const buttonLocs = locations.filter(l => l.kind === 'button');
      const textLocs = locations.filter(l => l.kind === 'text' || l.kind === 'dialog');
      console.log(`[renderChoices] Locations: ${buttonLocs.length} buttons, ${textLocs.length} text elements`);
      buttonLocs.forEach((loc, i) => {
        console.log(`[renderChoices]   Button ${i}: "${loc.name}" at (${loc.x}, ${loc.y}) size ${loc.width}x${loc.height}`);
      });
    }

    // If in chat mode, use chat rendering
    if (this.currentPresentationMode !== 'positioned') {
      return this.renderChatDialog(choices);
    }

    // Use currentBeatType from state if set (for AI beats), otherwise default to dialogTree
    const beatType = (this.getState('currentBeatType') as string) || 'dialogTree';

    // Use positioned rendering if locations are available
    if (locations && locations.length > 0) {
      // Check if current choices match the location names (for buttons)
      const buttonLocations = locations.filter(loc => loc.kind === 'button');
      const choicesMatchLocations = choices.every(choice =>
        buttonLocations.some(loc => loc.name === choice.text)
      );

      if (choicesMatchLocations) {
        // Choices match button locations - use positioned rendering as-is
        const content: Record<string, any> = {
          text: dialogContext.text || '',
          choices,
          markVisited
        };
        return this.renderPositionedBeat(beatType, content, locations, true);
      }

      // No button locations but we have choices - need to generate buttons
      if (buttonLocations.length === 0 && choices.length > 0) {
        // Keep existing non-button locations and add generated button locations
        const nonButtonLocations = [...locations];
        const stageWidth = this.context.width || 1024;
        const stageHeight = this.context.height || 768;
        const buttonWidth = 300;
        const buttonHeight = 50;
        const buttonSpacing = 15;
        const centerX = stageWidth / 2;
        // Position buttons in lower portion of screen
        let buttonY = stageHeight - 200 - (choices.length * (buttonHeight + buttonSpacing));

        const generatedLocations: Location[] = [...nonButtonLocations];
        choices.forEach((choice, index) => {
          generatedLocations.push({
            kind: 'button',
            name: choice.text,
            x: Math.round(centerX - buttonWidth / 2),
            y: Math.round(buttonY),
            width: buttonWidth,
            height: buttonHeight,
            zIndex: 10 + index,
          });
          buttonY += buttonHeight + buttonSpacing;
        });

        const content: Record<string, any> = {
          text: dialogContext.text || '',
          choices,
          markVisited
        };
        return this.renderPositionedBeat(beatType, content, generatedLocations, true);
      }

      // Choice text doesn't match button names - map choices to buttons by index
      // Use EXACT locations from visual editor - don't modify dimensions
      const textLocations = locations.filter(loc => loc.kind === 'text' || loc.kind === 'dialog');
      const characterLocations = locations.filter(loc => loc.kind === 'character');
      const propLocations = locations.filter(loc => loc.kind === 'prop');

      // Build locations array with choices mapped to button positions by index
      const mappedLocations: Location[] = [
        // Keep text/dialog locations as-is (just rename to 'text' for content mapping)
        ...textLocations.map(loc => ({
          ...loc,
          name: 'text',
        })),
        ...characterLocations,
        ...propLocations,
      ];

      // Map choices to existing button locations by index
      // Use EXACT button positions from visual editor
      choices.forEach((choice, index) => {
        if (index < buttonLocations.length) {
          // Use existing button location with choice text as name
          const btnLoc = buttonLocations[index];
          mappedLocations.push({
            ...btnLoc,
            name: choice.text,
          });
        } else {
          // Additional choices beyond defined buttons - stack below last button
          const lastBtn = buttonLocations[buttonLocations.length - 1] || buttonLocations[0];
          if (lastBtn) {
            const buttonSpacing = 15;
            mappedLocations.push({
              kind: 'button',
              name: choice.text,
              x: lastBtn.x,
              y: lastBtn.y + (lastBtn.height + buttonSpacing) * (index - buttonLocations.length + 1),
              width: lastBtn.width,
              height: lastBtn.height,
              zIndex: (lastBtn.zIndex || 10) + index,
            });
          }
        }
      });

      const content: Record<string, any> = {
        text: dialogContext.text || '',
        choices,
        markVisited
      };
      return this.renderPositionedBeat(beatType, content, mappedLocations, true);
    }

    // No locations provided - generate default locations from schema
    const content: Record<string, any> = {
      text: dialogContext.text || '',
      choices,
      markVisited
    };
    const defaultLocations = generateDefaultLocations(beatType, content);
    return this.renderPositionedBeat(beatType, content, defaultLocations, true);
  }

  async renderMovement(question: string, choices: { id: string; text: string; displayText?: string; location: string; locationName?: string }[], locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Get markVisited from renderer state (set by the beat)
    const markVisited = this.getState('markVisited') || false;

    // Use provided locations or generate default locations from schema
    const content = { question, choices, markVisited };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('movementChoice', content);

    return this.renderPositionedBeat('movementChoice', content, effectiveLocations, true);
  }

  async renderPropSelection(question: string, props: { id: string; name: string; displayName?: string; description: string; locationName?: string }[], locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Get markVisited from renderer state (set by the beat)
    const markVisited = this.getState('markVisited') || false;

    // Use provided locations or generate default locations from schema
    const content = { question, props, markVisited };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('pickProp', content);

    return this.renderPositionedBeat('pickProp', content, effectiveLocations, true);
  }

  async renderVideo(videoFile: string, autoplay: boolean, controls: boolean): Promise<void> {
    return new Promise(resolve => {
      const VideoDisplay: React.FC = () => (
        <div className="flex items-center justify-center h-screen bg-black">
          <video 
            src={videoFile}
            autoPlay={autoplay}
            controls={controls}
            className="max-w-full max-h-full"
            onEnded={() => resolve()}
          />
          {!controls && (
            <button 
              onClick={() => resolve()}
              className="absolute bottom-8 right-8 px-6 py-3 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-lg font-semibold transition-all"
            >
              Skip
            </button>
          )}
        </div>
      );
      this.renderComponent(<VideoDisplay />);
    });
  }

  async renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<string> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Get button text from renderer state (set by beat)
    const restartText = this.getState('restartText') || 'Play Again';
    const creditsText = this.getState('creditsText') || 'Credits';

    // Use provided locations or generate default locations from schema
    const content = { message, showRestart, showCredits, restartText, creditsText };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('endScreen', content);

    // Return the user's action (e.g., 'restart', 'credits', button text)
    return this.renderPositionedBeat('endScreen', content, effectiveLocations);
  }

  async renderAISummary(data: {
    title: string;
    summary: string;
    showRestart: boolean;
    showCredits: boolean;
    restartText?: string;
    creditsText?: string;
  }, locations?: Location[]): Promise<string> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Build content with separate title and summary
    const content = {
      title: data.title,
      summary: data.summary,
      showRestart: data.showRestart,
      showCredits: data.showCredits,
      restartText: data.restartText || 'Play Again',
      creditsText: data.creditsText || 'Credits',
    };

    // Use provided locations or generate default locations from schema
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('aiSummary', content);

    // Return the user's action (e.g., 'restart', 'credits')
    return this.renderPositionedBeat('aiSummary', content, effectiveLocations);
  }

  async renderCreditsPage(content: { creditsTitle: string; creditsBody: string; creditsCloseText: string }, locations?: Location[]): Promise<string> {
    // Keep same background as current beat
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Use provided locations or generate default locations for credits
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('endScreenCredits', content);

    return this.renderPositionedBeat('endScreenCredits', content, effectiveLocations);
  }

  async renderDurScreen(text: string, duration: number, locations?: Location[]): Promise<void> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Use provided locations or generate default locations from schema
    const content = { text };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('durScreen', content);

    await this.renderPositionedBeat('durScreen', content, effectiveLocations, false);
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  async renderInputText(
    prompt: string,
    placeholder?: string,
    buttonText?: string,
    options?: {
      validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
      minLength?: number;
      maxLength?: number;
      required?: boolean;
    },
    locations?: Location[]
  ): Promise<string> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Use provided locations or generate default locations from schema
    const content = {
      prompt,
      placeholder,
      buttonText: buttonText || 'Continue',
      validation: options?.validation,
      minLength: options?.minLength,
      maxLength: options?.maxLength,
      required: options?.required
    };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('inputText', content);

    // renderPositionedBeat returns a Promise<void>, but we need Promise<string>
    // So we wrap it and return the input value from resolveAction
    return new Promise<string>(resolve => {
      // Store the original resolveAction so we can call it with the input value
      const originalHandleAction = this.handleAction;
      this._originalHandleAction = originalHandleAction;  // Save for cancelPendingAction
      this.handleAction = (value: string) => {
        // Restore original handler
        this.handleAction = originalHandleAction;
        this._originalHandleAction = null;
        // Resolve with the input value
        resolve(value);
      };

      this.renderPositionedBeat('inputText', content, effectiveLocations, true);
    });
  }

  async renderKeypad(
    prompt: string,
    options: {
      layout: 'numeric' | 'phone' | 'pin';
      maxDigits: number;
      minDigits: number;
      correctCode?: string;
      failTarget?: string;
      maxAttempts: number;
      maskInput: boolean;
      buttonText: string;
      clearButtonText: string;
      showDisplay: boolean;
      skinId?: string;
    },
    locations?: Location[]
  ): Promise<string> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    const content = {
      prompt,
      ...options,
    };

    // Generate default locations if none provided
    // Filter out 'display' and 'submitButton' locations - KeypadElement handles those internally
    const effectiveLocations: Location[] = locations && locations.length > 0
      ? locations
          .filter(loc => {
            const name = (loc.name || '').toLowerCase();
            return name !== 'display' && name !== 'submitbutton';
          })
          .map(loc => {
            // Ensure keypadGrid location has kind 'keypad' (may be 'text' from legacy or initial creation)
            if (loc.name && loc.name.toLowerCase().includes('keypad')) {
              return { ...loc, kind: 'keypad' as const };
            }
            return loc;
          })
      : [
          // Prompt text
          { kind: 'text' as const, name: 'prompt', x: 212, y: 30, width: 600, height: 60 },
          // Keypad grid
          { kind: 'keypad' as const, name: 'keypadGrid', x: 392, y: 120, width: 240, height: 360 },
        ];

    return new Promise<string>(resolve => {
      const originalHandleAction = this.handleAction;
      this._originalHandleAction = originalHandleAction;  // Save for cancelPendingAction
      this.handleAction = (value: string) => {
        this.handleAction = originalHandleAction;
        this._originalHandleAction = null;
        resolve(value);
      };

      this.renderPositionedBeat('keypad', content, effectiveLocations, true);
    });
  }

  async renderHyperText(data: {
    text: string;
    links: Array<{
      word: string;
      targetBeatId: string;
      style: {
        color: string;
        hoverColor: string;
        underline: boolean;
        bold: boolean;
      };
    }>;
    allowMultiple: boolean;
  }, locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Use provided locations or generate default locations from schema
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('hyperText', data);

    return this.renderPositionedBeat('hyperText', data, effectiveLocations, true);
  }

  async renderPanorama(panoramaUrl: string, options: {
    hotspots: Array<{
      id: string;
      pitch: number;
      yaw: number;
      text: string;
      width?: number;
      height?: number;
      scale?: number;
      rotation?: number;
      sound?: string;
      assetId?: string;
      imageUrl?: string;
      kind?: string;
    }>;
    initialPitch?: number;
    initialYaw?: number;
    hfov?: number;
    projectionType?: 'equirectangular' | 'cylindrical';
    prompt?: string;
    promptDisplay?: 'static' | 'pinned';
    locations?: any[];
  }): Promise<string> {
    // Resolve panorama URL from asset ID if not already a URL
    const panoramaAssetId = this.getState('panoramaAssetId');
    const resolvedUrl = panoramaUrl || this.getState('panoramaAssetUrl') || this.resolveAssetUrl(panoramaAssetId) || '';

    // Pre-resolve hotspot images using asset resolver (PanoramaView may not
    // be able to resolve asset IDs if they aren't in the same blob store)
    const resolvedHotspots = options.hotspots.map(hs => {
      if (hs.assetId) {
        const resolved = this.resolveAssetUrl(hs.assetId);
        if (resolved) return { ...hs, imageUrl: resolved };
      }
      return hs;
    });

    return new Promise(resolve => {
      this.renderComponent(
        <div style={{ width: '100%', height: '100%' }}>
          <PanoramaView
            panoramaUrl={resolvedUrl}
            hotspots={resolvedHotspots}
            initialPitch={options.initialPitch}
            initialYaw={options.initialYaw}
            hfov={options.hfov}
            projectionType={options.projectionType}
            prompt={options.prompt}
            promptDisplay={options.promptDisplay}
            onHotspotClick={(hotspotId) => resolve(hotspotId)}
            overlayElements={options.locations?.map((loc: any) => {
              // Pre-resolve image: try asset resolver, then character resolver
              let resolvedImageUrl: string | undefined;
              if (loc.assetId) {
                resolvedImageUrl = this.resolveAssetUrl(loc.assetId) || undefined;
              }
              if (!resolvedImageUrl && loc.characterId && this.characterResolver) {
                resolvedImageUrl = this.characterResolver(loc.characterId, loc.stateId);
              }
              // Only use loc.imageUrl if it looks like a real URL (not a bare UUID)
              if (!resolvedImageUrl && loc.imageUrl) {
                const img = loc.imageUrl as string;
                if (img.startsWith('blob:') || img.startsWith('data:') || img.startsWith('http') || img.startsWith('/')) {
                  resolvedImageUrl = img;
                }
              }
              return {
                id: loc.id,
                name: loc.name,
                kind: loc.kind,
                yaw: loc.yaw,
                pitch: loc.pitch,
                width: loc.width,
                height: loc.height,
                scale: loc.scale,
                size: loc.size,
                rotation: loc.rotation,
                assetId: loc.assetId,
                imageUrl: resolvedImageUrl,
              };
            })}
            resolveAssetUrl={(assetId) => this.resolveAssetUrl(assetId) || undefined}
            soundBlobResolver={this.soundBlobResolver || undefined}
            stageWidth={this.context.width}
            hotspotStyle={this.theme?.hotspot ? {
              highlightColor: this.theme.hotspot.highlightColor,
              opacity: this.theme.hotspot.opacity,
              visible: this.theme.hotspot.visible,
              showInPreview: this.theme.hotspot.showInPreview,
              labelDisplay: this.theme.hotspot.labelDisplay,
              fontFamily: this.theme.fonts?.textFont,
              fontSize: this.theme.fonts?.textFontSize,
              tooltipBackgroundColor: this.theme.button?.backgroundColor,
              tooltipTextColor: this.theme.button?.textColor,
              tooltipBorderColor: this.theme.button?.borderColor,
              tooltipBorderRadius: this.theme.button?.borderRadius,
              tooltipFontFamily: this.theme.fonts?.buttonFont,
            } : undefined}
            promptStyle={this.theme ? {
              fontFamily: this.theme.fonts?.textFont,
              fontSize: this.theme.fonts?.textFontSize,
              color: this.theme.colors?.textColor,
              backgroundColor: this.theme.textBox?.backgroundColor?.startsWith('#')
                ? `rgba(${parseInt(this.theme.textBox.backgroundColor.slice(1,3), 16)}, ${parseInt(this.theme.textBox.backgroundColor.slice(3,5), 16)}, ${parseInt(this.theme.textBox.backgroundColor.slice(5,7), 16)}, ${(this.theme.textBox.opacity ?? 70) / 100})`
                : this.theme.textBox?.backgroundColor || undefined,
              border: (this.theme.textBox?.borderWidth && this.theme.textBox?.borderColor)
                ? `${this.theme.textBox.borderWidth}px solid ${this.theme.textBox.borderColor}`
                : undefined,
              borderRadius: this.theme.textBox?.borderRadius ?? 8,
              padding: this.theme.textBox?.padding ?? 8,
            } : undefined}
          />
        </div>
      );
    });
  }

  // Show choices with fade-in animation
  async showChoices<TResult = string>(
    choices: { id: string; text: string; icon?: string }[],
    options?: { fadeIn?: boolean; duration?: number }
  ): Promise<TResult> {
    const fadeIn = options?.fadeIn ?? true;
    const duration = options?.duration ?? 500;

    return new Promise(resolve => {
      this.resolveAction = resolve as (value: string) => void;

      const ChoicesDisplayWithFade: React.FC = () => {
        const [showChoices, setShowChoices] = React.useState(false);
        const [hasMounted, setHasMounted] = React.useState(false);

        React.useEffect(() => {
          setHasMounted(true);
          const timer = setTimeout(() => {
            setShowChoices(true);
          }, 10);
          return () => clearTimeout(timer);
        }, []);

        return (
          <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-8">
            <div
              className="max-w-2xl w-full space-y-4"
              style={{
                opacity: showChoices ? 1 : 0,
                transform: showChoices ? 'translateY(0)' : 'translateY(20px)',
                transition: hasMounted && fadeIn
                  ? `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`
                  : 'none'
              }}
            >
              {choices.map((choice, index) => (
                <button
                  key={choice.id}
                  onClick={() => this.handleAction?.(choice.id)}
                  className="w-full p-4 bg-white hover:bg-blue-50 border-2 border-gray-300 hover:border-blue-500 rounded-lg text-lg transition-all"
                  style={{
                    transitionDelay: fadeIn ? `${index * 50}ms` : '0ms'
                  }}
                >
                  {choice.icon && <span className="mr-2">{choice.icon}</span>}
                  {choice.text}
                </button>
              ))}
            </div>
          </div>
        );
      };

      this.renderComponent(<ChoicesDisplayWithFade />);
    });
  }

  /**
   * Show a loading indicator for AI-powered beats
   * @param message Main message to display (e.g., "Searching the internet...")
   * @param options Additional options (subMessage, spinnerType)
   */
  renderLoading(message: string, options?: {
    subMessage?: string;
    spinnerType?: 'spinner' | 'dots' | 'pulse';
  }): void {
    // Get background
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    this.renderComponent(
      <LoadingDisplay
        message={message}
        subMessage={options?.subMessage}
        spinnerType={options?.spinnerType}
        backgroundUrl={this.backgroundImageUrl}
        theme={this.theme}
      />
    );
  }

  /**
   * Hide the loading indicator
   * Note: Usually not needed as the next render call will replace it
   */
  hideLoading(): void {
    // Simply render empty - next render will replace
    if (this.root) {
      this.root.render(<></>);
    }
  }

  clear(): void {
    // FIXED: Don't call super.clear() as it removes DOM that React is managing
    // Instead, render empty content first, then stop sounds
    if (this.root) {
      this.root.render(<></>);
    }

    // Clear background
    this.backgroundImageUrl = null;

    // Cancel any pending action from a previous beat
    this.cancelPendingAction();

    // Reset HUD overlay state (config is kept — only live state resets)
    this.timerHudState = undefined;
    this.timerHudStateListeners.forEach(listener => listener(undefined));
    this.timerHudOverrideText = undefined;
    this.countdownMeterValue = undefined;
    this.overrideCountdownMeter = false;
    // Don't clear fictionalTimeText on beat change — it persists across beats
    // It's only cleared on story restart (reset)
    
    // Stop all sounds (copied from BaseRenderer)
    this.assetCache.sounds.forEach((audio: HTMLAudioElement) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (err) {
        // Ignore errors
      }
    });
  }
}
