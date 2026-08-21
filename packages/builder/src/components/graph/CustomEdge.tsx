import React from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge, useNodes } from 'reactflow';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  source,
  target,
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
  const nodes = useNodes();

  // Check if this edge needs to route around a cluster
  // This happens when:
  // 1. The source is a cluster (edge exits from cluster)
  // 2. The target is to the left of the source (returning edge)
  const sourceNode = nodes.find(n => n.id === source);
  const isSourceCluster = sourceNode?.type === 'cluster';
  const isReturningEdge = targetX < sourceX;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (isSourceCluster && isReturningEdge && sourceNode) {
    // Route around the cluster
    const clusterBounds = {
      x: sourceNode.position.x,
      y: sourceNode.position.y,
      width: sourceNode.width || 500,
      height: sourceNode.height || 300,
    };

    // Decide whether to go above or below the cluster
    // Go above if target is in upper half, below if in lower half
    const clusterCenterY = clusterBounds.y + clusterBounds.height / 2;
    const goAbove = targetY < clusterCenterY;

    // Calculate waypoints for routing around the cluster
    const padding = 40; // Distance from cluster edge
    const curveOffset = 60; // How far the curve extends

    if (goAbove) {
      // Route above the cluster
      const topY = clusterBounds.y - padding;

      // Create a path that goes: source -> right -> up -> above cluster -> down -> target
      edgePath = `
        M ${sourceX} ${sourceY}
        C ${sourceX + curveOffset} ${sourceY},
          ${sourceX + curveOffset} ${topY},
          ${sourceX} ${topY}
        L ${targetX} ${topY}
        C ${targetX - curveOffset} ${topY},
          ${targetX - curveOffset} ${targetY},
          ${targetX} ${targetY}
      `;

      labelX = (sourceX + targetX) / 2;
      labelY = topY - 10;
    } else {
      // Route below the cluster
      const bottomY = clusterBounds.y + clusterBounds.height + padding;

      // Create a path that goes: source -> right -> down -> below cluster -> up -> target
      edgePath = `
        M ${sourceX} ${sourceY}
        C ${sourceX + curveOffset} ${sourceY},
          ${sourceX + curveOffset} ${bottomY},
          ${sourceX} ${bottomY}
        L ${targetX} ${bottomY}
        C ${targetX - curveOffset} ${bottomY},
          ${targetX - curveOffset} ${targetY},
          ${targetX} ${targetY}
      `;

      labelX = (sourceX + targetX) / 2;
      labelY = bottomY + 10;
    }
  } else {
    // Standard bezier path for normal edges
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {(label || data?.guardSummary) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
              // Guard labels must clear the elevated dialog children (z 21)
              ...(data?.guardSummary ? { zIndex: 22 } : {}),
            }}
            className="nodrag nopan"
          >
            <div
              className={`bg-white px-2 py-1 rounded border shadow-sm ${data?.guardSummary ? 'border-violet-300' : 'border-gray-300'}`}
              title={data?.guardSummary ? `Shown only if: ${data.guardSummary}` : undefined}
            >
              {data?.guardSummary ? (
                // Guarded choice (B1a) — the condition reads on the edge it gates
                <div className="flex flex-col items-start">
                  {label ? <span className="text-xs text-gray-700">{label}</span> : null}
                  <span className="text-[10px] text-violet-700">◇ {data.guardSummary}</span>
                </div>
              ) : data?.condition ? (
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
