/**
 * SaveStatus - Visual indicator for auto-save status
 *
 * Displays current save state with appropriate icons and colors:
 * - idle: No unsaved changes
 * - pending: Changes pending save
 * - saving: Currently saving
 * - saved: Successfully saved (with timestamp)
 * - error: Error occurred
 */

import React from 'react';
import { Cloud, CloudOff, Loader2, Check, AlertCircle, Save } from 'lucide-react';
import type { SaveStatus as SaveStatusType } from '../hooks/useAutoSave';

export interface SaveStatusProps {
  /** Current save status */
  status: SaveStatusType;

  /** Last saved timestamp */
  lastSaved: Date | null;

  /** Error message if status is 'error' */
  error?: Error | null;

  /** Show detailed status text */
  showText?: boolean;

  /** Compact mode (icon only) */
  compact?: boolean;

  /** Custom className */
  className?: string;

  /** Callback for manual save button */
  onSave?: () => void;
}

/**
 * Format time ago string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Get status display information
 */
function getStatusInfo(status: SaveStatusType, lastSaved: Date | null, error?: Error | null) {
  switch (status) {
    case 'idle':
      return {
        icon: Cloud,
        text: lastSaved ? `Saved ${formatTimeAgo(lastSaved)}` : 'No changes',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
      };

    case 'pending':
      return {
        icon: Cloud,
        text: 'Unsaved changes',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
      };

    case 'saving':
      return {
        icon: Loader2,
        text: 'Saving...',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        spin: true,
      };

    case 'saved':
      return {
        icon: Check,
        text: `Saved ${lastSaved ? formatTimeAgo(lastSaved) : 'just now'}`,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
      };

    case 'error':
      return {
        icon: AlertCircle,
        text: error?.message || 'Save failed',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
      };

    default:
      return {
        icon: CloudOff,
        text: 'Unknown status',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
      };
  }
}

/**
 * Save status indicator component
 */
export const SaveStatus: React.FC<SaveStatusProps> = ({
  status,
  lastSaved,
  error,
  showText = true,
  compact = false,
  className = '',
  onSave,
}) => {
  const info = getStatusInfo(status, lastSaved, error);
  const Icon = info.icon;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 ${className}`}
        title={info.text}
      >
        <Icon
          size={16}
          className={`${info.color} ${info.spin ? 'animate-spin' : ''}`}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Status indicator - only show when there's something to report */}
      {(status === 'pending' || status === 'saving' || status === 'error') && showText && (
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${info.bgColor} transition-colors`}
          title={error ? error.message : undefined}
        >
          <Icon
            size={14}
            className={`${info.color} ${info.spin ? 'animate-spin' : ''}`}
          />
          <span className={`text-xs font-medium ${info.color}`}>
            {info.text}
          </span>
        </div>
      )}

      {/* Manual save button (styled to match header buttons) */}
      {onSave && (
        <button
          onClick={onSave}
          disabled={status === 'saving' || status === 'idle'}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
            status === 'idle'
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
              : status === 'saving'
              ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
              : status === 'saved'
              ? 'bg-green-500 text-white'
              : status === 'pending'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
          title={
            status === 'idle'
              ? 'Nothing to save'
              : status === 'saving'
              ? 'Saving...'
              : status === 'saved'
              ? `Saved ${lastSaved ? formatTimeAgo(lastSaved) : 'just now'}`
              : status === 'pending'
              ? 'Save changes'
              : 'Save project'
          }
        >
          {status === 'saved' ? <Check size={16} /> : status === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
};

/**
 * Minimal save status (just icon with tooltip)
 */
export const MinimalSaveStatus: React.FC<Omit<SaveStatusProps, 'showText' | 'compact'>> = (props) => {
  return <SaveStatus {...props} showText={false} compact={true} />;
};

/**
 * Save status badge (for toolbars)
 */
export const SaveStatusBadge: React.FC<SaveStatusProps> = (props) => {
  const info = getStatusInfo(props.status, props.lastSaved, props.error);
  const Icon = info.icon;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${info.bgColor} ${info.color} ${props.className || ''}`}
      title={info.text}
    >
      <Icon size={12} className={info.spin ? 'animate-spin' : ''} />
      {props.showText !== false && <span>{info.text}</span>}
    </div>
  );
};
