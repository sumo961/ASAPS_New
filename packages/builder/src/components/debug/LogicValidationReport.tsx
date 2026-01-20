import React, { useMemo, useState } from 'react';
import { AlertTriangle, Info, CheckCircle, FileText, Package, GitMerge, ChevronDown, ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import type { Story } from '@asaps/core';
import { validateStoryLogic, type LogicIssue, type LogicValidationResult } from '../../utils/storyLogicValidator';

interface LogicValidationReportProps {
  story: Story;
  onHighlightBeat?: (beatId: string) => void;
}

interface HubAnalysis {
  beatId: string;
  beatName: string;
  beatType: string;
  beatText: string;
  incomingPaths: {
    fromBeatId: string;
    fromBeatName: string;
    stateChanges: string[];
  }[];
}

/**
 * Extract text content from beat parameters
 */
function extractBeatText(params: any): string {
  if (params.text) return params.text;
  if (params.question) return params.question;
  if (params.message) return params.message;
  if (params.dialogTree?.text) return params.dialogTree.text;
  return '';
}

/**
 * Analyze what state changes happen on a path from source to target
 */
function analyzePathStateChanges(
  sourceBeatId: string,
  allBeatsMap: Map<string, any>,
  visited: Set<string> = new Set()
): string[] {
  const changes: string[] = [];
  const beat = allBeatsMap.get(sourceBeatId);
  if (!beat || visited.has(sourceBeatId)) return changes;

  visited.add(sourceBeatId);
  const params = beat.parameters || {};

  // Check for counter changes in setVariable beats
  if (beat.type === 'setVariable' && params.type === 'counter') {
    const op = params.operation === 'add' ? '+' : params.operation === 'set' ? '=' : params.operation;
    changes.push(`${params.name} ${op}${params.value}`);
  }

  // Check for inventory changes
  if (beat.type === 'addRemoveInventory') {
    if (params.action === 'add') {
      changes.push(`+📦 ${params.item}`);
    } else if (params.action === 'remove') {
      changes.push(`-📦 ${params.item}`);
    }
  }

  // Check for pickProp (auto-adds to inventory)
  if (beat.type === 'pickProp') {
    changes.push(`📦 (pick item)`);
  }

  // Check for counter effects on choices
  const choices = params.choices || params.props || [];
  for (const choice of choices) {
    if (choice.counter) {
      const op = choice.counterOperation === 'set' ? '=' : '+';
      changes.push(`${choice.counter} ${op}${choice.counterValue || 1} (via choice)`);
    }
  }

  // Check dialogTree choices
  if (params.dialogTree?.choices) {
    for (const choice of params.dialogTree.choices) {
      if (choice.counter) {
        const op = choice.counterOperation === 'set' ? '=' : '+';
        changes.push(`${choice.counter} ${op}${choice.counterValue || 1} (via dialog)`);
      }
    }
  }

  return changes;
}

/**
 * Build detailed hub analysis
 */
function buildHubAnalysis(
  hubBeatIds: string[],
  pathAnalysis: Map<string, string[]>,
  allBeats: any[]
): HubAnalysis[] {
  const beatsMap = new Map(allBeats.map(b => [b.id, { ...b, parameters: b.getParameters ? b.getParameters() : b.parameters }]));

  return hubBeatIds.map(hubId => {
    const beat = beatsMap.get(hubId);
    const incomingSources = pathAnalysis.get(hubId) || [];

    return {
      beatId: hubId,
      beatName: beat?.name || hubId,
      beatType: beat?.type || 'unknown',
      beatText: beat ? extractBeatText(beat.parameters) : '',
      incomingPaths: incomingSources.map(sourceId => {
        const sourceBeat = beatsMap.get(sourceId);
        return {
          fromBeatId: sourceId,
          fromBeatName: sourceBeat?.name || sourceId,
          stateChanges: analyzePathStateChanges(sourceId, beatsMap)
        };
      })
    };
  });
}

export const LogicValidationReport: React.FC<LogicValidationReportProps> = ({
  story,
  onHighlightBeat
}) => {
  const [expandedHubs, setExpandedHubs] = useState<Set<string>>(new Set());
  const allBeats = useMemo(() => story.getAllBeats(), [story]);

  const validation = useMemo(() => {
    const storyData = {
      beats: allBeats.map(beat => ({
        id: beat.id,
        name: beat.name,
        type: beat.type,
        parameters: beat.getParameters(),
        connections: beat.getConnections()  // Include connections for hub detection
      }))
    };
    return validateStoryLogic(storyData);
  }, [allBeats]);

  const hubAnalysis = useMemo(() => {
    return buildHubAnalysis(validation.hubBeats, validation.pathAnalysis, allBeats);
  }, [validation.hubBeats, validation.pathAnalysis, allBeats]);

  const warnings = validation.issues.filter(i => i.type === 'warning');
  const infos = validation.issues.filter(i => i.type === 'info');

  const toggleHub = (hubId: string) => {
    setExpandedHubs(prev => {
      const next = new Set(prev);
      if (next.has(hubId)) {
        next.delete(hubId);
      } else {
        next.add(hubId);
      }
      return next;
    });
  };

  const getCategoryIcon = (category: LogicIssue['category']) => {
    switch (category) {
      case 'hub_state_assumption':
        return <GitMerge className="w-4 h-4" />;
      case 'undescribed_item':
        return <Package className="w-4 h-4" />;
      case 'ungated_state_reference':
        return <FileText className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getCategoryLabel = (category: LogicIssue['category']) => {
    switch (category) {
      case 'hub_state_assumption':
        return 'Hub State Assumption';
      case 'undescribed_item':
        return 'Undescribed Item';
      case 'ungated_state_reference':
        return 'Ungated State Reference';
      case 'missing_condition_gate':
        return 'Missing Condition Gate';
      case 'narrative_inconsistency':
        return 'Narrative Inconsistency';
      default:
        return category;
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Notice */}
      <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm">
        <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
        <div>
          <strong className="text-purple-700">Pattern-based analysis</strong>
          <p className="text-purple-600 mt-1">
            This validation uses keyword pattern matching. For deeper semantic analysis of narrative consistency,
            AI-powered validation could better understand context and nuance. Configure an AI provider in Settings
            to enable enhanced story analysis features.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Story Logic Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-blue-500" />
            <span>Hub Beats: {validation.hubBeats.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span>Warnings: {warnings.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            <span>Info: {infos.length}</span>
          </div>
        </div>
      </div>

      {/* Detailed Hub Analysis */}
      {hubAnalysis.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-blue-500" />
            Hub Beat Analysis ({hubAnalysis.length})
          </h4>
          <p className="text-sm text-gray-600 mb-3">
            Hub beats can be reached from multiple paths. Review each to ensure text doesn't assume specific player state.
          </p>

          <div className="space-y-2">
            {hubAnalysis.map(hub => {
              const isExpanded = expandedHubs.has(hub.beatId);
              const hasWarning = warnings.some(w => w.beatId === hub.beatId && w.category === 'hub_state_assumption');

              return (
                <div
                  key={hub.beatId}
                  className={`border rounded-lg overflow-hidden ${hasWarning ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}
                >
                  {/* Hub Header */}
                  <button
                    onClick={() => toggleHub(hub.beatId)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="font-medium">{hub.beatName}</span>
                    <span className="text-xs text-gray-500">({hub.beatType})</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-auto">
                      {hub.incomingPaths.length} incoming paths
                    </span>
                    {hasWarning && (
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    )}
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t p-3 bg-white space-y-3">
                      {/* Show inline warning if this hub has a hub_state_assumption warning */}
                      {(() => {
                        const hubWarning = warnings.find(w => w.beatId === hub.beatId && w.category === 'hub_state_assumption');
                        if (hubWarning) {
                          return (
                            <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                <div className="text-sm">
                                  <div className="text-yellow-800 font-medium mb-1">Text assumes player state</div>
                                  <p className="text-yellow-700 mb-2">
                                    This beat can be reached from {hub.incomingPaths.length} paths without condition checks,
                                    but the text assumes the player has made progress.
                                  </p>
                                  {hubWarning.problematicText && (
                                    <p className="text-xs text-yellow-600 mb-2">
                                      <strong>Detected:</strong> {hubWarning.problematicText}
                                    </p>
                                  )}
                                  {hubWarning.suggestedFix && (
                                    <p className="text-xs text-yellow-600 bg-yellow-100 p-2 rounded">
                                      <strong>💡 Fix:</strong> {hubWarning.suggestedFix}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Hub Text */}
                      {hub.beatText && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Beat Text:</div>
                          <div className={`text-sm p-2 rounded italic ${hasWarning ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-100'}`}>
                            "{hub.beatText.length > 200 ? hub.beatText.substring(0, 200) + '...' : hub.beatText}"
                          </div>
                        </div>
                      )}

                      {/* Incoming Paths */}
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">Incoming Paths:</div>
                        <div className="space-y-2">
                          {hub.incomingPaths.map((path, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded"
                            >
                              <button
                                onClick={() => onHighlightBeat?.(path.fromBeatId)}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {path.fromBeatName}
                              </button>
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              <button
                                onClick={() => onHighlightBeat?.(hub.beatId)}
                                className="text-blue-600 hover:underline"
                              >
                                {hub.beatName}
                              </button>
                              {path.stateChanges.length > 0 && (
                                <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                  {path.stateChanges.join(', ')}
                                </span>
                              )}
                              {path.stateChanges.length === 0 && (
                                <span className="ml-auto text-xs text-gray-400">
                                  (no state changes)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Path analysis notes - only show if NO hub_state_assumption warning */}
                      {!hasWarning && (
                        <>
                          {hub.incomingPaths.some(p => p.stateChanges.length === 0) &&
                           hub.incomingPaths.some(p => p.stateChanges.length > 0) && (
                            <div className="text-xs text-yellow-700 bg-yellow-100 p-2 rounded border border-yellow-300">
                              <strong>⚠️ Note:</strong> Some paths modify state while others don't.
                              If this beat's text assumes the player has collected items or increased counters,
                              players arriving via paths without state changes may be confused.
                            </div>
                          )}
                          {hub.incomingPaths.every(p => p.stateChanges.length > 0) && (
                            <div className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                              ✓ All incoming paths modify state. No text pattern issues detected.
                            </div>
                          )}
                          {hub.incomingPaths.every(p => p.stateChanges.length === 0) && (
                            <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded">
                              ℹ️ No incoming paths modify state. Ensure beat text doesn't assume player has gathered anything.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Issues */}
      {validation.issues.length === 0 && validation.hubBeats.length === 0 && (
        <div className="flex items-center gap-3 p-4 bg-green-50 text-green-700 rounded-lg">
          <CheckCircle className="w-5 h-5" />
          <span>No narrative logic issues detected. Story structure looks good!</span>
        </div>
      )}

      {/* Other Warnings (hub_state_assumption shown inline above) */}
      {(() => {
        const otherWarnings = warnings.filter(w => w.category !== 'hub_state_assumption');
        if (otherWarnings.length === 0) return null;
        return (
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-4 h-4" />
              Other Warnings ({otherWarnings.length})
            </h4>
            <div className="space-y-3">
              {otherWarnings.map((issue, index) => (
                <div
                  key={`${issue.beatId}-${index}`}
                  className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-yellow-600 mt-0.5">
                      {getCategoryIcon(issue.category)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => onHighlightBeat?.(issue.beatId)}
                          className="font-medium text-yellow-800 hover:underline"
                        >
                          {issue.beatName || issue.beatId}
                        </button>
                        <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                          {getCategoryLabel(issue.category)}
                        </span>
                      </div>
                      <p className="text-sm text-yellow-700 mb-2">{issue.message}</p>
                      {issue.problematicText && (
                        <p className="text-xs text-yellow-600 mb-2">
                          <strong>Detected patterns:</strong> {issue.problematicText}
                        </p>
                      )}
                      {issue.suggestedFix && (
                        <p className="text-xs text-yellow-600 bg-yellow-100 p-2 rounded">
                          <strong>💡 Suggested fix:</strong> {issue.suggestedFix}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Info */}
      {infos.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2 text-blue-700">
            <Info className="w-4 h-4" />
            Info ({infos.length})
          </h4>
          <div className="space-y-2">
            {infos.map((issue, index) => (
              <div
                key={`${issue.beatId}-${index}`}
                className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm"
              >
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5" />
                  <div>
                    <button
                      onClick={() => onHighlightBeat?.(issue.beatId)}
                      className="font-medium text-blue-800 hover:underline"
                    >
                      {issue.beatName || issue.beatId}
                    </button>
                    <span className="text-blue-600">: {issue.message}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
        <strong>About Story Logic Validation:</strong>
        <ul className="mt-1 space-y-1 list-disc list-inside">
          <li><strong>Hub State Assumption:</strong> Hub beats (reachable from multiple paths) shouldn't assume player has gathered specific items/clues</li>
          <li><strong>Undescribed Item:</strong> Items picked up via pickProp should be described in the following beat (what does the letter say? what does the photo show?)</li>
          <li><strong>Ungated State Reference:</strong> Text referencing player state without a conditionBeat checking it first</li>
        </ul>
      </div>
    </div>
  );
};
