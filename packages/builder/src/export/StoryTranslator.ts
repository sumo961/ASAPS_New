/**
 * StoryTranslator - AI-powered story content translation
 *
 * Extracts translatable strings from project data, sends them to an AI provider
 * for batch translation, and applies the translations back to create a translated
 * copy of the project data.
 */

import type { AIProvider } from './HtmlExporter';

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
  'buttonText', 'restartText', 'creditsText', 'clearButtonText', 'placeholder',
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
 * Extract translatable strings from a single beat based on its type.
 */
function extractBeatStrings(beat: any, prefix: string, strings: Record<string, string>): void {
  const params = beat.parameters || beat;
  const type = beat.type || '';

  // Common text fields present on many beat types
  const commonFields = ['text', 'buttonText', 'prompt', 'question', 'message', 'title', 'author'];
  for (const field of commonFields) {
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
      // title only — prompts stay in original language
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
 */
function applyTranslations(projectData: any, translations: Record<string, string>): any {
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
      response = await callOpenAI(systemPrompt, userMessage, provider, apiKey, baseUrl, model, signal);
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
      result[key] = typeof parsed[key] === 'string' ? parsed[key] : batch[key];
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
  signal?: AbortSignal
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

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
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
