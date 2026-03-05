/**
 * TTS Configuration Dialog
 *
 * Provider picker for Text-to-Speech settings.
 * Mirrors AIConfigDialog pattern: provider tabs, API key, model, test voice.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Key, CheckCircle, AlertCircle, Server, Trash2, Play, Volume2 } from 'lucide-react';
import { getSavedTTSConfig, clearSavedTTSConfig } from '../../hooks/useTTS';
import { getTTSService } from '../../services/tts';
import type { TTSProviderType, TTSVoiceInfo } from '../../types/tts';

type TTSProviderTab = 'web-speech' | 'openai' | 'elevenlabs' | 'custom';

interface ProviderPreset {
  name: string;
  description: string;
  apiKeyRequired: boolean;
  apiKeyPlaceholder: string;
  apiKeyHelp: string;
  models: { id: string; name: string }[];
  defaultModel: string;
  baseUrlRequired?: boolean;
  baseUrlPlaceholder?: string;
}

const PROVIDER_PRESETS: Record<TTSProviderTab, ProviderPreset> = {
  'web-speech': {
    name: 'Built-in Voices',
    description: 'Free, offline',
    apiKeyRequired: false,
    apiKeyPlaceholder: '',
    apiKeyHelp: '',
    models: [],
    defaultModel: '',
  },
  openai: {
    name: 'OpenAI TTS',
    description: 'Neural voices',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Enter your OpenAI API key',
    apiKeyHelp: 'Uses your OpenAI API key from platform.openai.com',
    models: [
      { id: 'tts-1', name: 'TTS-1 (fast)' },
      { id: 'tts-1-hd', name: 'TTS-1 HD (quality)' },
    ],
    defaultModel: 'tts-1',
  },
  elevenlabs: {
    name: 'ElevenLabs',
    description: 'Ultra-realistic',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Enter your ElevenLabs API key',
    apiKeyHelp: 'Get your API key from elevenlabs.io',
    models: [
      { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
      { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (fast)' },
    ],
    defaultModel: 'eleven_multilingual_v2',
  },
  custom: {
    name: 'Custom Server',
    description: 'OpenAI-compatible',
    apiKeyRequired: false,
    apiKeyPlaceholder: 'Optional API key',
    apiKeyHelp: 'Most local servers ignore this',
    models: [],
    defaultModel: '',
    baseUrlRequired: true,
    baseUrlPlaceholder: 'http://localhost:8080/v1',
  },
};

export interface TTSConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the useTTS configure function to apply settings */
  onConfigure: (
    providerType: TTSProviderType,
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    defaultVoiceId?: string,
  ) => void;
  /** Current TTS enabled state */
  ttsEnabled: boolean;
  /** Toggle TTS on/off */
  onToggleTTS: (enabled: boolean) => void;
}

export const TTSConfigDialog: React.FC<TTSConfigDialogProps> = ({
  isOpen,
  onClose,
  onConfigure,
  ttsEnabled,
  onToggleTTS,
}) => {
  const [provider, setProvider] = useState<TTSProviderTab>('web-speech');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultVoiceId, setDefaultVoiceId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasLoadedSaved, setHasLoadedSaved] = useState(false);
  const [voices, setVoices] = useState<TTSVoiceInfo[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const preset = PROVIDER_PRESETS[provider];

  // Load saved configuration when dialog opens
  useEffect(() => {
    if (isOpen && !hasLoadedSaved) {
      const saved = getSavedTTSConfig();
      if (saved) {
        setProvider(saved.providerType as TTSProviderTab);
        setApiKey(saved.apiKey || '');
        setModel(saved.model || '');
        setBaseUrl(saved.baseUrl || '');
        setDefaultVoiceId(saved.defaultVoiceId || '');
      }
      setHasLoadedSaved(true);
    }
  }, [isOpen, hasLoadedSaved]);

  useEffect(() => {
    if (!isOpen) {
      setHasLoadedSaved(false);
      setSuccess(false);
      setError('');
    }
  }, [isOpen]);

  // Load voices when provider is active and configured
  const loadVoices = useCallback(async () => {
    const ttsService = getTTSService();
    const activeProvider = ttsService.getActiveProvider();
    if (activeProvider) {
      try {
        const lang = ttsService.getLanguage() || undefined;
        const v = await activeProvider.getVoices(lang);
        setVoices(v);
      } catch {
        setVoices([]);
      }
    }
  }, []);

  // Load voices when dialog opens
  useEffect(() => {
    if (isOpen) loadVoices();
  }, [isOpen, loadVoices]);

  const handleProviderChange = (newProvider: TTSProviderTab) => {
    setProvider(newProvider);
    setModel('');
    setApiKey('');
    setDefaultVoiceId('');
    setError('');
    setSuccess(false);
    const newPreset = PROVIDER_PRESETS[newProvider];
    setBaseUrl(newPreset.baseUrlPlaceholder || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (preset.apiKeyRequired && !apiKey.trim()) {
      setError('API key is required');
      return;
    }

    if (preset.baseUrlRequired && !baseUrl.trim()) {
      setError('Base URL is required');
      return;
    }

    setError('');
    setSuccess(false);

    try {
      onConfigure(
        provider as TTSProviderType,
        apiKey || undefined,
        model || preset.defaultModel || undefined,
        baseUrl || undefined,
        defaultVoiceId || undefined,
      );
      setSuccess(true);

      // Reload voices after configuration
      setTimeout(() => loadVoices(), 500);

      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
    }
  };

  const handleTestVoice = async () => {
    setIsTesting(true);
    try {
      const ttsService = getTTSService();
      const activeProvider = ttsService.getActiveProvider();
      if (!activeProvider) {
        setError('No TTS provider configured. Save settings first.');
        return;
      }
      await ttsService.speak('Hello, this is a voice test. How does this sound?');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = () => {
    clearSavedTTSConfig();
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setDefaultVoiceId('');
    setProvider('web-speech');
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
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Text-to-Speech</h2>
              <p className="text-sm text-gray-600">Configure voice synthesis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* TTS Enable/Disable toggle */}
        <div className="mb-5 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Text-to-Speech</p>
            <p className="text-xs text-gray-500">Read story text aloud during preview</p>
          </div>
          <button
            type="button"
            onClick={() => onToggleTTS(!ttsEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              ttsEnabled ? 'bg-teal-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                ttsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Voice Provider
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(PROVIDER_PRESETS) as [TTSProviderTab, ProviderPreset][]).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleProviderChange(key)}
                  className={`p-3 border-2 rounded-lg transition-all text-center ${
                    provider === key
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {key === 'custom' && <Server className="w-4 h-4 mx-auto mb-1 text-gray-600" />}
                  <p className="font-medium text-gray-900 text-xs leading-tight">{p.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* API Key (for providers that need it) */}
          {(preset.apiKeyRequired || provider === 'custom') && (
            <div>
              <label htmlFor="ttsApiKey" className="block text-sm font-medium text-gray-700 mb-2">
                API Key {!preset.apiKeyRequired && <span className="text-gray-400">(Optional)</span>}
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="ttsApiKey"
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={preset.apiKeyPlaceholder}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {preset.apiKeyHelp && (
                <p className="mt-1 text-xs text-gray-500">{preset.apiKeyHelp}</p>
              )}
            </div>
          )}

          {/* Model Selection */}
          {preset.models.length > 0 && (
            <div>
              <label htmlFor="ttsModel" className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                id="ttsModel"
                value={model || preset.defaultModel}
                onChange={e => setModel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {preset.models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Base URL (for custom provider) */}
          {preset.baseUrlRequired && (
            <div>
              <label htmlFor="ttsBaseUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Base URL
              </label>
              <input
                id="ttsBaseUrl"
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={preset.baseUrlPlaceholder}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                OpenAI-compatible TTS endpoint (e.g., local Piper, Coqui)
              </p>
            </div>
          )}

          {/* Default Voice */}
          {voices.length > 0 && (
            <div>
              <label htmlFor="ttsDefaultVoice" className="block text-sm font-medium text-gray-700 mb-2">
                Default Voice
              </label>
              <select
                id="ttsDefaultVoice"
                value={defaultVoiceId}
                onChange={e => setDefaultVoiceId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Auto</option>
                {voices.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.gender ? ` (${v.gender})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Test Voice */}
          <button
            type="button"
            onClick={handleTestVoice}
            disabled={isTesting}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm text-gray-700 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {isTesting ? 'Playing...' : 'Test Voice'}
          </button>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-700">TTS configuration saved!</p>
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
              className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors flex items-center justify-center gap-2"
            >
              <Volume2 className="w-4 h-4" />
              Save
            </button>
          </div>
        </form>

        {/* Info footer */}
        {provider !== 'web-speech' && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start justify-between">
              <p className="text-sm text-blue-900 flex-1">
                <strong>Note:</strong> Your API key is saved in browser storage only.
                Use the button to clear saved credentials.
              </p>
              <button
                type="button"
                onClick={handleClear}
                className="ml-3 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-sm"
                title="Clear saved TTS configuration"
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
