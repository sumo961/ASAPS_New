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
    // Generate dialog structure using JSON mode
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
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found in response');
    } catch (e) {
      console.error('[AIService] Failed to parse dialog response:', e);
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
}
