import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronDown, ChevronRight, Replace, RefreshCw } from 'lucide-react';
import { searchService, type SearchMatch, type SearchOptions } from '../../services/SearchService';
import type { Beat } from '@asaps/core';
import type { Character } from '../../types/character';
import type { Asset } from '../assets/AssetManager';

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  beats: Beat[];
  characters: Character[];
  assets: Asset[];
  metadata: { title?: string; author?: string };
  onNavigateToBeat?: (beatId: string) => void;
  onNavigateToCharacter?: (characterId: string) => void;
  onReplaceInBeat?: (beatId: string, field: string, oldValue: string, newValue: string) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  isOpen,
  onClose,
  beats,
  characters,
  assets,
  metadata,
  onNavigateToBeat,
  onNavigateToCharacter,
  onReplaceInBeat,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    searchIn: {
      beats: true,
      locations: true,
      characters: true,
      metadata: true,
      assets: true,
    },
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Update search service data when props change
  useEffect(() => {
    searchService.setData({
      beats,
      characters,
      assets,
      metadata,
    });
  }, [beats, characters, assets, metadata]);

  // Perform search
  const performSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setSelectedResults(new Set());

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const matches = searchService.search(searchQuery, options);
      setResults(matches);
      setIsSearching(false);
    }, 10);
  }, [searchQuery, options]);

  // Search on Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Toggle result selection
  const toggleResultSelection = (index: number) => {
    setSelectedResults((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Select all results
  const selectAllResults = () => {
    setSelectedResults(new Set(results.map((_, i) => i)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedResults(new Set());
  };

  // Handle replace
  const handleReplace = useCallback(() => {
    if (!replaceValue || selectedResults.size === 0 || !onReplaceInBeat) return;

    const selectedMatches = Array.from(selectedResults).map((i) => results[i]);

    // Apply replacements (only beat replacements for now)
    for (const match of selectedMatches) {
      if (match.type === 'beat' && match.context.beatId) {
        const newValue =
          match.value.substring(0, match.matchStart) +
          replaceValue +
          match.value.substring(match.matchEnd);
        onReplaceInBeat(match.context.beatId, match.field, match.value, newValue);
      }
    }

    // Re-search to update results
    performSearch();
  }, [replaceValue, selectedResults, results, onReplaceInBeat, performSearch]);

  // Navigate to result
  const handleResultClick = (match: SearchMatch) => {
    if (match.type === 'beat' && match.context.beatId && onNavigateToBeat) {
      onNavigateToBeat(match.context.beatId);
    } else if (match.type === 'character' && match.context.characterId && onNavigateToCharacter) {
      onNavigateToCharacter(match.context.characterId);
    }
  };

  // Get display name for match type
  const getTypeLabel = (type: SearchMatch['type']): string => {
    const labels: Record<SearchMatch['type'], string> = {
      beat: 'Beat',
      location: 'Location',
      character: 'Character',
      metadata: 'Metadata',
      variable: 'Variable',
      counter: 'Counter',
      asset: 'Asset',
    };
    return labels[type];
  };

  // Get highlighted text with match
  const getHighlightedText = (match: SearchMatch): React.ReactNode => {
    const before = match.value.substring(Math.max(0, match.matchStart - 20), match.matchStart);
    const matched = match.value.substring(match.matchStart, match.matchEnd);
    const after = match.value.substring(match.matchEnd, match.matchEnd + 20);

    return (
      <span className="font-mono text-xs">
        {before.length > 0 && match.matchStart > 20 && '...'}
        {before}
        <span className="bg-yellow-200 text-yellow-900 font-semibold">{matched}</span>
        {after}
        {match.matchEnd + 20 < match.value.length && '...'}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {/* Header - pt-10 pushes below Electron's macOS title bar drag region */}
      <div className="flex-shrink-0 p-4 pt-10 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Search & Replace</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in project..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={performSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
            title="Search"
          >
            <RefreshCw className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Replace Input (toggle) */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="flex items-center gap-1 mt-2 text-sm text-gray-600 hover:text-gray-800"
        >
          {showReplace ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Replace
        </button>

        {showReplace && (
          <div className="mt-2">
            <div className="relative">
              <Replace className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                placeholder="Replace with..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleReplace}
                disabled={selectedResults.size === 0 || !replaceValue}
                className="flex-1 px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Replace Selected ({selectedResults.size})
              </button>
            </div>
          </div>
        )}

        {/* Search Options (toggle) */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-1 mt-2 text-sm text-gray-600 hover:text-gray-800"
        >
          {showOptions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Options
        </button>

        {showOptions && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.caseSensitive}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, caseSensitive: e.target.checked }))
                }
                className="rounded border-gray-300"
              />
              Case sensitive
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.wholeWord}
                onChange={(e) => setOptions((prev) => ({ ...prev, wholeWord: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Whole word
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.useRegex}
                onChange={(e) => setOptions((prev) => ({ ...prev, useRegex: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Regular expression
            </label>

            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="text-xs font-medium text-gray-600 mb-1">Search in:</div>
              <div className="grid grid-cols-2 gap-1">
                {(['beats', 'characters', 'assets', 'metadata'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={options.searchIn?.[key] ?? true}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          searchIn: { ...prev.searchIn, [key]: e.target.checked },
                        }))
                      }
                      className="rounded border-gray-300 w-3 h-3"
                    />
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">{results.length} results</span>
            <div className="flex gap-2">
              <button
                onClick={selectAllResults}
                className="text-xs text-blue-600 hover:underline"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="text-xs text-gray-600 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {results.length === 0 && searchQuery && !isSearching && (
          <div className="p-4 text-center text-gray-500">No results found</div>
        )}

        <div className="divide-y divide-gray-100">
          {results.map((match, index) => (
            <div
              key={`${match.id}-${match.field}-${index}`}
              className={`p-3 hover:bg-gray-50 cursor-pointer ${
                selectedResults.has(index) ? 'bg-blue-50' : ''
              }`}
              onClick={() => handleResultClick(match)}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedResults.has(index)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleResultSelection(index);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                      {getTypeLabel(match.type)}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {match.context.beatName || match.context.characterName || match.id}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">{match.field}</div>
                  <div className="bg-gray-50 p-1.5 rounded">{getHighlightedText(match)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchPanel;
