/**
 * StoryTranslator - AI-powered story content translation
 *
 * Extracts translatable strings from project data, sends them to an AI provider
 * for batch translation, and applies the translations back to create a translated
 * copy of the project data.
 */

import type { AIProvider } from './HtmlExporter';
import type {
  TranslationResource,
  TranslationEntry,
  TranslationManifest,
  TextDirection,
} from '@asaps/core';
import {
  createEmptyResource,
  buildManifestEntry,
  createEmptyTranslationManifest,
  computeSourceHash,
  isRTLLanguage,
  detectFontsForTranslation,
  syncTranslation,
  applySyncResult,
} from '@asaps/core';

export interface TranslationAIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface TranslationProgress {
  currentLanguage: string;
  languageIndex: number;
  totalLanguages: number;
  stringsTranslated: number;
  totalStrings: number;
}

type ProgressCallback = (progress: TranslationProgress) => void;

/**
 * Maximum strings per AI translation request to avoid token limits
 */
const BATCH_SIZE = 80;

/**
 * Keys that indicate UI elements which should be translated concisely (single words where possible).
 */
const UI_ELEMENT_PATTERNS = [
  'buttonText', 'restartText', 'creditsText', 'creditsCloseText', 'clearButtonText', 'placeholder',
];

/**
 * Extract translatable strings from project data.
 * Returns a flat map of JSON-path keys to text values.
 * Paths are rooted at the projectData object (e.g., "project.story.beats.0.parameters.text").
 */
export function extractTranslatableStrings(projectData: any): Record<string, string> {
  const strings: Record<string, string> = {};

  // Story metadata
  const story = projectData.project?.story;
  if (!story) return strings;

  // Paths must include "project.story." prefix so applyTranslations can resolve them
  const P = 'project.story';

  if (story.metadata?.title) {
    strings[`${P}.metadata.title`] = story.metadata.title;
  }

  // Character names, counter displayNames, and inventory item labels
  const characters = story.characters;
  if (Array.isArray(characters)) {
    for (let i = 0; i < characters.length; i++) {
      if (characters[i].name) {
        strings[`${P}.characters.${i}.name`] = characters[i].name;
      }
      if (characters[i].displayName) {
        strings[`${P}.characters.${i}.displayName`] = characters[i].displayName;
      }
      // Counter display names (NOT counter.name — that's an internal identifier)
      const counters = characters[i].counters;
      if (Array.isArray(counters)) {
        for (let j = 0; j < counters.length; j++) {
          if (counters[j].displayName) {
            strings[`${P}.characters.${i}.counters.${j}.displayName`] = counters[j].displayName;
          }
        }
      }
      // Inventory item display names and descriptions (NOT item.name — that's an internal identifier)
      // Always create a displayName translation: use existing displayName or derive from name
      const inventory = characters[i].inventory;
      if (Array.isArray(inventory)) {
        for (let j = 0; j < inventory.length; j++) {
          const displaySource = inventory[j].displayName || inventory[j].name;
          if (displaySource) {
            strings[`${P}.characters.${i}.inventory.${j}.displayName`] = displaySource;
          }
          if (inventory[j].description) {
            strings[`${P}.characters.${i}.inventory.${j}.description`] = inventory[j].description;
          }
        }
      }
    }
  }

  // HUD overlay labels
  const globalSettings = projectData.project?.globalSettings;
  const hudOverlays = globalSettings?.hudOverlays;
  if (hudOverlays) {
    const G = 'project.globalSettings.hudOverlays';
    if (hudOverlays.timerHud?.label) {
      strings[`${G}.timerHud.label`] = hudOverlays.timerHud.label;
    }
    if (hudOverlays.timerHud?.staticText) {
      strings[`${G}.timerHud.staticText`] = hudOverlays.timerHud.staticText;
    }
    if (hudOverlays.countdownMeter?.label) {
      strings[`${G}.countdownMeter.label`] = hudOverlays.countdownMeter.label;
    }
  }

  // Environment node/prop names
  const environment = story.environment;
  if (environment) {
    if (Array.isArray(environment.nodes)) {
      for (let i = 0; i < environment.nodes.length; i++) {
        const node = environment.nodes[i];
        if (node.name) strings[`${P}.environment.nodes.${i}.name`] = node.name;
        if (Array.isArray(node.props)) {
          for (let j = 0; j < node.props.length; j++) {
            if (node.props[j].name) {
              strings[`${P}.environment.nodes.${i}.props.${j}.name`] = node.props[j].name;
            }
          }
        }
      }
    }
  }

  // Beats
  const beats = story.beats;
  if (!Array.isArray(beats)) return strings;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const prefix = `${P}.beats.${i}`;
    extractBeatStrings(beat, prefix, strings);
  }

  return strings;
}

/**
 * Extract source strings for a single beat using ID-based keys.
 * Returns a flat map like { "beat:abc123.parameters.text": "Hello" }.
 * Used for incremental staleness detection after editing a beat.
 */
export function extractBeatSourceStrings(beat: any, beatId: string): Record<string, string> {
  const strings: Record<string, string> = {};
  const prefix = `beat:${beatId}`;
  extractBeatStrings(beat, prefix, strings);
  return strings;
}

/**
 * Extract translatable strings from a single beat based on its type.
 */
function extractBeatStrings(beat: any, prefix: string, strings: Record<string, string>): void {
  const params = beat.parameters || beat;
  const type = beat.type || '';

  // Speaker name (top-level beat property, not inside parameters).
  // Skip for dialogTree — speaker lives in parameters.dialogTree.speaker
  // and is extracted separately below.
  if (beat.speaker && typeof beat.speaker === 'string' && type !== 'dialogTree') {
    strings[`${prefix}.speaker`] = beat.speaker;
  }

  // Common text fields present on many beat types
  const isAiBeat = type.startsWith('ai');
  const commonFields = ['text', 'buttonText', 'prompt', 'question', 'message', 'title', 'author'];
  for (const field of commonFields) {
    // Skip 'prompt' for AI beats — it's a system instruction, not user-facing text
    if (field === 'prompt' && isAiBeat) continue;
    if (params[field] && typeof params[field] === 'string') {
      strings[`${prefix}.parameters.${field}`] = params[field];
    }
  }

  // Text variations
  if (Array.isArray(params.textVariations)) {
    for (let j = 0; j < params.textVariations.length; j++) {
      if (typeof params.textVariations[j] === 'string') {
        strings[`${prefix}.parameters.textVariations.${j}`] = params.textVariations[j];
      }
    }
  }

  // Type-specific fields
  switch (type) {
    case 'dialogTree':
      extractDialogTreeStrings(params, prefix, strings);
      break;

    case 'movementChoice':
      if (Array.isArray(params.choices)) {
        for (let j = 0; j < params.choices.length; j++) {
          const choice = params.choices[j];
          // Translate into displayText (NOT text itself — it's used as a matching key
          // for locations[].name in the renderer). Use existing displayText if author set one.
          // Fallback chain: displayText → text → location (text can be null in ASML imports)
          const choiceLabel = choice.displayText || choice.text || choice.location;
          if (choiceLabel) strings[`${prefix}.parameters.choices.${j}.displayText`] = choiceLabel;
        }
      }
      break;

    case 'pickProp':
      if (Array.isArray(params.props)) {
        for (let j = 0; j < params.props.length; j++) {
          const prop = params.props[j];
          // Translate into displayName (NOT name itself — it's a matching key for
          // locations[].name and connections[].label). Use existing displayName if author set one.
          const propLabel = prop.displayName || prop.name;
          if (propLabel) strings[`${prefix}.parameters.props.${j}.displayName`] = propLabel;
          if (prop.description) strings[`${prefix}.parameters.props.${j}.description`] = prop.description;
        }
      }
      break;

    case 'endScreen':
      if (params.restartText) strings[`${prefix}.parameters.restartText`] = params.restartText;
      if (params.creditsText) strings[`${prefix}.parameters.creditsText`] = params.creditsText;
      if (params.creditsPageTitle) strings[`${prefix}.parameters.creditsPageTitle`] = params.creditsPageTitle;
      if (params.creditsPageBody) strings[`${prefix}.parameters.creditsPageBody`] = params.creditsPageBody;
      if (params.creditsCloseText) strings[`${prefix}.parameters.creditsCloseText`] = params.creditsCloseText;
      break;

    case 'inputText':
      if (params.placeholder) strings[`${prefix}.parameters.placeholder`] = params.placeholder;
      break;

    case 'keypad':
      if (params.clearButtonText) strings[`${prefix}.parameters.clearButtonText`] = params.clearButtonText;
      break;

    case 'hyperText':
      if (Array.isArray(params.hyperlinks)) {
        for (let j = 0; j < params.hyperlinks.length; j++) {
          if (params.hyperlinks[j].word) {
            strings[`${prefix}.parameters.hyperlinks.${j}.word`] = params.hyperlinks[j].word;
          }
        }
      }
      break;

    case 'panorama':
      if (Array.isArray(params.hotspots)) {
        for (let j = 0; j < params.hotspots.length; j++) {
          const hotspot = params.hotspots[j];
          const label = hotspot.displayText || hotspot.text;
          if (label) strings[`${prefix}.parameters.hotspots.${j}.displayText`] = label;
        }
      }
      break;

    case 'aiInfoText':
    case 'aiDurScreen':
      // Translate fallback text but NOT the AI prompt (prompts stay in original language)
      if (params.fallbackText) strings[`${prefix}.parameters.fallbackText`] = params.fallbackText;
      break;

    case 'onlineContent':
      if (params.displayTemplate) strings[`${prefix}.parameters.displayTemplate`] = params.displayTemplate;
      if (params.errorMessage) strings[`${prefix}.parameters.errorMessage`] = params.errorMessage;
      break;

    case 'aiSummary':
      if (params.title) strings[`${prefix}.parameters.title`] = params.title;
      if (params.restartText) strings[`${prefix}.parameters.restartText`] = params.restartText;
      if (params.creditsText) strings[`${prefix}.parameters.creditsText`] = params.creditsText;
      if (params.creditsPageTitle) strings[`${prefix}.parameters.creditsPageTitle`] = params.creditsPageTitle;
      if (params.creditsPageBody) strings[`${prefix}.parameters.creditsPageBody`] = params.creditsPageBody;
      if (params.creditsCloseText) strings[`${prefix}.parameters.creditsCloseText`] = params.creditsCloseText;
      break;

    case 'aiDialogTree':
      if (params.npcName) strings[`${prefix}.parameters.npcName`] = params.npcName;
      break;
  }
}

/**
 * Extract translatable strings from a dialog tree structure (recursive).
 */
function extractDialogTreeStrings(params: any, prefix: string, strings: Record<string, string>): void {
  const dialogTree = params.dialogTree;
  if (!dialogTree) return;

  function walkNode(node: any, path: string): void {
    if (!node) return;
    if (node.speaker) strings[`${path}.speaker`] = node.speaker;
    if (node.text) strings[`${path}.text`] = node.text;

    if (Array.isArray(node.choices)) {
      for (let i = 0; i < node.choices.length; i++) {
        const choice = node.choices[i];
        if (choice.text) strings[`${path}.choices.${i}.text`] = choice.text;
        if (choice.dialogNode) {
          walkNode(choice.dialogNode, `${path}.choices.${i}.dialogNode`);
        }
      }
    }
  }

  walkNode(dialogTree, `${prefix}.parameters.dialogTree`);
}

/**
 * Apply translated strings back to a deep clone of the project data.
 * Uses positional keys (e.g., "project.story.beats.0.parameters.text").
 */
export function applyTranslations(projectData: any, translations: Record<string, string>): any {
  const translated = JSON.parse(JSON.stringify(projectData));

  for (const [path, value] of Object.entries(translations)) {
    setNestedValue(translated, path, value);
  }

  return translated;
}

/**
 * Set a value at a dot-separated JSON path.
 */
function setNestedValue(obj: any, path: string, value: string): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    // Handle array indices
    const index = Number(key);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = current?.[key];
    }
    if (current === undefined || current === null) return;
  }

  const lastKey = parts[parts.length - 1];
  const lastIndex = Number(lastKey);
  if (!isNaN(lastIndex) && Array.isArray(current)) {
    current[lastIndex] = value;
  } else if (current && typeof current === 'object') {
    current[lastKey] = value;
  }
}

/**
 * Analyze the story narrative to provide translation context.
 * Makes one AI call to determine genre, tone, setting, and style.
 */
export async function analyzeNarrative(
  projectData: any,
  aiConfig: TranslationAIConfig,
  signal?: AbortSignal
): Promise<string> {
  const story = projectData.project?.story;
  if (!story) return '';

  // Collect a sample of story content for analysis
  const sampleParts: string[] = [];

  if (story.metadata?.title) {
    sampleParts.push(`Title: ${story.metadata.title}`);
  }
  if (story.metadata?.author) {
    sampleParts.push(`Author: ${story.metadata.author}`);
  }

  // Character names, roles, and descriptions
  if (Array.isArray(story.characters)) {
    const charDescriptions = story.characters.map((c: any) => {
      let desc = c.name || c.displayName || '(unnamed)';
      if (c.role) desc += ` (role: ${c.role})`;
      if (c.description) desc += ` — ${c.description}`;
      return desc;
    }).filter(Boolean);
    if (charDescriptions.length > 0) {
      sampleParts.push(`Characters:\n${charDescriptions.join('\n')}`);
    }
  }

  // First several beat texts (narrative sample)
  if (Array.isArray(story.beats)) {
    let textCount = 0;
    for (const beat of story.beats) {
      if (textCount >= 6) break;
      const params = beat.parameters || beat;
      if (params.text && typeof params.text === 'string') {
        sampleParts.push(`Beat text: ${params.text.substring(0, 300)}`);
        textCount++;
      }
      if (params.message && typeof params.message === 'string') {
        sampleParts.push(`Message: ${params.message.substring(0, 200)}`);
        textCount++;
      }
    }
  }

  if (sampleParts.length < 2) {
    return ''; // Not enough content to analyze
  }

  const systemPrompt = 'You are a literary analyst. Analyze the following sample content from an interactive story/game and provide a brief narrative profile to guide translators. Include:\n1. Genre, tone/mood, setting/time period, target audience, and writing style (2-3 sentences)\n2. For EACH character, state their gender (male/female/non-binary/unknown) and a one-line description of who they are. This is critical for languages with grammatical gender (German, French, Spanish, etc.) where pronouns, articles, and adjective endings depend on gender.\n\nBe concise and specific.';
  const userMessage = sampleParts.join('\n\n');

  try {
    const { provider, apiKey, baseUrl, model } = aiConfig;
    let response: string;
    if (provider === 'anthropic') {
      response = await callAnthropic(systemPrompt, userMessage, apiKey!, baseUrl, model, signal);
    } else {
      response = await callOpenAI(systemPrompt, userMessage, provider, apiKey, baseUrl, model, signal, false);
    }
    console.log('[StoryTranslator] Narrative analysis:', response.trim());
    return response.trim();
  } catch (e) {
    console.warn('[StoryTranslator] Narrative analysis failed, proceeding without context:', e);
    return '';
  }
}

/**
 * Check if a string key represents a UI element that should be kept concise.
 */
function isUIElement(key: string): boolean {
  return UI_ELEMENT_PATTERNS.some(pattern => key.includes(pattern));
}

/**
 * Build character context string from project data for grammatical gender guidance.
 * The narrative analysis provides genre/tone, but this provides explicit character info
 * directly in the translation prompt to ensure correct gender agreement.
 */
function buildCharacterContext(projectData: any): string {
  const story = projectData.project?.story;
  if (!story) return '';

  const lines: string[] = [];

  // Characters defined in the character system
  if (Array.isArray(story.characters)) {
    for (const char of story.characters) {
      const name = char.displayName || char.name;
      if (!name) continue;
      let line = `- ${name}`;
      if (char.role) line += ` (${char.role})`;
      if (char.description) line += `: ${char.description}`;
      lines.push(line);
    }
  }

  // Also scan dialog tree speakers for characters not in the character list
  const knownNames = new Set(
    (story.characters || []).map((c: any) => (c.displayName || c.name || '').toLowerCase())
  );
  if (Array.isArray(story.beats)) {
    for (const beat of story.beats) {
      const params = beat.parameters || beat;
      if (params.dialogTree?.speaker && !knownNames.has(params.dialogTree.speaker.toLowerCase())) {
        knownNames.add(params.dialogTree.speaker.toLowerCase());
        lines.push(`- ${params.dialogTree.speaker} (speaker in dialog)`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

/**
 * Build the translation system prompt with narrative context and conciseness guidance.
 */
function buildTranslationPrompt(
  targetLanguage: string,
  narrativeContext: string,
  batch: Record<string, string>,
  characterContext?: string
): string {
  const hasUIElements = Object.keys(batch).some(isUIElement);

  let prompt = `You are a professional literary translator specializing in interactive fiction and games. Translate the following content to ${targetLanguage}.`;

  // Add narrative context if available
  if (narrativeContext) {
    prompt += `\n\nNarrative context for this story:\n${narrativeContext}\n\nUse this context to inform your translation choices — match the tone, register, and style of the original work. Produce natural, fluent ${targetLanguage} that reads as if originally written in that language, not a word-for-word translation.`;
  } else {
    prompt += ` Produce natural, fluent ${targetLanguage} that reads as if originally written in that language.`;
  }

  // Add character gender/role context for grammatically gendered languages
  if (characterContext) {
    prompt += `\n\nCharacter reference (use correct grammatical gender for pronouns, articles, adjective endings, and prepositions):\n${characterContext}`;
  }

  // Add conciseness guidance for UI elements
  if (hasUIElements) {
    prompt += `\n\nIMPORTANT — Conciseness for UI elements: Keys containing "buttonText", "restartText", "creditsText", "clearButtonText", or "placeholder" are UI labels/buttons. These MUST be kept very short — use a single word where the target language allows it (e.g., "Continue" → "weiter" in German, "continuar" in Spanish; "Restart" → "Neustart"/"Reiniciar"). Do NOT use verbose multi-word phrases for buttons.`;
  }

  // Add guidance for speaker names
  const hasSpeakerKeys = Object.keys(batch).some(k => k.endsWith('.speaker'));
  if (hasSpeakerKeys) {
    prompt += `\n\nKeys ending with ".speaker" are character names or nicknames used in dialog. Translate them naturally (e.g., "Gran" → "Oma" in German, "Grandma" → "Abuela" in Spanish) or keep them as-is if they are proper names.`;
  }

  prompt += `\n\nRules:\n- Preserve all HTML tags exactly as they are\n- Preserve all {{variable}} references and template syntax exactly\n- Preserve any formatting markers\n- Return ONLY a valid JSON object with the same keys and translated values\n- Do not add any explanation or commentary`;

  return prompt;
}

/**
 * Call AI provider to translate a batch of strings.
 */
async function translateBatch(
  batch: Record<string, string>,
  targetLanguage: string,
  aiConfig: TranslationAIConfig,
  signal?: AbortSignal,
  narrativeContext?: string,
  characterContext?: string
): Promise<Record<string, string>> {
  const { provider, apiKey, baseUrl, model } = aiConfig;

  const systemPrompt = buildTranslationPrompt(targetLanguage, narrativeContext || '', batch, characterContext);

  const userMessage = JSON.stringify(batch, null, 2);

  let responseText: string;

  if (provider === 'anthropic') {
    responseText = await callAnthropic(systemPrompt, userMessage, apiKey!, baseUrl, model, signal);
  } else {
    // openai, custom, and local all use OpenAI-compatible API
    responseText = await callOpenAI(systemPrompt, userMessage, provider, apiKey, baseUrl, model, signal);
  }

  // Parse the JSON response
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Validate that all keys from the batch are present
    const result: Record<string, string> = {};
    for (const key of Object.keys(batch)) {
      const value = typeof parsed[key] === 'string' ? parsed[key] : batch[key];
      result[key] = value;
    }
    return result;
  } catch (e) {
    console.error('[StoryTranslator] Failed to parse AI response:', cleaned.substring(0, 200));
    throw new Error(`Failed to parse translation response: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
  }
}

/**
 * Call Anthropic Messages API directly.
 */
async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  baseUrl?: string,
  model?: string,
  signal?: AbortSignal
): Promise<string> {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Call OpenAI-compatible Chat Completions API.
 */
async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  provider: AIProvider,
  apiKey?: string,
  baseUrl?: string,
  model?: string,
  signal?: AbortSignal,
  jsonMode: boolean = true
): Promise<string> {
  let url: string;
  if (baseUrl) {
    url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  } else if (provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
  } else {
    throw new Error('Base URL is required for custom/local AI provider');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body: any = {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`AI API error ${response.status}: ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Translate an entire story project to a target language.
 *
 * @param projectData - The full project JSON (as exported in project.json)
 * @param targetLanguage - Target language name (e.g., "Spanish", "German")
 * @param aiConfig - AI provider configuration
 * @param onProgress - Progress callback
 * @param signal - AbortSignal for cancellation
 * @returns A translated deep clone of the project data
 */
export async function translateStory(
  projectData: any,
  targetLanguage: string,
  aiConfig: TranslationAIConfig,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  narrativeContext?: string
): Promise<any> {
  // 1. Extract all translatable strings
  const allStrings = extractTranslatableStrings(projectData);
  const keys = Object.keys(allStrings);
  const totalStrings = keys.length;

  if (totalStrings === 0) {
    // Nothing to translate, return a clone
    return JSON.parse(JSON.stringify(projectData));
  }

  // Log extraction diagnostics for display fields
  const displayFieldKeys = keys.filter(k => k.includes('displayText') || k.includes('displayName'));
  console.log(`[StoryTranslator] Translating ${totalStrings} strings to ${targetLanguage}`);
  console.log(`[StoryTranslator] Display fields extracted: ${displayFieldKeys.length}`, displayFieldKeys.map(k => `${k} = "${allStrings[k]}"`));

  // 2. Analyze narrative context if not already provided (first language in a batch)
  let context = narrativeContext;
  if (context === undefined) {
    console.log('[StoryTranslator] Analyzing narrative for translation context...');
    context = await analyzeNarrative(projectData, aiConfig, signal);
  }

  // 2b. Build character context for grammatical gender
  const charContext = buildCharacterContext(projectData);
  if (charContext) {
    console.log('[StoryTranslator] Character context:', charContext);
  }

  // 3. Batch strings and translate
  const allTranslations: Record<string, string> = {};
  let translated = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new DOMException('Translation cancelled', 'AbortError');
    }

    const batchKeys = keys.slice(i, i + BATCH_SIZE);
    const batch: Record<string, string> = {};
    for (const key of batchKeys) {
      batch[key] = allStrings[key];
    }

    const batchTranslations = await translateBatch(batch, targetLanguage, aiConfig, signal, context, charContext);
    Object.assign(allTranslations, batchTranslations);

    translated += batchKeys.length;
    onProgress?.({
      currentLanguage: targetLanguage,
      languageIndex: 0, // Caller sets this
      totalLanguages: 1, // Caller sets this
      stringsTranslated: translated,
      totalStrings,
    });
  }

  // 4. Apply translations to a deep clone
  const displayTranslations = Object.entries(allTranslations).filter(([k]) => k.includes('displayText') || k.includes('displayName'));
  console.log(`[StoryTranslator] Applying ${Object.keys(allTranslations).length} translations for ${targetLanguage}`);
  console.log(`[StoryTranslator] Display field translations:`, displayTranslations.map(([k, v]) => `${k} = "${v}"`));
  const result = applyTranslations(projectData, allTranslations);

  // Verify display fields were applied
  const story = result.project?.story;
  if (story?.beats) {
    for (let i = 0; i < story.beats.length; i++) {
      const beat = story.beats[i];
      const params = beat.parameters;
      if (beat.type === 'movementChoice' && params?.choices) {
        const displayTexts = params.choices.map((c: any) => ({ text: c.text, displayText: c.displayText }));
        console.log(`[StoryTranslator] Beat ${i} (movementChoice) choices:`, displayTexts);
      }
      if (beat.type === 'pickProp' && params?.props) {
        const displayNames = params.props.map((p: any) => ({ name: p.name, displayName: p.displayName }));
        console.log(`[StoryTranslator] Beat ${i} (pickProp) props:`, displayNames);
      }
    }
  }

  console.log(`[StoryTranslator] Translation to ${targetLanguage} complete`);
  return result;
}

// ============================================================================
// ID-Based Key Generation
// ============================================================================

/**
 * Convert positional keys (used by extractTranslatableStrings) to ID-based keys.
 * Positional: "project.story.beats.0.parameters.text"
 * ID-based:   "beat:{beatId}.parameters.text"
 *
 * Non-beat strings (characters, metadata, etc.) keep their positional keys
 * since they don't have beat IDs.
 *
 * @param positionalStrings - Strings with positional keys from extractTranslatableStrings()
 * @param projectData - The project data (needed to look up beat IDs by index)
 * @returns Record with ID-based keys
 */
export function positionalToIdBased(
  positionalStrings: Record<string, string>,
  projectData: any
): Record<string, string> {
  const beats = projectData.project?.story?.beats;
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(positionalStrings)) {
    const idKey = convertKeyToIdBased(key, beats);
    result[idKey] = value;
  }

  return result;
}

/**
 * Convert ID-based keys back to positional keys for use with applyTranslations().
 *
 * @param idBasedStrings - Strings with ID-based keys
 * @param projectData - The project data (needed to find beat indices)
 * @returns Record with positional keys
 */
export function idBasedToPositional(
  idBasedStrings: Record<string, string>,
  projectData: any
): Record<string, string> {
  const beats = projectData.project?.story?.beats;
  if (!Array.isArray(beats)) return { ...idBasedStrings };

  // Build ID → index map
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < beats.length; i++) {
    const id = beats[i].id ?? String(i);
    idToIndex.set(String(id), i);
  }

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(idBasedStrings)) {
    const match = key.match(/^beat:([^.]+)\.(.+)$/);
    if (match) {
      const beatId = match[1];
      const suffix = match[2];
      const index = idToIndex.get(beatId);
      if (index !== undefined) {
        result[`project.story.beats.${index}.${suffix}`] = value;
      }
      // If beat not found (deleted), skip it
    } else {
      // Non-beat key — pass through as-is
      result[key] = value;
    }
  }

  return result;
}

/**
 * Convert a single positional key to ID-based format.
 */
function convertKeyToIdBased(key: string, beats: any[] | undefined): string {
  if (!Array.isArray(beats)) return key;

  // Match pattern: project.story.beats.{index}.{rest}
  const match = key.match(/^project\.story\.beats\.(\d+)\.(.+)$/);
  if (!match) return key; // Not a beat key — keep as-is

  const beatIndex = parseInt(match[1], 10);
  const suffix = match[2];

  if (beatIndex < beats.length) {
    const beatId = beats[beatIndex].id ?? String(beatIndex);
    return `beat:${beatId}.${suffix}`;
  }

  return key; // Index out of range — keep as-is
}

// ============================================================================
// Translation Resource Generation
// ============================================================================

/**
 * Generate a TranslationResource by AI-translating the entire story.
 * This is the batch AI translation path: translates all strings upfront.
 *
 * @param projectData - The full project JSON
 * @param languageCode - BCP 47 language code (e.g., 'de', 'fr', 'ar')
 * @param languageName - Human-readable language name (e.g., 'German', 'French')
 * @param aiConfig - AI provider configuration
 * @param onProgress - Progress callback
 * @param signal - AbortSignal for cancellation
 * @returns A complete TranslationResource
 */
export async function generateTranslationResource(
  projectData: any,
  languageCode: string,
  languageName: string,
  aiConfig: TranslationAIConfig,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<TranslationResource> {
  const direction: TextDirection = isRTLLanguage(languageCode) ? 'rtl' : 'ltr';

  // 1. Extract source strings (positional keys)
  const positionalStrings = extractTranslatableStrings(projectData);

  // 2. Convert to ID-based keys
  const idBasedSource = positionalToIdBased(positionalStrings, projectData);

  // 3. AI-translate the story using existing batch infrastructure
  // translateStory works with positional keys, so we use it and then map the results
  const translatedData = await translateStory(
    projectData,
    languageName,
    aiConfig,
    onProgress,
    signal
  );

  // 4. Extract translated strings from the result (positional)
  const translatedPositional = extractTranslatableStrings(translatedData);

  // 5. Convert translated positional to ID-based using ORIGINAL project data
  //    (beat IDs haven't changed, but we need the original index→ID mapping)
  const idBasedTranslated = positionalToIdBased(translatedPositional, projectData);

  // 6. Build the TranslationResource
  const resource = createEmptyResource(languageCode, languageName, direction);
  resource.origin = 'ai';
  resource.sourceHash = computeSourceHash(idBasedSource);
  resource._sourceSnapshot = idBasedSource;

  // Build entries
  for (const [key, sourceValue] of Object.entries(idBasedSource)) {
    const translatedValue = idBasedTranslated[key];
    resource.strings[key] = {
      value: translatedValue ?? sourceValue,
      status: translatedValue ? 'translated' : 'untranslated',
    };
  }

  // Detect required fonts from translated text
  const translatedValues: Record<string, string> = {};
  for (const [key, entry] of Object.entries(resource.strings)) {
    translatedValues[key] = entry.value;
  }
  resource.requiredFonts = detectFontsForTranslation(translatedValues);

  console.log(`[StoryTranslator] Generated translation resource for ${languageName} (${languageCode}): ${Object.keys(resource.strings).length} strings`);
  if (resource.requiredFonts.length > 0) {
    console.log(`[StoryTranslator] Required fonts: ${resource.requiredFonts.join(', ')}`);
  }

  return resource;
}

/**
 * Incrementally update a TranslationResource by AI-retranslating only stale and
 * untranslated strings. Already-translated strings are preserved as-is.
 *
 * @param projectData - The full project JSON
 * @param existingResource - The translation resource to update
 * @param aiConfig - AI provider configuration
 * @param onProgress - Progress callback
 * @param signal - AbortSignal for cancellation
 * @returns An updated TranslationResource with stale/new strings retranslated
 */
export async function updateTranslationResource(
  projectData: any,
  existingResource: TranslationResource,
  aiConfig: TranslationAIConfig,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<TranslationResource> {
  // 1. Extract current source strings and convert to ID-based keys
  const positionalStrings = extractTranslatableStrings(projectData);
  const currentSource = positionalToIdBased(positionalStrings, projectData);

  // 2. Sync to find stale + new keys
  const syncResult = syncTranslation(existingResource, currentSource);

  // Apply sync to a clone (marks stale, adds new as untranslated, updates snapshot)
  const resource: TranslationResource = {
    ...existingResource,
    strings: { ...existingResource.strings },
    _sourceSnapshot: { ...existingResource._sourceSnapshot },
  };
  applySyncResult(resource, syncResult, currentSource);

  // 3. Collect source strings that need (re)translation
  const keysToTranslate = [...syncResult.staleStrings, ...syncResult.newStrings];

  // Also include any previously untranslated or stale strings that the sync
  // didn't re-detect (e.g., stale entries from corrupted snapshot repair
  // where the preserved snapshot matches current source)
  for (const [key, entry] of Object.entries(resource.strings)) {
    if ((entry.status === 'untranslated' || entry.status === 'stale') && !keysToTranslate.includes(key)) {
      keysToTranslate.push(key);
    }
  }

  if (keysToTranslate.length === 0) {
    console.log(`[StoryTranslator] updateTranslationResource: nothing to retranslate for ${resource.languageName}`);
    return resource;
  }

  const subset: Record<string, string> = {};
  for (const key of keysToTranslate) {
    if (currentSource[key]) {
      subset[key] = currentSource[key];
    }
  }

  const totalStrings = Object.keys(subset).length;
  console.log(`[StoryTranslator] Retranslating ${totalStrings} strings for ${resource.languageName} (${syncResult.staleStrings.length} stale, ${syncResult.newStrings.length} new)`);

  // 4. Analyze narrative context
  const narrativeContext = await analyzeNarrative(projectData, aiConfig, signal);
  const charContext = buildCharacterContext(projectData);

  // 5. Translate in batches
  const keys = Object.keys(subset);
  let translated = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new DOMException('Translation cancelled', 'AbortError');
    }

    const batchKeys = keys.slice(i, i + BATCH_SIZE);
    const batch: Record<string, string> = {};
    for (const key of batchKeys) {
      batch[key] = subset[key];
    }

    const batchTranslations = await translateBatch(
      batch, resource.languageName, aiConfig, signal, narrativeContext, charContext
    );

    // 6. Merge translations back
    for (const [key, value] of Object.entries(batchTranslations)) {
      resource.strings[key] = { value, status: 'translated' };
      resource._sourceSnapshot[key] = currentSource[key];
    }

    translated += batchKeys.length;
    onProgress?.({
      currentLanguage: resource.languageName,
      languageIndex: 0,
      totalLanguages: 1,
      stringsTranslated: translated,
      totalStrings,
    });
  }

  // 7. Recompute hash and timestamp
  resource.sourceHash = computeSourceHash(currentSource);
  resource.modifiedAt = new Date().toISOString();

  // Re-detect fonts
  const translatedValues: Record<string, string> = {};
  for (const [key, entry] of Object.entries(resource.strings)) {
    translatedValues[key] = entry.value;
  }
  resource.requiredFonts = detectFontsForTranslation(translatedValues);

  console.log(`[StoryTranslator] Retranslation complete for ${resource.languageName}: ${translated} strings updated`);
  return resource;
}

/**
 * Create a TranslationResource for manual translation.
 * Populates all keys with source text as placeholder values, marked as 'untranslated'.
 *
 * @param projectData - The full project JSON
 * @param languageCode - BCP 47 language code
 * @param languageName - Human-readable language name
 * @returns A TranslationResource with source text as placeholders
 */
export function createManualTranslationResource(
  projectData: any,
  languageCode: string,
  languageName: string
): TranslationResource {
  const direction: TextDirection = isRTLLanguage(languageCode) ? 'rtl' : 'ltr';

  // Extract and convert to ID-based keys
  const positionalStrings = extractTranslatableStrings(projectData);
  const idBasedSource = positionalToIdBased(positionalStrings, projectData);

  const resource = createEmptyResource(languageCode, languageName, direction);
  resource.origin = 'human';
  resource.sourceHash = computeSourceHash(idBasedSource);
  resource._sourceSnapshot = idBasedSource;

  // All strings start as untranslated with source text as placeholder
  for (const [key, value] of Object.entries(idBasedSource)) {
    resource.strings[key] = {
      value,
      status: 'untranslated',
    };
  }

  return resource;
}

/**
 * Extract translated character displayNames from a translation resource.
 * Returns a map of character index → translated displayName.
 */
export function extractCharacterDisplayNameTranslations(
  resource: TranslationResource
): Map<number, string> {
  const result = new Map<number, string>();
  // Match only direct displayName keys: project.story.characters.{N}.displayName
  // NOT nested ones like project.story.characters.0.counters.0.displayName
  const pattern = /^project\.story\.characters\.(\d+)\.displayName$/;
  for (const [key, entry] of Object.entries(resource.strings)) {
    const match = key.match(pattern);
    if (match && entry.status !== 'untranslated') {
      result.set(parseInt(match[1], 10), entry.value);
    }
  }
  return result;
}

/**
 * Apply a TranslationResource to project data, producing a translated clone.
 * This is the data-layer translation: beats see already-translated strings.
 *
 * @param projectData - The original project JSON
 * @param resource - The TranslationResource to apply
 * @returns A deep clone of projectData with translations applied
 */
export function applyTranslationResource(
  projectData: any,
  resource: TranslationResource
): any {
  // Convert ID-based translated strings to positional keys
  const translatedValues: Record<string, string> = {};
  for (const [key, entry] of Object.entries(resource.strings)) {
    if (entry.status !== 'untranslated') {
      translatedValues[key] = entry.value;
    }
  }

  const positional = idBasedToPositional(translatedValues, projectData);
  return applyTranslations(projectData, positional);
}

/**
 * Get translated parameter values for a single beat from a translation resource.
 * Returns a flat map of parameter paths to translated values.
 * E.g., { 'text': 'Hallo Welt', 'choices.0.displayText': 'Wähle...' }
 */
export function getTranslationsForBeat(
  resource: TranslationResource,
  beatId: string
): Record<string, string> {
  const prefix = `beat:${beatId}.parameters.`;
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(resource.strings)) {
    if (key.startsWith(prefix) && entry.status !== 'untranslated') {
      result[key.substring(prefix.length)] = entry.value;
    }
  }

  return result;
}

/**
 * Get all translation entries for a single beat (including untranslated).
 * Returns entries with their status for display in the Inspector.
 */
export function getAllTranslationEntriesForBeat(
  resource: TranslationResource,
  beatId: string
): { path: string; value: string; status: string }[] {
  const prefix = `beat:${beatId}.parameters.`;
  const result: { path: string; value: string; status: string }[] = [];

  for (const [key, entry] of Object.entries(resource.strings)) {
    if (key.startsWith(prefix)) {
      result.push({
        path: key.substring(prefix.length),
        value: entry.value,
        status: entry.status,
      });
    }
  }

  return result;
}

/**
 * Build a TranslationManifest from an array of TranslationResources.
 */
export function buildTranslationManifest(
  resources: TranslationResource[],
  sourceLanguage: string = 'en'
): TranslationManifest {
  const manifest = createEmptyTranslationManifest(sourceLanguage);
  manifest.languages = resources.map(buildManifestEntry);
  manifest.modifiedAt = new Date().toISOString();
  return manifest;
}
