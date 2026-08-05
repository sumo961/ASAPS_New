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
  /** Stage width for layout. Ignored when `responsive` is true (the
   *  view fills its parent at 100% × 100%). */
  stageWidth?: number;
  /** Stage height for layout. Ignored when `responsive` is true. */
  stageHeight?: number;
  /** Character avatar resolver */
  characterAvatarResolver?: (characterId: string) => string | undefined;
  /** Show typing indicator (NPC is "thinking") */
  showTypingIndicator?: boolean;
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
  /**
   * When true, render at 100% × 100% of the parent without the
   * ScaledStage uniform-scale wrapper. Bubble/typography sizes use
   * clamp() and viewport units so layout reflows naturally instead
   * of being scale-transformed. Bubbles also pick up theme.textBox
   * styling for consistency with slot mode.
   */
  responsive?: boolean;
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
  showTypingIndicator = false,
  fontScale = 1.0,
  responsive = false,
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

  // Get theme colors (fallbacks mirror the "Ink & Brass" default theme —
  // keep in sync with DEFAULT_THEME in PositionedBeatView)
  const textBox = theme?.textBox || {
    backgroundColor: '#1b1f2b',
    borderColor: '#3d4356',
    borderWidth: 1,
    borderRadius: 16, // Rounder for chat bubbles
    padding: 12,
    opacity: 93,
  };

  const button = theme?.button || {
    backgroundColor: '#d9a441',
    hoverBackgroundColor: '#e2b35e',
    textColor: '#201607',
    borderColor: '#3d4356',
    borderWidth: 1,
    borderRadius: 20, // Pill-shaped for chat choices
  };

  const colors = theme?.colors || {
    textColor: '#eae7de',
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

  // Player message styling: player bubbles take the theme's BUTTON colors
  // (the player's voice = the player's controls), NPC bubbles the text box.
  // Was a hardcoded #0a66c2 blue that ignored the theme entirely.
  const playerBubbleBg = button.backgroundColor;
  const playerBubbleText = button.textColor;

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
              backgroundColor: isPlayer ? playerBubbleBg : textBox.backgroundColor,
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
              <div
                className="w-full h-full flex items-center justify-center text-sm font-bold"
                style={{ color: isPlayer ? playerBubbleText : colors.textColor }}
              >
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
          {/* Speaker name (NPC only, and only when the avatar isn't
              already showing it).
              Bug 21 — dropped the emotion emoji that used to follow
              the name. dialogNode.emotion has no author UI in the
              DialogTreeEditor, so the emoji was shown to players but
              authors could never set or change it. The character's
              live affect (which DOES have authoring) is already
              visible via the debug panel and through any character-
              affect-driven beats.
              Bug 22 — suppress the label when showAvatars is on: the
              circular avatar (image or initial) already identifies
              the speaker, and a duplicate name above the bubble is
              visual noise. With showAvatars OFF, the text label is
              still essential so the player knows who's talking. */}
          {!isPlayer && !showAvatars && (
            <div
              className="text-xs mb-1 px-2"
              style={{
                color: colors.textColor,
                opacity: 0.7,
                fontFamily: fonts.textFont,
              }}
            >
              {message.speaker}
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
              // Player bubbles need the button's contrast color, not the NPC
              // text color — a light button bg + white NPC text was unreadable.
              color: isPlayer ? playerBubbleText : colors.textColor,
              fontFamily: fonts.textFont,
              fontSize: Math.round(15 * fontScale),
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
              fontSize: Math.round(14 * fontScale),
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

  // Render typing indicator (animated "..." dots)
  const renderTypingIndicator = () => {
    if (!showTypingIndicator) return null;

    return (
      <div
        className="flex items-end gap-2 mb-3"
        style={{ flexDirection: 'row' }}
      >
        {/* Avatar placeholder for NPC */}
        {showAvatars && (
          <div
            className="flex-shrink-0 rounded-full overflow-hidden"
            style={{
              width: 40,
              height: 40,
              backgroundColor: textBox.backgroundColor,
              border: `2px solid ${textBox.borderColor}`,
            }}
          >
            <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
              ?
            </div>
          </div>
        )}

        {/* Typing bubble */}
        <div
          className="px-4 py-3"
          style={{
            backgroundColor: bubbleBg,
            borderRadius: textBox.borderRadius || 16,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: colors.textColor,
                  opacity: 0.6,
                  animation: 'typingDot 1.4s infinite ease-in-out',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes typingDot {
              0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
              30% { transform: translateY(-4px); opacity: 1; }
            }
          `}</style>
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex flex-col"
      style={{
        width: responsive ? '100%' : stageWidth,
        height: responsive ? '100%' : stageHeight,
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundColor: backgroundUrl ? undefined : backgroundColor,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        // Responsive mode: pick up theme typography at the root so
        // bubbles/labels inherit the project font instead of the
        // browser default. Slot mode already does this in SlotFlowView.
        ...(responsive ? {
          fontFamily: theme?.fonts.textFont || 'sans-serif',
          color: theme?.colors?.textColor || '#fff',
        } : {}),
      }}
    >
      {/* Message area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{
          // Responsive: use viewport-relative padding so it scales on
          // mobile. Legacy: fixed 20px/16px for ScaledStage-compatible
          // pixels.
          padding: responsive ? 'clamp(12px, 2vh, 24px) clamp(12px, 3vw, 24px)' : '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: mode === 'chat-bubble' ? 'center' : 'flex-end',
        }}
      >
        <div
          style={{
            // Readable max-width column. clamp keeps narrow screens
            // wide-enough for legibility and caps the line length on
            // ultra-wide displays.
            maxWidth: responsive ? 'min(680px, 92vw)' : 600,
            width: '100%',
            margin: '0 auto',
          }}
        >
          {displayMessages.map((msg, index) => renderMessage(msg, index))}
          {renderTypingIndicator()}
        </div>
      </div>

      {/* Choices area */}
      {renderChoices()}
    </div>
  );
};

export default ChatDialogView;
