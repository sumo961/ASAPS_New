import React, { useState, useCallback, useRef } from 'react';

export interface KeypadElementProps {
  /** Keypad layout */
  layout: 'numeric' | 'phone' | 'pin';
  /** Maximum digits allowed */
  maxDigits: number;
  /** Minimum digits required */
  minDigits: number;
  /** Expected code for validation (empty = accept any) */
  correctCode?: string;
  /** Maximum attempts (0 = unlimited) */
  maxAttempts: number;
  /** Show * instead of digits */
  maskInput: boolean;
  /** Submit button text */
  buttonText: string;
  /** Clear button text */
  clearButtonText: string;
  /** Show digit display area */
  showDisplay: boolean;
  /** Callback when code is submitted */
  onSubmit: (code: string) => void;
  /** Callback when max attempts reached with wrong code */
  onFail?: () => void;
  /** Theme colors */
  theme?: {
    buttonBg?: string;
    buttonText?: string;
    buttonBorder?: string;
    displayBg?: string;
    displayText?: string;
    frameBg?: string;
  };
  /** Width of the keypad area */
  width?: number;
  /** Height of the keypad area */
  height?: number;
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
}

/**
 * Get the button grid layout based on the keypad type
 */
function getKeypadButtons(layout: 'numeric' | 'phone' | 'pin'): string[][] {
  switch (layout) {
    case 'phone':
      return [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['*', '0', '#'],
      ];
    case 'pin':
      return [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['C', '0', '✓'],
      ];
    case 'numeric':
    default:
      return [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['←', '0', '✓'],
      ];
  }
}

/**
 * KeypadElement - A grid of digit buttons with display area.
 * Used for phone keypads, safe locks, PIN entry, etc.
 */
export const KeypadElement: React.FC<KeypadElementProps> = ({
  layout,
  maxDigits,
  minDigits,
  correctCode,
  maxAttempts,
  maskInput,
  buttonText,
  clearButtonText,
  showDisplay,
  onSubmit,
  onFail,
  theme,
  width = 240,
  height = 360,
  fontScale = 1.0,
}) => {
  const [digits, setDigits] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const buttons = getKeypadButtons(layout);

  // Theme defaults
  const btnBg = theme?.buttonBg || 'rgba(255, 255, 255, 0.15)';
  const btnText = theme?.buttonText || '#ffffff';
  const btnBorder = theme?.buttonBorder || 'rgba(255, 255, 255, 0.3)';
  const dispBg = theme?.displayBg || 'rgba(0, 0, 0, 0.4)';
  const dispText = theme?.displayText || '#00ff00';
  const frameBg = theme?.frameBg || 'rgba(30, 30, 50, 0.9)';

  const triggerShake = useCallback(() => {
    setShaking(true);
    setError(true);
    setTimeout(() => {
      setShaking(false);
      setError(false);
      setDigits('');
    }, 600);
  }, []);

  const handleDigit = useCallback((digit: string) => {
    // Special keys
    if (digit === '←' || digit === 'C') {
      if (digit === 'C') {
        setDigits('');
      } else {
        setDigits(prev => prev.slice(0, -1));
      }
      return;
    }

    if (digit === '✓') {
      handleSubmit();
      return;
    }

    // Regular digit (or * / #)
    if (digits.length < maxDigits) {
      setDigits(prev => prev + digit);
    }
  }, [digits, maxDigits]);

  const handleSubmit = useCallback(() => {
    if (digits.length < minDigits) return;

    // Validate against correct code if set
    if (correctCode && correctCode.length > 0) {
      if (digits !== correctCode) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        triggerShake();

        if (maxAttempts > 0 && newAttempts >= maxAttempts) {
          // Max attempts reached
          onFail?.();
          onSubmit('__keypad_fail__');
        }
        return;
      }
    }

    onSubmit(digits);
  }, [digits, minDigits, correctCode, attempts, maxAttempts, triggerShake, onFail, onSubmit]);

  const handleClear = useCallback(() => {
    setDigits('');
  }, []);

  // Calculate button sizes based on available space
  const padding = 12;
  const gap = 6;
  const displayHeight = showDisplay ? 50 : 0;
  const submitHeight = 40;
  const rows = buttons.length;
  const cols = 3;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2 - displayHeight - submitHeight - gap * (rows + 1);
  const btnWidth = Math.floor((availableWidth - gap * (cols - 1)) / cols);
  const btnHeight = Math.floor((availableHeight - gap * (rows - 1)) / rows);

  const displayText = maskInput
    ? '•'.repeat(digits.length)
    : digits;

  // Placeholder dots
  const placeholderDots = maskInput
    ? '•'.repeat(maxDigits)
    : '_'.repeat(maxDigits);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        backgroundColor: frameBg,
        borderRadius: 12,
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        animation: shaking ? 'keypadShake 0.5s ease-in-out' : undefined,
      }}
    >
      {/* CSS for shake animation */}
      <style>{`
        @keyframes keypadShake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>

      {/* Display area */}
      {showDisplay && (
        <div
          style={{
            height: displayHeight,
            backgroundColor: dispBg,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"Courier New", monospace',
            fontSize: Math.round(Math.min(28, displayHeight * 0.5) * fontScale),
            fontWeight: 700,
            color: error ? '#EF4444' : dispText,
            letterSpacing: '0.2em',
            border: `1px solid ${error ? '#EF4444' : 'rgba(255, 255, 255, 0.1)'}`,
            transition: 'color 0.3s, border-color 0.3s',
          }}
        >
          {digits.length > 0 ? displayText : (
            <span style={{ opacity: 0.3 }}>{placeholderDots}</span>
          )}
        </div>
      )}

      {/* Attempt counter */}
      {maxAttempts > 0 && attempts > 0 && (
        <div
          style={{
            textAlign: 'center',
            fontSize: Math.round(11 * fontScale),
            color: attempts >= maxAttempts - 1 ? '#EF4444' : 'rgba(255, 255, 255, 0.5)',
          }}
        >
          Attempt {attempts}/{maxAttempts}
        </div>
      )}

      {/* Button grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap,
        }}
      >
        {buttons.flat().map((btn, i) => {
          const isAction = btn === '←' || btn === 'C' || btn === '✓';
          return (
            <button
              key={`${btn}-${i}`}
              onClick={() => handleDigit(btn)}
              style={{
                width: btnWidth,
                height: btnHeight,
                backgroundColor: isAction ? 'rgba(255, 255, 255, 0.08)' : btnBg,
                color: btnText,
                border: `1px solid ${btnBorder}`,
                borderRadius: 8,
                fontSize: Math.round(Math.min(20, btnHeight * 0.4) * fontScale),
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.15s, transform 0.1s',
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              {btn}
            </button>
          );
        })}
      </div>

      {/* Submit / Clear row */}
      <div
        style={{
          display: 'flex',
          gap,
          height: submitHeight,
        }}
      >
        <button
          onClick={handleClear}
          style={{
            flex: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.7)',
            border: `1px solid ${btnBorder}`,
            borderRadius: 8,
            fontSize: Math.round(13 * fontScale),
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {clearButtonText}
        </button>
        <button
          onClick={handleSubmit}
          disabled={digits.length < minDigits}
          style={{
            flex: 2,
            // Submit follows the theme button (was hardcoded blue and
            // ignored the theme the digit keys already consume).
            backgroundColor: digits.length >= minDigits
              ? (theme?.buttonBg || '#3B82F6')
              : `color-mix(in srgb, ${theme?.buttonBg || '#3B82F6'} 30%, transparent)`,
            color: theme?.buttonText || '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontSize: Math.round(14 * fontScale),
            fontWeight: 600,
            cursor: digits.length >= minDigits ? 'pointer' : 'not-allowed',
            opacity: digits.length >= minDigits ? 1 : 0.5,
            transition: 'background-color 0.2s, opacity 0.2s',
          }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default KeypadElement;
