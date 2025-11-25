import React, { useState, useMemo } from 'react';
import { GitBranch, ChevronRight, Search, Filter, Eye, EyeOff } from 'lucide-react';
import { Story, PathAnalyzer } from '@asaps/core';
import type { StoryPath } from '@asaps/core';

interface PathVisualizationProps {
  story: Story;
  onHighlightPath?: (beatIds: string[]) => void;
}

export const PathVisualization: React.FC<PathVisualizationProps> = ({
  story,
  onHighlightPath
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPath, setSelectedPath] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'endings' | 'longest' | 'shortest'>('all');
  const [showCycles, setShowCycles] = useState(true);

  // Run path analysis
  const allPaths = useMemo<StoryPath[]>(() => {
    const analyzer = new PathAnalyzer(story);
    return analyzer.findAllPaths();
  }, [story]);

  const getBeatName = (beatId: string): string => {
    const beat = story.getBeat(beatId);
    return beat ? beat.name : beatId;
  };

  // Filter paths based on mode
  const filteredPaths = useMemo(() => {
    let paths = allPaths;

    // Filter by search term
    if (searchTerm) {
      paths = paths.filter(path =>
        path.beats.some(beatId => {
          const name = getBeatName(beatId);
          return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 beatId.toLowerCase().includes(searchTerm.toLowerCase());
        })
      );
    }

    // Filter by mode
    switch (filterMode) {
      case 'endings':
        paths = paths.filter(p => p.endsAt !== null);
        break;
      case 'longest':
        if (paths.length > 0) {
          const maxLength = Math.max(...paths.map(p => p.length));
          paths = paths.filter(p => p.length === maxLength);
        }
        break;
      case 'shortest':
        if (paths.length > 0) {
          const minLength = Math.min(...paths.map(p => p.length));
          paths = paths.filter(p => p.length === minLength);
        }
        break;
    }

    // Filter cycles
    if (!showCycles) {
      paths = paths.filter(p => !p.hasCycle);
    }

    return paths;
  }, [allPaths, searchTerm, filterMode, showCycles]);

  const handlePathClick = (index: number, path: StoryPath) => {
    setSelectedPath(selectedPath === index ? null : index);
    if (selectedPath !== index) {
      onHighlightPath?.(path.beats);
    }
  };

  const getPathSummary = (path: StoryPath): string => {
    const parts: string[] = [];
    if (path.hasCycle) parts.push('Contains cycle');
    if (path.endsAt) parts.push(`Ends at ${getBeatName(path.endsAt)}`);
    else parts.push('No ending');
    return parts.join(' • ');
  };

  const stats = useMemo(() => {
    const withCycles = allPaths.filter(p => p.hasCycle).length;
    const withEndings = allPaths.filter(p => p.endsAt !== null).length;
    const avgLength = allPaths.length > 0
      ? (allPaths.reduce((sum, p) => sum + p.length, 0) / allPaths.length).toFixed(1)
      : 0;
    const maxLength = allPaths.length > 0
      ? Math.max(...allPaths.map(p => p.length))
      : 0;

    return { withCycles, withEndings, avgLength, maxLength };
  }, [allPaths]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Path Analysis
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          All possible paths through the story
        </p>
      </div>

      {/* Statistics */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-blue-50 p-2 rounded">
            <div className="text-xs text-blue-700">Total Paths</div>
            <div className="text-xl font-bold text-blue-700">{allPaths.length}</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="text-xs text-green-700">With Endings</div>
            <div className="text-xl font-bold text-green-700">{stats.withEndings}</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="text-xs text-purple-700">Avg Length</div>
            <div className="text-xl font-bold text-purple-700">{stats.avgLength}</div>
          </div>
          <div className="bg-orange-50 p-2 rounded">
            <div className="text-xs text-orange-700">Max Length</div>
            <div className="text-xl font-bold text-orange-700">{stats.maxLength}</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search paths..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Filter:</span>
          </div>
          {(['all', 'endings', 'longest', 'shortest'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filterMode === mode
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
          <button
            onClick={() => setShowCycles(!showCycles)}
            className={`px-3 py-1 text-xs rounded-full flex items-center gap-1 transition-colors ${
              showCycles
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {showCycles ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Cycles
          </button>
        </div>
      </div>

      {/* Path List */}
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {filteredPaths.length > 0 ? (
          filteredPaths.map((path, index) => (
            <div
              key={index}
              className={`transition-colors ${
                selectedPath === index ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <button
                onClick={() => handlePathClick(index, path)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      Path {index + 1}
                    </span>
                    {path.hasCycle && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        Cycle
                      </span>
                    )}
                    {path.endsAt && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Ends
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {path.length} beats • {getPathSummary(path)}
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    selectedPath === index ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {selectedPath === index && (
                <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
                  <div className="py-2">
                    <div className="space-y-2">
                      {path.beats.map((beatId, beatIndex) => {
                        const isLast = beatIndex === path.beats.length - 1;
                        const isCyclePoint = path.hasCycle && isLast;

                        return (
                          <div key={beatIndex} className="flex items-start gap-2">
                            <div className="flex flex-col items-center">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                beatIndex === 0
                                  ? 'bg-blue-500 text-white'
                                  : isCyclePoint
                                  ? 'bg-purple-500 text-white'
                                  : path.endsAt === beatId
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-300 text-gray-700'
                              }`}>
                                {beatIndex + 1}
                              </div>
                              {!isLast && (
                                <div className="w-0.5 h-6 bg-gray-300" />
                              )}
                            </div>
                            <div className="flex-1 pt-1">
                              <div className="text-sm font-medium text-gray-900">
                                {getBeatName(beatId)}
                              </div>
                              <div className="text-xs text-gray-500">{beatId}</div>
                              {isCyclePoint && (
                                <div className="text-xs text-purple-700 mt-1">
                                  Cycles back to earlier beat
                                </div>
                              )}
                              {path.endsAt === beatId && (
                                <div className="text-xs text-green-700 mt-1">
                                  Story ending
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-gray-500">
            <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {searchTerm
                ? 'No paths match your search'
                : 'No paths found with current filters'}
            </p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          Showing {filteredPaths.length} of {allPaths.length} path{allPaths.length !== 1 ? 's' : ''}
          {stats.withCycles > 0 && ` • ${stats.withCycles} with cycles`}
        </div>
      </div>
    </div>
  );
};
