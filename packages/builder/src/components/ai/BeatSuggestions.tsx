/**
 * Beat Suggestions Component
 *
 * AI-powered suggestions for next beats
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Loader2, AlertCircle } from 'lucide-react';
import type { BeatConfig } from '@asaps/core';
import type { BeatSuggestion } from '../../types/ai';
import { useAI } from '../../hooks/useAI';

export interface BeatSuggestionsProps {
  /** Currently selected beat */
  currentBeat: BeatConfig;

  /** All beats in the story */
  allBeats: BeatConfig[];

  /** Story metadata */
  storyMetadata?: {
    title: string;
    genre?: string;
  };

  /** Callback when user wants to add a suggested beat */
  onAddBeat: (suggestion: BeatSuggestion) => void;

  /** Number of suggestions to show */
  count?: number;
}

/**
 * Beat Suggestions Panel
 */
export const BeatSuggestions: React.FC<BeatSuggestionsProps> = ({
  currentBeat,
  allBeats,
  storyMetadata,
  onAddBeat,
  count = 3,
}) => {
  const { isConfigured, isGenerating, error, suggestBeats, clearError } = useAI();
  const [suggestions, setSuggestions] = useState<BeatSuggestion[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  /**
   * Generate suggestions
   */
  const handleGenerateSuggestions = async () => {
    if (!isConfigured) {
      return;
    }

    clearError();

    const response = await suggestBeats({
      currentBeat,
      existingBeats: allBeats,
      storyMetadata,
      count,
    });

    if (response) {
      setSuggestions(response.suggestions);
      setIsExpanded(true);
    }
  };

  /**
   * Add a suggested beat
   */
  const handleAddSuggestion = (suggestion: BeatSuggestion) => {
    onAddBeat(suggestion);
    // Optionally refresh suggestions after adding
  };

  /**
   * Clear suggestions when beat changes
   */
  useEffect(() => {
    setSuggestions([]);
    setIsExpanded(false);
  }, [currentBeat.id]);

  if (!isConfigured) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-gray-600">
            <p className="font-medium mb-1">AI Not Configured</p>
            <p>Configure an AI provider in Settings to get beat suggestions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <h3 className="font-semibold text-gray-900">Suggest Next Beat</h3>
        </div>

        {!isExpanded && (
          <button
            onClick={handleGenerateSuggestions}
            disabled={isGenerating}
            title={`Suggest new beats to follow "${currentBeat.name || 'this beat'}"`}
            className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Suggest Next Beats
              </>
            )}
          </button>
        )}
      </div>

      {/* Scope hint — suggestions create NEW beats after this one */}
      <p className="text-xs text-gray-500 -mt-1">
        Proposes new beats to follow{' '}
        <span className="font-medium text-gray-700">{currentBeat.name || 'this beat'}</span> — the
        selected beat itself is not changed.
      </p>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isGenerating && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-600">Analyzing story context...</p>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {isExpanded && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <SuggestionCard
              key={index}
              suggestion={suggestion}
              onAdd={() => handleAddSuggestion(suggestion)}
            />
          ))}

          <button
            onClick={handleGenerateSuggestions}
            disabled={isGenerating}
            className="w-full px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Regenerate Suggestions
          </button>
        </div>
      )}

      {/* Empty state */}
      {isExpanded && suggestions.length === 0 && !isGenerating && !error && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No suggestions generated. Try again?
        </div>
      )}
    </div>
  );
};

/**
 * Individual suggestion card
 */
const SuggestionCard: React.FC<{
  suggestion: BeatSuggestion;
  onAdd: () => void;
}> = ({ suggestion, onAdd }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Confidence color
  const confidenceColor =
    suggestion.confidence >= 0.8
      ? 'bg-green-100 text-green-800'
      : suggestion.confidence >= 0.6
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-800';

  return (
    <div className="border border-gray-200 rounded-lg p-3 hover:border-purple-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900">{suggestion.name}</h4>
            <span className={`px-2 py-0.5 text-xs rounded-full ${confidenceColor}`}>
              {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>

          <p className="text-sm text-gray-600 mb-2">{suggestion.reasoning}</p>

          {isExpanded && (
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <p>
                <span className="font-medium">Type:</span> {suggestion.beatType}
              </p>
              {Object.keys(suggestion.parameters).length > 0 && (
                <p>
                  <span className="font-medium">Parameters:</span>{' '}
                  {Object.keys(suggestion.parameters).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onAdd}
          title="Creates a new beat after the selected one and connects them"
          className="px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-1.5 text-sm flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 text-xs text-purple-600 hover:text-purple-700"
      >
        {isExpanded ? 'Show less' : 'Show details'}
      </button>
    </div>
  );
};
