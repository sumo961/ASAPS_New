/**
 * Web AI Provider for HTML-exported stories
 * Uses embedded API key if provided by creator, otherwise prompts user
 */

import type { IAIService } from '@asaps/core';
import { effectiveMaxTokens } from '@asaps/core';

export type AIProvider = 'openai' | 'anthropic' | 'custom' | 'local';

interface StoredConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;  // For custom providers
  model?: string;    // Model override
}

// Embedded config from creator (set in window.ASAPS_CONFIG.aiConfig)
interface EmbeddedConfig {
  provider: AIProvider;
  apiKey: string;
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

  async generateContent(prompt: string, options?: {
    maxTokens?: number;
    enableWebSearch?: boolean;
  }): Promise<string> {
    const config = await this.ensureConfig();
    if (!config) {
      throw new Error('AI not configured - skipping AI content');
    }

    // Give reasoning models headroom — the caller's 250-token ask gets eaten
    // by hidden reasoning_content, returning truncated/empty visible content.
    const budget = effectiveMaxTokens(config.model, options?.maxTokens ?? 1024);

    if (config.provider === 'anthropic') {
      return this.callAnthropic(prompt, config.apiKey, budget, config.model, config.baseUrl);
    } else if (config.provider === 'custom' || config.provider === 'local') {
      // Custom and local both use OpenAI-compatible API
      return this.callOpenAI(prompt, config.apiKey || '', budget, config.model, config.baseUrl);
    } else {
      // OpenAI - baseUrl is optional (for proxies/enterprise endpoints)
      return this.callOpenAI(prompt, config.apiKey, budget, config.model, config.baseUrl);
    }
  }

  async generateDialog(request: {
    prompt: string;
    format: 'dialogTree';
    maxTurns?: number;
  }): Promise<any> {
    // Pass the prompt directly - AIDialogTreeBeat provides detailed format instructions
    // Using a minimal system prompt to avoid conflicting format requirements
    const config = await this.ensureConfig();
    if (!config) {
      throw new Error('AI not configured - skipping AI content');
    }

    let response: string;
    const maxTokens = 8192; // Dialog trees with nested nodes need ample room

    if (config.provider === 'anthropic') {
      response = await this.callAnthropicWithSystem(
        'You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.',
        request.prompt,
        maxTokens,
        config.model,
        config.baseUrl,
        config.apiKey
      );
    } else {
      response = await this.callOpenAIWithSystem(
        'You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.',
        request.prompt,
        maxTokens,
        config.model,
        config.baseUrl,
        config.apiKey
      );
    }

    // Strip thinking blocks (e.g. <think>...</think>) that some models produce
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    try {
      const jsonStr = this.extractJSON(response);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[WebAIService] Failed to parse dialog response:', e);
      console.error('[WebAIService] Raw response:', response.substring(0, 500));
      throw new Error('No valid JSON found in response');
    }
  }

  async classifyContent(prompt: string, categories: string[]): Promise<string> {
    const systemPrompt = `Classify the following content into exactly one of these categories: ${categories.join(', ')}.
Respond with ONLY the category name, nothing else.`;

    const response = await this.generateContent(`${systemPrompt}\n\nContent: ${prompt}`, {
      maxTokens: 50,
    });

    const trimmed = response.trim();
    const match = categories.find(c => c.toLowerCase() === trimmed.toLowerCase());
    return match || categories[0];
  }

  async analyzeImage(
    image: { base64: string; mediaType: string },
    prompt: string,
    options?: { maxTokens?: number }
  ): Promise<string> {
    const config = await this.ensureConfig();
    if (!config) {
      throw new Error('AI not configured - skipping AI content');
    }

    const maxTokens = effectiveMaxTokens(config.model, options?.maxTokens ?? 1024);

    if (config.provider === 'anthropic') {
      const url = config.baseUrl
        ? `${config.baseUrl.replace(/\/$/, '')}/messages`
        : 'https://api.anthropic.com/v1/messages';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model || 'claude-sonnet-4-6',
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return (data.content?.[0]?.text || '').trim();
    }

    // OpenAI-compatible (openai / custom / local) — vision via image_url
    // content parts. Local models without vision support return an API
    // error here, which the beat turns into its fallbackValue.
    const url = config.baseUrl
      ? `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-5.2',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_completion_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  private async callOpenAI(
    prompt: string,
    apiKey: string,
    maxTokens?: number,
    model?: string,
    baseUrl?: string
  ): Promise<string> {
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-5.2',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async callAnthropic(
    prompt: string,
    apiKey: string,
    maxTokens?: number,
    model?: string,
    baseUrl?: string
  ): Promise<string> {
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/messages`
      : 'https://api.anthropic.com/v1/messages';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  private async callOpenAIWithSystem(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    model?: string,
    baseUrl?: string,
    apiKey?: string
  ): Promise<string> {
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || ''}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-5.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async callAnthropicWithSystem(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    model?: string,
    baseUrl?: string,
    apiKey?: string
  ): Promise<string> {
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/messages`
      : 'https://api.anthropic.com/v1/messages';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  /**
   * Extract JSON object from text, handling markdown code blocks and extra content
   */
  private extractJSON(text: string): string {
    // Strip markdown code blocks
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      lines.shift(); // Remove opening ```json or ```
      while (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) {
        lines.pop();
      }
      cleaned = lines.join('\n').trim();
    }

    const jsonStart = cleaned.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('No JSON object found in response');
    }

    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = jsonStart; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return cleaned.substring(jsonStart, i + 1);
          }
        }
      }
    }

    // If we didn't find a complete match, return from jsonStart to end
    return cleaned.substring(jsonStart);
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
