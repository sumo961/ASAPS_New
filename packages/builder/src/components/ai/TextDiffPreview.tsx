/**
 * Text Diff Preview Component
 *
 * Displays a visual diff of text changes with highlights.
 */

import React from 'react';
import type { TextDiff, DiffSegment } from '../../types/helperCommand';

export interface TextDiffPreviewProps {
  /** The text diff to display */
  diff: TextDiff;

  /** Whether to show the full text or truncated */
  expanded?: boolean;

  /** Maximum characters to show when not expanded */
  maxLength?: number;
}

export const TextDiffPreview: React.FC<TextDiffPreviewProps> = ({
  diff,
  expanded = false,
  maxLength = 200,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(expanded);

  // Calculate display segments
  const getDisplaySegments = (): DiffSegment[] => {
    if (isExpanded) {
      return diff.segments;
    }

    // Truncate while preserving diff structure
    let totalLength = 0;
    const result: DiffSegment[] = [];

    for (const segment of diff.segments) {
      if (totalLength >= maxLength) {
        result.push({ text: '...', type: 'unchanged' });
        break;
      }

      const remainingLength = maxLength - totalLength;
      if (segment.text.length <= remainingLength) {
        result.push(segment);
        totalLength += segment.text.length;
      } else {
        result.push({
          text: segment.text.slice(0, remainingLength) + '...',
          type: segment.type,
        });
        totalLength = maxLength;
      }
    }

    return result;
  };

  const segments = getDisplaySegments();
  const needsExpansion = diff.original.length > maxLength || diff.modified.length > maxLength;

  return (
    <div className="mt-2">
      <div className="font-mono text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto">
        {segments.map((segment, i) => {
          let className = '';
          switch (segment.type) {
            case 'removed':
              className = 'bg-red-100 text-red-800 line-through';
              break;
            case 'added':
              className = 'bg-green-100 text-green-800';
              break;
            default:
              className = 'text-gray-700';
          }

          return (
            <span key={i} className={className}>
              {segment.text}
            </span>
          );
        })}
      </div>

      {needsExpansion && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-xs text-blue-600 hover:underline mt-1"
        >
          Show full text
        </button>
      )}

      {isExpanded && needsExpansion && (
        <button
          onClick={() => setIsExpanded(false)}
          className="text-xs text-blue-600 hover:underline mt-1"
        >
          Show less
        </button>
      )}
    </div>
  );
};

/**
 * Simple side-by-side diff display
 */
export const SideBySideDiff: React.FC<{ original: string; modified: string }> = ({
  original,
  modified,
}) => {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
      <div className="bg-red-50 border border-red-200 rounded p-2">
        <div className="text-red-600 font-medium mb-1">Before</div>
        <div className="font-mono text-red-800 whitespace-pre-wrap break-words">
          {original.length > 200 ? original.slice(0, 200) + '...' : original}
        </div>
      </div>
      <div className="bg-green-50 border border-green-200 rounded p-2">
        <div className="text-green-600 font-medium mb-1">After</div>
        <div className="font-mono text-green-800 whitespace-pre-wrap break-words">
          {modified.length > 200 ? modified.slice(0, 200) + '...' : modified}
        </div>
      </div>
    </div>
  );
};

export default TextDiffPreview;
