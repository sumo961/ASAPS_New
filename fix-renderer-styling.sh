#!/bin/bash

# Fix ReactRenderer positioned rendering to handle backgrounds and proper text styling

FILE="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/renderer/src/renderers/ReactRenderer.tsx"

echo "Creating fixed ReactRenderer with proper background and text styling..."

cat > "$FILE" << 'ENDOFFILE'
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BaseRenderer } from './BaseRenderer';
import type { Location } from '@asaps/core';
import type { RenderContext, RenderOptions } from '../types';

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
} & ScreenProps> = ({ question, choices, onAction }) => (
  <div className="flex flex-col items-center h-screen bg-blue-50 p-8">
    <h2 className="text-3xl font-bold text-gray-800 mb-8 mt-12">{question}</h2>
    <div className="max-w-3xl w-full space-y-4">
      {choices.map(choice => (
        <button
          key={choice.id}
          onClick={() => onAction?.(choice.id)}
          className="w-full p-6 bg-white hover:bg-blue-100 border-2 border-blue-300 hover:border-blue-500 rounded-lg transition-all"
        >
          <div className="flex items-center">
            <span className="text-3xl mr-4">📍</span>
            <div className="text-left">
              <div className="text-lg font-semibold">{choice.text}</div>
              <div className="text-sm text-gray-600">{choice.location}</div>
            </div>
          </div>
        </button>
      ))}
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
    <div className="flex gap-4">
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
  private resolveAction: ((value: string) => void) | null = null;
  private instanceId: string;
  private backgroundImageUrl: string | null = null;
  
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

  private renderComponent(component: React.ReactElement): void {
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

  private handleAction = (id: string): void => {
    if (this.resolveAction) {
      this.resolveAction(id);
      this.resolveAction = null;
    }
  };

  // ============= UNIVERSAL POSITIONED RENDERING SYSTEM =============
  
  /**
   * Generic positioned rendering that works for ANY beat type
   * This single method replaces all beat-specific positioned methods
   */
  private async renderPositioned(
    beatType: string,
    content: Record<string, any>,
    locations: Location[],
    waitForAction: boolean = true
  ): Promise<void> {
    console.log(`[ReactRenderer ${this.instanceId}] Rendering positioned ${beatType} with ${locations.length} elements`);
    
    return new Promise(resolve => {
      if (waitForAction) {
        this.resolveAction = (id: string) => {
          this.resolveAction = null;
          resolve();
        };
      } else {
        resolve();
      }
      
      // Container style with background
      const containerStyle: React.CSSProperties = {
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
      
      // Add background image if available
      if (this.backgroundImageUrl) {
        containerStyle.backgroundImage = `url(${this.backgroundImageUrl})`;
      } else {
        // Fallback gradient backgrounds
        const backgrounds: Record<string, string> = {
          titleScreen: 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
          endScreen: 'linear-gradient(to bottom right, #9333ea, #db2777)',
          inputText: 'linear-gradient(to bottom right, #6366f1, #9333ea)',
          hyperText: 'linear-gradient(to bottom right, #2dd4bf, #3b82f6)',
        };
        const bgGradient = backgrounds[beatType];
        if (bgGradient) {
          containerStyle.background = bgGradient;
        }
      }
      
      this.renderComponent(
        <div style={containerStyle}>
          {locations.map((loc, index) => this.renderLocationElement(loc, index, content, beatType))}
        </div>
      );
    });
  }

  /**
   * Render a single element based on its location data
   */
  private renderLocationElement(
    loc: Location,
    index: number,
    content: Record<string, any>,
    beatType: string
  ): React.ReactNode {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${loc.x}px`,
      top: `${loc.y}px`,
      width: `${loc.width}px`,
      height: `${loc.height}px`,
      zIndex: loc.zIndex || 0,
    };

    const text = this.getContentForLocation(loc, content, beatType);
    
    if (!text && loc.kind !== 'character' && loc.kind !== 'prop') {
      return null;
    }

    switch (loc.kind) {
      case 'text':
        // Title/author text - white background boxes with black text
        const fontSize = loc.height > 50 ? '32px' : loc.height > 30 ? '18px' : '14px';
        return (
          <div
            key={index}
            style={{
              ...baseStyle,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '12px 20px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize,
              fontWeight: '500',
              color: '#000',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            {text}
          </div>
        );

      case 'button':
      case 'hotspot':
        return (
          <button
            key={index}
            onClick={() => this.handleAction(loc.name || 'continue')}
            style={{
              ...baseStyle,
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: '2px solid #2563eb',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }}
          >
            {text}
          </button>
        );

      case 'dialog':
        return (
          <div
            key={index}
            style={{
              ...baseStyle,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '16px',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{text}</p>
          </div>
        );

      case 'character':
      case 'prop':
        return (
          <div
            key={index}
            style={{
              ...baseStyle,
              backgroundColor: '#d1d5db',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#4b5563',
              border: '2px dashed #9ca3af',
            }}
          >
            {loc.name}
          </div>
        );

      default:
        return null;
    }
  }

  /**
   * Smart content resolution - finds the right content for each location
   */
  private getContentForLocation(
    loc: Location,
    content: Record<string, any>,
    beatType: string
  ): string {
    const nameLower = loc.name?.toLowerCase() || '';
    
    // Location name mapping
    if (nameLower.includes('title')) return content.title || '';
    if (nameLower.includes('author')) return content.author ? `by ${content.author}` : '';
    if (nameLower.includes('start')) return content.buttonText || 'Start';
    if (nameLower.includes('continue') || nameLower.includes('submit')) {
      return content.buttonText || 'Continue';
    }
    if (nameLower.includes('restart')) return content.buttonText || 'Play Again';
    if (nameLower.includes('main') || nameLower.includes('text') || loc.kind === 'dialog') {
      return content.text || '';
    }
    if (nameLower.includes('end') || nameLower.includes('message')) {
      return content.message || 'The End';
    }
    if (nameLower.includes('prompt')) {
      return content.prompt || '';
    }
    
    // Fallback for buttons/hotspots
    if (loc.kind === 'button' || loc.kind === 'hotspot') {
      return content.buttonText || loc.name || 'Continue';
    }
    
    return content.text || content.message || content.prompt || loc.name || '';
  }

  // ============= RENDER METHODS (All use general positioning system) =============

  async renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void> {
    console.log(`[ReactRenderer ${this.instanceId}] renderTitleScreen called`);
    
    // Get background from state if available
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
    
    if (locations && locations.length > 0) {
      console.log(`[ReactRenderer ${this.instanceId}] - Using POSITIONED rendering`);
      return this.renderPositioned('titleScreen', { title, author, buttonText }, locations);
    }
    
    console.log(`[ReactRenderer ${this.instanceId}] - Using CENTERED fallback rendering`);
    return new Promise(resolve => {
      this.resolveAction = () => { this.resolveAction = null; resolve(); };
      this.renderComponent(<TitleScreen title={title} author={author} buttonText={buttonText} onAction={this.handleAction} />);
    });
  }

  async renderText(text: string, buttonText: string, locations?: Location[]): Promise<void> {
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
    
    if (locations && locations.length > 0) {
      return this.renderPositioned('introText', { text, buttonText }, locations);
    }
    return new Promise(resolve => {
      this.resolveAction = () => { this.resolveAction = null; resolve(); };
      this.renderComponent(<TextDisplay text={text} buttonText={buttonText} onAction={this.handleAction} />);
    });
  }

  async renderDialog(speaker: string, text: string, emotion?: string): Promise<void> {
    this.renderComponent(<DialogDisplay speaker={speaker} text={text} emotion={emotion} onAction={this.handleAction} />);
  }

  async renderChoices(choices: { id: string; text: string }[]): Promise<string> {
    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<ChoiceDisplay choices={choices} onAction={this.handleAction} />);
    });
  }

  async renderMovement(question: string, choices: { id: string; text: string; location: string }[]): Promise<string> {
    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<MovementDisplay question={question} choices={choices} onAction={this.handleAction} />);
    });
  }

  async renderPropSelection(question: string, props: { id: string; name: string; description: string }[]): Promise<string> {
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
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
    
    if (locations && locations.length > 0) {
      const buttonText = showRestart ? 'Play Again' : showCredits ? 'Credits' : 'Close';
      return this.renderPositioned('endScreen', { message, buttonText, showRestart, showCredits }, locations);
    }
    return new Promise(resolve => {
      this.resolveAction = () => { this.resolveAction = null; resolve(); };
      this.renderComponent(<EndScreen message={message} showRestart={showRestart} showCredits={showCredits} onAction={this.handleAction} />);
    });
  }

  async renderDurScreen(text: string, duration: number, locations?: Location[]): Promise<void> {
    this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
    
    if (locations && locations.length > 0) {
      await this.renderPositioned('durScreen', { text }, locations, false);
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
    }
  ): Promise<string> {
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
  }): Promise<string> {
    return new Promise(resolve => {
      this.resolveAction = resolve;
      this.renderComponent(<HyperText data={data} onAction={this.handleAction} />);
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
ENDOFFILE

echo "✓ Created fixed ReactRenderer with:"
echo "  - Proper background image support"
echo "  - White boxes for text elements (not blue highlights)"
echo "  - Proper button styling with hover effects"
echo "  - Better font sizing"
echo ""
echo "Now rebuild renderer:"
echo "  cd packages/renderer && npm run build"
