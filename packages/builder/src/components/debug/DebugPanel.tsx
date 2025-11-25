import React, { useState } from 'react';
import { X, Bug, GitBranch, AlertCircle } from 'lucide-react';
import type { Story } from '@asaps/core';
import { ReachabilityReport } from './ReachabilityReport';
import { PathVisualization } from './PathVisualization';

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
  const [activeTab, setActiveTab] = useState<'reachability' | 'paths'>('reachability');

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Debug Tools
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'reachability' ? (
            <ReachabilityReport
              story={story}
              onHighlightBeat={onHighlightBeat}
            />
          ) : (
            <PathVisualization
              story={story}
              onHighlightPath={onHighlightPath}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="text-xs text-gray-600">
            <p>
              <strong>Tip:</strong> Click on any beat or path to highlight it in the graph editor
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
