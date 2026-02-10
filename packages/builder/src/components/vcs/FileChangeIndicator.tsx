/**
 * FileChangeIndicator - Visual indicator for VCS-modified beats/clusters
 *
 * Shows a colored dot overlay on beats in the canvas based on VCS status:
 * green=added, orange=modified, red=conflict, blue=locked (P4).
 */

import React from 'react';
import { useVCSStatus, type BeatVCSStatus } from '../../vcs/VCSStatusProvider';

const statusColors: Record<BeatVCSStatus, string> = {
  added: '#22c55e',     // green
  modified: '#f59e0b',  // amber/orange
  deleted: '#ef4444',   // red
  conflict: '#dc2626',  // dark red
  locked: '#3b82f6',    // blue
  unchanged: 'transparent',
};

const statusTitles: Record<BeatVCSStatus, string> = {
  added: 'New file (untracked/added)',
  modified: 'Modified since last commit',
  deleted: 'Deleted',
  conflict: 'Merge conflict',
  locked: 'Locked by another user',
  unchanged: '',
};

interface FileChangeIndicatorProps {
  /** Beat ID to check */
  beatId: string;
  /** Position relative to the parent element */
  position?: 'top-right' | 'top-left' | 'bottom-right';
  /** Size of the indicator dot */
  size?: number;
}

export const FileChangeIndicator: React.FC<FileChangeIndicatorProps> = ({
  beatId,
  position = 'top-right',
  size = 8,
}) => {
  const vcs = useVCSStatus();

  // Don't render if VCS not active
  if (!vcs || !vcs.initialized || vcs.type === 'none') {
    return null;
  }

  const status = vcs.getBeatStatus(beatId);
  if (status === 'unchanged') {
    return null;
  }

  const color = statusColors[status];
  const title = statusTitles[status];

  // For locked files, also show who locked it
  const lockedBy = vcs.getLockedBy(beatId);
  const fullTitle = lockedBy ? `${title} (${lockedBy})` : title;

  const positionStyles: Record<string, React.CSSProperties> = {
    'top-right': { top: -size / 2, right: -size / 2 },
    'top-left': { top: -size / 2, left: -size / 2 },
    'bottom-right': { bottom: -size / 2, right: -size / 2 },
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles[position],
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        border: status === 'conflict' ? '1.5px solid #fca5a5' : '1.5px solid #1e293b',
        zIndex: 10,
        pointerEvents: 'none',
      }}
      title={fullTitle}
    />
  );
};

/**
 * Inline VCS badge for use in lists or panels
 */
export const VCSBadge: React.FC<{ beatId: string }> = ({ beatId }) => {
  const vcs = useVCSStatus();

  if (!vcs || !vcs.initialized || vcs.type === 'none') {
    return null;
  }

  const status = vcs.getBeatStatus(beatId);
  if (status === 'unchanged') return null;

  const color = statusColors[status];
  const title = statusTitles[status];

  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: color,
        marginLeft: 4,
        verticalAlign: 'middle',
      }}
      title={title}
    />
  );
};
