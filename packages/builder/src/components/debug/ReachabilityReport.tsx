import React, { useState, useMemo } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, Search, Unlink, GitBranch } from 'lucide-react';
import { Story, ReachabilityAnalyzer } from '@asaps/core';
import type { ReachabilityResult } from '@asaps/core';

interface ReachabilityReportProps {
  story: Story;
  onHighlightBeat?: (beatId: string) => void;
}

export const ReachabilityReport: React.FC<ReachabilityReportProps> = ({
  story,
  onHighlightBeat
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));
  const [searchTerm, setSearchTerm] = useState('');
  const [hideSinglePathWarnings, setHideSinglePathWarnings] = useState(false);

  // Run analysis
  const analysis = useMemo<ReachabilityResult>(() => {
    const analyzer = new ReachabilityAnalyzer(story);
    return analyzer.analyze();
  }, [story]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getBeatName = (beatId: string): string => {
    const beat = story.getBeat(beatId);
    return beat ? beat.name : beatId;
  };

  const filterBeats = (beatIds: string[]) => {
    if (!searchTerm) return beatIds;
    return beatIds.filter(id => {
      const name = getBeatName(id);
      return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             id.toLowerCase().includes(searchTerm.toLowerCase());
    });
  };

  const getWarningIcon = (type: string) => {
    switch (type) {
      case 'single-path':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'conditional-only':
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const reachableBeatsArray = Array.from(analysis.reachableBeats);
  const filteredReachable = filterBeats(reachableBeatsArray);
  const filteredUnreachable = filterBeats(analysis.unreachableBeats.map(b => b.beatId));
  const filteredOrphaned = filterBeats(analysis.orphanedBeats);

  // Filter warnings based on settings
  const filteredWarnings = useMemo(() => {
    return analysis.warnings.filter(w =>
      !hideSinglePathWarnings || w.type !== 'single-path'
    );
  }, [analysis.warnings, hideSinglePathWarnings]);
  const hiddenWarningCount = analysis.warnings.length - filteredWarnings.length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">Reachability Analysis</h3>
        <p className="text-sm text-gray-600 mt-1">
          Story flow analysis showing which beats can be reached during gameplay
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search beats..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => toggleSection('summary')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {expandedSections.has('summary') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <span className="font-medium">Summary</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              {analysis.analysis.reachableCount} reachable
            </span>
            <span className="text-red-600 flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              {analysis.analysis.unreachableCount} unreachable
            </span>
          </div>
        </button>

        {expandedSections.has('summary') && (
          <div className="px-4 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-600">Total Beats</div>
                <div className="text-2xl font-bold text-gray-900">
                  {analysis.analysis.totalBeats}
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-xs text-green-700">Reachable</div>
                <div className="text-2xl font-bold text-green-700">
                  {analysis.analysis.reachableCount}
                </div>
              </div>
              <div className="bg-red-50 p-3 rounded">
                <div className="text-xs text-red-700">Unreachable</div>
                <div className="text-2xl font-bold text-red-700">
                  {analysis.analysis.unreachableCount}
                </div>
              </div>
              <div className="bg-orange-50 p-3 rounded">
                <div className="text-xs text-orange-700">Orphaned</div>
                <div className="text-2xl font-bold text-orange-700">
                  {analysis.analysis.orphanedCount}
                </div>
              </div>
            </div>

            {/* Broken connections alert */}
            {analysis.brokenConnections && analysis.brokenConnections.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded p-3">
                <div className="flex items-center gap-2 text-sm text-purple-800">
                  <Unlink className="w-4 h-4" />
                  <span className="font-medium">{analysis.brokenConnections.length} broken connection(s) - pointing to non-existent beats</span>
                </div>
              </div>
            )}

            {/* Unreachable condition branches alert */}
            {analysis.conditionBeatWarnings && analysis.conditionBeatWarnings.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="flex items-center gap-2 text-sm text-red-800">
                  <GitBranch className="w-4 h-4" />
                  <span className="font-medium">{analysis.conditionBeatWarnings.length} unreachable condition branch(es) - counter thresholds cannot be satisfied</span>
                </div>
              </div>
            )}

            {filteredWarnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <div className="flex items-center gap-2 text-sm text-yellow-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">
                    {filteredWarnings.length} warning(s) detected
                    {hiddenWarningCount > 0 && ` (${hiddenWarningCount} hidden)`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reachable Beats */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => toggleSection('reachable')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {expandedSections.has('reachable') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="font-medium">Reachable Beats</span>
          </div>
          <span className="text-sm text-gray-600">
            {filteredReachable.length}/{reachableBeatsArray.length}
          </span>
        </button>

        {expandedSections.has('reachable') && (
          <div className="px-4 pb-3">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredReachable.length > 0 ? (
                filteredReachable.map((beatId: string) => (
                  <div
                    key={beatId}
                    onClick={() => onHighlightBeat?.(beatId)}
                    className="flex items-center justify-between p-2 rounded hover:bg-green-50 cursor-pointer group"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {getBeatName(beatId)}
                      </div>
                      <div className="text-xs text-gray-500">{beatId}</div>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 text-center py-4">
                  {searchTerm ? 'No matching reachable beats' : 'No reachable beats'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Broken Connections */}
      {analysis.brokenConnections && analysis.brokenConnections.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => toggleSection('broken')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('broken') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Unlink className="w-4 h-4 text-purple-600" />
              <span className="font-medium">Broken Connections</span>
            </div>
            <span className="text-sm text-gray-600">
              {analysis.brokenConnections.length}
            </span>
          </button>

          {expandedSections.has('broken') && (
            <div className="px-4 pb-3">
              <div className="bg-purple-50 border border-purple-200 rounded p-2 mb-3 text-xs text-purple-800">
                Connections pointing to beats that don't exist. The target beat ID may have been deleted or mistyped.
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analysis.brokenConnections.map((broken, index) => (
                  <div
                    key={`${broken.sourceBeatId}-${broken.targetId}-${index}`}
                    onClick={() => onHighlightBeat?.(broken.sourceBeatId)}
                    className="p-3 bg-purple-50 border border-purple-200 rounded cursor-pointer hover:border-purple-300"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          From: {broken.sourceBeatName}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {broken.sourceBeatId}
                        </div>
                        <div className="text-xs text-purple-700 mt-2">
                          → Missing target: <span className="font-mono">{broken.targetId}</span>
                          {broken.label && <span className="ml-2 text-gray-600">(label: {broken.label})</span>}
                        </div>
                      </div>
                      <Unlink className="w-4 h-4 text-purple-600 flex-shrink-0 ml-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unreachable Beats */}
      {analysis.unreachableBeats.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => toggleSection('unreachable')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('unreachable') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="font-medium">Unreachable Beats</span>
            </div>
            <span className="text-sm text-gray-600">
              {filteredUnreachable.length}/{analysis.unreachableBeats.length}
            </span>
          </button>

          {expandedSections.has('unreachable') && (
            <div className="px-4 pb-3">
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredUnreachable.length > 0 ? (
                  analysis.unreachableBeats
                    .filter(b => filteredUnreachable.includes(b.beatId))
                    .map(unreachable => (
                      <div
                        key={unreachable.beatId}
                        onClick={() => onHighlightBeat?.(unreachable.beatId)}
                        className="p-3 bg-red-50 border border-red-200 rounded cursor-pointer hover:border-red-300"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {getBeatName(unreachable.beatId)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {unreachable.beatId}
                            </div>
                            <div className="text-xs text-red-700 mt-2">
                              {unreachable.reason}
                            </div>
                          </div>
                          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 ml-2" />
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4">
                    No matching unreachable beats
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Orphaned Beats */}
      {analysis.orphanedBeats.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => toggleSection('orphaned')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('orphaned') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="font-medium">Orphaned Beats</span>
            </div>
            <span className="text-sm text-gray-600">
              {filteredOrphaned.length}/{analysis.orphanedBeats.length}
            </span>
          </button>

          {expandedSections.has('orphaned') && (
            <div className="px-4 pb-3">
              <div className="bg-orange-50 border border-orange-200 rounded p-2 mb-3 text-xs text-orange-800">
                Orphaned beats have no incoming connections but may still be reachable via defaultTarget
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredOrphaned.length > 0 ? (
                  analysis.orphanedBeats
                    .filter(beatId => filteredOrphaned.includes(beatId))
                    .map(beatId => (
                      <div
                        key={beatId}
                        onClick={() => onHighlightBeat?.(beatId)}
                        className="p-3 bg-orange-50 border border-orange-200 rounded cursor-pointer hover:border-orange-300"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {getBeatName(beatId)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {beatId}
                            </div>
                            <div className="text-xs text-orange-700 mt-2">
                              No incoming connections
                            </div>
                          </div>
                          <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 ml-2" />
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4">
                    No matching orphaned beats
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => toggleSection('warnings')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('warnings') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <span className="font-medium">Warnings</span>
            </div>
            <span className="text-sm text-gray-600">
              {filteredWarnings.length}
              {hiddenWarningCount > 0 && ` (+${hiddenWarningCount} hidden)`}
            </span>
          </button>

          {expandedSections.has('warnings') && (
            <div className="px-4 pb-3">
              {/* Toggle for single-path warnings */}
              <label className="flex items-center gap-2 mb-3 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideSinglePathWarnings}
                  onChange={(e) => setHideSinglePathWarnings(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Hide &quot;single incoming connection&quot; warnings</span>
              </label>

              <div className="space-y-2">
                {filteredWarnings.map((warning, index) => (
                  <div
                    key={index}
                    onClick={() => onHighlightBeat?.(warning.beatId)}
                    className={`p-3 border rounded cursor-pointer hover:shadow-sm ${getSeverityColor(warning.severity)}`}
                  >
                    <div className="flex items-start gap-2">
                      {getWarningIcon(warning.type)}
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {getBeatName(warning.beatId)}
                        </div>
                        <div className="text-xs mt-1">{warning.message}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Condition Beat Warnings - Unreachable Thresholds */}
      {analysis.conditionBeatWarnings && analysis.conditionBeatWarnings.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => toggleSection('conditionWarnings')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('conditionWarnings') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <GitBranch className="w-4 h-4 text-red-600" />
              <span className="font-medium">Unreachable Condition Branches</span>
            </div>
            <span className="text-sm text-red-600 font-medium">
              {analysis.conditionBeatWarnings.length}
            </span>
          </button>

          {expandedSections.has('conditionWarnings') && (
            <div className="px-4 pb-3">
              <div className="bg-red-50 border border-red-200 rounded p-2 mb-3 text-xs text-red-800">
                These condition beats have branches that can never be reached because the counter threshold is impossible to satisfy.
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analysis.conditionBeatWarnings.map((warning, index) => (
                  <div
                    key={`${warning.conditionBeatId}-${index}`}
                    onClick={() => onHighlightBeat?.(warning.conditionBeatId)}
                    className="p-3 bg-red-50 border border-red-200 rounded cursor-pointer hover:border-red-300"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {warning.conditionBeatName}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {warning.conditionBeatId}
                        </div>
                        <div className="text-xs text-red-700 mt-2">
                          <span className="font-medium">{warning.unreachableBranch === 'true' ? 'True' : 'False'} branch</span> to &quot;{warning.targetBeatId}&quot; is unreachable
                        </div>
                        {warning.analysis?.reason && (
                          <div className="text-xs text-red-600 mt-1">
                            {warning.analysis.reason}
                          </div>
                        )}
                        {warning.condition && (
                          <div className="text-xs text-gray-600 mt-1 font-mono bg-gray-100 px-2 py-1 rounded">
                            {warning.condition.left || warning.condition.variableName} {warning.condition.operator} {warning.condition.right ?? warning.condition.value}
                          </div>
                        )}
                      </div>
                      <GitBranch className="w-4 h-4 text-red-600 flex-shrink-0 ml-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
