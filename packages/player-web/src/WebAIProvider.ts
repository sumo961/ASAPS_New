/**
 * Web AI Provider for HTML-exported stories
 * Uses embedded API key if provided by creator, otherwise prompts user
 */

import type { IAIService } from '@asaps/core';
import {
  createRuntimeAIService,
  createDirectAnthropicTransport,
  createDirectOpenAITransport,
  createRelayTransport,
} from '@asaps/core';

export type AIProvider = 'openai' | 'anthropic' | 'custom' | 'local';

interface StoredConfig {
  provider: AIProvider;
  /** Optional in relay deployments (proxyUrl carries the access instead). */
  apiKey?: string;
  /** Relay URL — see EmbeddedConfig.proxyUrl. */
  proxyUrl?: string;
  baseUrl?: string;  // For custom providers
  model?: string;    // Model override
}

// Embedded config from creator (set in window.ASAPS_CONFIG.aiConfig)
interface EmbeddedConfig {
  provider: AIProvider;
  /** Absent in relay deployments — the key never reaches the browser. */
  apiKey?: string;
  /**
   * Relay URL (same-origin serverless function, see the export's
   * README-RELAY.md). When set, requests go { provider, body } → relay,
   * which injects the key from its host's environment.
   */
  proxyUrl?: string;
  baseUrl?: string;
  model?: string;
}

const STORAGE_KEY = 'asaps-player-ai-config';

/**
 * Get embedded AI config from creator (if provided during export)
 */
function getEmbeddedConfig(): EmbeddedConfig | null {
  try {
    const asapsConfig = (window as any).ASAPS_CONFIG;
    if (asapsConfig?.aiConfig) {
      return asapsConfig.aiConfig;
    }
  } catch (e) {
    // Not in a context with ASAPS_CONFIG
  }
  return null;
}

/**
 * Load stored AI configuration from localStorage
 */
function loadConfig(): StoredConfig | null {
  // First check for embedded config from creator
  const embedded = getEmbeddedConfig();
  if (embedded) {
    return embedded;
  }

  // Otherwise check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[WebAIProvider] Failed to load config:', e);
  }
  return null;
}

/**
 * Save AI configuration to localStorage
 */
function saveConfig(config: StoredConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('[WebAIProvider] Failed to save config:', e);
  }
}

/**
 * Show API key prompt modal
 */
function showApiKeyPrompt(): Promise<StoredConfig | null> {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #1e1e2e;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      color: #fff;
    `;

    modal.innerHTML = `
      <h2 style="margin: 0 0 12px; font-size: 20px;">AI Configuration Required</h2>
      <p style="color: #888; margin: 0 0 20px; font-size: 14px; line-height: 1.5;">
        This story uses AI-powered content. Please configure your API key to continue.
      </p>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #999;">Provider</label>
        <select id="ai-provider" style="width: 100%; padding: 10px 12px; background: #252542; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px;">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="custom">Custom (OpenAI-compatible)</option>
          <option value="local">Local LLM (self-hosted)</option>
        </select>
      </div>

      <div id="ai-baseurl-container" style="margin-bottom: 16px; display: none;">
        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #999;">Base URL</label>
        <input type="text" id="ai-base-url" placeholder="https://api.example.com/v1"
          style="width: 100%; padding: 10px 12px; background: #252542; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box;">
        <p id="ai-baseurl-hint" style="font-size: 11px; color: #666; margin-top: 4px;"></p>
      </div>

      <div id="ai-apikey-container" style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #999;">API Key</label>
        <input type="password" id="ai-api-key" placeholder="Enter your API key"
          style="width: 100%; padding: 10px 12px; background: #252542; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box;">
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #999;">Model (optional)</label>
        <input type="text" id="ai-model" placeholder="Leave empty for default"
          style="width: 100%; padding: 10px 12px; background: #252542; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box;">
      </div>

      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button id="ai-cancel" style="flex: 1; padding: 12px; background: transparent; border: 1px solid #555; border-radius: 6px; color: #ccc; cursor: pointer; font-size: 14px;">
          Skip AI Features
        </button>
        <button id="ai-save" style="flex: 1; padding: 12px; background: #6366f1; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 500;">
          Save & Continue
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle interactions
    const providerSelect = modal.querySelector('#ai-provider') as HTMLSelectElement;
    const baseUrlContainer = modal.querySelector('#ai-baseurl-container') as HTMLDivElement;
    const baseUrlInput = modal.querySelector('#ai-base-url') as HTMLInputElement;
    const baseUrlHint = modal.querySelector('#ai-baseurl-hint') as HTMLParagraphElement;
    const apiKeyContainer = modal.querySelector('#ai-apikey-container') as HTMLDivElement;
    const apiKeyInput = modal.querySelector('#ai-api-key') as HTMLInputElement;
    const modelInput = modal.querySelector('#ai-model') as HTMLInputElement;
    const cancelBtn = modal.querySelector('#ai-cancel') as HTMLButtonElement;
    const saveBtn = modal.querySelector('#ai-save') as HTMLButtonElement;

    // Update UI based on provider
    const updateProviderUI = () => {
      const provider = providerSelect.value;
      const needsBaseUrl = provider === 'custom' || provider === 'local';
      const needsApiKey = provider !== 'local';

      baseUrlContainer.style.display = needsBaseUrl ? 'block' : 'none';
      apiKeyContainer.style.display = needsApiKey ? 'block' : 'none';

      // Update placeholder and hint
      if (provider === 'local') {
        baseUrlInput.placeholder = 'http://localhost:8080/v1';
        baseUrlHint.textContent = 'URL of your local LLM server (llama.cpp, Ollama, etc.)';
      } else {
        baseUrlInput.placeholder = 'https://api.example.com/v1';
        baseUrlHint.textContent = 'OpenAI-compatible API endpoint';
      }
    };

    providerSelect.onchange = updateProviderUI;

    cancelBtn.onclick = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };

    saveBtn.onclick = () => {
      const provider = providerSelect.value as AIProvider;
      const apiKey = apiKeyInput.value.trim();
      const baseUrl = baseUrlInput.value.trim();

      // Validate based on provider
      if (provider === 'local') {
        if (!baseUrl) {
          baseUrlInput.style.borderColor = '#ef4444';
          return;
        }
      } else if (provider === 'custom') {
        if (!apiKey) {
          apiKeyInput.style.borderColor = '#ef4444';
          return;
        }
        if (!baseUrl) {
          baseUrlInput.style.borderColor = '#ef4444';
          return;
        }
      } else {
        if (!apiKey) {
          apiKeyInput.style.borderColor = '#ef4444';
          return;
        }
      }

      const config: StoredConfig = {
        provider,
        apiKey: apiKey || '',
        baseUrl: baseUrl || undefined,
        model: modelInput.value.trim() || undefined,
      };

      saveConfig(config);
      document.body.removeChild(overlay);
      resolve(config);
    };

    // Focus API key input
    setTimeout(() => apiKeyInput.focus(), 100);
  });
}

/**
 * Create an AI service that prompts for API key if not configured
 */
export class WebAIService implements IAIService {
  private config: StoredConfig | null = null;
  private configPromise: Promise<StoredConfig | null> | null = null;

  constructor() {
    this.config = loadConfig();
  }

  private async ensureConfig(): Promise<StoredConfig | null> {
    if (this.config) return this.config;

    // Only show one prompt at a time
    if (!this.configPromise) {
      this.configPromise = showApiKeyPrompt().then(config => {
        this.config = config;
        this.configPromise = null;
        return config;
      });
    }

    return this.configPromise;
  }

  /**
   * Build (and memoize) the shared runtime AI service for the current
   * config. All per-provider orchestration — request bodies with the
   * correct token parameter per model, response parsing, thinking-block
   * stripping, tolerant JSON extraction + repair, image analysis — lives
   * in @asaps/core's runtime adapter, shared with the builder's preview
   * runtimes. This file only owns config storage and the key-prompt UI.
   */
  private service: IAIService | null = null;
  private serviceKey: string | null = null;

  private getService(config: StoredConfig): IAIService {
    const key = `${config.provider}|${config.apiKey}|${(config as EmbeddedConfig).proxyUrl || ''}|${config.baseUrl || ''}|${config.model || ''}`;
    if (this.service && this.serviceKey === key) {
      return this.service;
    }

    const family = config.provider === 'anthropic' ? 'anthropic' as const : 'openai' as const;
    // Relay deployments carry a proxyUrl and no key — the relay injects
    // the key server-side (the "hide your API key" export path).
    const transport = (config as EmbeddedConfig).proxyUrl
      ? createRelayTransport({ endpoint: (config as EmbeddedConfig).proxyUrl!, family })
      : config.provider === 'anthropic'
        ? createDirectAnthropicTransport({ apiKey: config.apiKey ?? '', baseUrl: config.baseUrl })
        // 'openai', 'custom', and 'local' all speak the OpenAI-compatible API.
        : createDirectOpenAITransport({ apiKey: config.apiKey ?? '', baseUrl: config.baseUrl });

    this.service = createRuntimeAIService({
      family: config.provider === 'anthropic' ? 'anthropic' : 'openai',
      model: config.model,
      transport,
      logPrefix: '[WebAIService]',
    });
    this.serviceKey = key;
    return this.service;
  }

  private async requireService(): Promise<IAIService> {
    const config = await this.ensureConfig();
    if (!config) {
      throw new Error('AI not configured - skipping AI content');
    }
    return this.getService(config);
  }

  async generateContent(prompt: string, options?: {
    maxTokens?: number;
    enableWebSearch?: boolean;
  }): Promise<string> {
    const service = await this.requireService();
    return service.generateContent(prompt, options);
  }

  async generateDialog(request: {
    prompt: string;
    format: 'dialogTree';
    maxTurns?: number;
  }): Promise<any> {
    // Pass the prompt directly - AIDialogTreeBeat provides detailed format instructions
    const service = await this.requireService();
    return service.generateDialog(request);
  }

  async generateConversationTurn(request: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ text: string }> {
    const service = await this.requireService();
    // The shared adapter always implements this; the IAIService type marks
    // it optional, hence the assertion.
    return service.generateConversationTurn!(request);
  }

  async classifyContent(prompt: string, categories: string[]): Promise<string> {
    const service = await this.requireService();
    return service.classifyContent(prompt, categories);
  }

  async analyzeImage(
    image: { base64: string; mediaType: string },
    prompt: string,
    options?: { maxTokens?: number }
  ): Promise<string> {
    const service = await this.requireService();
    return service.analyzeImage!(image, prompt, options);
  }
}

/**
 * Check if AI is already configured
 */
export function isAIConfigured(): boolean {
  return loadConfig() !== null;
}

/**
 * Get current AI configuration (without API key for display)
 */
export function getAIConfigStatus(): { configured: boolean; provider?: AIProvider; embedded?: boolean } {
  const embedded = getEmbeddedConfig();
  if (embedded) {
    return { configured: true, provider: embedded.provider, embedded: true };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      return { configured: true, provider: config.provider, embedded: false };
    }
  } catch (e) {
    // Ignore
  }
  return { configured: false };
}

/**
 * Clear stored AI configuration
 */
export function clearAIConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Show AI settings modal (can be called manually from UI)
 */
export function showAISettings(): Promise<boolean> {
  return showApiKeyPrompt().then(config => config !== null);
}
