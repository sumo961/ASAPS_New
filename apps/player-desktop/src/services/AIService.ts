/**
 * AI Service implementation for Desktop Player
 *
 * Delegates to @asaps/core's shared runtime adapter — the same request
 * building and reply parsing the builder's preview and the exported web
 * player use (thinking settings per model, structured replies, text-block
 * extraction, JSON repair, conversation turns, image analysis). This file
 * only maps the player's saved settings onto it.
 */

import {
  createRuntimeAIService,
  createDirectAnthropicTransport,
  createDirectOpenAITransport,
  type IAIService,
} from '@asaps/core';
import type { AISettings } from './AIConfig';
import { getProviderBaseUrl, getDefaultModel } from './AIConfig';

export class DesktopAIService implements IAIService {
  private readonly service: IAIService;
  private readonly hasKey: boolean;

  constructor(settings: AISettings) {
    const model = settings.model || getDefaultModel(settings.provider);
    this.hasKey = !!settings.apiKey;
    this.service = settings.provider === 'anthropic'
      ? createRuntimeAIService({
          family: 'anthropic',
          model,
          // Official endpoint (no baseUrl): lets the transport opt into
          // server-side refusal fallbacks for the models that have them.
          transport: createDirectAnthropicTransport({ apiKey: settings.apiKey }),
          logPrefix: '[DesktopAIService]',
        })
      : createRuntimeAIService({
          family: 'openai',
          model,
          transport: createDirectOpenAITransport({ apiKey: settings.apiKey, baseUrl: getProviderBaseUrl(settings) || undefined }),
          logPrefix: '[DesktopAIService]',
        });
  }

  private ready(): IAIService {
    if (!this.hasKey) throw new Error('AI API key not configured. Please configure in Settings.');
    return this.service;
  }

  generateContent(prompt: string, options?: { maxTokens?: number; enableWebSearch?: boolean; schema?: Record<string, unknown> }): Promise<string> {
    return this.ready().generateContent(prompt, options);
  }

  generateDialog(request: { prompt: string; format: 'dialogTree'; maxTurns?: number }): Promise<any> {
    return this.ready().generateDialog(request);
  }

  classifyContent(prompt: string, categories: string[]): Promise<string> {
    return this.ready().classifyContent(prompt, categories);
  }

  generateConversationTurn(request: { systemPrompt: string; messages: Array<{ role: string; content: string }>; schema?: Record<string, unknown> }): Promise<{ text: string }> {
    return this.ready().generateConversationTurn!(request);
  }

  analyzeImage(image: { base64: string; mediaType: string }, prompt: string, options?: { maxTokens?: number }): Promise<string> {
    return this.ready().analyzeImage!(image, prompt, options);
  }
}
