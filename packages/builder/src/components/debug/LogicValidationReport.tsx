import React, { useMemo, useState } from 'react';
import { useAIFeatures } from '../../utils/aiFeatures';
import { Sparkles, AlertTriangle, CheckCircle, GitMerge, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import type { Story } from '@asaps/core';
import { arrivalKey, describeArrivalDifferences, type BeatArrival, type SimulationState } from '@asaps/core';
import { simulateStory } from '../../services/storySimulation';
import { storyLogicValidation } from './problems';
import { StoryLogicAISection } from './StoryLogicAISection';
import type { StoryLogicStore } from '../../types/storyLogic';
import type { AIFixSuggestion } from '../../types/generationReview';

interface LogicValidationReportProps {
  story: Story;
  onHighlightBeat?: (beatId: string) => void;
  onHighlightPath?: (beatIds: string[]) => void;
  storyLogic?: StoryLogicStore | null;
  onStoryLogicChange?: (store: StoryLogicStore) => void;
  onFixDecision?: (suggestion: AIFixSuggestion, decision: 'accepted' | 'rejected') => void;
  fixResult?: { findingId: string; ok: boolean; error?: string } | null;
}

interface HubAnalysis {
  beatId: string;
  beatName: string;
  beatType: string;
  beatText: string;
  /** Distinct states players arrive in (0 when the simulation never reached it). */
  arrivalCount: number;
  /** What differs between them, in words. */
  differences: string[];
  /** The beats that lead here. */
  waysIn: { fromBeatId: string; fromBeatName: string }[];
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

/** A summary figure that jumps to its section. */
const SummaryJump: React.FC<{ target: string; disabled?: boolean; children: React.ReactNode }> = ({ target, disabled, children }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    className="hover:underline disabled:no-underline disabled:cursor-default text-left"
  >
    {children}
  </button>
);

export const LogicValidationReport: React.FC<LogicValidationReportProps> = ({
  story,
  onHighlightBeat,
  onHighlightPath,
  storyLogic,
  onStoryLogicChange,
  onFixDecision,
  fixResult,
}) => {
  const aiOn = useAIFeatures();
  const [aiFindingCount, setAiFindingCount] = useState(0);
  const [expandedHubs, setExpandedHubs] = useState<Set<string>>(new Set());
  const allBeats = useMemo(() => story.getAllBeats(), [story]);

  // The states players arrive in at each beat — the same simulation Path
  // Analysis shows. Without it (a story the simulation can't play), the
  // checks fall back to the links.
  const simulation = useMemo(() => {
    try {
      return simulateStory(story);
    } catch (error) {
      console.error('[LogicValidationReport] Path simulation failed:', error);
      return null;
    }
  }, [story]);
  const arrivals = useMemo<Map<string, BeatArrival[]> | null>(() => simulation?.arrivals() ?? null, [simulation]);

  const validation = useMemo(() => storyLogicValidation(story, simulation), [story, simulation]);

  const hubAnalysis = useMemo<HubAnalysis[]>(() => {
    const names = new Map<string, string>(
      (((story as any).getCharacters?.() ?? []) as any[])
        .filter((c) => c?.id)
        .flatMap((c) => [[c.id, c.displayName || c.name || c.id], [c.name, c.displayName || c.name]] as [string, string][]),
    );
    const nameOf = (ref: string) => names.get(ref) ?? ref;
    const affectOf = simulation ? (st: SimulationState) => simulation.analyzer.affectAt(st) : undefined;
    const beatsMap = new Map(allBeats.map(b => [b.id, b]));
    return validation.hubBeats.map((hubId) => {
      const beat = beatsMap.get(hubId);
      const list = arrivals?.get(hubId) ?? [];
      return {
        beatId: hubId,
        beatName: beat?.name || hubId,
        beatType: beat?.type || 'unknown',
        beatText: beat ? extractBeatText(beat.getParameters()) : '',
        arrivalCount: new Set(list.map((a) => arrivalKey(a.state))).size,
        differences: describeArrivalDifferences(list, { affectOf, nameOf }),
        waysIn: (validation.pathAnalysis.get(hubId) || []).filter((fromBeatId) => fromBeatId !== hubId).map((fromBeatId) => ({
          fromBeatId,
          fromBeatName: beatsMap.get(fromBeatId)?.name || fromBeatId,
        })),
      };
    });
  }, [validation.hubBeats, validation.pathAnalysis, allBeats, arrivals, simulation, story]);

  const warnings = validation.issues.filter(i => i.type === 'warning');

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

  return (
    <div className="space-y-6">
      {/* Summary: each figure jumps to its section */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Story Logic Summary</h3>
        <div className={`grid ${aiOn ? 'grid-cols-2' : 'grid-cols-1'} gap-4 text-sm`}>
          <div className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-blue-500" />
            <SummaryJump target="story-logic-hubs" disabled={hubAnalysis.length === 0}>Different states: {validation.hubBeats.length}</SummaryJump>
          </div>
          {aiOn && (
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <SummaryJump target="story-logic-ai">AI findings: {aiFindingCount}</SummaryJump>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Hub Analysis */}
      {hubAnalysis.length > 0 && (
        <div id="story-logic-hubs">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-blue-500" />
            Beats reached in different states ({hubAnalysis.length})
          </h4>
          <p className="text-sm text-gray-600 mb-3">
            These beats are reached in different states: with or without an item, a variable set or not, someone's trust higher or lower. Check that each one's text holds for every way in.
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
                      {hub.arrivalCount > 0 ? `${hub.arrivalCount} states` : `${hub.waysIn.length} ways in`}
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
                                  <p className="text-yellow-700 mb-2">{hubWarning.message}</p>
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

                      {/* What differs between the states players arrive in */}
                      {hub.differences.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Players arrive:</div>
                          <ul className="text-sm space-y-0.5 list-disc list-inside text-gray-700">
                            {hub.differences.map((d) => <li key={d}>{d}</li>)}
                          </ul>
                        </div>
                      )}
                      {hub.arrivalCount === 0 && (
                        <p className="text-xs text-gray-500">Path Analysis never reaches this beat, so its ways in are listed by link.</p>
                      )}

                      {/* Ways in */}
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">Ways in:</div>
                        <div className="space-y-2">
                          {hub.waysIn.map((way) => (
                            <div key={way.fromBeatId} className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded">
                              <button
                                onClick={() => onHighlightBeat?.(way.fromBeatId)}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {way.fromBeatName}
                              </button>
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              <button
                                onClick={() => onHighlightBeat?.(hub.beatId)}
                                className="text-blue-600 hover:underline"
                              >
                                {hub.beatName}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
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

      {/* AI findings */}
      {simulation && arrivals && onStoryLogicChange && (
        <div id="story-logic-ai">
        <StoryLogicAISection
          story={story}
          analyzer={simulation.analyzer}
          arrivals={arrivals}
          hubBeats={validation.hubBeats}
          flaggedBeats={validation.issues.filter((i) => i.category === 'hub_state_assumption' || i.category === 'ungated_state_reference').map((i) => i.beatId)}
          incoming={validation.pathAnalysis}
          store={storyLogic ?? null}
          onStoreChange={onStoryLogicChange}
          onHighlightBeat={onHighlightBeat}
          onHighlightPath={onHighlightPath}
          onFixDecision={onFixDecision}
          fixResult={fixResult ?? null}
          onFindingCount={setAiFindingCount}
        />
        </div>
      )}

      <p className="text-xs text-gray-500">Warnings from these checks are in the Problems tab.</p>
    </div>
  );
};
