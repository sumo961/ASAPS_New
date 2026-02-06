/**
 * Local LLM Provider for Desktop Player
 * Uses embedded llama.cpp via Tauri for local AI inference
 */

import type { IAIService } from '@asaps/core';

export interface ModelInfo {
  name: string;
  path: string;
  size_bytes: number;
  downloaded: boolean;
}

export interface AvailableModel {
  id: string;
  name: string;
  description: string;
  size_gb: number;
  url: string;
  recommended: boolean;
}

export interface DownloadProgress {
  model_id: string;
  bytes_downloaded: number;
  total_bytes: number;
  percent: number;
}

/**
 * Check if embedded AI is available (compiled with feature)
 */
export async function isEmbeddedAIAvailable(): Promise<boolean> {
  if (!window.__TAURI__) return false;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('llm_is_available');
  } catch {
    return false;
  }
}

/**
 * List models available for download
 */
export async function listAvailableModels(): Promise<AvailableModel[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<AvailableModel[]>('llm_list_available_models');
}

/**
 * Check if a model is downloaded
 */
export async function checkModel(modelId: string): Promise<ModelInfo> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ModelInfo>('llm_check_model', { modelId });
}

/**
 * Get the path to a downloaded model
 */
export async function getModelPath(modelId: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('llm_get_model_path', { modelId });
}

/**
 * Download a model with progress tracking
 */
export async function downloadModel(
  modelId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  // Set up progress listener
  let unlisten: (() => void) | undefined;

  if (onProgress) {
    unlisten = await listen<DownloadProgress>('llm-download-progress', (event) => {
      if (event.payload.model_id === modelId) {
        onProgress(event.payload);
      }
    });
  }

  try {
    await invoke('llm_download_model', { modelId });
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}

/**
 * Delete a downloaded model
 */
export async function deleteModel(modelId: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('llm_delete_model', { modelId });
}

/**
 * Generate text using local model
 */
export async function generateText(
  modelId: string,
  prompt: string,
  maxTokens: number = 512
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('llm_generate', { modelId, prompt, maxTokens });
}

/**
 * Local LLM AI Service - implements IAIService using embedded llama.cpp
 */
export class LocalLLMService implements IAIService {
  private modelId: string;

  constructor(modelId: string = 'gemma-3-4b') {
    this.modelId = modelId;
  }

  async generateContent(prompt: string, options?: {
    maxTokens?: number;
    enableWebSearch?: boolean;
  }): Promise<string> {
    const maxTokens = options?.maxTokens || 1000;

    try {
      return await generateText(this.modelId, prompt, maxTokens);
    } catch (error) {
      console.error('[LocalLLMService] Generation failed:', error);
      throw error;
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
    }
  ]
}
Maximum turns: ${request.maxTurns || 5}

Dialog prompt: ${request.prompt}

Respond with ONLY valid JSON, no other text.`;

    const response = await this.generateContent(systemPrompt, { maxTokens: 2000 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found in response');
    } catch (e) {
      console.error('[LocalLLMService] Failed to parse dialog response:', e);
      throw e;
    }
  }

  async classifyContent(prompt: string, categories: string[]): Promise<string> {
    const systemPrompt = `Classify the following content into exactly one of these categories: ${categories.join(', ')}.
Respond with ONLY the category name, nothing else.

Content: ${prompt}`;

    const response = await this.generateContent(systemPrompt, { maxTokens: 50 });

    const trimmed = response.trim();
    const match = categories.find(c => c.toLowerCase() === trimmed.toLowerCase());
    return match || categories[0];
  }
}
