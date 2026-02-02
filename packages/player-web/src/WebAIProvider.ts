/**
 * Web AI Provider for HTML-exported stories
 * Prompts user for API key on first use and stores in localStorage
 */

import type { IAIService } from '@asaps/core';

export type AIProvider = 'openai' | 'anthropic';

interface StoredConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

const STORAGE_KEY = 'asaps-player-ai-config';

/**
 * Load stored AI configuration
 */
function loadConfig(): StoredConfig | null {
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
        </select>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #999;">API Key</label>
        <input type="password" id="ai-api-key" placeholder="Enter your API key"
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
    const apiKeyInput = modal.querySelector('#ai-api-key') as HTMLInputElement;
    const cancelBtn = modal.querySelector('#ai-cancel') as HTMLButtonElement;
    const saveBtn = modal.querySelector('#ai-save') as HTMLButtonElement;

    cancelBtn.onclick = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };

    saveBtn.onclick = () => {
      const apiKey = apiKeyInput.value.trim();
      if (!apiKey) {
        apiKeyInput.style.borderColor = '#ef4444';
        return;
      }

      const config: StoredConfig = {
        provider: providerSelect.value as AIProvider,
        apiKey,
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

    if (config.provider === 'anthropic') {
      return this.callAnthropic(prompt, config.apiKey, options?.maxTokens);
    } else {
      return this.callOpenAI(prompt, config.apiKey, options?.maxTokens);
    }
  }

  async generateDialog(request: {
    prompt: string;
    format: 'dialogTree';
    maxTurns?: number;
  }): Promise<any> {
    const systemPrompt = `You are a dialog writer for interactive fiction. Generate a dialog tree in JSON format.
The structure should be:
{
  "nodes": [
    {
      "id": "start",
      "speaker": "Character Name",
      "text": "What they say",
      "choices": [
        { "text": "Player option 1", "nextId": "node2" },
        { "text": "Player option 2", "nextId": "node3" }
      ]
    },
    ...
  ]
}
Maximum turns: ${request.maxTurns || 5}`;

    const response = await this.generateContent(`${systemPrompt}\n\nDialog prompt: ${request.prompt}`, {
      maxTokens: 2000,
    });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found in response');
    } catch (e) {
      console.error('[WebAIService] Failed to parse dialog response:', e);
      throw e;
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

  private async callOpenAI(prompt: string, apiKey: string, maxTokens?: number): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async callAnthropic(prompt: string, apiKey: string, maxTokens?: number): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
}

/**
 * Check if AI is already configured
 */
export function isAIConfigured(): boolean {
  return loadConfig() !== null;
}

/**
 * Clear stored AI configuration
 */
export function clearAIConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
