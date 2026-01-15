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

// ============= SCALED STAGE COMPONENT =============
// Handles viewport-responsive scaling for the story stage
// Defined at module level to prevent recreation on each render

interface ScaledStageProps {
  children: React.ReactNode;
  width: number;
  height: number;
}

const ScaledStage: React.FC<ScaledStageProps> = ({ children, width, height }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState<number | null>(null);

  // Use useLayoutEffect to calculate scale synchronously before paint
  React.useLayoutEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const availableWidth = parent.clientWidth;
          const availableHeight = parent.clientHeight;
          const scaleX = availableWidth / width;
          const scaleY = availableHeight / height;
          // Use the smaller scale to fit entirely within viewport
          let newScale = Math.min(scaleX, scaleY, 1); // Cap at 1 to not upscale
          console.log(`[ScaledStage] container: ${availableWidth}x${availableHeight}, stage: ${width}x${height}, scaleX: ${scaleX.toFixed(4)}, scaleY: ${scaleY.toFixed(4)}, scale: ${newScale.toFixed(4)}`);
          // If very close to 1, use exactly 1 to avoid sub-pixel letterboxing
          if (newScale > 0.99) {
            newScale = 1;
          }
          setScale(newScale);
        }
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [width, height]);

  // Don't render until scale is calculated to prevent flash
  if (scale === null) {
    return <div ref={containerRef} style={{ width, height, visibility: 'hidden' }}>{children}</div>;
  }

  // When scale is 1 (or close to it), fill the container entirely
  // Otherwise center the scaled content
  const fillContainer = scale >= 0.99;

  return (
    <div
      ref={containerRef}
      style={{
        width: fillContainer ? '100%' : width,
        height: fillContainer ? '100%' : height,
        transform: fillContainer ? 'none' : `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
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
    let text = data.text;
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

// ============= REACT RENDERER CLASS =============

export class ReactRenderer extends BaseRenderer {
  private _root: ReactDOM.Root | null = null;
  protected resolveAction: ((value: string) => void) | null = null;  // Changed to protected
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
  protected chatMessages: ChatMessage[] = [];  // NEW: Accumulated messages for chat mode
  protected currentPresentationMode: 'positioned' | 'chat-scroll' | 'chat-bubble' = 'positioned';  // NEW: Current dialog presentation mode
  protected currentShowAvatars: boolean = true;  // NEW: Whether to show avatars in chat mode
  private characterAvatarResolver: ((characterId: string) => string | undefined) | null = null;  // NEW: Character avatar resolver
  protected timerState: { totalTime: number; remainingTime: number; visible: boolean; label?: string } | undefined;  // NEW: Timer state for progress bar
  private timerStateListeners: Set<(state: typeof this.timerState) => void> = new Set();  // Listeners for timer state changes

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

  protected renderComponent(component: React.ReactElement): void {  // Changed to protected
    console.log(`[ReactRenderer ${this.instanceId}] renderComponent called, root exists:`, !!this.root);
    
    if (!this.root) {
      console.warn(`[ReactRenderer ${this.instanceId}] No root available, attempting to reinitialize`);
      try {
        this.initialize();
        if (!this.root) {
          console.error(`[ReactRenderer ${this.instanceId}] Reinitialization failed!`);
          return;
        }
        console.log(`[ReactRenderer ${this.instanceId}] Successfully reinitialized root`);
      } catch (error) {
        console.error(`[ReactRenderer ${this.instanceId}] Failed to reinitialize:`, error);
        return;
      }
    }
    
    this.root.render(component);
  }

  protected handleAction = (id: string): void => {  // Changed to protected
    console.log(`[ReactRenderer ${this.instanceId}] handleAction called with id="${id}", hasResolveAction=${!!this.resolveAction}`);
    if (this.resolveAction) {
      this.resolveAction(id);
      this.resolveAction = null;
    } else {
      console.warn(`[ReactRenderer ${this.instanceId}] handleAction called but no resolveAction pending!`);
    }
  };

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
   * Set the timer state for the progress bar display
   * Used when a beat has showTimer: true and a defaultTargetDelay
   */
  setTimerState(state: { totalTime: number; remainingTime: number; visible: boolean; label?: string } | undefined): void {
    this.timerState = state;
    // Notify all listeners of the change
    this.timerStateListeners.forEach(listener => listener(state));
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

      this.renderComponent(
        <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ScaledStage width={stageWidth} height={stageHeight}>
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
              showTextOnHover={showTextOnHover}
              soundBlobResolver={this.soundBlobResolver || undefined}
              animations={effectiveAnimations}
              characterMeterFrameResolver={this.characterMeterFrameResolver || undefined}
              characterInventoryResolver={this.characterInventoryResolver || undefined}
              inventoryVisible={this.inventoryVisible}
              timerState={this.timerState}
              onSubscribeTimerState={(listener) => this.subscribeToTimerState(listener)}
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
    let effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('titleScreen', content);

    console.log(`[ReactRenderer ${this.instanceId}] ✅ Using POSITIONED rendering with ${effectiveLocations.length} locations`);
    await this.renderPositionedBeat('titleScreen', content, effectiveLocations);
  }

  async renderText(text: string, buttonText: string, locations?: Location[]): Promise<void> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    // Use provided locations or generate default locations from schema
    const content = { text, buttonText };
    const effectiveLocations = locations && locations.length > 0 ? locations : generateDefaultLocations('introText', content);

    await this.renderPositionedBeat('introText', content, effectiveLocations);
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
        // waitForAction=false means render and return immediately
        await this.renderPositionedBeat('dialogTree', content, nonButtonLocations, false);
      }
    }
  }

  /**
   * Render the chat dialog view with current messages and optional choices
   */
  private renderChatDialog(choices: Array<{ id: string; text: string }>): Promise<string> {
    return new Promise(resolve => {
      // Get response delay from renderer state (set by DialogTreeBeat)
      const responseDelay = (this.getState('responseDelay') as number) || 0;

      this.resolveAction = async (id: string) => {
        // When a choice is selected, add it as a player message
        const selectedChoice = choices.find(c => c.id === id);
        if (selectedChoice) {
          const playerMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          this.chatMessages.push({
            id: playerMessageId,
            speaker: 'You', // Player's name
            text: selectedChoice.text,
            isPlayer: true,
          });

          // If there's a response delay, show player message first, then typing indicator
          if (responseDelay > 0) {
            // Re-render to show player's message (without choices, with typing indicator)
            this.renderChatView([], false);

            // Small delay to let player see their message
            await new Promise(r => setTimeout(r, 300));

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

    this.renderComponent(
      <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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
        />
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

    // If in chat mode, use chat rendering
    if (this.currentPresentationMode !== 'positioned') {
      return this.renderChatDialog(choices);
    }

    // Use positioned rendering if locations are available
    if (locations && locations.length > 0) {
      // Check if current choices match the location names (for buttons)
      const buttonLocations = locations.filter(loc => loc.kind === 'button');
      const choicesMatchLocations = choices.every(choice =>
        buttonLocations.some(loc => loc.name === choice.text)
      );

      if (choicesMatchLocations || buttonLocations.length === 0) {
        // Root level dialog or no button locations - use positioned rendering as-is
        const content: Record<string, any> = {
          text: dialogContext.text || '',
          choices,
          markVisited
        };
        return this.renderPositionedBeat('dialogTree', content, locations, true);
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
      return this.renderPositionedBeat('dialogTree', content, mappedLocations, true);
    }

    // No locations provided - generate default locations from schema
    const content: Record<string, any> = {
      text: dialogContext.text || '',
      choices,
      markVisited
    };
    const defaultLocations = generateDefaultLocations('dialogTree', content);
    return this.renderPositionedBeat('dialogTree', content, defaultLocations, true);
  }

  async renderMovement(question: string, choices: { id: string; text: string; location: string }[], locations?: Location[]): Promise<string> {
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

  async renderPropSelection(question: string, props: { id: string; name: string; description: string }[], locations?: Location[]): Promise<string> {
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
      this.handleAction = (value: string) => {
        // Restore original handler
        this.handleAction = originalHandleAction;
        // Resolve with the input value
        resolve(value);
      };

      this.renderPositionedBeat('inputText', content, effectiveLocations, true);
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

  clear(): void {
    // FIXED: Don't call super.clear() as it removes DOM that React is managing
    // Instead, render empty content first, then stop sounds
    if (this.root) {
      this.root.render(<></>);
    }
    
    // Clear background
    this.backgroundImageUrl = null;
    
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
