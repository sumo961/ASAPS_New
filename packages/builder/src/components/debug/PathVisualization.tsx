import React, { useState, useMemo } from 'react';
import { GitBranch, ChevronRight, Search, Filter, Eye, EyeOff, Zap, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Story, PathAnalyzer, SymbolicPathAnalyzer } from '@asaps/core';
import type { StoryPath, SymbolicPathResult, SymbolicPath } from '@asaps/core';

interface PathVisualizationProps {
  story: Story;
  onHighlightPath?: (beatIds: string[]) => void;
}

// Helper to extract beat IDs from a path
const getPathBeatIds = (path: StoryPath): string[] => path.nodes.map(n => n.beatId);

// Helper to check if path has a cycle
const pathHasCycle = (path: StoryPath): boolean => path.endType === 'cycle';

// Helper to get ending beat ID
const getPathEndingId = (path: StoryPath): string | undefined =>
  path.endType === 'endBeat' ? path.endBeatId : undefined;

// Helpers for symbolic paths
const getSymbolicPathBeatIds = (path: SymbolicPath): string[] => path.nodes.map(n => n.beatId);
const symbolicPathHasCycle = (path: SymbolicPath): boolean => path.endType === 'cycle';
const getSymbolicPathEndingId = (path: SymbolicPath): string | undefined =>
  path.endType === 'endBeat' ? path.endBeatId : undefined;

export const PathVisualization: React.FC<PathVisualizationProps> = ({
  story,
  onHighlightPath
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPath, setSelectedPath] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'endings' | 'longest' | 'shortest'>('all');
  const [showCycles, setShowCycles] = useState(true);
  const [analysisMode, setAnalysisMode] = useState<'basic' | 'symbolic'>('basic');

  // Symbolic mode specific state
  const [symbolicSearchTerm, setSymbolicSearchTerm] = useState('');
  const [selectedSymbolicPath, setSelectedSymbolicPath] = useState<number | null>(null);
  const [symbolicFilterMode, setSymbolicFilterMode] = useState<'all' | 'endings' | 'longest' | 'shortest'>('all');
  const [showSymbolicCycles, setShowSymbolicCycles] = useState(true);

  // Run basic path analysis
  const basicResult = useMemo(() => {
    const analyzer = new PathAnalyzer(story, { maxPaths: 10000 });
    return analyzer.analyze();
  }, [story]);

  const allPaths = basicResult.uniquePaths;

  // Run symbolic path analysis
  const symbolicResult = useMemo<SymbolicPathResult | null>(() => {
    if (analysisMode !== 'symbolic') return null;
    try {
      const analyzer = new SymbolicPathAnalyzer(story);
      return analyzer.analyze();
    } catch (error) {
      console.error('[PathVisualization] Symbolic analysis error:', error);
      return null;
    }
  }, [story, analysisMode]);

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
        getPathBeatIds(path).some((beatId: string) => {
          const name = getBeatName(beatId);
          return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 beatId.toLowerCase().includes(searchTerm.toLowerCase());
        })
      );
    }

    // Filter by mode
    switch (filterMode) {
      case 'endings':
        paths = paths.filter(p => getPathEndingId(p) !== undefined);
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
      paths = paths.filter(p => !pathHasCycle(p));
    }

    return paths;
  }, [allPaths, searchTerm, filterMode, showCycles]);

  const handlePathClick = (index: number, path: StoryPath) => {
    const isDeselecting = selectedPath === index;
    setSelectedPath(isDeselecting ? null : index);

    // Always call highlight callback - either with path beats or empty array to clear
    if (isDeselecting) {
      onHighlightPath?.([]);
    } else {
      onHighlightPath?.(getPathBeatIds(path));
    }
  };

  const getPathSummary = (path: StoryPath): string => {
    const parts: string[] = [];
    if (pathHasCycle(path)) parts.push('Contains cycle');
    const endingId = getPathEndingId(path);
    if (endingId) parts.push(`Ends at ${getBeatName(endingId)}`);
    else parts.push('No ending');
    return parts.join(' • ');
  };

  // Filter symbolic paths based on mode
  const filteredSymbolicPaths = useMemo(() => {
    if (!symbolicResult?.paths) return [];
    let paths = symbolicResult.paths;

    // Filter by search term
    if (symbolicSearchTerm) {
      paths = paths.filter(path =>
        getSymbolicPathBeatIds(path).some((beatId: string) => {
          const name = getBeatName(beatId);
          return name.toLowerCase().includes(symbolicSearchTerm.toLowerCase()) ||
                 beatId.toLowerCase().includes(symbolicSearchTerm.toLowerCase());
        })
      );
    }

    // Filter by mode
    switch (symbolicFilterMode) {
      case 'endings':
        paths = paths.filter(p => getSymbolicPathEndingId(p) !== undefined);
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
    if (!showSymbolicCycles) {
      paths = paths.filter(p => !symbolicPathHasCycle(p));
    }

    return paths;
  }, [symbolicResult, symbolicSearchTerm, symbolicFilterMode, showSymbolicCycles]);

  const handleSymbolicPathClick = (index: number, path: SymbolicPath) => {
    const isDeselecting = selectedSymbolicPath === index;
    setSelectedSymbolicPath(isDeselecting ? null : index);

    // Always call highlight callback - either with path beats or empty array to clear
    if (isDeselecting) {
      onHighlightPath?.([]);
    } else {
      onHighlightPath?.(getSymbolicPathBeatIds(path));
    }
  };

  const getSymbolicPathSummary = (path: SymbolicPath): string => {
    const parts: string[] = [];
    if (symbolicPathHasCycle(path)) parts.push('Contains cycle');
    const endingId = getSymbolicPathEndingId(path);
    if (endingId) parts.push(`Ends at ${getBeatName(endingId)}`);
    else if (path.endType === 'deadEnd') parts.push('Dead end');
    else if (path.endType === 'depthLimit') parts.push('Depth limit');
    else parts.push('No ending');
    return parts.join(' • ');
  };

  const stats = useMemo(() => {
    // Limit processing to avoid stack overflow with huge path counts
    const MAX_PATHS_TO_ANALYZE = 10000;
    const pathsToAnalyze = allPaths.length > MAX_PATHS_TO_ANALYZE
      ? allPaths.slice(0, MAX_PATHS_TO_ANALYZE)
      : allPaths;
    const isTruncated = allPaths.length > MAX_PATHS_TO_ANALYZE;

    const withCycles = pathsToAnalyze.filter(p => pathHasCycle(p)).length;
    const withEndings = pathsToAnalyze.filter(p => getPathEndingId(p) !== undefined).length;
    const avgLength = pathsToAnalyze.length > 0
      ? (pathsToAnalyze.reduce((sum, p) => sum + p.length, 0) / pathsToAnalyze.length).toFixed(1)
      : 0;
    // Use reduce instead of Math.max(...) to avoid stack overflow
    const maxLength = pathsToAnalyze.length > 0
      ? pathsToAnalyze.reduce((max, p) => Math.max(max, p.length), 0)
      : 0;

    return { withCycles, withEndings, avgLength, maxLength, isTruncated, analyzedCount: pathsToAnalyze.length };
  }, [allPaths]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Path Analysis
          </h3>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setAnalysisMode('basic')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                analysisMode === 'basic'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Basic
            </button>
            <button
              onClick={() => setAnalysisMode('symbolic')}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                analysisMode === 'symbolic'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Zap className="w-3 h-3" />
              Symbolic
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {analysisMode === 'basic'
            ? 'All possible paths through the story'
            : 'Constraint-based analysis (prunes infeasible paths)'}
        </p>
      </div>

      {/* Warning for large path counts (basic mode only) */}
      {analysisMode === 'basic' && stats.isTruncated && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Story has {allPaths.length.toLocaleString()} paths.
            Statistics are based on a sample of {stats.analyzedCount.toLocaleString()} paths.
          </p>
        </div>
      )}

      {/* Symbolic Analysis Results */}
      {analysisMode === 'symbolic' && (
        <div className="px-4 py-3 border-b border-gray-100">
          {symbolicResult ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-purple-50 p-2 rounded">
                  <div className="text-xs text-purple-700">Feasible Paths</div>
                  <div className="text-xl font-bold text-purple-700">
                    {symbolicResult.feasiblePaths.toLocaleString()}
                  </div>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <div className="text-xs text-green-700">Reachable Beats</div>
                  <div className="text-xl font-bold text-green-700">
                    {symbolicResult.reachableBeats.length}
                  </div>
                </div>
                <div className="bg-red-50 p-2 rounded">
                  <div className="text-xs text-red-700">Pruned Conflicts</div>
                  <div className="text-xl font-bold text-red-700">
                    {symbolicResult.constraintConflicts.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {symbolicResult.analysisTime}ms
                </span>
                <span>
                  {symbolicResult.uniqueEndings.length} unique ending{symbolicResult.uniqueEndings.length !== 1 ? 's' : ''}
                </span>
                <span>
                  {symbolicResult.statesCached.toLocaleString()} states cached
                </span>
              </div>
              {symbolicResult.unreachableBeats.length > 0 && (
                <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                  <div className="flex items-center gap-1 text-xs text-yellow-800 font-medium mb-1">
                    <AlertTriangle className="w-3 h-3" />
                    Unreachable Beats ({symbolicResult.unreachableBeats.length})
                  </div>
                  <div className="text-xs text-yellow-700 max-h-24 overflow-y-auto">
                    {symbolicResult.unreachableBeats.slice(0, 10).map(id => (
                      <span key={id} className="inline-block bg-yellow-100 px-1.5 py-0.5 rounded mr-1 mb-1">
                        {getBeatName(id)}
                      </span>
                    ))}
                    {symbolicResult.unreachableBeats.length > 10 && (
                      <span className="text-yellow-600">
                        +{symbolicResult.unreachableBeats.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              {symbolicResult.unreachableBeats.length === 0 && (
                <div className="mt-3 p-2 bg-green-50 rounded border border-green-200">
                  <div className="flex items-center gap-1 text-xs text-green-800">
                    <CheckCircle className="w-3 h-3" />
                    All beats are reachable
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <Zap className="w-8 h-8 mx-auto mb-2 animate-pulse" />
              <p className="text-sm">Running symbolic analysis...</p>
            </div>
          )}
        </div>
      )}

      {/* Symbolic Search and Filters */}
      {analysisMode === 'symbolic' && symbolicResult && symbolicResult.paths.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={symbolicSearchTerm}
              onChange={(e) => setSymbolicSearchTerm(e.target.value)}
              placeholder="Search paths..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                onClick={() => setSymbolicFilterMode(mode)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  symbolicFilterMode === mode
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setShowSymbolicCycles(!showSymbolicCycles)}
              className={`px-3 py-1 text-xs rounded-full flex items-center gap-1 transition-colors ${
                showSymbolicCycles
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {showSymbolicCycles ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Cycles
            </button>
          </div>
        </div>
      )}

      {/* Symbolic Path List */}
      {analysisMode === 'symbolic' && symbolicResult && (
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {filteredSymbolicPaths.length > 0 ? (
            filteredSymbolicPaths.map((path, index) => {
              const beatIds = getSymbolicPathBeatIds(path);
              const hasCycle = symbolicPathHasCycle(path);
              const endingId = getSymbolicPathEndingId(path);

              return (
                <div
                  key={path.id}
                  className={`transition-colors ${
                    selectedSymbolicPath === index ? 'bg-purple-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <button
                    onClick={() => handleSymbolicPathClick(index, path)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          Path {index + 1}
                        </span>
                        {hasCycle && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            Cycle
                          </span>
                        )}
                        {endingId && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Ends
                          </span>
                        )}
                        {path.constraints.length > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {path.constraints.length} constraint{path.constraints.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {path.length} beats • {getSymbolicPathSummary(path)}
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        selectedSymbolicPath === index ? 'rotate-90' : ''
                      }`}
                    />
                  </button>

                  {selectedSymbolicPath === index && (
                    <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
                      {/* Constraints summary */}
                      {path.constraints.length > 0 && (
                        <div className="py-2 border-b border-gray-200 mb-2">
                          <div className="text-xs text-gray-500 mb-1">Required conditions:</div>
                          <div className="flex flex-wrap gap-1">
                            {path.constraints.map((c, ci) => (
                              <span key={ci} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="py-2">
                        <div className="space-y-2">
                          {beatIds.map((beatId: string, beatIndex: number) => {
                            const isLast = beatIndex === beatIds.length - 1;
                            const isCyclePoint = hasCycle && isLast;

                            return (
                              <div key={beatIndex} className="flex items-start gap-2">
                                <div className="flex flex-col items-center">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                    beatIndex === 0
                                      ? 'bg-purple-500 text-white'
                                      : isCyclePoint
                                      ? 'bg-purple-500 text-white'
                                      : endingId === beatId
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
                                  {endingId === beatId && (
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
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-gray-500">
              <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {symbolicSearchTerm
                  ? 'No paths match your search'
                  : symbolicResult.paths.length === 0
                  ? 'No feasible paths found'
                  : 'No paths found with current filters'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Basic Statistics (basic mode only) */}
      {analysisMode === 'basic' && (
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-blue-50 p-2 rounded">
            <div className="text-xs text-blue-700">Total Paths</div>
            <div className="text-xl font-bold text-blue-700">{allPaths.length.toLocaleString()}</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="text-xs text-green-700">With Endings{stats.isTruncated ? '*' : ''}</div>
            <div className="text-xl font-bold text-green-700">{stats.withEndings.toLocaleString()}</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="text-xs text-purple-700">Avg Length{stats.isTruncated ? '*' : ''}</div>
            <div className="text-xl font-bold text-purple-700">{stats.avgLength}</div>
          </div>
          <div className="bg-orange-50 p-2 rounded">
            <div className="text-xs text-orange-700">Max Length{stats.isTruncated ? '*' : ''}</div>
            <div className="text-xl font-bold text-orange-700">{stats.maxLength}</div>
          </div>
        </div>
      </div>
      )}

      {/* Search and Filters (basic mode only) */}
      {analysisMode === 'basic' && (
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
      )}

      {/* Path List (basic mode only) */}
      {analysisMode === 'basic' && (
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {filteredPaths.length > 0 ? (
          filteredPaths.map((path, index) => {
            const beatIds = getPathBeatIds(path);
            const hasCycle = pathHasCycle(path);
            const endingId = getPathEndingId(path);

            return (
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
                      {hasCycle && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          Cycle
                        </span>
                      )}
                      {endingId && (
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
                        {beatIds.map((beatId: string, beatIndex: number) => {
                          const isLast = beatIndex === beatIds.length - 1;
                          const isCyclePoint = hasCycle && isLast;

                          return (
                            <div key={beatIndex} className="flex items-start gap-2">
                              <div className="flex flex-col items-center">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                  beatIndex === 0
                                    ? 'bg-blue-500 text-white'
                                    : isCyclePoint
                                    ? 'bg-purple-500 text-white'
                                    : endingId === beatId
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
                                {endingId === beatId && (
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
            );
          })
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
      )}

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          {analysisMode === 'basic' ? (
            <>
              Showing {filteredPaths.length} of {allPaths.length} path{allPaths.length !== 1 ? 's' : ''}
              {stats.withCycles > 0 && ` • ${stats.withCycles} with cycles`}
              {basicResult.truncated && ' (truncated)'}
            </>
          ) : symbolicResult ? (
            <>
              Showing {filteredSymbolicPaths.length} of {symbolicResult.paths.length} sample path{symbolicResult.paths.length !== 1 ? 's' : ''}
              {symbolicResult.paths.length < symbolicResult.feasiblePaths && (
                <span className="text-purple-600"> (of {symbolicResult.feasiblePaths.toLocaleString()} total)</span>
              )}
              {' '}• {symbolicResult.reachableBeats.length} reachable beats
            </>
          ) : (
            'Analyzing...'
          )}
        </div>
      </div>
    </div>
  );
};
