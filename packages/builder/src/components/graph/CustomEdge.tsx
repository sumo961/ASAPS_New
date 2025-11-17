import React from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  label,
  markerEnd,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div className="bg-white px-2 py-1 rounded border border-gray-300 shadow-sm">
              {data?.condition ? (
                <div className="flex items-center gap-1">
                  <span className="text-yellow-600">⚡</span>
                  <span className="font-mono text-xs">{label}</span>
                </div>
              ) : (
                <span className="text-xs text-gray-600">{label}</span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
