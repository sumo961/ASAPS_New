import React, { memo, useMemo } from 'react';
// Simplified container connection edge - just visual styling without complex path calculations
// For ReactFlow integration later, this will be properly integrated with node types

interface ContainerConnectionEdgeData {
  isPortalConnection?: boolean;
  sourceContainer?: string;
  targetContainer?: string;
}

interface ContainerConnectionEdgeProps {
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
  data?: ContainerConnectionEdgeData;
  selected?: boolean;
}

export const ContainerConnectionEdge = memo(({
  data,
  selected
}: ContainerConnectionEdgeProps) => {

  const containerInfo = data?.sourceContainer && data?.targetContainer
    ? `${data?.sourceContainer} → ${data?.targetContainer}`
    : 'Container Connection';

  if (data?.isPortalConnection) {
    return (
      <div className="flex items-center justify-center p-2">
        <div className="bg-green-500 text-white text-xs px-2 py-1 rounded font-medium">
          🔗 {containerInfo}
        </div>
      </div>
    );
  }

  return null; // Regular edges handled by ReactFlow
});

ContainerConnectionEdge.displayName = 'ContainerConnectionEdge';