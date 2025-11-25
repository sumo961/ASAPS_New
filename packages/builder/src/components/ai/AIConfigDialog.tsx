/**
 * AI Configuration Dialog
 *
 * Dialog for configuring AI providers
 */

import React, { useState } from 'react';
import { X, Key, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { useAI } from '../../hooks/useAI';

export interface AIConfigDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;

  /** Close dialog callback */
  onClose: () => void;
}

/**
 * AI Configuration Dialog
 */
export const AIConfigDialog: React.FC<AIConfigDialogProps> = ({ isOpen, onClose }) => {
  const { isConfigured, currentProvider, configure, error: aiError } = useAI();

  const [provider, setProvider] = useState<'claude' | 'openai'>(
    (currentProvider as 'claude' | 'openai') || 'claude'
  );
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setError('');
    setSuccess(false);

    try {
      configure(provider, apiKey, model || undefined, baseUrl || undefined);
      setSuccess(true);

      // Close after short delay
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI Configuration</h2>
              <p className="text-sm text-gray-600">Configure your AI provider</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Current Status */}
        {isConfigured && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-800">
                Currently configured: <span className="font-medium">{currentProvider}</span>
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProvider('claude')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  provider === 'claude'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <p className="font-medium text-gray-900">Claude</p>
                  <p className="text-xs text-gray-500 mt-1">Anthropic</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider('openai')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  provider === 'openai'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <p className="font-medium text-gray-900">OpenAI</p>
                  <p className="text-xs text-gray-500 mt-1">GPT-4</p>
                </div>
              </button>
            </div>
          </div>

          {/* API Key */}
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${provider === 'claude' ? 'Anthropic' : 'OpenAI'} API key`}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {provider === 'claude'
                ? 'Get your API key from console.anthropic.com'
                : 'Get your API key from platform.openai.com'}
            </p>
          </div>

          {/* Model (Optional) */}
          <div>
            <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
              Model (Optional)
            </label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-4-turbo-preview'
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">Leave empty for default model</p>
          </div>

          {/* Base URL (Optional) */}
          <div>
            <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Base URL (Optional)
            </label>
            <input
              id="baseUrl"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === 'claude'
                  ? 'https://api.anthropic.com'
                  : 'https://api.openai.com/v1'
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              For alternative API-compatible providers (leave empty for default)
            </p>
          </div>

          {/* Error */}
          {(error || aiError) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error || aiError}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-700">Configuration saved successfully!</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Configure
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> API keys are stored in memory only and are not persisted. You'll
            need to re-enter them when you reload the application.
          </p>
        </div>
      </div>
    </div>
  );
};
