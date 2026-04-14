/**
 * AI Configuration Dialog
 *
 * Dialog for configuring AI providers
 */

import React, { useState, useEffect } from 'react';
import { X, Key, Sparkles, CheckCircle, AlertCircle, Server, Trash2 } from 'lucide-react';
import { useAI, getSavedAIConfig, clearSavedAIConfig } from '../../hooks/useAI';

// Provider presets for easy configuration
type ProviderType = 'claude' | 'openai' | 'local';

interface ProviderPreset {
  name: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  apiKeyRequired: boolean;
  apiKeyPlaceholder: string;
  apiKeyHelp: string;
  modelHelp: string;
}

const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  claude: {
    name: 'Claude',
    description: 'Anthropic',
    defaultBaseUrl: '',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Enter your Anthropic API key',
    apiKeyHelp: 'Get your API key from console.anthropic.com',
    modelHelp: 'Leave empty for default model',
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT-5 (reasoning capable)',
    defaultBaseUrl: '',
    defaultModel: 'gpt-5.2',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Enter your OpenAI API key',
    apiKeyHelp: 'Get your API key from platform.openai.com',
    modelHelp: 'Leave empty for default model',
  },
  local: {
    name: 'Local LLM',
    description: 'Ollama / Local',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    apiKeyRequired: false,
    apiKeyPlaceholder: 'ollama (or leave empty)',
    apiKeyHelp: 'Most local servers ignore this - use any value or leave empty',
    modelHelp: 'e.g., llama3.2, deepseek-coder:6.7b, mistral:7b',
  },
};

export interface AIConfigDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;

  /** Close dialog callback */
  onClose: () => void;

  /** Called when AI settings change (non-secret fields for project-level persistence) */
  onSettingsChanged?: (settings: {
    provider?: 'claude' | 'openai';
    providerType?: 'claude' | 'openai' | 'local';
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  }) => void;
}

/**
 * AI Configuration Dialog
 */
export const AIConfigDialog: React.FC<AIConfigDialogProps> = ({ isOpen, onClose, onSettingsChanged }) => {
  const { isConfigured, currentProvider, configure, error: aiError } = useAI();

  const [provider, setProvider] = useState<ProviderType>(
    (currentProvider as ProviderType) || 'claude'
  );
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<
    '' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  >('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasLoadedSaved, setHasLoadedSaved] = useState(false);

  const preset = PROVIDER_PRESETS[provider];

  // Load saved configuration when dialog opens
  useEffect(() => {
    if (isOpen && !hasLoadedSaved) {
      const savedConfig = getSavedAIConfig();
      if (savedConfig) {
        // Determine the provider type for UI
        const savedProviderType = savedConfig.providerType || savedConfig.provider;
        setProvider(savedProviderType as ProviderType);
        setApiKey(savedConfig.apiKey || '');
        setModel(savedConfig.model || '');
        setBaseUrl(savedConfig.baseUrl || '');
        setMaxTokens(savedConfig.maxTokens?.toString() || '');
        setReasoningEffort(savedConfig.reasoningEffort || '');
        console.log('[AIConfigDialog] Loaded saved configuration for:', savedProviderType);
      }
      setHasLoadedSaved(true);
    }
  }, [isOpen, hasLoadedSaved]);

  // Reset hasLoadedSaved when dialog closes so it reloads on next open
  useEffect(() => {
    if (!isOpen) {
      setHasLoadedSaved(false);
    }
  }, [isOpen]);

  // Update baseUrl when provider changes (only if user manually changes provider)
  const handleProviderChange = (newProvider: ProviderType) => {
    setProvider(newProvider);
    const newPreset = PROVIDER_PRESETS[newProvider];
    if (newPreset.defaultBaseUrl) {
      setBaseUrl(newPreset.defaultBaseUrl);
    } else {
      setBaseUrl('');
    }
    // Clear other fields when switching providers
    setModel('');
    setReasoningEffort('');
    setApiKey('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Only require API key for providers that need it
    if (preset.apiKeyRequired && !apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setError('');
    setSuccess(false);

    try {
      const maxTokensNum = maxTokens ? parseInt(maxTokens, 10) : undefined;
      // Local LLMs use OpenAI-compatible API
      const actualProvider = provider === 'local' ? 'openai' : provider;
      // For local, use a dummy API key if none provided (Ollama ignores it)
      const actualApiKey = provider === 'local' && !apiKey.trim() ? 'ollama' : apiKey;
      configure(
        actualProvider,
        actualApiKey,
        model || undefined,
        baseUrl || undefined,
        maxTokensNum,
        reasoningEffort || undefined,
        provider // Pass the original provider type for UI display
      );
      setSuccess(true);

      // Persist non-secret settings to project globalSettings for VCS
      if (onSettingsChanged) {
        onSettingsChanged({
          provider: actualProvider,
          providerType: provider,
          ...(model ? { model } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(maxTokensNum ? { maxTokens: maxTokensNum } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
        });
      }

      // Close after short delay
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
    }
  };

  const handleClearSavedConfig = () => {
    clearSavedAIConfig();
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setMaxTokens('');
    setReasoningEffort('');
    setProvider('claude');
    setSuccess(false);
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
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
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleProviderChange('claude')}
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
                onClick={() => handleProviderChange('openai')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  provider === 'openai'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <p className="font-medium text-gray-900">OpenAI</p>
                  <p className="text-xs text-gray-500 mt-1">GPT-5.2</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('local')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  provider === 'local'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <Server className="w-5 h-5 mx-auto mb-1 text-gray-600" />
                  <p className="font-medium text-gray-900">Local</p>
                  <p className="text-xs text-gray-500 mt-1">Ollama</p>
                </div>
              </button>
            </div>
          </div>

          {/* API Key */}
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              API Key {!preset.apiKeyRequired && <span className="text-gray-400">(Optional)</span>}
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={preset.apiKeyPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">{preset.apiKeyHelp}</p>
          </div>

          {/* Model */}
          <div>
            <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
              Model {provider !== 'local' && <span className="text-gray-400">(Optional)</span>}
            </label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={preset.defaultModel}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">{preset.modelHelp}</p>
          </div>

          {/* Reasoning effort (GPT-5) */}
          {(provider === 'openai' || provider === 'local') && (
            <div>
              <label htmlFor="reasoningEffort" className="block text-sm font-medium text-gray-700 mb-2">
                Reasoning effort (GPT-5)
              </label>
              <select
                id="reasoningEffort"
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Auto (model default)</option>
                <option value="none">None (no reasoning, fastest)</option>
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">X-High (max depth)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                GPT-5 reasoning uses max_completion_tokens and ignores temperature. Leave blank to use the model default (gpt-5.2 defaults to none).
              </p>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Base URL {provider !== 'local' && <span className="text-gray-400">(Optional)</span>}
            </label>
            <div className="relative">
              <input
                id="baseUrl"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={preset.defaultBaseUrl || (provider === 'claude' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
              />
              {baseUrl && (
                <button
                  type="button"
                  onClick={() => setBaseUrl('')}
                  title="Clear to use default endpoint"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {provider === 'local'
                ? 'Ollama default: localhost:11434. For remote: http://your-server:11434/v1'
                : 'For alternative API-compatible providers (leave empty for default)'}
            </p>
          </div>

          {/* Max Tokens (Optional) - shown when using custom baseUrl */}
          {baseUrl && (
            <div>
              <label htmlFor="maxTokens" className="block text-sm font-medium text-gray-700 mb-2">
                Max Tokens (Optional)
              </label>
              <input
                id="maxTokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="32000"
                min="1000"
                max="256000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Max output tokens for story generation. Default: 32000. Kimi K2 supports up to 256K.
              </p>
            </div>
          )}

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

        {/* Info - context-sensitive */}
        {provider === 'local' ? (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-900 font-medium mb-2">Quick Start with Ollama:</p>
            <ol className="text-sm text-green-800 list-decimal list-inside space-y-1">
              <li>Install: <code className="bg-green-100 px-1 rounded">curl -fsSL https://ollama.com/install.sh | sh</code></li>
              <li>Pull a model: <code className="bg-green-100 px-1 rounded">ollama pull llama3.2</code></li>
              <li>Ollama runs automatically on port 11434</li>
            </ol>
            <p className="text-xs text-green-700 mt-2">
              For Jetson/ARM: Use quantized models (e.g., deepseek-coder:6.7b-q4) to fit in memory.
            </p>
          </div>
        ) : (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start justify-between">
              <p className="text-sm text-blue-900 flex-1">
                <strong>Note:</strong> Your API key is saved in browser storage and will persist across sessions.
                Use the button to clear saved credentials.
              </p>
              <button
                type="button"
                onClick={handleClearSavedConfig}
                className="ml-3 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-sm"
                title="Clear saved configuration"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
