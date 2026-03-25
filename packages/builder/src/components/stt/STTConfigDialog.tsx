/**
 * STT Configuration Dialog
 *
 * Provider picker for Speech-to-Text settings.
 * Mirrors TTSConfigDialog pattern: provider tabs, API key, test button.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Key, CheckCircle, AlertCircle, Trash2, Mic, Server, Link2 } from 'lucide-react';
import { getSavedSTTConfig, clearSavedSTTConfig } from '../../hooks/useSTT';
import { getSavedTTSConfig } from '../../hooks/useTTS';
import type { STTProviderType } from '../../types/stt';

type STTProviderTab = 'web-speech' | 'whisper' | 'local' | 'vosk' | 'whisper-cpp';

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

const PROVIDER_PRESETS: Record<STTProviderTab, ProviderPreset> = {
  'web-speech': {
    name: 'Built-in',
    description: 'Free, real-time',
    apiKeyRequired: false,
    apiKeyPlaceholder: '',
    apiKeyHelp: '',
    models: [],
    defaultModel: '',
  },
  whisper: {
    name: 'Whisper',
    description: 'OpenAI API',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Enter your OpenAI API key',
    apiKeyHelp: 'Uses your OpenAI API key for Whisper transcription',
    models: [
      { id: 'whisper-1', name: 'Whisper v1' },
    ],
    defaultModel: 'whisper-1',
  },
  local: {
    name: 'Local Server',
    description: 'Self-hosted Whisper',
    apiKeyRequired: false,
    apiKeyPlaceholder: 'Optional API key',
    apiKeyHelp: 'Most local servers don\'t need this',
    models: [],
    defaultModel: '',
    baseUrlRequired: true,
    baseUrlPlaceholder: 'http://localhost:9000/v1',
  },
  vosk: {
    name: 'Vosk',
    description: 'Offline, streaming',
    apiKeyRequired: false,
    apiKeyPlaceholder: '',
    apiKeyHelp: '',
    models: [],
    defaultModel: '',
    baseUrlRequired: true,
    baseUrlPlaceholder: 'ws://localhost:2700',
  },
  'whisper-cpp': {
    name: 'Whisper.cpp',
    description: 'Offline, accurate',
    apiKeyRequired: false,
    apiKeyPlaceholder: '',
    apiKeyHelp: '',
    models: [],
    defaultModel: '',
    baseUrlRequired: true,
    baseUrlPlaceholder: 'http://localhost:8178',
  },
};

const LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'de-DE', name: 'German' },
  { code: 'fr-FR', name: 'French' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (BR)' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
];

export interface STTConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigure: (
    providerType: STTProviderType,
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    language?: string,
  ) => void;
  sttEnabled: boolean;
  onToggleSTT: (enabled: boolean) => void;
}

export const STTConfigDialog: React.FC<STTConfigDialogProps> = ({
  isOpen,
  onClose,
  onConfigure,
  sttEnabled,
  onToggleSTT,
}) => {
  const [provider, setProvider] = useState<STTProviderTab>('web-speech');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasLoadedSaved, setHasLoadedSaved] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const preset = PROVIDER_PRESETS[provider];

  // Check if TTS has a compatible provider we can sync from
  const ttsSync = useMemo(() => {
    const ttsConfig = getSavedTTSConfig();
    if (!ttsConfig?.apiKey) return null;

    if (ttsConfig.providerType === 'openai') {
      return {
        label: 'OpenAI TTS',
        sttProvider: 'whisper' as STTProviderTab,
        apiKey: ttsConfig.apiKey,
        baseUrl: undefined as string | undefined,
        model: 'whisper-1',
      };
    }
    if (ttsConfig.providerType === 'custom' && ttsConfig.baseUrl) {
      return {
        label: `Custom (${ttsConfig.baseUrl})`,
        sttProvider: 'local' as STTProviderTab,
        apiKey: ttsConfig.apiKey,
        baseUrl: ttsConfig.baseUrl,
        model: undefined as string | undefined,
      };
    }
    if (ttsConfig.providerType === 'local' && ttsConfig.baseUrl) {
      return {
        label: `Local (${ttsConfig.baseUrl})`,
        sttProvider: 'local' as STTProviderTab,
        apiKey: ttsConfig.apiKey,
        baseUrl: ttsConfig.baseUrl,
        model: undefined as string | undefined,
      };
    }
    return null;
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncFromTTS = () => {
    if (!ttsSync) return;
    setProvider(ttsSync.sttProvider);
    setApiKey(ttsSync.apiKey || '');
    setModel(ttsSync.model || '');
    setBaseUrl(ttsSync.baseUrl || '');
    setError('');
    setSuccess(false);
  };

  useEffect(() => {
    if (isOpen && !hasLoadedSaved) {
      const saved = getSavedSTTConfig();
      if (saved) {
        setProvider(saved.providerType as STTProviderTab);
        setApiKey(saved.apiKey || '');
        setModel(saved.model || '');
        setBaseUrl(saved.baseUrl || '');
        if (saved.language) setLanguage(saved.language);
      }
      setHasLoadedSaved(true);
    }
  }, [isOpen, hasLoadedSaved]);

  useEffect(() => {
    if (!isOpen) {
      setHasLoadedSaved(false);
      setSuccess(false);
      setError('');
      setTestResult('');
    }
  }, [isOpen]);

  const handleProviderChange = (newProvider: STTProviderTab) => {
    setProvider(newProvider);
    setModel('');
    setApiKey('');
    setError('');
    setSuccess(false);
    setTestResult('');
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
        provider as STTProviderType,
        apiKey || undefined,
        model || preset.defaultModel || undefined,
        baseUrl || undefined,
        language || undefined,
      );
      setSuccess(true);

      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
    }
  };

  const handleTestMic = async () => {
    setIsTesting(true);
    setError('');
    setTestResult('');

    try {
      // Quick test: configure, listen for 3 seconds, show result
      onConfigure(
        provider as STTProviderType,
        apiKey || undefined,
        model || preset.defaultModel || undefined,
        baseUrl || undefined,
        language || undefined,
      );

      await new Promise(r => setTimeout(r, 100));

      const { getSTTService } = await import('../../services/stt');
      const service = getSTTService();

      let result = '';
      service.startListening({
        language,
        onResult: (r) => {
          if (r.isFinal) {
            result = r.text;
            setTestResult(r.text);
          } else {
            setTestResult(r.text + '...');
          }
        },
        onError: (err) => {
          setError(err.message);
          setIsTesting(false);
        },
        onEnd: () => {
          if (!result) setTestResult('(no speech detected)');
          setIsTesting(false);
        },
      });

      // Auto-stop after 4 seconds
      setTimeout(() => {
        service.stopListening();
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone test failed');
      setIsTesting(false);
    }
  };

  const handleClear = () => {
    clearSavedSTTConfig();
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setLanguage('en-US');
    setProvider('web-speech');
    setSuccess(false);
    setError('');
    setTestResult('');
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
            <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
              <Mic className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Speech-to-Text</h2>
              <p className="text-sm text-gray-600">Configure voice input</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Enable/Disable toggle */}
        <div className="mb-5 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Speech-to-Text</p>
            <p className="text-xs text-gray-500">Enable voice input during preview</p>
          </div>
          <button
            type="button"
            onClick={() => onToggleSTT(!sttEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              sttEnabled ? 'bg-rose-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                sttEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sync from TTS banner */}
          {ttsSync && (
            <button
              type="button"
              onClick={handleSyncFromTTS}
              className="w-full p-3 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-3 text-left"
            >
              <Link2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-teal-800">Use TTS provider credentials</p>
                <p className="text-xs text-teal-600 truncate">
                  Sync API key from {ttsSync.label}
                </p>
              </div>
            </button>
          )}

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              STT Provider
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(PROVIDER_PRESETS) as [STTProviderTab, ProviderPreset][]).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleProviderChange(key)}
                  className={`p-3 border-2 rounded-lg transition-all text-center ${
                    provider === key
                      ? 'border-rose-500 bg-rose-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {key === 'local' && <Server className="w-4 h-4 mx-auto mb-1 text-gray-600" />}
                  <p className="font-medium text-gray-900 text-xs leading-tight">{p.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          {(preset.apiKeyRequired || provider === 'local') && (
            <div>
              <label htmlFor="sttApiKey" className="block text-sm font-medium text-gray-700 mb-2">
                API Key {!preset.apiKeyRequired && <span className="text-gray-400">(Optional)</span>}
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="sttApiKey"
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={preset.apiKeyPlaceholder}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
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
              <label htmlFor="sttModel" className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                id="sttModel"
                value={model || preset.defaultModel}
                onChange={e => setModel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {preset.models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Base URL */}
          {preset.baseUrlRequired && (
            <div>
              <label htmlFor="sttBaseUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Base URL
              </label>
              <input
                id="sttBaseUrl"
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={preset.baseUrlPlaceholder}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Whisper-compatible STT endpoint (e.g., faster-whisper, whisper.cpp)
              </p>
            </div>
          )}

          {/* Language */}
          <div>
            <label htmlFor="sttLanguage" className="block text-sm font-medium text-gray-700 mb-2">
              Language
            </label>
            <select
              id="sttLanguage"
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Test Mic */}
          <button
            type="button"
            onClick={handleTestMic}
            disabled={isTesting}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm text-gray-700 disabled:opacity-50"
          >
            <Mic className="w-4 h-4" />
            {isTesting ? 'Listening... (speak now)' : 'Test Microphone'}
          </button>

          {/* Test Result */}
          {testResult && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Transcription:</p>
              <p className="text-sm text-gray-900">{testResult}</p>
            </div>
          )}

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
                <p className="text-sm text-green-700">STT configuration saved!</p>
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
              className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors flex items-center justify-center gap-2"
            >
              <Mic className="w-4 h-4" />
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
              </p>
              <button
                type="button"
                onClick={handleClear}
                className="ml-3 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-sm"
                title="Clear saved STT configuration"
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
