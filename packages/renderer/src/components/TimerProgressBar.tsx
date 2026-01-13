import React, { useMemo } from 'react';

export interface TimerProgressBarProps {
  /** Total time for the countdown in seconds */
  totalTime: number;
  /** Current remaining time in seconds */
  remainingTime: number;
  /** Whether the timer bar should be visible */
  visible: boolean;
  /** Optional label to show (e.g., timer name) */
  label?: string;
  /** Show numeric countdown */
  showNumeric?: boolean;
}

/**
 * A horizontal progress bar displayed at the top of the stage
 * showing countdown progress for default target timers.
 *
 * Color transitions from green -> yellow -> red as time runs out.
 */
export const TimerProgressBar: React.FC<TimerProgressBarProps> = ({
  totalTime,
  remainingTime,
  visible,
  label,
  showNumeric = true,
}) => {
  // Calculate progress percentage (0 to 100)
  const progress = useMemo(() => {
    if (totalTime <= 0) return 0;
    const percent = (remainingTime / totalTime) * 100;
    return Math.max(0, Math.min(100, percent));
  }, [totalTime, remainingTime]);

  // Calculate color based on progress (green -> yellow -> red)
  const barColor = useMemo(() => {
    if (progress > 66) {
      // Green zone (66-100%)
      return 'bg-green-500';
    } else if (progress > 33) {
      // Yellow zone (33-66%)
      return 'bg-yellow-500';
    } else {
      // Red zone (0-33%)
      return 'bg-red-500';
    }
  }, [progress]);

  // Format remaining time for display
  const formattedTime = useMemo(() => {
    const seconds = Math.ceil(remainingTime);
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }, [remainingTime]);

  if (!visible || totalTime <= 0) {
    return null;
  }

  return (
    <div
      className="absolute top-0 left-0 right-0 z-[1001] pointer-events-none"
      style={{ height: '12px' }}
    >
      {/* Background track */}
      <div className="absolute inset-0 bg-gray-800/70 backdrop-blur-sm">
        {/* Progress bar - shrinks from right to left as time runs out */}
        <div
          className={`absolute top-0 left-0 h-full ${barColor}`}
          style={{
            width: `${progress}%`,
            transition: 'width 1s linear', // Match timer tick interval
          }}
        />
      </div>

      {/* Optional label and numeric display */}
      {(label || showNumeric) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs font-mono text-white drop-shadow-lg">
          {label && <span>{label}</span>}
          {showNumeric && (
            <span className={`px-1.5 py-0.5 rounded ${progress <= 33 ? 'bg-red-600' : progress <= 66 ? 'bg-yellow-600' : 'bg-green-600'}`}>
              {formattedTime}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default TimerProgressBar;
