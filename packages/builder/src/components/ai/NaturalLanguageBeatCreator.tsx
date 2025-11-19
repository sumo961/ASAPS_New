/**
 * Natural Language Beat Creator
 *
 * Quick beat creation from natural language descriptions
 */

import React, { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, Lightbulb, X } from 'lucide-react';
import { useAI } from '../../hooks/useAI';
import type { NaturalLanguageBeatRequest } from '../../types/ai';

export interface NaturalLanguageBeatCreatorProps {
  /** Whether dialog is open */
  isOpen: boolean;

  /** Close dialog callback */
  onClose: () => void;

  /** Callback when beat is created */
  onBeatCreated: (beat: any) => void;
}

/**
 * Natural Language Beat Creator Dialog
 */
export const NaturalLanguageBeatCreator: React.FC<NaturalLanguageBeatCreatorProps> = ({
  isOpen,
  onClose,
  onBeatCreated,
}) => {
  const { isConfigured, isGenerating, error, createBeatFromNL, clearError } = useAI();

  const [description, setDescription] = useState('');

  // Example prompts
  const examples = [
    'Add a choice where the player decides to help the merchant or walk away',
    'Create a dialogue with the detective asking about the murder weapon',
    'Show a timed screen with ominous music that lasts 5 seconds',
    'Add text input where the player enters their character name',
  ];

  /**
   * Create beat from description
   */
  const handleCreate = async () => {
    if (!description.trim()) {
      return;
    }

    clearError();

    const request: NaturalLanguageBeatRequest = {
      description: description.trim(),
    };

    const result = await createBeatFromNL(request);

    if (result) {
      onBeatCreated(result);
      onClose();
      // Reset form
      setDescription('');
    }
  };

  /**
   * Use example prompt
   */
  const handleUseExample = (example: string) => {
    setDescription(example);
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
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Create Beat from Description</h2>
              <p className="text-sm text-gray-500">Describe what you want and AI will create the beat</p>
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
                  Please configure your AI provider (Claude or OpenAI) in the settings before creating beats.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Creation Failed</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Description Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Describe the beat you want to create <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the beat in natural language..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={4}
              disabled={isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleCreate();
                }
              }}
            />
            <p className="text-xs text-gray-500 mt-2">
              Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to create
            </p>
          </div>

          {/* Examples */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Example Prompts
            </label>
            <div className="grid grid-cols-1 gap-2">
              {examples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => handleUseExample(example)}
                  disabled={isGenerating}
                  className="px-4 py-3 text-left text-sm text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3 h-3 inline mr-2 text-gray-400" />
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Tips for better results
            </h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Be specific about the beat type (dialogue, choice, text, etc.)</li>
              <li>Include any text content you want in the beat</li>
              <li>Mention timing or conditions if relevant</li>
              <li>Describe player actions or choices clearly</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            AI will determine the best beat type based on your description
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
              onClick={handleCreate}
              disabled={!isConfigured || !description.trim() || isGenerating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create Beat
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
