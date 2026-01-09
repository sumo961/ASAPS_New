import React, { useEffect, useRef, useState } from 'react';
import type { RenderThemeSettings } from './PositionedBeatView';

/**
 * A single message in the chat dialog
 */
export interface ChatMessage {
  id: string;
  speaker: string;
  text: string;
  emotion?: string;
  isPlayer?: boolean; // If true, message is from player (right side)
  avatarUrl?: string; // Optional avatar image
}

/**
 * Props for the ChatDialogView component
 */
export interface ChatDialogViewProps {
  /** Current messages to display (for scroll mode, this includes history) */
  messages: ChatMessage[];
  /** Current choices available to player */
  choices?: Array<{ id: string; text: string; target?: string }>;
  /** Presentation mode - 'chat-scroll' shows full history, 'chat-bubble' shows single message */
  mode: 'chat-scroll' | 'chat-bubble';
  /** Whether to show character avatars */
  showAvatars?: boolean;
  /** Theme settings for styling */
  theme?: RenderThemeSettings;
  /** Background URL */
  backgroundUrl?: string | null;
  /** Background color/gradient */
  backgroundColor?: string;
  /** Callback when a choice is selected */
  onChoiceSelect?: (choiceId: string) => void;
  /** Stage width for layout */
  stageWidth?: number;
  /** Stage height for layout */
  stageHeight?: number;
  /** Character avatar resolver */
  characterAvatarResolver?: (characterId: string) => string | undefined;
}

/**
 * ChatDialogView - Renders dialog in chat/messaging app style
 *
 * Two modes:
 * - chat-scroll: Full message history, scrollable, messages stack vertically
 * - chat-bubble: Single message at a time (like a speech bubble but styled as chat)
 */
export const ChatDialogView: React.FC<ChatDialogViewProps> = ({
  messages,
  choices = [],
  mode,
  showAvatars = true,
  theme,
  backgroundUrl,
  backgroundColor = 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
  onChoiceSelect,
  stageWidth = 800,
  stageHeight = 600,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [animatedMessages, setAnimatedMessages] = useState<Set<string>>(new Set());
  const [choicesVisible, setChoicesVisible] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (mode === 'chat-scroll' && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, mode]);

  // Track which messages have been animated in
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedMessages(new Set(messages.map(m => m.id)));
    }, 50);
    return () => clearTimeout(timer);
  }, [messages]);

  // Track when choices should become visible
  // Show choices after messages are animated (or immediately if messages already animated)
  useEffect(() => {
    if (choices.length > 0) {
      // Show choices after a brief delay to allow message animations to complete
      const timer = setTimeout(() => {
        setChoicesVisible(true);
      }, animatedMessages.size === messages.length ? 0 : 100);
      return () => clearTimeout(timer);
    } else {
      setChoicesVisible(false);
    }
  }, [choices.length, animatedMessages.size, messages.length]);

  // Get theme colors
  const textBox = theme?.textBox || {
    backgroundColor: '#16213e',
    borderColor: '#4a90d9',
    borderWidth: 2,
    borderRadius: 16, // Rounder for chat bubbles
    padding: 12,
    opacity: 95,
  };

  const button = theme?.button || {
    backgroundColor: '#0f3460',
    hoverBackgroundColor: '#1a4a7a',
    textColor: '#ffffff',
    borderColor: '#4a90d9',
    borderWidth: 1,
    borderRadius: 20, // Pill-shaped for chat choices
  };

  const colors = theme?.colors || {
    textColor: '#ffffff',
    textAlpha: 100,
  };

  const fonts = theme?.fonts || {
    textFont: 'system-ui, -apple-system, sans-serif',
    buttonFont: 'system-ui, -apple-system, sans-serif',
  };

  // Convert opacity (0-100) to CSS value
  const bgOpacity = (textBox.opacity || 95) / 100;

  // Parse background color and apply opacity
  const bubbleBg = textBox.backgroundColor.startsWith('#')
    ? `rgba(${parseInt(textBox.backgroundColor.slice(1, 3), 16)}, ${parseInt(textBox.backgroundColor.slice(3, 5), 16)}, ${parseInt(textBox.backgroundColor.slice(5, 7), 16)}, ${bgOpacity})`
    : textBox.backgroundColor;

  // Player message styling (different from NPC)
  const playerBubbleBg = '#0a66c2'; // Blue for player messages

  // Render a single message bubble
  const renderMessage = (message: ChatMessage, index: number) => {
    const isPlayer = message.isPlayer;
    const isAnimated = animatedMessages.has(message.id);

    return (
      <div
        key={message.id}
        className="flex items-end gap-2 mb-3"
        style={{
          flexDirection: isPlayer ? 'row-reverse' : 'row',
          opacity: isAnimated ? 1 : 0,
          transform: isAnimated ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
          transitionDelay: `${index * 50}ms`,
        }}
      >
        {/* Avatar */}
        {showAvatars && (
          <div
            className="flex-shrink-0 rounded-full overflow-hidden"
            style={{
              width: 40,
              height: 40,
              backgroundColor: isPlayer ? '#0a66c2' : textBox.backgroundColor,
              border: `2px solid ${textBox.borderColor}`,
            }}
          >
            {message.avatarUrl ? (
              <img
                src={message.avatarUrl}
                alt={message.speaker}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                {message.speaker.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Message bubble */}
        <div
          style={{
            maxWidth: '70%',
            minWidth: 100,
          }}
        >
          {/* Speaker name (only for NPC in chat mode) */}
          {!isPlayer && (
            <div
              className="text-xs mb-1 px-2"
              style={{
                color: colors.textColor,
                opacity: 0.7,
                fontFamily: fonts.textFont,
              }}
            >
              {message.speaker}
              {message.emotion && (
                <span className="ml-2">
                  {getEmotionEmoji(message.emotion)}
                </span>
              )}
            </div>
          )}

          {/* Bubble content */}
          <div
            className="px-4 py-3"
            style={{
              backgroundColor: isPlayer ? playerBubbleBg : bubbleBg,
              borderRadius: textBox.borderRadius || 16,
              borderTopLeftRadius: !isPlayer && !showAvatars ? 4 : textBox.borderRadius || 16,
              borderTopRightRadius: isPlayer && !showAvatars ? 4 : textBox.borderRadius || 16,
              color: colors.textColor,
              fontFamily: fonts.textFont,
              fontSize: 15,
              lineHeight: 1.5,
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            {message.text}
          </div>
        </div>
      </div>
    );
  };

  // Render choice buttons (styled as chat input suggestions)
  const renderChoices = () => {
    if (!choices.length) return null;

    return (
      <div
        className="flex flex-wrap gap-2 justify-center"
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderTop: `1px solid rgba(255, 255, 255, 0.1)`,
        }}
      >
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            onClick={() => onChoiceSelect?.(choice.id)}
            className="transition-all duration-200"
            style={{
              backgroundColor: button.backgroundColor,
              color: button.textColor,
              border: `${button.borderWidth}px solid ${button.borderColor}`,
              borderRadius: button.borderRadius || 20,
              padding: '8px 16px',
              fontFamily: fonts.buttonFont,
              fontSize: 14,
              cursor: 'pointer',
              opacity: choicesVisible ? 1 : 0,
              transform: choicesVisible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.3s ease-out',
              transitionDelay: `${index * 50}ms`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = button.hoverBackgroundColor;
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = button.backgroundColor;
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {choice.text}
          </button>
        ))}
      </div>
    );
  };

  // For chat-bubble mode, only show the latest message
  const displayMessages = mode === 'chat-bubble'
    ? messages.slice(-1)
    : messages;

  return (
    <div
      className="flex flex-col"
      style={{
        width: stageWidth,
        height: stageHeight,
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundColor: backgroundUrl ? undefined : backgroundColor,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Message area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: mode === 'chat-bubble' ? 'center' : 'flex-end',
        }}
      >
        <div
          style={{
            maxWidth: 600,
            width: '100%',
            margin: '0 auto',
          }}
        >
          {displayMessages.map((msg, index) => renderMessage(msg, index))}
        </div>
      </div>

      {/* Choices area */}
      {renderChoices()}
    </div>
  );
};

/**
 * Get an emoji for a given emotion
 */
function getEmotionEmoji(emotion: string): string {
  const emotionMap: Record<string, string> = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    surprised: '😮',
    neutral: '😐',
    excited: '🤩',
    confused: '😕',
    worried: '😟',
    thinking: '🤔',
    laughing: '😂',
    scared: '😨',
    love: '😍',
  };
  return emotionMap[emotion.toLowerCase()] || '';
}

export default ChatDialogView;
