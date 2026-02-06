/**
 * Settings Modal for Desktop Player
 * Allows configuration of AI provider and API keys
 */

import React, { useState, useEffect } from 'react';
import type { AIProvider, AISettings } from '../services/AIConfig';
import { loadAISettings, saveAISettings, getDefaultModel } from '../services/AIConfig';
import {
  isEmbeddedAIAvailable,
  listAvailableModels,
  checkModel,
  downloadModel,
  deleteModel,
  type AvailableModel,
  type DownloadProgress,
} from '../services/LocalLLMProvider';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: AISettings) => void;
}

const PROVIDERS: { value: AIProvider; label: string; description: string }[] = [
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o and other OpenAI models' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude models' },
  { value: 'local', label: 'Local AI', description: 'Offline AI with downloaded models' },
  { value: 'custom', label: 'Custom', description: 'OpenAI-compatible API (e.g., Ollama)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: '',
    localModelId: 'gemma-3-4b',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Local LLM state
  const [embeddedAIAvailable, setEmbeddedAIAvailable] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    if (isOpen) {
      const loadAll = async () => {
        // Load settings
        const loaded = await loadAISettings();
        setSettings(loaded);

        // Check embedded AI availability
        const available = await isEmbeddedAIAvailable();
        setEmbeddedAIAvailable(available);

        if (available) {
          // Load available models
          const models = await listAvailableModels();
          setAvailableModels(models);

          // Check which models are downloaded
          const downloaded = new Set<string>();
          for (const model of models) {
            const info = await checkModel(model.id);
            if (info.downloaded) {
              downloaded.add(model.id);
            }
          }
          setDownloadedModels(downloaded);
        }

        setLoading(false);
      };

      loadAll();
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await saveAISettings(settings);
      setSuccess(true);
      onSettingsChange?.(settings);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = (provider: AIProvider) => {
    setSettings(s => ({
      ...s,
      provider,
      model: '', // Reset model when provider changes
      baseUrl: provider === 'custom' ? s.baseUrl : '',
    }));
  };

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingModel(modelId);
    setDownloadProgress(null);

    try {
      await downloadModel(modelId, (progress) => {
        setDownloadProgress(progress);
      });

      // Update downloaded models list
      setDownloadedModels(prev => new Set([...prev, modelId]));
      setSettings(s => ({ ...s, localModelId: modelId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloadingModel(null);
      setDownloadProgress(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await deleteModel(modelId);
      setDownloadedModels(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });

      // If this was the selected model, select another
      if (settings.localModelId === modelId) {
        const remaining = [...downloadedModels].filter(id => id !== modelId);
        setSettings(s => ({ ...s, localModelId: remaining[0] || 'gemma-3-4b' }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="settings-loading">Loading...</div>
        ) : (
          <div className="settings-content">
            <section className="settings-section">
              <h3>AI Provider</h3>
              <p className="settings-description">
                Configure AI for dynamic story content. Some stories use AI-powered beats
                that require an API key.
              </p>

              <div className="provider-grid">
                {PROVIDERS.map(p => (
                  <button
                    key={p.value}
                    className={`provider-option ${settings.provider === p.value ? 'selected' : ''}`}
                    onClick={() => handleProviderChange(p.value)}
                  >
                    <div className="provider-label">{p.label}</div>
                    <div className="provider-description">{p.description}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-section">
              <h3>API Key</h3>
              <div className="input-group">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
                  placeholder={`Enter your ${settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`}
                  className="settings-input"
                />
                <button
                  className="toggle-visibility"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="input-hint">
                {settings.provider === 'openai' && (
                  <>Get your API key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a></>
                )}
                {settings.provider === 'anthropic' && (
                  <>Get your API key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a></>
                )}
                {settings.provider === 'custom' && (
                  <>Enter your API key or leave empty for local models</>
                )}
              </p>
            </section>

            {settings.provider === 'custom' && (
              <section className="settings-section">
                <h3>Custom API URL</h3>
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={e => setSettings(s => ({ ...s, baseUrl: e.target.value }))}
                  placeholder="e.g., http://localhost:11434/v1"
                  className="settings-input"
                />
                <p className="input-hint">
                  For Ollama, use: http://localhost:11434/v1
                </p>
              </section>
            )}

            {settings.provider === 'local' && (
              <section className="settings-section">
                <h3>Local AI Models</h3>
                {!embeddedAIAvailable ? (
                  <div className="settings-warning">
                    Local AI is not available. The app was built without embedded AI support.
                  </div>
                ) : (
                  <>
                    <p className="settings-description">
                      Download AI models for offline use. Models run locally on your computer.
                    </p>
                    <div className="model-list">
                      {availableModels.map(model => (
                        <div
                          key={model.id}
                          className={`model-item ${settings.localModelId === model.id ? 'selected' : ''}`}
                        >
                          <div className="model-info">
                            <div className="model-name">
                              {model.name}
                              {model.recommended && <span className="model-badge">Recommended</span>}
                            </div>
                            <div className="model-description">{model.description}</div>
                            <div className="model-size">{model.size_gb} GB</div>
                          </div>
                          <div className="model-actions">
                            {downloadedModels.has(model.id) ? (
                              <>
                                <button
                                  className="model-btn select"
                                  onClick={() => setSettings(s => ({ ...s, localModelId: model.id }))}
                                  disabled={settings.localModelId === model.id}
                                >
                                  {settings.localModelId === model.id ? 'Selected' : 'Select'}
                                </button>
                                <button
                                  className="model-btn delete"
                                  onClick={() => handleDeleteModel(model.id)}
                                >
                                  Delete
                                </button>
                              </>
                            ) : downloadingModel === model.id ? (
                              <div className="download-progress">
                                <div
                                  className="progress-bar"
                                  style={{ width: `${downloadProgress?.percent || 0}%` }}
                                />
                                <span className="progress-text">
                                  {downloadProgress
                                    ? `${formatBytes(downloadProgress.bytes_downloaded)} / ${formatBytes(downloadProgress.total_bytes)}`
                                    : 'Starting...'}
                                </span>
                              </div>
                            ) : (
                              <button
                                className="model-btn download"
                                onClick={() => handleDownloadModel(model.id)}
                                disabled={downloadingModel !== null}
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            <section className="settings-section">
              <h3>Model (Optional)</h3>
              <input
                type="text"
                value={settings.model}
                onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                placeholder={`Default: ${getDefaultModel(settings.provider) || 'None'}`}
                className="settings-input"
              />
              <p className="input-hint">
                Leave empty to use the default model for your provider
              </p>
            </section>

            {error && (
              <div className="settings-error">{error}</div>
            )}
            {success && (
              <div className="settings-success">Settings saved successfully!</div>
            )}

            <div className="settings-actions">
              <button className="settings-button secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="settings-button primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
