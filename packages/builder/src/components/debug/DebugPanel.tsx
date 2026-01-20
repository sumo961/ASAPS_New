import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Bug, GitBranch, AlertCircle, GripHorizontal, FileText } from 'lucide-react';
import type { Story } from '@asaps/core';
import { ReachabilityReport } from './ReachabilityReport';
import { PathVisualization } from './PathVisualization';
import { LogicValidationReport } from './LogicValidationReport';

interface DebugPanelProps {
  story: Story;
  onClose: () => void;
  onHighlightBeat?: (beatId: string) => void;
  onHighlightPath?: (beatIds: string[]) => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  story,
  onClose,
  onHighlightBeat,
  onHighlightPath
}) => {
  const [activeTab, setActiveTab] = useState<'reachability' | 'paths' | 'logic'>('reachability');

  // Draggable state
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Resizable state
  const [size, setSize] = useState({ width: 650, height: Math.min(window.innerHeight * 0.8, 800) });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Handle mouse down on header to start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only allow dragging from the header area (not buttons)
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.preventDefault();
  }, [position]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      // Constrain to viewport
      const panel = panelRef.current;
      if (panel) {
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      } else {
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    };
  }, [size]);

  // Handle mouse move during resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.current.x;
      const deltaY = e.clientY - resizeStart.current.y;
      const newWidth = Math.max(400, Math.min(window.innerWidth - position.x - 20, resizeStart.current.width + deltaX));
      const newHeight = Math.max(300, Math.min(window.innerHeight - position.y - 20, resizeStart.current.height + deltaY));
      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, position]);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-white rounded-lg shadow-2xl flex flex-col border border-gray-300"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height
      }}
    >
      {/* Draggable Header */}
      <div
        className={`flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-gray-400" />
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Debug Tools
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('reachability')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'reachability'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          Reachability Analysis
        </button>
        <button
          onClick={() => setActiveTab('paths')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'paths'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Path Analysis
        </button>
        <button
          onClick={() => setActiveTab('logic')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'logic'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          Story Logic
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'reachability' && (
          <ReachabilityReport
            story={story}
            onHighlightBeat={onHighlightBeat}
          />
        )}
        {activeTab === 'paths' && (
          <PathVisualization
            story={story}
            onHighlightPath={onHighlightPath}
          />
        )}
        {activeTab === 'logic' && (
          <LogicValidationReport
            story={story}
            onHighlightBeat={onHighlightBeat}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4 bg-gray-50 rounded-b-lg">
        <div className="text-xs text-gray-600">
          <p>
            <strong>Tip:</strong> Drag the header to move this panel. Click on any beat or path to highlight it in the graph.
          </p>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, #6366f1 50%)',
          borderBottomRightRadius: '0.5rem',
        }}
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      />
    </div>
  );
};
