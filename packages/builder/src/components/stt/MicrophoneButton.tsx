/**
 * MicrophoneButton
 *
 * Reusable mic button with listening indicator and interim transcript display.
 * Used by AIConversationBeat's renderConversationInput and any other
 * component that needs voice input.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { getSTTService } from '../../services/stt';

export interface MicrophoneButtonProps {
  /** Called with final transcribed text */
  onTranscription: (text: string) => void;
  /** Language for recognition (BCP 47) */
  language?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show inline interim transcript */
  showTranscript?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({
  onTranscription,
  language,
  disabled = false,
  className = '',
  showTranscript = false,
  size = 'md',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accumulatedText = useRef('');

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const service = getSTTService();
      if (service.isListening()) {
        service.stopListening();
      }
    };
  }, []);

  const handleToggle = useCallback(() => {
    const service = getSTTService();

    if (isListening) {
      // Stop listening
      service.stopListening().then((result) => {
        setIsListening(false);
        setInterimText('');
        const finalText = result?.text || accumulatedText.current;
        if (finalText.trim()) {
          onTranscription(finalText.trim());
        }
        accumulatedText.current = '';
      });
      return;
    }

    // Start listening
    if (!service.isReady()) {
      setError('STT not configured. Open Settings to configure speech input.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setError(null);
    setInterimText('');
    accumulatedText.current = '';

    service.startListening({
      language,
      onResult: (result) => {
        if (result.isFinal) {
          accumulatedText.current = accumulatedText.current
            ? accumulatedText.current + ' ' + result.text
            : result.text;
          setInterimText('');
        } else {
          setInterimText(result.text);
        }
      },
      onError: (err) => {
        setError(err.message);
        setIsListening(false);
        setTimeout(() => setError(null), 3000);
      },
      onEnd: () => {
        setIsListening(false);
        const finalText = accumulatedText.current;
        if (finalText.trim()) {
          onTranscription(finalText.trim());
        }
        accumulatedText.current = '';
        setInterimText('');
      },
    });

    setIsListening(true);
  }, [isListening, language, onTranscription]);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center transition-all ${
          isListening
            ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={isListening ? 'Stop listening' : 'Start voice input'}
      >
        {isListening ? (
          <Square className={iconSizes[size]} />
        ) : disabled ? (
          <MicOff className={iconSizes[size]} />
        ) : (
          <Mic className={iconSizes[size]} />
        )}
      </button>

      {/* Interim transcript */}
      {showTranscript && (isListening || interimText) && (
        <div className="text-xs text-gray-500 max-w-48 text-center truncate">
          {interimText || (accumulatedText.current ? accumulatedText.current : 'Listening...')}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-500 max-w-48 text-center">
          {error}
        </div>
      )}
    </div>
  );
};
