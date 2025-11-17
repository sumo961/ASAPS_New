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
 */

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
        drawPath();
      };
    } else {
      // Gray background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, width, height);
      drawPath();
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
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        waypoints.forEach((waypoint, index) => {
          // Draw control point 1 handle
          if (waypoint.controlPoint1) {
            ctx.beginPath();
            ctx.moveTo(waypoint.x, waypoint.y);
            ctx.lineTo(waypoint.controlPoint1.x, waypoint.controlPoint1.y);
            ctx.stroke();

            // Draw control point
            drawControlPoint(ctx, waypoint.controlPoint1, index, 'control1');
          }

          // Draw control point 2 handle
          if (waypoint.controlPoint2) {
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
      const isSelected =
        waypointIndex === selectedWaypointIndex;

      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#9ca3af' : '#d1d5db';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }, [animation, width, height, backgroundUrl, selectedWaypointIndex, hoveredWaypoint]);

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
