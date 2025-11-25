import React from 'react';
import ReactDOM from 'react-dom/client';
import { BaseRenderer } from './BaseRenderer';
import type { Location } from '@asaps/core';
import type { RenderContext, RenderOptions } from '../types';
import { PositionedBeatView, createPositionedElementData, type PositionedElementData, type RenderThemeSettings } from '../components/PositionedBeatView';

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

// Choice Component
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
  protected hideTextBoxes: boolean = false;  // NEW: Whether to hide text box backgrounds
  protected hideButtonBoxes: boolean = false;  // NEW: Whether to hide button box backgrounds
  protected theme: RenderThemeSettings | undefined = undefined;  // NEW: Theme settings for styling
  
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
    if (this.resolveAction) {
      this.resolveAction(id);
      this.resolveAction = null;
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
    waitForAction: boolean = true
  ): Promise<string> {
    console.log(`[ReactRenderer ${this.instanceId}] Rendering positioned ${beatType} with ${locations.length} elements`);

    return new Promise(resolve => {
      if (waitForAction) {
        this.resolveAction = (id: string) => {
          this.resolveAction = null;
          resolve(id);
        };
      } else {
        resolve('');
      }

      // Create element data using the shared helper, passing the asset resolver
      const elements: PositionedElementData[] = createPositionedElementData(
        locations,
        content,
        beatType,
        this.assetResolver || undefined
      );
      
      // Determine background - consistent for all beat types
      // Use the beat's background image if available, otherwise use default gradient
      const backgroundColor = this.backgroundImageUrl ? 'transparent' : 'linear-gradient(to bottom, #1e3a8a, #1e40af)';
      
      // Render using the shared PositionedBeatView component
      this.renderComponent(
        <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PositionedBeatView
            stageWidth={1024}
            stageHeight={768}
            backgroundUrl={this.backgroundImageUrl}
            backgroundColor={backgroundColor}
            elements={elements}
            onAction={this.handleAction}
            interactive={true}
            hideTextBoxes={this.hideTextBoxes}
            hideButtonBoxes={this.hideButtonBoxes}
            theme={this.theme}
          />
        </div>
      );
    });
  }

  // ============= RENDER METHODS (All use unified positioning system) =============

  async renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void> {
    console.log(`[ReactRenderer ${this.instanceId}] renderTitleScreen called`);
    console.log(`[ReactRenderer ${this.instanceId}]   - title: "${title}"`);
    console.log(`[ReactRenderer ${this.instanceId}]   - locations:`, locations?.length || 0);
    if (locations && locations.length > 0) {
      console.log(`[ReactRenderer ${this.instanceId}]   - locations detail:`, JSON.stringify(locations, null, 2));
    }
    
    // Get background - try state first (asset URL), then try to resolve from state (asset ID)
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);
    console.log(`[ReactRenderer ${this.instanceId}]   - backgroundAssetId:`, backgroundAssetId);
    console.log(`[ReactRenderer ${this.instanceId}]   - backgroundImageUrl:`, this.backgroundImageUrl);
    
    if (locations && locations.length > 0) {
      console.log(`[ReactRenderer ${this.instanceId}] ✅ Using POSITIONED rendering`);
      await this.renderPositionedBeat('titleScreen', { title, author, buttonText }, locations);
      return;
    }
    
    console.log(`[ReactRenderer ${this.instanceId}] ⚠️ Using CENTERED fallback rendering (no locations)`);
    return new Promise(resolve => {
      this.resolveAction = () => { this.resolveAction = null; resolve(); };
      this.renderComponent(<TitleScreen title={title} author={author} buttonText={buttonText} onAction={this.handleAction} />);
    });
  }

  async renderText(text: string, buttonText: string, locations?: Location[]): Promise<void> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);
    
    if (locations && locations.length > 0) {
      await this.renderPositionedBeat('introText', { text, buttonText }, locations);
      return;
    }
    return new Promise(resolve => {
      this.resolveAction = () => { this.resolveAction = null; resolve(); };
      this.renderComponent(<TextDisplay text={text} buttonText={buttonText} onAction={this.handleAction} />);
    });
  }

  async renderDialog(speaker: string, text: string, emotion?: string, locations?: Location[]): Promise<void> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    if (locations && locations.length > 0) {
      await this.renderPositionedBeat('dialogTree', {
        speaker,
        text,
        emotion
      }, locations);
      return;
    }

    this.renderComponent(<DialogDisplay speaker={speaker} text={text} emotion={emotion} onAction={this.handleAction} />);
  }

  async renderChoices(choices: { id: string; text: string }[], locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    if (locations && locations.length > 0) {
      return this.renderPositionedBeat('dialogTree', {
        choices
      }, locations, true);
    }

    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<ChoiceDisplay choices={choices} onAction={this.handleAction} />);
    });
  }

  async renderMovement(question: string, choices: { id: string; text: string; location: string }[], locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    console.log('[ReactRenderer.renderMovement] Getting background:');
    console.log('[ReactRenderer.renderMovement]   - backgroundAssetId from state:', backgroundAssetId);
    console.log('[ReactRenderer.renderMovement]   - backgroundAssetUrl from state:', this.getState('backgroundAssetUrl'));
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);
    console.log('[ReactRenderer.renderMovement]   - resolved backgroundImageUrl:', this.backgroundImageUrl?.substring(0, 50));

    if (locations && locations.length > 0) {
      console.log('[ReactRenderer.renderMovement] Using positioned rendering with', locations.length, 'locations');
      console.log('[ReactRenderer.renderMovement] backgroundImageUrl before positioned render:', this.backgroundImageUrl?.substring(0, 50));
      return this.renderPositionedBeat('movementChoice', {
        question,
        choices
      }, locations, true);
    }

    console.log('[ReactRenderer.renderMovement] Using fallback component rendering');
    console.log('[ReactRenderer.renderMovement] backgroundImageUrl for fallback:', this.backgroundImageUrl?.substring(0, 50));

    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<MovementDisplay question={question} choices={choices} backgroundUrl={this.backgroundImageUrl} onAction={this.handleAction} />);
    });
  }

  async renderPropSelection(question: string, props: { id: string; name: string; description: string }[], locations?: Location[]): Promise<string> {
    // Get background asset ID from renderer state
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    if (locations && locations.length > 0) {
      return this.renderPositionedBeat('pickProp', {
        question,
        props
      }, locations, true);
    }

    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<PropDisplay question={question} props={props} onAction={this.handleAction} />);
    });
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

  async renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<void> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);

    if (locations && locations.length > 0) {
      // Get button text from renderer state (set by beat)
      const restartText = this.getState('restartText') || 'Play Again';
      const creditsText = this.getState('creditsText') || 'Credits';

      // Pass through all necessary content for schema mapping
      await this.renderPositionedBeat('endScreen', {
        message,
        showRestart,
        showCredits,
        restartText,
        creditsText
      }, locations);
      return;
    }
    return new Promise(resolve => {
      this.resolveAction = () => { this.resolveAction = null; resolve(); };
      this.renderComponent(<EndScreen message={message} showRestart={showRestart} showCredits={showCredits} onAction={this.handleAction} />);
    });
  }

  async renderDurScreen(text: string, duration: number, locations?: Location[]): Promise<void> {
    const backgroundAssetId = this.getState('backgroundAssetId');
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);
    
    if (locations && locations.length > 0) {
      await this.renderPositionedBeat('durScreen', { text }, locations, false);
      await new Promise(resolve => setTimeout(resolve, duration));
      return;
    }
    const DurScreen: React.FC = () => (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-8">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-6">
          <p className="text-lg text-gray-800 whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
    this.renderComponent(<DurScreen />);
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

    // If locations are provided, use positioned rendering (WYSIWYG)
    if (locations && locations.length > 0) {
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

        this.renderPositionedBeat('inputText', {
          prompt,
          placeholder,
          buttonText: buttonText || 'Continue',
          validation: options?.validation,
          minLength: options?.minLength,
          maxLength: options?.maxLength,
          required: options?.required
        }, locations, true);
      });
    }

    // Fall back to functional component rendering
    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(
        <InputText prompt={prompt} placeholder={placeholder} buttonText={buttonText} options={options} onAction={this.handleAction} />
      );
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

    if (locations && locations.length > 0) {
      return this.renderPositionedBeat('hyperText', data, locations, true);
    }

    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<HyperText data={data} onAction={this.handleAction} />);
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
