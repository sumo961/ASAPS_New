import React, { useRef, useEffect, useState } from 'react';
import type { AnimationPath, AnimationWaypoint, ControlPoint } from '@asaps/core';

/**
 * PathCanvas - Visual canvas for editing animation paths
 *
 * Features:
 * - Click to add waypoints
 * - Drag waypoints to reposition
 * - Drag control points for bezier curves
 * - Visual path preview with curves
 * - Display stage elements for reference
 */

/** Stage element to display in the animation canvas */
export interface StageElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  imageUrl?: string;
  isAnimationTarget?: boolean;
}

interface PathCanvasProps {
  /** Width of the canvas (should match stage width) */
  width: number;

  /** Height of the canvas (should match stage height) */
  height: number;

  /** Current animation path being edited */
  animation: AnimationPath;

  /** Background image URL for reference */
  backgroundUrl?: string;

  /** Callback when animation is modified */
  onAnimationChange: (animation: AnimationPath) => void;

  /** Currently selected waypoint index */
  selectedWaypointIndex: number | null;

  /** Callback when waypoint selection changes */
  onWaypointSelect: (index: number | null) => void;

  /** Stage elements to display for reference */
  stageElements?: StageElement[];

  /** ID of the element being animated (will be highlighted) */
  animationTargetId?: string;
}

type DragState = {
  type: 'waypoint' | 'control1' | 'control2';
  waypointIndex: number;
  startX: number;
  startY: number;
} | null;

export const PathCanvas: React.FC<PathCanvasProps> = ({
  width,
  height,
  animation,
  backgroundUrl,
  onAnimationChange,
  selectedWaypointIndex,
  onWaypointSelect,
  stageElements = [],
  animationTargetId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [hoveredWaypoint, setHoveredWaypoint] = useState<number | null>(null);

  // Draw the animation path on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background if provided
    if (backgroundUrl) {
      const img = new Image();
      img.src = backgroundUrl;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        drawStageElements();
        drawPath();
      };
    } else {
      // Gray background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, width, height);
      drawStageElements();
      drawPath();
    }

    // Draw stage elements for reference
    function drawStageElements() {
      if (!ctx || stageElements.length === 0) return;

      stageElements.forEach((element) => {
        const isTarget = element.id === animationTargetId;

        // Draw element bounding box
        ctx.strokeStyle = isTarget ? '#f97316' : '#94a3b8';
        ctx.lineWidth = isTarget ? 2 : 1;
        ctx.setLineDash(isTarget ? [] : [4, 4]);

        // Fill with semi-transparent background
        ctx.fillStyle = isTarget ? 'rgba(249, 115, 22, 0.15)' : 'rgba(148, 163, 184, 0.1)';
        ctx.fillRect(element.x, element.y, element.width, element.height);
        ctx.strokeRect(element.x, element.y, element.width, element.height);

        // Draw element label
        ctx.setLineDash([]);
        ctx.fillStyle = isTarget ? '#ea580c' : '#64748b';
        ctx.font = isTarget ? 'bold 11px Arial' : '10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const label = element.label || element.type;
        const labelPadding = 4;

        // Draw label background
        const textMetrics = ctx.measureText(label);
        const labelHeight = 14;
        ctx.fillStyle = isTarget ? 'rgba(249, 115, 22, 0.9)' : 'rgba(100, 116, 139, 0.8)';
        ctx.fillRect(
          element.x,
          element.y - labelHeight - labelPadding,
          textMetrics.width + labelPadding * 2,
          labelHeight + labelPadding
        );

        // Draw label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, element.x + labelPadding, element.y - labelHeight);

        // Draw element type icon (small indicator in corner)
        if (element.type === 'character' || element.type === 'prop') {
          ctx.fillStyle = isTarget ? '#f97316' : '#94a3b8';
          ctx.beginPath();
          ctx.arc(element.x + element.width - 8, element.y + 8, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(element.type === 'character' ? 'C' : 'P', element.x + element.width - 8, element.y + 8);
        }
      });
    }

    function drawPath() {
      if (!ctx || animation.waypoints.length === 0) return;

      const waypoints = animation.waypoints;

      // Draw path lines
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();

      for (let i = 0; i < waypoints.length; i++) {
        const waypoint = waypoints[i];

        if (i === 0) {
          ctx.moveTo(waypoint.x, waypoint.y);
        } else {
          const prevWaypoint = waypoints[i - 1];

          if (animation.type === 'bezier' && waypoint.controlPoint1 && prevWaypoint.controlPoint2) {
            // Draw bezier curve
            ctx.bezierCurveTo(
              prevWaypoint.controlPoint2.x,
              prevWaypoint.controlPoint2.y,
              waypoint.controlPoint1.x,
              waypoint.controlPoint1.y,
              waypoint.x,
              waypoint.y
            );
          } else {
            // Draw straight line
            ctx.lineTo(waypoint.x, waypoint.y);
          }
        }
      }

      ctx.stroke();

      // Draw control point handles for bezier curves
      if (animation.type === 'bezier') {
        waypoints.forEach((waypoint, index) => {
          const isSelected = index === selectedWaypointIndex;

          // Draw control point 1 handle line
          if (waypoint.controlPoint1) {
            ctx.strokeStyle = isSelected ? '#f97316' : '#6b7280';
            ctx.lineWidth = isSelected ? 2 : 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(waypoint.x, waypoint.y);
            ctx.lineTo(waypoint.controlPoint1.x, waypoint.controlPoint1.y);
            ctx.stroke();

            // Draw control point
            drawControlPoint(ctx, waypoint.controlPoint1, index, 'control1');
          }

          // Draw control point 2 handle line
          if (waypoint.controlPoint2) {
            ctx.strokeStyle = isSelected ? '#f97316' : '#6b7280';
            ctx.lineWidth = isSelected ? 2 : 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(waypoint.x, waypoint.y);
            ctx.lineTo(waypoint.controlPoint2.x, waypoint.controlPoint2.y);
            ctx.stroke();

            // Draw control point
            drawControlPoint(ctx, waypoint.controlPoint2, index, 'control2');
          }
        });
      }

      // Draw waypoints
      waypoints.forEach((waypoint, index) => {
        const isSelected = index === selectedWaypointIndex;
        const isHovered = index === hoveredWaypoint;

        ctx.beginPath();
        ctx.arc(waypoint.x, waypoint.y, isSelected ? 8 : 6, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? '#ef4444' : isHovered ? '#f59e0b' : '#3b82f6';
        ctx.fill();

        // White border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();

        // Draw waypoint number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), waypoint.x, waypoint.y);
      });
    }

    function drawControlPoint(
      ctx: CanvasRenderingContext2D,
      point: ControlPoint,
      waypointIndex: number,
      type: 'control1' | 'control2'
    ) {
      const isSelected = waypointIndex === selectedWaypointIndex;

      // Draw larger, more visible control points
      ctx.beginPath();
      ctx.arc(point.x, point.y, isSelected ? 7 : 6, 0, 2 * Math.PI);
      // Orange when selected, darker gray otherwise for better visibility
      ctx.fillStyle = isSelected ? '#f97316' : '#6b7280';
      ctx.fill();
      // White border for contrast
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();

      // Add inner highlight for better visibility
      ctx.beginPath();
      ctx.arc(point.x, point.y, isSelected ? 3 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#fdba74' : '#9ca3af';
      ctx.fill();
    }
  }, [animation, width, height, backgroundUrl, selectedWaypointIndex, hoveredWaypoint, stageElements, animationTargetId]);

  // Handle mouse down - start dragging or add waypoint
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on a waypoint
    for (let i = 0; i < animation.waypoints.length; i++) {
      const waypoint = animation.waypoints[i];
      const distance = Math.sqrt((x - waypoint.x) ** 2 + (y - waypoint.y) ** 2);

      if (distance < 10) {
        // Start dragging waypoint
        setDragState({ type: 'waypoint', waypointIndex: i, startX: x, startY: y });
        onWaypointSelect(i);
        return;
      }

      // Check control points for bezier
      if (animation.type === 'bezier') {
        if (waypoint.controlPoint1) {
          const cp1Distance = Math.sqrt(
            (x - waypoint.controlPoint1.x) ** 2 + (y - waypoint.controlPoint1.y) ** 2
          );
          if (cp1Distance < 8) {
            setDragState({ type: 'control1', waypointIndex: i, startX: x, startY: y });
            onWaypointSelect(i);
            return;
          }
        }

        if (waypoint.controlPoint2) {
          const cp2Distance = Math.sqrt(
            (x - waypoint.controlPoint2.x) ** 2 + (y - waypoint.controlPoint2.y) ** 2
          );
          if (cp2Distance < 8) {
            setDragState({ type: 'control2', waypointIndex: i, startX: x, startY: y });
            onWaypointSelect(i);
            return;
          }
        }
      }
    }

    // No waypoint clicked - add new waypoint
    if (e.shiftKey) {
      // Shift+click to add waypoint
      const newWaypoint: AnimationWaypoint = {
        x,
        y,
        duration: 1000, // Default 1 second
      };

      // Add control points for bezier
      if (animation.type === 'bezier') {
        newWaypoint.controlPoint1 = { x: x - 50, y };
        newWaypoint.controlPoint2 = { x: x + 50, y };
      }

      const newWaypoints = [...animation.waypoints, newWaypoint];
      onAnimationChange({ ...animation, waypoints: newWaypoints });
      onWaypointSelect(newWaypoints.length - 1);
    }
  };

  // Handle mouse move - drag waypoint or control point
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragState) {
      // Dragging something
      const newWaypoints = [...animation.waypoints];
      const waypoint = { ...newWaypoints[dragState.waypointIndex] };

      if (dragState.type === 'waypoint') {
        waypoint.x = x;
        waypoint.y = y;
      } else if (dragState.type === 'control1' && waypoint.controlPoint1) {
        waypoint.controlPoint1 = { x, y };
      } else if (dragState.type === 'control2' && waypoint.controlPoint2) {
        waypoint.controlPoint2 = { x, y };
      }

      newWaypoints[dragState.waypointIndex] = waypoint;
      onAnimationChange({ ...animation, waypoints: newWaypoints });
    } else {
      // Update hover state
      let foundHover = false;
      for (let i = 0; i < animation.waypoints.length; i++) {
        const waypoint = animation.waypoints[i];
        const distance = Math.sqrt((x - waypoint.x) ** 2 + (y - waypoint.y) ** 2);
        if (distance < 10) {
          setHoveredWaypoint(i);
          foundHover = true;
          break;
        }
      }
      if (!foundHover) {
        setHoveredWaypoint(null);
      }
    }
  };

  // Handle mouse up - stop dragging
  const handleMouseUp = () => {
    setDragState(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="border border-gray-300 cursor-crosshair"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
      <div className="absolute bottom-2 right-2 bg-white bg-opacity-90 px-2 py-1 rounded text-xs text-gray-600">
        Shift+Click to add waypoint | Drag to move
      </div>
    </div>
  );
};
