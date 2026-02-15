/**
 * HTML Export Dialog - Configure and trigger HTML export
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Download, FileText, FolderOpen, Info, Eye, EyeOff, Settings } from 'lucide-react';
import { downloadHtmlExport, type HtmlExportOptions, type AIProvider } from '../../export/HtmlExporter';
import { getSavedAIConfig } from '../../hooks/useAI';

const STANDARD_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'ja', label: 'Japanese' },
  { code: 'mt', label: 'Maltese' },
  { code: 'zh', label: 'Mandarin Chinese' },
] as const;


interface HtmlExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export const HtmlExportDialog: React.FC<HtmlExportDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const [mode, setMode] = useState<'folder' | 'single-file'>('folder');
  const [enableAI, setEnableAI] = useState(true);
  const [aiProvider, setAiProvider] = useState<AIProvider>('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [customLanguage, setCustomLanguage] = useState('');
  const [customLanguages, setCustomLanguages] = useState<string[]>([]);
  const [translationMode, setTranslationMode] = useState<'separate' | 'bundled'>('separate');
  const [usingGlobalConfig, setUsingGlobalConfig] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<{
    currentLanguage: string;
    languageIndex: number;
    totalLanguages: number;
    stringsTranslated: number;
    totalStrings: number;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasPopulatedRef = useRef(false);

  // Pre-populate AI settings from global config on first open
  useEffect(() => {
    if (isOpen && !hasPopulatedRef.current) {
      hasPopulatedRef.current = true;
      const globalConfig = getSavedAIConfig();
      if (globalConfig) {
        // Map providerType to AIProvider
        const providerMap: Record<string, AIProvider> = {
          claude: 'anthropic',
          openai: 'openai',
          local: 'local',
        };
        const mappedProvider = providerMap[globalConfig.providerType || globalConfig.provider] || 'openai';
        setAiProvider(mappedProvider);
        if (globalConfig.apiKey) setAiApiKey(globalConfig.apiKey);
        if (globalConfig.baseUrl) setAiBaseUrl(globalConfig.baseUrl);
        if (globalConfig.model) setAiModel(globalConfig.model);
        setUsingGlobalConfig(true);
        // Show advanced options if model or baseUrl were set
        if (globalConfig.model || globalConfig.baseUrl) {
          setShowAdvanced(true);
        }
      }
    }
    if (!isOpen) {
      hasPopulatedRef.current = false;
    }
  }, [isOpen]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    setTranslationProgress(null);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // For local provider, we need baseUrl but not apiKey
      // For others, we need apiKey (baseUrl is optional)
      const hasAIConfig = aiProvider === 'local'
        ? !!aiBaseUrl
        : !!aiApiKey;

      // Collect translation languages
      const translateLanguages: string[] = [];
      if (enableTranslation) {
        for (const code of selectedLanguages) {
          const lang = STANDARD_LANGUAGES.find(l => l.code === code);
          if (lang) translateLanguages.push(lang.label);
        }
        translateLanguages.push(...customLanguages);
      }

      // Translation needs AI config even if enableAI (for player) is off
      const needsAIConfig = (enableAI && hasAIConfig) || translateLanguages.length > 0;

      const options: HtmlExportOptions = {
        mode,
        responsive: true,
        enableAI,
        showApiKeyPrompt: enableAI && !hasAIConfig,
        aiProvider: needsAIConfig ? aiProvider : undefined,
        aiApiKey: needsAIConfig && aiApiKey ? aiApiKey : undefined,
        aiBaseUrl: needsAIConfig && aiBaseUrl ? aiBaseUrl : undefined,
        aiModel: needsAIConfig && aiModel ? aiModel : undefined,
        translateLanguages: translateLanguages.length > 0 ? translateLanguages : undefined,
        translationMode: translateLanguages.length > 0 ? translationMode : undefined,
        onTranslationProgress: (progress) => setTranslationProgress(progress),
        signal: abortController.signal,
      };

      await downloadHtmlExport(projectId, projectName, options);
      onClose();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Translation cancelled');
      } else {
        console.error('[HtmlExportDialog] Export failed:', err);
        setError(err instanceof Error ? err.message : 'Export failed');
      }
    } finally {
      setExporting(false);
      setTranslationProgress(null);
      abortControllerRef.current = null;
    }
  }, [mode, enableAI, aiProvider, aiApiKey, aiBaseUrl, aiModel, projectId, projectName, onClose, enableTranslation, selectedLanguages, customLanguages, translationMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Export as HTML</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
          {/* Export Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('folder')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === 'folder'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FolderOpen className={`w-6 h-6 mb-2 ${mode === 'folder' ? 'text-blue-500' : 'text-gray-400'}`} />
                <div className="font-medium text-gray-900">Folder (ZIP)</div>
                <div className="text-xs text-gray-500 mt-1">
                  Separate files, better for large stories
                </div>
              </button>

              <button
                onClick={() => setMode('single-file')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === 'single-file'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className={`w-6 h-6 mb-2 ${mode === 'single-file' ? 'text-blue-500' : 'text-gray-400'}`} />
                <div className="font-medium text-gray-900">Single File</div>
                <div className="text-xs text-gray-500 mt-1">
                  One HTML file with everything inline
                </div>
              </button>
            </div>
          </div>

          {/* AI Settings */}
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableAI}
                onChange={(e) => setEnableAI(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900">Enable AI Features</div>
                <div className="text-sm text-gray-500">
                  {aiApiKey
                    ? 'API key will be embedded in export'
                    : 'Players will be prompted for API key if story uses AI beats'
                  }
                </div>
              </div>
            </label>

            {/* AI Configuration - shown when AI is enabled */}
            {enableAI && (
              <div className="ml-7 space-y-3 border-l-2 border-blue-200 pl-4">
                {usingGlobalConfig && (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1.5 mb-2">
                    <Settings className="w-3.5 h-3.5" />
                    Pre-filled from global AI settings — edit to override
                  </div>
                )}
                <div className="text-sm text-gray-600 mb-2">
                  Optionally embed your API key so players don't need to configure it:
                </div>

                {/* Provider Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AI Provider
                  </label>
                  <select
                    value={aiProvider}
                    onChange={(e) => { setAiProvider(e.target.value as AIProvider); setUsingGlobalConfig(false); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="openai">OpenAI (GPT-5.2)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                    <option value="local">Local LLM (self-hosted server)</option>
                  </select>
                </div>

                {/* Base URL - required for local/custom, optional for others */}
                {(aiProvider === 'custom' || aiProvider === 'local') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Base URL {aiProvider === 'local' ? '' : ''}
                    </label>
                    <input
                      type="text"
                      value={aiBaseUrl}
                      onChange={(e) => { setAiBaseUrl(e.target.value); setUsingGlobalConfig(false); }}
                      placeholder={
                        aiProvider === 'local'
                          ? 'http://localhost:8080/v1'
                          : 'https://api.example.com/v1'
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {aiProvider === 'local'
                        ? 'URL of your local LLM server (llama.cpp, Ollama, etc.)'
                        : 'OpenAI-compatible API endpoint (Azure OpenAI, proxy, etc.)'
                      }
                    </p>
                  </div>
                )}

                {/* API Key Input - not shown for local */}
                {aiProvider !== 'local' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key {aiApiKey ? '' : '(optional)'}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={aiApiKey}
                        onChange={(e) => { setAiApiKey(e.target.value); setUsingGlobalConfig(false); }}
                        placeholder={
                          aiProvider === 'openai' ? 'sk-...' :
                          aiProvider === 'anthropic' ? 'sk-ant-...' :
                          'Enter API key'
                        }
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {aiApiKey && (
                      <p className="text-xs text-amber-600 mt-1">
                        Warning: API key will be visible in the exported HTML source code
                      </p>
                    )}
                  </div>
                )}

                {/* Advanced toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {showAdvanced ? '− Hide advanced options' : '+ Show advanced options'}
                </button>

                {/* Advanced options */}
                {showAdvanced && (
                  <div className="space-y-3">
                    {/* Base URL override for OpenAI/Anthropic */}
                    {(aiProvider === 'openai' || aiProvider === 'anthropic') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Base URL Override
                        </label>
                        <input
                          type="text"
                          value={aiBaseUrl}
                          onChange={(e) => { setAiBaseUrl(e.target.value); setUsingGlobalConfig(false); }}
                          placeholder={
                            aiProvider === 'openai'
                              ? 'https://api.openai.com/v1 (default)'
                              : 'https://api.anthropic.com/v1 (default)'
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          For proxies or enterprise endpoints. Leave empty for default.
                        </p>
                      </div>
                    )}

                    {/* Model override */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Model Override
                      </label>
                      <input
                        type="text"
                        value={aiModel}
                        onChange={(e) => { setAiModel(e.target.value); setUsingGlobalConfig(false); }}
                        placeholder={
                          aiProvider === 'openai' ? 'gpt-5.2 (default)' :
                          aiProvider === 'anthropic' ? 'claude-sonnet-4-20250514 (default)' :
                          aiProvider === 'local' ? 'llama-3, mistral, etc.' :
                          'model-name'
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty to use provider's default model
                      </p>
                    </div>
                  </div>
                )}

                {/* Internet access warning */}
                {aiApiKey && aiProvider !== 'local' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <strong>Note:</strong> This story will require internet access to use AI features.
                    {mode === 'single-file' && ' Players opening the file locally will need to be online.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 rounded-lg p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About HTML Export</p>
              <p>
                The exported story can be opened directly in a browser or embedded in a webpage
                using an iframe. All assets are included in the export.
              </p>
              {mode === 'folder' && (
                <p className="mt-2">
                  <strong>Folder mode:</strong> Upload the extracted folder to a web server.
                  Open <code className="bg-blue-100 px-1 rounded">index.html</code> to play.
                </p>
              )}
              {mode === 'single-file' && (
                <p className="mt-2">
                  <strong>Single-file mode:</strong> The HTML file contains everything.
                  Note: Very large stories may have slower load times.
                </p>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
