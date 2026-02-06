/**
 * AI Service implementation for Mobile Player
 * Implements the IAIService interface using configured API provider
 */

import type { IAIService } from '@asaps/core';
import type { AISettings } from './AIConfig';
import { getProviderBaseUrl, getDefaultModel } from './AIConfig';

export class MobileAIService implements IAIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  async generateContent(prompt: string, options?: {
    maxTokens?: number;
    enableWebSearch?: boolean;
  }): Promise<string> {
    const { provider, apiKey, model } = this.settings;
    const baseUrl = getProviderBaseUrl(this.settings);
    const modelToUse = model || getDefaultModel(provider);

    if (!apiKey) {
      throw new Error('AI API key not configured. Please configure in Settings.');
    }

    if (provider === 'anthropic') {
      return this.callAnthropic(prompt, modelToUse, apiKey, options?.maxTokens);
    } else {
      // OpenAI and custom providers use OpenAI-compatible API
      return this.callOpenAI(prompt, baseUrl, modelToUse, apiKey, options?.maxTokens);
    }
  }

  async generateDialog(request: {
    prompt: string;
    format: 'dialogTree';
    maxTurns?: number;
  }): Promise<any> {
    // Pass the prompt directly - AIDialogTreeBeat provides detailed format instructions
    const { provider, apiKey, model } = this.settings;
    const baseUrl = getProviderBaseUrl(this.settings);
    const modelToUse = model || getDefaultModel(provider);
    const systemPrompt = 'You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.';
    const maxTokens = 8192;

    let response: string;
    if (provider === 'anthropic') {
      response = await this.callAnthropicWithSystem(systemPrompt, request.prompt, modelToUse, apiKey, maxTokens);
    } else {
      response = await this.callOpenAIWithSystem(systemPrompt, request.prompt, baseUrl, modelToUse, apiKey, maxTokens);
    }

    // Strip thinking blocks that some models produce
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    try {
      const jsonStr = this.extractJSON(response);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[AIService] Failed to parse dialog response:', e);
      console.error('[AIService] Raw response:', response.substring(0, 500));
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
    // Find matching category (case-insensitive)
    const match = categories.find(c => c.toLowerCase() === trimmed.toLowerCase());
    return match || categories[0];
  }

  private async callOpenAI(
    prompt: string,
    baseUrl: string,
    model: string,
    apiKey: string,
    maxTokens?: number
  ): Promise<string> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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

  private async callAnthropic(
    prompt: string,
    model: string,
    apiKey: string,
    maxTokens?: number
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
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
    baseUrl: string,
    model: string,
    apiKey: string,
    maxTokens: number
  ): Promise<string> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
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
    model: string,
    apiKey: string,
    maxTokens: number
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
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

  private extractJSON(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      lines.shift();
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
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) return cleaned.substring(jsonStart, i + 1);
        }
      }
    }

    return cleaned.substring(jsonStart);
  }
}
