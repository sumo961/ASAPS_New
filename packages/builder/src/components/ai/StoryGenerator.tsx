/**
 * Story Generator Component
 *
 * AI-powered complete story generation from natural language prompts
 */

import React, { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, BookOpen, X } from 'lucide-react';
import { useAI } from '../../hooks/useAI';
import type { StoryGenerationRequest } from '../../types/ai';

export interface StoryGeneratorProps {
  /** Whether dialog is open */
  isOpen: boolean;

  /** Close dialog callback */
  onClose: () => void;

  /** Callback when story is generated */
  onStoryGenerated: (story: any) => void;
}

/**
 * Story Generator Dialog
 */
export const StoryGenerator: React.FC<StoryGeneratorProps> = ({
  isOpen,
  onClose,
  onStoryGenerated,
}) => {
  const { isConfigured, isGenerating, error, generateStory, clearError } = useAI();

  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<string>('');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [complexity, setComplexity] = useState<'linear' | 'moderate' | 'complex'>('moderate');

  /**
   * Generate story from prompt
   */
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      return;
    }

    clearError();

    const request: StoryGenerationRequest = {
      prompt: prompt.trim(),
      genre: genre || undefined,
      length,
      complexity,
    };

    const result = await generateStory(request);

    if (result) {
      onStoryGenerated(result);
      onClose();
      // Reset form
      setPrompt('');
      setGenre('');
      setLength('medium');
      setComplexity('moderate');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Generate Story</h2>
              <p className="text-sm text-gray-500">Create a complete interactive story from your idea</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Configuration Warning */}
          {!isConfigured && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900">AI Not Configured</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Please configure your AI provider (Claude or OpenAI) in the settings before generating stories.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Generation Failed</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Story Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Story Idea <span className="text-red-500">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your story idea... (e.g., 'A detective solving a murder mystery in a haunted Victorian mansion')"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
              rows={4}
              disabled={isGenerating}
            />
            <p className="text-xs text-gray-500 mt-2">
              Be specific about setting, characters, and plot to get better results
            </p>
          </div>

          {/* Genre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Genre (Optional)
            </label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              disabled={isGenerating}
            >
              <option value="">Auto-detect from prompt</option>
              <option value="mystery">Mystery</option>
              <option value="fantasy">Fantasy</option>
              <option value="scifi">Science Fiction</option>
              <option value="romance">Romance</option>
              <option value="horror">Horror</option>
              <option value="adventure">Adventure</option>
              <option value="drama">Drama</option>
              <option value="comedy">Comedy</option>
            </select>
          </div>

          {/* Story Length */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Story Length
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['short', 'medium', 'long'] as const).map((len) => (
                <button
                  key={len}
                  onClick={() => setLength(len)}
                  disabled={isGenerating}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    length === len
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium capitalize">{len}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {len === 'short' && '5-8 beats'}
                    {len === 'medium' && '10-15 beats'}
                    {len === 'long' && '20-30 beats'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Branching Complexity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Branching Complexity
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['linear', 'moderate', 'complex'] as const).map((comp) => (
                <button
                  key={comp}
                  onClick={() => setComplexity(comp)}
                  disabled={isGenerating}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    complexity === comp
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium capitalize">{comp}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {comp === 'linear' && 'Single path'}
                    {comp === 'moderate' && 'Some choices'}
                    {comp === 'complex' && 'Many branches'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <BookOpen className="w-4 h-4 inline mr-1" />
            This will create a new story with beats and connections
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!isConfigured || !prompt.trim() || isGenerating}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Story
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
