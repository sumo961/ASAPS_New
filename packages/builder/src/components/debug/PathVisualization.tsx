import React, { useState, useMemo } from 'react';
import { GitBranch, ChevronRight, Search, Clock, AlertTriangle, CheckCircle, Target, ArrowLeft, HelpCircle, TreePine } from 'lucide-react';
import {
  Story,
  ConstraintPathAnalyzer,
  BackwardAnalyzer,
  StateSimulationAnalyzer,
  PathQueryEngine,
  constraintSetToStrings,
  buildPathTree,
} from '@asaps/core';
import type {
  OutcomeGroup,
  PathStep,
  ConstraintPathResult,
  BackwardAnalysisResult,
  PathRequirement,
  DecisionPoint,
  PathTreeResult,
} from '@asaps/core';
import { PathTreeView } from './PathTreeView';

interface PathVisualizationProps {
  story: Story;
  onHighlightPath?: (beatIds: string[]) => void;
}

export const PathVisualization: React.FC<PathVisualizationProps> = ({
  story,
  onHighlightPath
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'forward' | 'backward' | 'tree'>('forward');
  const [selectedBackwardBeat, setSelectedBackwardBeat] = useState<string | null>(null);
  const [expandedBackwardPath, setExpandedBackwardPath] = useState<number | null>(null);

  // Use state-based simulation analyzer for more accurate path analysis.
  // Default maxPaths (50k) is needed for real AI stories with wide hub-and-spoke
  // structures — narrow condition-gated endings sit deep in the BFS queue and a
  // small budget exhausts before they are dequeued.
  const simulationAnalyzer = useMemo(() => {
    return new StateSimulationAnalyzer(story, {
      maxDepth: 300,
    });
  }, [story]);

  // Run state-based path analysis (forward)
  const analysisResult = useMemo<ConstraintPathResult | null>(() => {
    try {
      return simulationAnalyzer.analyze();
    } catch (error) {
      console.error('[PathVisualization] Simulation analysis error:', error);
      return null;
    }
  }, [simulationAnalyzer]);

  // Build collapsed path tree (shares the same analyzer, runs exploration once)
  const pathTreeResult = useMemo<PathTreeResult | null>(() => {
    try {
      const rawPaths = simulationAnalyzer.analyzeRaw();
      return buildPathTree(rawPaths, story);
    } catch (error) {
      console.error('[PathVisualization] Path tree build error:', error);
      return null;
    }
  }, [simulationAnalyzer, story]);

  // Get endings for backward analysis
  const endings = useMemo(() => {
    return simulationAnalyzer.getEndings();
  }, [simulationAnalyzer]);

  // Run backward analysis when a beat is selected
  const backwardResult = useMemo<BackwardAnalysisResult | null>(() => {
    if (!selectedBackwardBeat) return null;
    try {
      return simulationAnalyzer.analyzeBackward(selectedBackwardBeat);
    } catch (error) {
      console.error('[PathVisualization] Backward analysis error:', error);
      return null;
    }
  }, [simulationAnalyzer, selectedBackwardBeat]);

  // Query engine for filtering outcomes
  const queryEngine = useMemo(() => {
    if (!analysisResult) return null;
    return new PathQueryEngine(analysisResult);
  }, [analysisResult]);

  // Filter outcomes by query
  const filteredOutcomes = useMemo(() => {
    if (!analysisResult) return [];
    if (!queryInput.trim() || !queryEngine) return analysisResult.outcomes;

    const parsed = queryEngine.parseQuery(queryInput);
    if (!parsed) return analysisResult.outcomes;

    const result = queryEngine.query(parsed);
    return result.matchingOutcomes;
  }, [analysisResult, queryInput, queryEngine]);

  // Get suggested queries
  const suggestedQueries = useMemo(() => {
    if (!queryEngine) return [];
    return queryEngine.getSuggestedQueries().slice(0, 5);
  }, [queryEngine]);

  const getBeatName = (beatId: string): string => {
    const beat = story.getBeat(beatId);
    return beat ? beat.name : beatId;
  };

  // Forward: Handle outcome click - highlight ALL beats from ALL path variations
  const handleOutcomeClick = (index: number, outcome: OutcomeGroup) => {
    const isDeselecting = selectedOutcome === index;
    setSelectedOutcome(isDeselecting ? null : index);

    if (isDeselecting) {
      onHighlightPath?.([]);
    } else {
      // Collect all unique beat IDs from all path variations
      const allBeatIds = new Set<string>();

      // Add beats from representative path
      for (const step of outcome.representativePath) {
        allBeatIds.add(step.beatId);
      }

      // Add beats from all path variations (if available)
      if (outcome.pathVariations) {
        for (const variation of outcome.pathVariations) {
          if (variation.pathBeatIds) {
            for (const beatId of variation.pathBeatIds) {
              allBeatIds.add(beatId);
            }
          }
        }
      }

      onHighlightPath?.(Array.from(allBeatIds));
    }
  };

  // Backward: Handle path click - highlight ALL beats on the path
  const handleBackwardPathClick = (index: number, req: PathRequirement) => {
    const isDeselecting = expandedBackwardPath === index;
    setExpandedBackwardPath(isDeselecting ? null : index);

    if (isDeselecting) {
      onHighlightPath?.([]);
    } else {
      // Highlight ALL beats on the path (pathBeats includes all beats, not just decision points)
      const beatIds = req.pathBeats?.map(pb => pb.beatId) || req.decisionPoints.map(dp => dp.beatId);
      // Ensure target beat is included
      if (selectedBackwardBeat && !beatIds.includes(selectedBackwardBeat)) {
        beatIds.push(selectedBackwardBeat);
      }
      onHighlightPath?.(beatIds);
    }
  };

  // Filter constraint strings to only show meaningful ones (not visited beats)
  const getFilteredConstraints = (constraintStrings: string[]): string[] => {
    return constraintStrings.filter(c => !c.startsWith('visited beat') && !c.startsWith('not visited beat'));
  };

  // Extract key decisions from a path (beats where choices/conditions were made)
  const extractKeyDecisions = (path: PathStep[]): DecisionPoint[] => {
    const decisions: DecisionPoint[] = [];
    for (const step of path) {
      if (step.decisionMade || step.conditionResult !== undefined) {
        decisions.push({
          beatId: step.beatId,
          beatName: step.beatName,
          beatType: step.beatType,
          requiredChoice: step.decisionMade,
          requiredCondition: step.conditionResult !== undefined
            ? (step.conditionResult ? 'TRUE' : 'FALSE')
            : undefined,
        });
      }
    }
    return decisions;
  };

  const getEndTypeBadge = (endType: string) => {
    switch (endType) {
      case 'ending':
        return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ending</span>;
      case 'deadEnd':
        return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Dead End</span>;
      case 'cycle':
        return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Cycle</span>;
      case 'depthLimit':
        return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Depth Limit</span>;
      default:
        return null;
    }
  };

  // Render key decisions (used in both forward and backward)
  const renderKeyDecisions = (decisionPoints: DecisionPoint[]) => {
    if (decisionPoints.length === 0) return null;
    return (
      <div className="py-2">
        <div className="text-xs text-gray-500 mb-2">Key decisions:</div>
        <div className="space-y-1">
          {decisionPoints.map((dp, dpIndex) => (
            <div key={dpIndex} className="flex items-start gap-2 text-xs">
              <span className="font-medium text-gray-700 min-w-0 flex-shrink-0">
                {dp.beatName}
              </span>
              {dp.requiredChoice && (
                <span className="text-blue-600 break-words">
                  → Choose "{dp.requiredChoice}"
                </span>
              )}
              {dp.requiredCondition && (
                <span className="text-purple-600">
                  → {dp.requiredCondition} branch
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render path visualization (used in both forward and backward)
  const renderPathVisualization = (
    path: Array<{ beatId: string; beatName: string; decisionMade?: string; conditionResult?: boolean }>,
    endType?: string
  ) => {
    return (
      <div className="py-2">
        <div className="text-xs text-gray-500 mb-2">Path ({path.length} beats):</div>
        <div className="space-y-2">
          {path.map((step, stepIndex) => {
            const isLast = stepIndex === path.length - 1;

            return (
              <div key={stepIndex} className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    stepIndex === 0
                      ? 'bg-blue-500 text-white'
                      : isLast && endType === 'ending'
                      ? 'bg-green-500 text-white'
                      : isLast && endType === 'cycle'
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-300 text-gray-700'
                  }`}>
                    {stepIndex + 1}
                  </div>
                  {!isLast && (
                    <div className="w-0.5 h-6 bg-gray-300" />
                  )}
                </div>
                <div className="flex-1 pt-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {step.beatName}
                  </div>
                  <div className="text-xs text-gray-500">{step.beatId}</div>
                  {step.decisionMade && (
                    <div className="text-xs text-blue-600 mt-0.5">
                      → "{step.decisionMade}"
                    </div>
                  )}
                  {step.conditionResult !== undefined && (
                    <div className={`text-xs mt-0.5 ${step.conditionResult ? 'text-green-600' : 'text-red-600'}`}>
                      → {step.conditionResult ? 'TRUE' : 'FALSE'} branch
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Path Analysis
          </h3>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('forward')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                viewMode === 'forward'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Forward
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                viewMode === 'tree'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TreePine className="w-3 h-3" />
              Tree
            </button>
            <button
              onClick={() => setViewMode('backward')}
              className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                viewMode === 'backward'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ArrowLeft className="w-3 h-3" />
              Backward
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {viewMode === 'forward'
            ? 'All possible outcomes from story start'
            : viewMode === 'tree'
            ? 'Story structure as a collapsed decision tree'
            : 'All paths to reach a specific ending'}
        </p>
      </div>

      {/* Forward Analysis View */}
      {viewMode === 'forward' && (
        <>
          {/* Analysis Stats */}
          {analysisResult && (
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="bg-blue-50 p-2 rounded">
                  <div className="text-xs text-blue-700">Outcomes</div>
                  <div className="text-xl font-bold text-blue-700">
                    {analysisResult.outcomes.length}
                  </div>
                </div>
                <div className="bg-indigo-50 p-2 rounded">
                  <div className="text-xs text-indigo-700">Total Paths</div>
                  <div className="text-xl font-bold text-indigo-700">
                    {analysisResult.totalConstraintSets}
                  </div>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <div className="text-xs text-green-700">Unique Endings</div>
                  <div className="text-xl font-bold text-green-700">
                    {analysisResult.uniqueEndings.length}
                  </div>
                </div>
                <div className="bg-purple-50 p-2 rounded">
                  <div className="text-xs text-purple-700">Reachable Beats</div>
                  <div className="text-xl font-bold text-purple-700">
                    {analysisResult.reachableBeats.length}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {analysisResult.analysisTime.toFixed(0)}ms
                </span>
                {analysisResult.unreachableBeats.length > 0 && (
                  <span className="flex items-center gap-1 text-yellow-700">
                    <AlertTriangle className="w-3 h-3" />
                    {analysisResult.unreachableBeats.length} unreachable beats
                  </span>
                )}
                {analysisResult.unreachableBeats.length === 0 && (
                  <span className="flex items-center gap-1 text-green-700">
                    <CheckCircle className="w-3 h-3" />
                    All beats reachable
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Query Input */}
          <div className="px-4 py-3 border-b border-gray-100 space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Query: adult > 7, has axe, visits beat-123..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {suggestedQueries.length > 0 && !queryInput && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-gray-500">Try:</span>
                {suggestedQueries.map((q, i) => {
                  const label = q.type === 'hasConstraint' && q.constraint
                    ? `${q.constraint.variable} ${q.constraint.operator} ${q.constraint.value}`
                    : q.type === 'reachesEnding' && q.beatId
                    ? `ends ${getBeatName(q.beatId)}`
                    : '';
                  if (!label) return null;
                  return (
                    <button
                      key={i}
                      onClick={() => setQueryInput(label)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded transition-colors"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outcome List - expandable */}
          <div className="divide-y divide-gray-100 overflow-y-auto flex-1 min-h-0">
            {filteredOutcomes.length > 0 ? (
              filteredOutcomes.map((outcome, index) => {
                const allConstraintStrings = outcome.constraintSets.length > 0
                  ? constraintSetToStrings(outcome.constraintSets[0])
                  : [];
                const constraintStrings = getFilteredConstraints(allConstraintStrings);
                const keyDecisions = extractKeyDecisions(outcome.representativePath);

                return (
                  <div
                    key={index}
                    className={`transition-colors ${
                      selectedOutcome === index ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => handleOutcomeClick(index, outcome)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {outcome.endType === 'ending'
                              ? getBeatName(outcome.endingBeatId)
                              : `Outcome ${index + 1}`}
                          </span>
                          {getEndTypeBadge(outcome.endType)}
                          {outcome.constraintSets.length > 1 && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              {outcome.constraintSets.length} variations
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {outcome.representativePath.length} steps
                          {keyDecisions.length > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-2">
                              {keyDecisions.length} decisions
                            </span>
                          )}
                          {constraintStrings.length > 0 && (
                            <span className="text-blue-600 ml-2">
                              {constraintStrings.slice(0, 2).join(', ')}
                              {constraintStrings.length > 2 && '...'}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                          selectedOutcome === index ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {selectedOutcome === index && (
                      <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
                        {/* Required state (filtered constraints) */}
                        {constraintStrings.length > 0 && (
                          <div className="py-2 border-b border-gray-200 mb-2">
                            <div className="text-xs text-gray-500 mb-1">Required state:</div>
                            <div className="flex flex-wrap gap-1">
                              {constraintStrings.map((c, ci) => (
                                <span key={ci} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Show path variations if multiple paths lead to this ending */}
                        {outcome.pathVariations && outcome.pathVariations.length > 1 && (
                          <div className="py-2 border-b border-gray-200 mb-2">
                            <div className="text-xs text-gray-500 mb-2">
                              Path variations ({outcome.pathVariations.length} different orderings):
                            </div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {outcome.pathVariations.slice(0, 10).map((variation, vIndex) => (
                                <div key={vIndex} className="flex items-start gap-2">
                                  <span className="text-xs text-gray-400 flex-shrink-0 w-4">
                                    {vIndex + 1}.
                                  </span>
                                  <div className="text-xs text-gray-600 break-words">
                                    {variation.summary || 'Direct path'}
                                  </div>
                                </div>
                              ))}
                              {outcome.pathVariations.length > 10 && (
                                <div className="text-xs text-gray-400 pl-6">
                                  +{outcome.pathVariations.length - 10} more variations...
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Key decisions (like backward analysis) */}
                        {renderKeyDecisions(keyDecisions)}
                      </div>
                    )}
                  </div>
                );
              })
            ) : analysisResult ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {queryInput
                    ? 'No outcomes match your query'
                    : 'No outcomes found'}
                </p>
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                <Clock className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                <p className="text-sm">Analyzing story paths...</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tree View */}
      {viewMode === 'tree' && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {pathTreeResult ? (
            <PathTreeView
              treeResult={pathTreeResult}
              onHighlightPath={onHighlightPath}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <div className="text-center">
                <TreePine className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">Building path tree...</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backward Analysis View */}
      {viewMode === 'backward' && (
        <>
          {/* Target Selection */}
          <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="text-sm text-gray-700 mb-2">Select target beat:</div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {endings.slice(0, 10).map((ending) => (
                  <button
                    key={ending.beatId}
                    onClick={() => {
                      setSelectedBackwardBeat(ending.beatId);
                      setExpandedBackwardPath(null);
                      onHighlightPath?.([]);
                    }}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      selectedBackwardBeat === ending.beatId
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {ending.beatName}
                  </button>
                ))}
                {endings.length > 10 && (
                  <span className="text-xs text-gray-500 px-2 py-1">
                    +{endings.length - 10} more
                  </span>
                )}
              </div>
              {endings.length === 0 && (
                <div className="text-xs text-gray-500">
                  No ending beats found.
                </div>
              )}
            </div>
          </div>

          {/* Backward Analysis Results */}
          {backwardResult && (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-gray-900">
                    Paths to "{backwardResult.targetBeatName}"
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 p-2 rounded">
                    <div className="text-xs text-blue-700">Total Paths</div>
                    <div className="text-xl font-bold text-blue-700">
                      {backwardResult.requirements.length}
                    </div>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <div className="text-xs text-green-700">Min Steps</div>
                    <div className="text-xl font-bold text-green-700">
                      {backwardResult.minimumSteps >= 0 ? backwardResult.minimumSteps : '-'}
                    </div>
                  </div>
                  <div className="bg-purple-50 p-2 rounded">
                    <div className="text-xs text-purple-700">Analysis Time</div>
                    <div className="text-xl font-bold text-purple-700">
                      {backwardResult.analysisTime.toFixed(0)}ms
                    </div>
                  </div>
                </div>
                {backwardResult.necessaryBeats.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">Must visit (all paths):</div>
                    <div className="flex flex-wrap gap-1">
                      {backwardResult.necessaryBeats.map((beatId) => (
                        <span key={beatId} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                          {getBeatName(beatId)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Requirement Sets - expandable */}
              <div className="divide-y divide-gray-100 overflow-y-auto flex-1 min-h-0">
                {backwardResult.requirements.length > 0 ? (
                  backwardResult.requirements.map((req: PathRequirement, index: number) => {
                    const constraintStrings = constraintSetToStrings(req.constraints);

                    return (
                      <div
                        key={index}
                        className={`transition-colors ${
                          expandedBackwardPath === index ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <button
                          onClick={() => handleBackwardPathClick(index, req)}
                          className="w-full px-4 py-3 flex items-center justify-between text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                Path {index + 1}
                              </span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {req.pathLength} steps
                              </span>
                              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                                {req.decisionPoints.length} decisions
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1 truncate">
                              {req.summary || 'No specific requirements'}
                            </div>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                              expandedBackwardPath === index ? 'rotate-90' : ''
                            }`}
                          />
                        </button>

                        {expandedBackwardPath === index && (
                          <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
                            {/* Constraints */}
                            {constraintStrings.length > 0 && (
                              <div className="py-2 border-b border-gray-200 mb-2">
                                <div className="text-xs text-gray-500 mb-1">Required state:</div>
                                <div className="flex flex-wrap gap-1">
                                  {constraintStrings.map((c, ci) => (
                                    <span key={ci} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Key decisions */}
                            {renderKeyDecisions(req.decisionPoints)}

                            {/* Path visualization from decision points */}
                            {req.decisionPoints.length > 0 && (
                              <div className="py-2 border-t border-gray-200 mt-2">
                                <div className="text-xs text-gray-500 mb-2">Decision path:</div>
                                <div className="space-y-2">
                                  {req.decisionPoints.map((dp, dpIndex) => {
                                    const isLast = dpIndex === req.decisionPoints.length - 1;
                                    return (
                                      <div key={dpIndex} className="flex items-start gap-2">
                                        <div className="flex flex-col items-center">
                                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                            dpIndex === 0
                                              ? 'bg-blue-500 text-white'
                                              : isLast
                                              ? 'bg-green-500 text-white'
                                              : 'bg-gray-300 text-gray-700'
                                          }`}>
                                            {dpIndex + 1}
                                          </div>
                                          {!isLast && (
                                            <div className="w-0.5 h-6 bg-gray-300" />
                                          )}
                                        </div>
                                        <div className="flex-1 pt-1 min-w-0">
                                          <div className="text-sm font-medium text-gray-900 truncate">
                                            {dp.beatName}
                                          </div>
                                          <div className="text-xs text-gray-500">{dp.beatId}</div>
                                          {dp.requiredChoice && (
                                            <div className="text-xs text-blue-600 mt-0.5">
                                              → "{dp.requiredChoice}"
                                            </div>
                                          )}
                                          {dp.requiredCondition && (
                                            <div className={`text-xs mt-0.5 ${dp.requiredCondition === 'TRUE' ? 'text-green-600' : 'text-red-600'}`}>
                                              → {dp.requiredCondition} branch
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {/* Add target beat at end */}
                                  <div className="flex items-start gap-2">
                                    <div className="flex flex-col items-center">
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-green-500 text-white">
                                        ✓
                                      </div>
                                    </div>
                                    <div className="flex-1 pt-1 min-w-0">
                                      <div className="text-sm font-medium text-green-700 truncate">
                                        {backwardResult.targetBeatName}
                                      </div>
                                      <div className="text-xs text-gray-500">Target reached</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <HelpCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      No paths found to this beat.
                      It may be unreachable from the story start.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {!selectedBackwardBeat && (
            <div className="px-4 py-8 text-center text-gray-500 flex-1">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                Select a target beat above to analyze
                what conditions lead to reaching it.
              </p>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="text-xs text-gray-600">
          {viewMode === 'forward' && analysisResult && (
            <>
              Showing {filteredOutcomes.length} of {analysisResult.outcomes.length} outcomes
              ({analysisResult.totalConstraintSets} total paths)
              {queryInput && ` matching "${queryInput}"`}
            </>
          )}
          {viewMode === 'backward' && backwardResult && (
            <>
              {backwardResult.requirements.length} paths to "{backwardResult.targetBeatName}"
              {' '}• Click a path to highlight decision points
            </>
          )}
          {viewMode === 'backward' && !backwardResult && (
            <>Select an ending to analyze paths</>
          )}
        </div>
      </div>
    </div>
  );
};
