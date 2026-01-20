/**
 * AI Service
 *
 * Main service for AI-assisted story creation
 * Coordinates providers, validation, and error handling
 */

import type {
  IAIProvider,
  AIServiceOptions,
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse
} from '../types/ai';
import { getAIValidator } from './AIValidator';

/**
 * AI Service
 *
 * Singleton service for AI operations
 */
export class AIService {
  private providers: Map<string, IAIProvider> = new Map();
  private currentProvider: IAIProvider | null = null;
  private options: AIServiceOptions;
  private validator = getAIValidator();

  /**
   * Export story + validation details as a downloadable JSON for debugging.
   * Browser-only; no-op on server.
   * Always called after story generation to help with debugging.
   * Also stores to localStorage for easy access by Claude Code.
   */
  private exportStoryDebug(
    story: StoryGenerationResponse,
    errors: any[] = [],
    warnings: any[] = [],
    status: 'success' | 'failed' = 'success'
  ): void {
    if (typeof window === 'undefined') return;

    try {
      const payload = {
        title: story.metadata?.title,
        generatedAt: new Date().toISOString(),
        status,
        beatCount: story.beats?.length || 0,
        beatTypes: story.beats?.map(b => b.type) || [],
        errors,
        warnings,
        story,
      };
      const jsonString = JSON.stringify(payload, null, 2);

      // Save to browser download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const statusSuffix = status === 'failed' ? '-FAILED' : '';
      const filename = `story-debug${statusSuffix}-${Date.now()}.json`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also store in localStorage for easy access (keep last 5 debug files)
      try {
        const debugHistory = JSON.parse(localStorage.getItem('asaps_debug_history') || '[]');
        debugHistory.unshift({ filename, timestamp: Date.now(), data: payload });
        // Keep only last 5
        while (debugHistory.length > 5) debugHistory.pop();
        localStorage.setItem('asaps_debug_history', JSON.stringify(debugHistory));
        // Also store the latest one separately for quick access
        localStorage.setItem('asaps_latest_debug', jsonString);
        console.log(`[AIService] Saved debug story file (${status}): ${filename}`);
        console.log(`[AIService] Debug also stored in localStorage. Access via: localStorage.getItem('asaps_latest_debug')`);
      } catch (storageErr) {
        console.warn('[AIService] Could not store debug in localStorage:', storageErr);
      }
    } catch (err) {
      console.warn('[AIService] Failed to export story debug file:', err);
    }
  }

  constructor(options: AIServiceOptions = {}) {
    this.options = {
      validateSchema: true,
      retryOnError: true,
      maxRetries: 3,
      ...options
    };
  }

  /**
   * Register an AI provider
   */
  registerProvider(provider: IAIProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`[AIService] Registered provider: ${provider.name}`);

    // Set as current if no provider is set
    if (!this.currentProvider && provider.isReady()) {
      this.currentProvider = provider;
      console.log(`[AIService] Set ${provider.name} as current provider`);
    }
  }

  /**
   * Set active provider
   */
  setProvider(providerName: string): void {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not registered`);
    }

    if (!provider.isReady()) {
      throw new Error(`Provider '${providerName}' is not configured`);
    }

    this.currentProvider = provider;
    console.log(`[AIService] Switched to provider: ${providerName}`);
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): IAIProvider | null {
    return this.currentProvider;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.currentProvider !== null && this.currentProvider.isReady();
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Ensure service is ready
   */
  private ensureReady(): void {
    if (!this.isReady()) {
      throw new Error('AI Service not ready. Configure a provider first.');
    }
  }

  /**
   * Transform AI-generated beat format to match schema expectations
   * - Converts top-level `connections` array to `parameters.connection`
   * - Normalizes setVariable parameters (variableName → name, default type)
   */
  private transformBeatFormat(beat: any): any {
    const transformed = { ...beat };

    if (!transformed.parameters) {
      transformed.parameters = {};
    }

    // === CLEANUP: Remove duplicate/unwanted fields ===

    // 1. Remove duplicate dialogTree data (should ONLY be in parameters.dialogTree, nowhere else)
    if (beat.type === 'dialogTree') {
      // Remove from top-level beat object
      if (transformed.dialogTree) {
        console.log(`[AIService] Removing duplicate top-level dialogTree from beat ${beat.id}`);
        delete transformed.dialogTree;
      }
      if (transformed.speaker !== undefined) {
        console.log(`[AIService] Removing duplicate top-level speaker from beat ${beat.id}`);
        delete transformed.speaker;
      }
      if (transformed.text !== undefined) {
        console.log(`[AIService] Removing duplicate top-level text from beat ${beat.id}`);
        delete transformed.text;
      }
      if (transformed.emotion !== undefined) {
        console.log(`[AIService] Removing duplicate top-level emotion from beat ${beat.id}`);
        delete transformed.emotion;
      }
      // ALSO remove from parameters (these are duplicated from dialogTree object)
      // The only valid location is parameters.dialogTree.speaker/text/emotion
      if (transformed.parameters.speaker !== undefined && transformed.parameters.dialogTree?.speaker) {
        console.log(`[AIService] Removing duplicate parameters.speaker from beat ${beat.id}`);
        delete transformed.parameters.speaker;
      }
      if (transformed.parameters.text !== undefined && transformed.parameters.dialogTree?.text) {
        console.log(`[AIService] Removing duplicate parameters.text from beat ${beat.id}`);
        delete transformed.parameters.text;
      }
      if (transformed.parameters.emotion !== undefined && transformed.parameters.dialogTree?.emotion) {
        console.log(`[AIService] Removing duplicate parameters.emotion from beat ${beat.id}`);
        delete transformed.parameters.emotion;
      }
    }

    // 2. Remove internal editor fields that AI should never generate
    if (transformed.parameters._rawHyperlinks) {
      console.log(`[AIService] Removing AI-generated _rawHyperlinks from beat ${beat.id} (will be regenerated)`);
      delete transformed.parameters._rawHyperlinks;
    }
    if (transformed.parameters.locs) {
      delete transformed.parameters.locs;
    }
    if (transformed.locations && Array.isArray(transformed.locations) && transformed.locations.length === 0) {
      delete transformed.locations;
    }

    // 3. Deduplicate connections array
    if (transformed.connections && Array.isArray(transformed.connections)) {
      const seen = new Set<string>();
      const originalCount = transformed.connections.length;
      transformed.connections = transformed.connections.filter((conn: any) => {
        const targetId = conn.targetId || conn.target;
        if (!targetId) return false;
        if (seen.has(targetId)) {
          return false; // Duplicate, remove
        }
        seen.add(targetId);
        return true;
      });
      if (transformed.connections.length < originalCount) {
        console.log(`[AIService] Removed ${originalCount - transformed.connections.length} duplicate connections from beat ${beat.id}`);
      }
    }

    // If beat has connections array at top level, convert to parameters.connection
    if (beat.connections && Array.isArray(beat.connections) && beat.connections.length > 0) {
      // For single-connection beats (titleScreen, introText, etc.)
      // Take the first connection and put it in parameters.connection
      const firstConnection = beat.connections[0];

      // Convert from { targetId: "..." } to { target: "..." }
      transformed.parameters.connection = {
        target: firstConnection.targetId || firstConnection.target,
        ...(firstConnection.label && { label: firstConnection.label }),
        ...(firstConnection.condition && { condition: firstConnection.condition }),
        ...(firstConnection.effects && { effects: firstConnection.effects }),
      };
    }

    // Normalize inputText parameters
    if (beat.type === 'inputText') {
      const params = transformed.parameters;

      // Map variableName → variable (common AI variation)
      if (params.variableName && !params.variable) {
        params.variable = params.variableName;
        delete params.variableName;
        console.log(`[AIService] Normalized: variableName → variable "${params.variable}" for beat ${beat.id}`);
      }

      // Default saveToType to "variable" if not specified
      if (!params.saveToType) {
        params.saveToType = 'variable';
        console.log(`[AIService] Defaulted inputText saveToType="variable" for beat ${beat.id}`);
      }

      // If variable is specified but saveToType isn't, ensure consistency
      if (params.variable && !params.saveToType) {
        params.saveToType = 'variable';
      }
    }

    // Normalize beat type aliases to canonical names
    const BEAT_TYPE_ALIASES: Record<string, string> = {
      'variable': 'setVariable',
      'counter': 'setVariable',
      'setCounter': 'setVariable',
      'setGlobal': 'setVariable',
      'condition': 'conditionBeat',
      'conditionCheck': 'conditionBeat',
      'addInventory': 'addRemoveInventory',
      'removeInventory': 'addRemoveInventory',
    };

    const originalBeatType = beat.type;
    if (BEAT_TYPE_ALIASES[beat.type]) {
      transformed.type = BEAT_TYPE_ALIASES[beat.type];
      console.log(`[AIService] Normalized beat type: "${originalBeatType}" → "${transformed.type}" for beat ${beat.id}`);
    }

    // Normalize setVariable, variable, and counter parameters
    if (transformed.type === 'setVariable' || originalBeatType === 'counter' || originalBeatType === 'setCounter' || originalBeatType === 'variable') {
      const params = transformed.parameters;

      // Map variableName → name (common AI variation)
      if (params.variableName && !params.name) {
        params.name = params.variableName;
        console.log(`[AIService] Normalized: variableName → name for beat ${beat.id}`);
      }

      // If original beat type was "counter", ensure parameters.type is set to "counter"
      if (originalBeatType === 'counter' || originalBeatType === 'setCounter') {
        params.type = 'counter';
        console.log(`[AIService] Set parameters.type="counter" for beat ${beat.id}`);
      }

      // If original beat type was "variable", ensure parameters.type is set to "variable"
      if (originalBeatType === 'variable') {
        params.type = 'variable';
        console.log(`[AIService] Set parameters.type="variable" for beat ${beat.id}`);
      }

      // For addInventory/removeInventory aliases, set the action parameter
      if (originalBeatType === 'addInventory') {
        params.action = 'add';
      } else if (originalBeatType === 'removeInventory') {
        params.action = 'remove';
      }

      // Normalize operation variations that AI might generate
      if (params.operation) {
        const opLower = params.operation.toLowerCase();
        const originalOp = params.operation;

        // Map AI variations to standard operations
        // IMPORTANT: "change" maps to "add" since UI only supports: set, add, subtract, multiply, divide
        if (opLower === 'change' || opLower === 'increment' || opLower === 'increase' || opLower === 'plus') {
          params.operation = 'add';
        } else if (opLower === 'decrement' || opLower === 'decrease' || opLower === 'minus') {
          params.operation = 'subtract';
        } else if (opLower === 'times' || opLower === 'mult') {
          params.operation = 'multiply';
        } else if (opLower === 'div') {
          params.operation = 'divide';
        }

        if (params.operation !== originalOp) {
          console.log(`[AIService] Normalized operation: "${originalOp}" → "${params.operation}" for beat ${beat.id}`);
        }
      }

      // Fix type based on operation - if operation is present, it MUST be a counter
      // This overrides incorrect AI output where type="variable" but operation="change"
      const hasCounterOperation = params.operation &&
        ['add', 'change', 'subtract', 'multiply', 'divide'].includes(params.operation);

      if (hasCounterOperation && params.type !== 'counter') {
        const oldType = params.type;
        params.type = 'counter';
        console.log(`[AIService] Fixed type: "${oldType}" → "counter" (has operation="${params.operation}") for beat ${beat.id}`);
      }

      // Default type to "variable" if not specified
      if (!params.type) {
        // Infer type from operation or value
        if (hasCounterOperation || typeof params.value === 'number') {
          params.type = 'counter';
        } else {
          params.type = 'variable';
        }
        console.log(`[AIService] Inferred type="${params.type}" for beat ${beat.id}`);
      }

      // Ensure name is provided - use a default if missing
      if (!params.name && !params.variableName && !params.variable) {
        params.name = params.type === 'counter' ? 'counter' : 'variable';
        console.warn(`[AIService] Beat ${beat.id} missing variable/counter name, defaulting to "${params.name}"`);
      }

      // Ensure value is provided
      if (params.value === undefined) {
        params.value = params.type === 'counter' ? 0 : '';
        console.warn(`[AIService] Beat ${beat.id} missing value, defaulting to ${params.value}`);
      }
    }

    // Normalize hyperText parameters - extract bracketed text into hyperlinks
    if (beat.type === 'hyperText') {
      const params = transformed.parameters;

      // If text contains [bracketed] text but hyperlinks array is empty/missing, extract them
      if (params.text && (!params.hyperlinks || params.hyperlinks.length === 0)) {
        const bracketRegex = /\[([^\]]+)\]/g;
        const matches = [...params.text.matchAll(bracketRegex)];

        if (matches.length > 0) {
          console.log(`[AIService] Found ${matches.length} bracketed text in hyperText beat ${beat.id}, extracting as hyperlinks`);

          // Create hyperlinks from bracketed text
          params.hyperlinks = [];
          const connections = beat.connections || [];

          matches.forEach((match, index) => {
            const word = match[1]; // Text inside brackets
            // Try to find corresponding target from connections
            const targetConnection = connections[index];
            const targetBeatId = targetConnection?.targetId || targetConnection?.target || `beat_${beat.id}_link_${index}`;

            params.hyperlinks.push({
              word: word,
              targetBeatId: targetBeatId
            });

            console.log(`[AIService] Created hyperlink: "${word}" → ${targetBeatId}`);
          });

          // Remove brackets from the text itself
          params.text = params.text.replace(bracketRegex, '$1');
          console.log(`[AIService] Cleaned hyperText text (removed brackets): "${params.text.substring(0, 50)}..."`);
        }
      }

      // Also handle if AI used 'target' instead of 'targetBeatId' in hyperlinks
      if (params.hyperlinks && Array.isArray(params.hyperlinks)) {
        params.hyperlinks = params.hyperlinks.map((link: any) => ({
          word: link.word || link.text || link.phrase,
          targetBeatId: link.targetBeatId || link.target || link.beatId,
          style: link.style
        }));
      }
    }

    // Normalize conditionBeat parameters
    if (transformed.type === 'conditionBeat' || beat.type === 'condition' || beat.type === 'conditionCheck') {
      const params = transformed.parameters;

      // Normalize condition object if present
      if (params.condition) {
        const cond = params.condition;

        // Map variableName → variable (common AI variation)
        if (cond.variableName && !cond.variable) {
          cond.variable = cond.variableName;
          delete cond.variableName;
          console.log(`[AIService] Normalized condition: variableName → variable for beat ${beat.id}`);
        }

        // Map name → variable (another common variation)
        if (cond.name && !cond.variable) {
          cond.variable = cond.name;
          delete cond.name;
          console.log(`[AIService] Normalized condition: name → variable for beat ${beat.id}`);
        }

        // Normalize operator variations
        if (cond.operator) {
          const opMap: Record<string, string> = {
            'equals': '==',
            'equal': '==',
            'eq': '==',
            'notEquals': '!=',
            'notEqual': '!=',
            'ne': '!=',
            'greaterThan': '>',
            'gt': '>',
            'lessThan': '<',
            'lt': '<',
            'greaterOrEqual': '>=',
            'gte': '>=',
            'lessOrEqual': '<=',
            'lte': '<=',
          };
          if (opMap[cond.operator]) {
            const oldOp = cond.operator;
            cond.operator = opMap[cond.operator];
            console.log(`[AIService] Normalized condition operator: "${oldOp}" → "${cond.operator}" for beat ${beat.id}`);
          }
        }

        // FLATTEN condition object to top-level parameters (Inspector expects flat structure)
        // Inspector reads from params.conditionType, params.variableName, params.operator, params.value
        if (cond.type && !params.conditionType) {
          params.conditionType = cond.type;
          console.log(`[AIService] Flattened condition.type → conditionType for beat ${beat.id}`);
        }
        if (cond.variable && !params.variableName) {
          params.variableName = cond.variable;
          console.log(`[AIService] Flattened condition.variable → variableName for beat ${beat.id}`);
        }
        if (cond.operator && !params.operator) {
          params.operator = cond.operator;
          console.log(`[AIService] Flattened condition.operator → operator for beat ${beat.id}`);
        }
        if (cond.value !== undefined && params.value === undefined) {
          params.value = cond.value;
          console.log(`[AIService] Flattened condition.value → value for beat ${beat.id}`);
        }
        // For counter compare conditions
        if (cond.counter1 && !params.counter1) {
          params.counter1 = cond.counter1;
        }
        if (cond.counter2 && !params.counter2) {
          params.counter2 = cond.counter2;
        }
        // For timer conditions
        if (cond.timer && !params.timer) {
          params.timer = cond.timer;
        }
        // For inventory conditions - AI often uses "variable" instead of "item"
        if (cond.type === 'inventory' && cond.variable && !cond.item) {
          cond.item = cond.variable;
          console.log(`[AIService] Converted condition.variable → condition.item: "${cond.item}" for beat ${beat.id}`);
        }
        if (cond.item && !params.item) {
          params.item = cond.item;
        }
        if (cond.character && !params.character) {
          params.character = cond.character;
        }
        if (cond.checkType && !params.checkType) {
          params.checkType = cond.checkType;
        }
      }

      // CRITICAL FIX: For inventory conditions, AI often uses variableName instead of item
      // Convert variableName → item when conditionType is 'inventory'
      if (params.conditionType === 'inventory' && params.variableName && !params.item) {
        params.item = params.variableName;
        console.log(`[AIService] Converted inventory variableName → item: "${params.item}" for beat ${beat.id}`);
        // Don't delete variableName as it might be used elsewhere, but item takes precedence
      }

      // Normalize trueConnection/falseConnection → trueTarget/falseTarget
      // AI generates: trueConnection: { target: "beat_id" }
      // ConditionBeat expects: trueTarget: "beat_id"
      if (params.trueConnection && !params.trueTarget) {
        params.trueTarget = typeof params.trueConnection === 'string'
          ? params.trueConnection
          : params.trueConnection.target;
        console.log(`[AIService] Normalized: trueConnection → trueTarget "${params.trueTarget}" for beat ${beat.id}`);
      }
      if (params.falseConnection && !params.falseTarget) {
        params.falseTarget = typeof params.falseConnection === 'string'
          ? params.falseConnection
          : params.falseConnection.target;
        console.log(`[AIService] Normalized: falseConnection → falseTarget "${params.falseTarget}" for beat ${beat.id}`);
      }
    }

    // Normalize DialogTree - unwrap extra "root" wrapper that AI sometimes generates
    if (beat.type === 'dialogTree') {
      const params = transformed.parameters;
      if (params.dialogTree?.root && !params.dialogTree?.id) {
        console.log(`[AIService] Unwrapped dialogTree.root for beat ${beat.id}`);
        params.dialogTree = params.dialogTree.root;
      }

      // Fix nested dialogNode structure - AI puts target INSIDE dialogNode instead of on choice
      // When dialogNode has a target but no choices, we need to add an auto-continue choice
      // so the user sees the NPC response before exiting to the next beat
      if (params.dialogTree?.choices && Array.isArray(params.dialogTree.choices)) {
        params.dialogTree.choices = params.dialogTree.choices.map((choice: any) => {
          if (choice.dialogNode) {
            const dn = choice.dialogNode;

            // If dialogNode has a target but no choices (or empty choices), create auto-continue
            if (dn.target && (!dn.choices || dn.choices.length === 0)) {
              console.log(`[AIService] Adding auto-continue choice to dialogNode in beat ${beat.id}`);
              dn.choices = [{
                id: `${choice.id}_continue`,
                text: '[Continue]',
                target: dn.target
              }];
              delete dn.target; // Remove from dialogNode now that it's in the choice
            }

            // Recursively fix nested dialogNodes
            if (dn.choices && Array.isArray(dn.choices)) {
              dn.choices = dn.choices.map((nestedChoice: any) => {
                if (nestedChoice.dialogNode?.target && (!nestedChoice.dialogNode.choices || nestedChoice.dialogNode.choices.length === 0)) {
                  console.log(`[AIService] Adding auto-continue to nested dialogNode in beat ${beat.id}`);
                  nestedChoice.dialogNode.choices = [{
                    id: `${nestedChoice.id}_continue`,
                    text: '[Continue]',
                    target: nestedChoice.dialogNode.target
                  }];
                  delete nestedChoice.dialogNode.target;
                }
                return nestedChoice;
              });
            }
          }
          return choice;
        });
      }
    }

    // Normalize EndScreen - fix parameter names
    if (beat.type === 'endScreen') {
      const params = transformed.parameters;
      // AI uses "endMessage" but schema expects "message"
      if (params.endMessage && !params.message) {
        params.message = params.endMessage;
        delete params.endMessage;
        console.log(`[AIService] Normalized: endMessage → message for beat ${beat.id}`);
      }
      // Also handle "text" variation
      if (params.text && !params.message) {
        params.message = params.text;
        delete params.text;
        console.log(`[AIService] Normalized: text → message for beat ${beat.id}`);
      }
    }

    // Normalize addRemoveInventory - fix parameter names
    // AI often uses "propId" but schema requires "item" and "character"
    if (beat.type === 'addRemoveInventory') {
      const params = transformed.parameters;

      // Map propId → item (common AI variation)
      if (params.propId && !params.item) {
        params.item = params.propId;
        delete params.propId;
        console.log(`[AIService] Normalized: propId → item "${params.item}" for beat ${beat.id}`);
      }

      // Default character to "player" if missing
      if (!params.character) {
        params.character = 'player';
        console.log(`[AIService] Defaulted character="player" for addRemoveInventory beat ${beat.id}`);
      }

      // Default action to "add" if missing
      if (!params.action) {
        params.action = 'add';
        console.log(`[AIService] Defaulted action="add" for addRemoveInventory beat ${beat.id}`);
      }

      // Normalize fromCharacter/toCharacter variations
      if (params.fromCharacter && !params.fromChar) {
        params.fromChar = params.fromCharacter;
        delete params.fromCharacter;
        console.log(`[AIService] Normalized: fromCharacter → fromChar for beat ${beat.id}`);
      }
      if (params.toCharacter && !params.toChar) {
        params.toChar = params.toCharacter;
        delete params.toCharacter;
        console.log(`[AIService] Normalized: toCharacter → toChar for beat ${beat.id}`);
      }
    }

    // Normalize setTimer - fix parameter names
    // AI often uses "timerName" and "duration" but schema requires "name", "value", "timerTarget"
    if (beat.type === 'setTimer') {
      const params = transformed.parameters;

      // Map timerName → name (common AI variation)
      if (params.timerName && !params.name) {
        params.name = params.timerName;
        delete params.timerName;
        console.log(`[AIService] Normalized: timerName → name "${params.name}" for beat ${beat.id}`);
      }

      // Map duration → value (common AI variation)
      if (params.duration !== undefined && params.value === undefined) {
        params.value = params.duration;
        delete params.duration;
        console.log(`[AIService] Normalized: duration → value ${params.value} for beat ${beat.id}`);
      }

      // Try to set timerTarget from connection if missing
      if (!params.timerTarget && params.connection?.target) {
        // Use the same target as the connection if no timerTarget specified
        // This is a fallback - AI should specify timerTarget explicitly
        console.warn(`[AIService] Beat ${beat.id} missing timerTarget, using connection.target as fallback`);
        params.timerTarget = params.connection.target;
      }

      // Warn if still missing required parameters
      if (!params.name) {
        console.warn(`[AIService] Beat ${beat.id} missing required 'name' parameter for setTimer`);
      }
      if (params.value === undefined) {
        console.warn(`[AIService] Beat ${beat.id} missing required 'value' parameter for setTimer`);
      }
      if (!params.timerTarget) {
        console.warn(`[AIService] Beat ${beat.id} missing required 'timerTarget' parameter for setTimer`);
      }
    }

    // Normalize videoBeat - fix parameter names
    // AI often uses "videoAssetId" but schema requires "videoFile"
    if (beat.type === 'videoBeat') {
      const params = transformed.parameters;

      // Map videoAssetId → videoFile (common AI variation)
      if (params.videoAssetId && !params.videoFile) {
        params.videoFile = params.videoAssetId;
        delete params.videoAssetId;
        console.log(`[AIService] Normalized: videoAssetId → videoFile "${params.videoFile}" for beat ${beat.id}`);
      }

      // Also handle variations like videoSrc, videoUrl, src, url
      const videoAliases = ['videoSrc', 'videoUrl', 'src', 'url', 'video'];
      for (const alias of videoAliases) {
        if (params[alias] && !params.videoFile) {
          params.videoFile = params[alias];
          delete params[alias];
          console.log(`[AIService] Normalized: ${alias} → videoFile "${params.videoFile}" for beat ${beat.id}`);
          break;
        }
      }

      // Warn if still missing required parameter
      if (!params.videoFile) {
        console.warn(`[AIService] Beat ${beat.id} missing required 'videoFile' parameter for videoBeat`);
      }
    }

    // Normalize MovementChoice - ensure choices have id fields
    if (beat.type === 'movementChoice') {
      const params = transformed.parameters;
      if (params.choices && Array.isArray(params.choices)) {
        params.choices = params.choices.map((choice: any, index: number) => {
          if (!choice.id) {
            // Generate id from text or use index
            const generatedId = choice.text
              ? `choice_${choice.text.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 20)}`
              : `choice_${index}`;
            console.log(`[AIService] Generated id "${generatedId}" for movementChoice choice in beat ${beat.id}`);
            return { ...choice, id: generatedId };
          }
          return choice;
        });
      }
    }

    // Normalize PickProp - ensure props have id fields
    if (beat.type === 'pickProp') {
      const params = transformed.parameters;
      if (params.props && Array.isArray(params.props)) {
        params.props = params.props.map((prop: any, index: number) => {
          if (!prop.id) {
            // Generate id from name or use index
            const generatedId = prop.name
              ? `prop_${prop.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 20)}`
              : `prop_${index}`;
            console.log(`[AIService] Generated id "${generatedId}" for pickProp prop in beat ${beat.id}`);
            return { ...prop, id: generatedId };
          }
          return prop;
        });
      }
    }

    // Validate and normalize HyperText links
    if (beat.type === 'hyperText') {
      const params = transformed.parameters;
      if (params.hyperlinks && Array.isArray(params.hyperlinks) && params.text) {
        const originalCount = params.hyperlinks.length;
        // Normalize hyperlinks to word-based format and validate they exist in text
        params.hyperlinks = params.hyperlinks
          .map((link: any) => {
            const word = link.word || link.text || link.phrase;
            if (!word) return null;
            return {
              word,
              targetBeatId: link.targetBeatId || link.target || '',
              style: link.style || { color: '#0066cc', underline: true }
            };
          })
          .filter((link: any) => {
            if (!link) return false;
            const found = params.text.includes(link.word);
            if (!found) {
              console.warn(`[AIService] HyperText link "${link.word}" not found in text for beat ${beat.id}, removing`);
            }
            return found;
          });
        if (params.hyperlinks.length < originalCount) {
          console.log(`[AIService] Removed ${originalCount - params.hyperlinks.length} invalid hyperlinks from beat ${beat.id}`);
        }
      }
    }

    return transformed;
  }

  /**
   * Transform all beats in a story response
   */
  private transformStoryResponse(response: StoryGenerationResponse): StoryGenerationResponse {
    return {
      ...response,
      beats: response.beats.map(beat => this.transformBeatFormat(beat)),
    };
  }

  /**
   * Clean up redundant parameters that AI models often add despite prompts
   * This runs AFTER transformation to catch parameters added during normalization
   */
  private cleanupRedundantParameters(response: StoryGenerationResponse): void {
    if (!response.beats || !Array.isArray(response.beats)) return;

    // Beat types that should NOT have a "connection" parameter
    // (they define targets in their choices/props/hyperlinks instead)
    const multiConnectionTypes = new Set([
      'movementChoice',
      'pickProp',
      'dialogTree',
      'hyperText',
      'conditionBeat'
    ]);

    // Flat conditionBeat parameters that should be removed if nested format exists
    // These are flattened during transformation but the schema doesn't have them at top level
    const forbiddenConditionParams = new Set([
      'conditionType',
      'variableName',
      'trueTarget',
      'falseTarget',
      'operator',   // Schema only has this inside condition object
      'value',      // Schema only has this inside condition object
      'item',       // Inventory condition field - should be inside condition object
      'character',  // Inventory condition field - should be inside condition object
      'checkType'   // Inventory condition field - should be inside condition object
    ]);

    let cleanupCount = 0;

    for (const beat of response.beats) {
      if (!beat.parameters) continue;

      // Remove "connection" from multi-connection beat types
      if (multiConnectionTypes.has(beat.type) && 'connection' in beat.parameters) {
        delete beat.parameters.connection;
        cleanupCount++;
      }

      // Remove redundant flat conditionBeat parameters if nested format exists
      if (beat.type === 'conditionBeat' && beat.parameters.condition) {
        for (const param of forbiddenConditionParams) {
          if (param in beat.parameters) {
            delete beat.parameters[param];
            cleanupCount++;
          }
        }
      }

      // Clean up inputText parameters not in schema
      if (beat.type === 'inputText') {
        // AI often uses variableName instead of variable - copy then delete
        if ('variableName' in beat.parameters) {
          if (!beat.parameters.variable) {
            beat.parameters.variable = beat.parameters.variableName;
          }
          delete beat.parameters.variableName;
          cleanupCount++;
          console.log(`[AIService] Cleanup: variableName → variable for beat ${beat.id}`);
        }
        // submitButtonText is not in schema
        if ('submitButtonText' in beat.parameters) {
          delete beat.parameters.submitButtonText;
          cleanupCount++;
          console.log(`[AIService] Cleanup: Removed submitButtonText from beat ${beat.id}`);
        }
      }

      // Clean up setTimer parameters - safety net for transformation
      if (beat.type === 'setTimer') {
        // timerName → name
        if ('timerName' in beat.parameters && !beat.parameters.name) {
          beat.parameters.name = beat.parameters.timerName;
          delete beat.parameters.timerName;
          cleanupCount++;
          console.log(`[AIService] Cleanup: timerName → name for beat ${beat.id}`);
        }
        // duration → value
        if ('duration' in beat.parameters && beat.parameters.value === undefined) {
          beat.parameters.value = beat.parameters.duration;
          delete beat.parameters.duration;
          cleanupCount++;
          console.log(`[AIService] Cleanup: duration → value for beat ${beat.id}`);
        }
        // Set timerTarget from connection if missing
        if (!beat.parameters.timerTarget && beat.parameters.connection?.target) {
          beat.parameters.timerTarget = beat.parameters.connection.target;
          cleanupCount++;
          console.log(`[AIService] Cleanup: Set timerTarget from connection for beat ${beat.id}`);
        }
      }

      // Clean up addRemoveInventory parameters
      if (beat.type === 'addRemoveInventory') {
        // propId → item
        if ('propId' in beat.parameters && !beat.parameters.item) {
          beat.parameters.item = beat.parameters.propId;
          delete beat.parameters.propId;
          cleanupCount++;
          console.log(`[AIService] Cleanup: propId → item for beat ${beat.id}`);
        }
        // Default character to "player" if missing
        if (!beat.parameters.character) {
          beat.parameters.character = 'player';
          cleanupCount++;
          console.log(`[AIService] Cleanup: Defaulted character="player" for beat ${beat.id}`);
        }
        // Default action to "add" if missing
        if (!beat.parameters.action) {
          beat.parameters.action = 'add';
          cleanupCount++;
          console.log(`[AIService] Cleanup: Defaulted action="add" for beat ${beat.id}`);
        }
      }

      // Clean up videoBeat parameters
      if (beat.type === 'videoBeat') {
        // videoAssetId → videoFile
        if ('videoAssetId' in beat.parameters && !beat.parameters.videoFile) {
          beat.parameters.videoFile = beat.parameters.videoAssetId;
          delete beat.parameters.videoAssetId;
          cleanupCount++;
          console.log(`[AIService] Cleanup: videoAssetId → videoFile for beat ${beat.id}`);
        }
        // Handle other variations
        const videoAliases = ['videoSrc', 'videoUrl', 'src', 'url', 'video'];
        for (const alias of videoAliases) {
          if (alias in beat.parameters && !beat.parameters.videoFile) {
            beat.parameters.videoFile = beat.parameters[alias];
            delete beat.parameters[alias];
            cleanupCount++;
            console.log(`[AIService] Cleanup: ${alias} → videoFile for beat ${beat.id}`);
            break;
          }
        }
      }
    }

    if (cleanupCount > 0) {
      console.log(`[AIService] Cleaned up ${cleanupCount} redundant parameters after transformation`);
    }
  }

  /**
   * Auto-fix missing connections on linear beats (common smaller model issue)
   * Linear beats like introText, durScreen, setVariable need a 'connection' parameter
   * to specify their next beat. Smaller models often forget this.
   */
  private autoFixMissingConnections(response: StoryGenerationResponse): void {
    console.log('[AIService.autoFix] Starting connection auto-fix...');

    if (!response.beats || !Array.isArray(response.beats)) {
      console.log('[AIService.autoFix] No beats array, skipping');
      return;
    }

    console.log(`[AIService.autoFix] Processing ${response.beats.length} beats`);

    // Beat types that require a single 'connection' parameter
    const linearBeatTypes = new Set([
      'introText',
      'durScreen',
      'setVariable',
      'addRemoveInventory',
      'videoBeat',
      'randomTarget',
      'setTimer',
    ]);

    // Build set of all beat IDs that are already targets
    const targetedBeatIds = new Set<string>();
    const beatMap = new Map<string, any>();

    for (const beat of response.beats) {
      beatMap.set(beat.id, beat);

      // Check connection parameter
      if (beat.parameters?.connection?.target) {
        targetedBeatIds.add(beat.parameters.connection.target);
      }

      // Check choices/props/dialogTree targets
      const choices = beat.parameters?.choices || beat.parameters?.props || [];
      for (const choice of choices) {
        if (choice.target) targetedBeatIds.add(choice.target);
      }

      // Check dialogTree recursively
      if (beat.parameters?.dialogTree) {
        this.collectDialogTreeTargets(beat.parameters.dialogTree, targetedBeatIds);
      }

      // Check conditionBeat targets
      if (beat.type === 'conditionBeat') {
        if (beat.parameters?.trueTarget) targetedBeatIds.add(beat.parameters.trueTarget);
        if (beat.parameters?.falseTarget) targetedBeatIds.add(beat.parameters.falseTarget);
        if (beat.parameters?.trueConnection?.target) targetedBeatIds.add(beat.parameters.trueConnection.target);
        if (beat.parameters?.falseConnection?.target) targetedBeatIds.add(beat.parameters.falseConnection.target);
      }

      // Check connections array
      if (beat.connections && Array.isArray(beat.connections)) {
        for (const conn of beat.connections) {
          if (conn.targetId) targetedBeatIds.add(conn.targetId);
          if ((conn as any).target) targetedBeatIds.add((conn as any).target);
        }
      }
    }

    // titleScreen always targets something so it's implicitly connected
    const titleScreen = response.beats.find(b => b.type === 'titleScreen');
    if (titleScreen) {
      targetedBeatIds.add(titleScreen.id);
    }

    console.log(`[AIService.autoFix] Targeted beats: ${[...targetedBeatIds].join(', ')}`);

    // Find orphaned beats (not targeted by anything)
    const orphanedBeatIds = response.beats
      .filter(b => !targetedBeatIds.has(b.id))
      .map(b => b.id);

    console.log(`[AIService.autoFix] Orphaned beats: ${orphanedBeatIds.join(', ') || 'none'}`);

    // List linear beats and their connection status
    const linearBeats = response.beats.filter(b => linearBeatTypes.has(b.type));
    console.log(`[AIService.autoFix] Linear beats to check: ${linearBeats.map(b => `${b.id}(${b.type})`).join(', ')}`);
    for (const lb of linearBeats) {
      console.log(`[AIService.autoFix]   - ${lb.id}: connection=${lb.parameters?.connection?.target || 'MISSING'}`);
    }

    let fixCount = 0;

    // Fix linear beats missing connections
    for (let i = 0; i < response.beats.length; i++) {
      const beat = response.beats[i];

      if (!linearBeatTypes.has(beat.type)) continue;

      if (beat.parameters?.connection?.target) {
        console.log(`[AIService.autoFix] Beat ${beat.id} already has connection → ${beat.parameters.connection.target}`);
        continue;
      }

      console.log(`[AIService.autoFix] Beat ${beat.id} (${beat.type}) at index ${i} needs connection`);

      // Find the next orphaned beat that should be connected
      // Strategy: look for the next orphaned beat in array order after this one
      let targetId: string | null = null;

      // First, try to find an orphaned beat that comes after this beat
      for (let j = i + 1; j < response.beats.length; j++) {
        const nextBeat = response.beats[j];
        const isOrphaned = orphanedBeatIds.includes(nextBeat.id);
        const isEndScreen = nextBeat.type === 'endScreen';

        if (isOrphaned && !isEndScreen) {
          console.log(`[AIService.autoFix]   Found orphaned target: ${nextBeat.id} (${nextBeat.type}) at index ${j}`);
          targetId = nextBeat.id;
          // Remove from orphaned list since we're connecting to it
          const idx = orphanedBeatIds.indexOf(targetId);
          if (idx !== -1) orphanedBeatIds.splice(idx, 1);
          break;
        }
      }

      // If no orphaned beat found, try the next beat in sequence (it might be intentional)
      if (!targetId && i + 1 < response.beats.length) {
        const nextBeat = response.beats[i + 1];
        if (nextBeat.type !== 'endScreen') {
          console.log(`[AIService.autoFix]   No orphan found, using next sequential beat: ${nextBeat.id}`);
          targetId = nextBeat.id;
        }
      }

      // If still no target (last beat), look for existing endScreen or convert to endScreen
      if (!targetId) {
        const existingEndScreen = response.beats.find(b => b.type === 'endScreen');
        if (existingEndScreen) {
          console.log(`[AIService.autoFix]   No next beat, connecting to existing endScreen: ${existingEndScreen.id}`);
          targetId = existingEndScreen.id;
        } else if (beat.type === 'introText') {
          // Convert terminal introText to endScreen
          console.log(`[AIService.autoFix]   Converting terminal introText ${beat.id} to endScreen`);
          beat.type = 'endScreen';
          // Transform parameters: introText has text/buttonText, endScreen has message/showRestart
          const message = beat.parameters?.text || 'The End';
          beat.parameters = {
            message: message,
            showRestart: true,
            showCredits: false,
          };
          // No connection needed for endScreen
          beat.connections = [];
          fixCount++;
          continue; // Skip the connection fix since we converted to endScreen
        }
      }

      if (targetId) {
        if (!beat.parameters) beat.parameters = {};
        beat.parameters.connection = { target: targetId };

        // Also add to connections array for consistency
        if (!beat.connections) beat.connections = [];
        beat.connections.push({ targetId: targetId });

        console.log(`[AIService.autoFix] ✓ Fixed: ${beat.id} (${beat.type}) → ${targetId}`);
        fixCount++;
      } else {
        console.log(`[AIService.autoFix] ✗ Could not find target for ${beat.id}`);
      }
    }

    if (fixCount > 0) {
      console.log(`[AIService.autoFix] Auto-fixed ${fixCount} missing connections on linear beats`);
    } else {
      console.log(`[AIService.autoFix] No fixes needed`);
    }
  }

  /**
   * Helper to collect all targets from a dialogTree recursively
   */
  private collectDialogTreeTargets(node: any, targets: Set<string>): void {
    if (!node) return;

    if (node.choices && Array.isArray(node.choices)) {
      for (const choice of node.choices) {
        if (choice.target) targets.add(choice.target);
        if (choice.dialogNode) {
          this.collectDialogTreeTargets(choice.dialogNode, targets);
        }
      }
    }
  }

  /**
   * Generate complete story with automatic repair for fixable issues
   */
  async generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResponse> {
    this.ensureReady();

    console.log('[AIService] Generating story:', request.prompt);

    const MAX_REPAIR_ATTEMPTS = 2;

    try {
      // Generate with current provider
      let response = await this.currentProvider!.generateStory(request);

      // Transform beat format to match schema
      response = this.transformStoryResponse(response);
      console.log('[AIService] Transformed beat format for schema compatibility');

      // Clean up redundant parameters that AI models often add
      this.cleanupRedundantParameters(response);

      // Auto-fix missing connections on linear beats (common smaller model issue)
      this.autoFixMissingConnections(response);

      // Validate if enabled
      let validationErrors: any[] = [];
      let validationWarnings: any[] = [];

      if (this.options.validateSchema) {
        const validation = await this.validator.validateStoryGeneration(response);
        validationErrors = validation.errors || [];
        validationWarnings = validation.warnings || [];

        // Filter out known harmless warnings - these parameters work via fallback logic
        // Only suppress warnings where the code ACTUALLY handles both parameter names
        const harmlessWarningPatterns = [
          /Parameter 'variableName' not defined.*inputText/,  // code reads variable OR variableName
          /Parameter 'submitButtonText' not defined.*inputText/,  // cosmetic, optional
          /Parameter 'operator' not defined.*conditionBeat/,  // code reads from nested condition
          /Parameter 'value' not defined.*conditionBeat/,  // code reads from nested condition
        ];

        validationWarnings = validationWarnings.filter(warning =>
          !harmlessWarningPatterns.some(pattern => pattern.test(warning))
        );

        if (!validation.valid) {
          // Check if errors are repairable (counter threshold issues or unreachable beats)
          const repairableErrors = validationErrors.filter((e: any) => {
            const msg = e.message || e;
            return msg.includes('cannot satisfy') ||
              msg.includes('Possible range') ||
              msg.includes('unreachable');  // Include all unreachable errors (beats may be orphaned due to threshold issues)
          });

          if (repairableErrors.length > 0) {
            // Attempt repair with AI feedback for repairable errors
            console.log(`[AIService] Found ${repairableErrors.length} repairable errors (of ${validationErrors.length} total), attempting AI repair...`);

            for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
              console.log(`[AIService] Story repair attempt ${attempt}/${MAX_REPAIR_ATTEMPTS}`);

              const repairedResponse = await this.attemptStoryRepair(
                response,
                repairableErrors,
                request
              );

              if (repairedResponse) {
                // Re-validate the repaired response
                const revalidation = await this.validator.validateStoryGeneration(repairedResponse);
                const newRepairableErrors = (revalidation.errors || []).filter((e: any) => {
                  const msg = e.message || e;
                  return msg.includes('cannot satisfy') ||
                    msg.includes('Possible range') ||
                    msg.includes('unreachable');
                });

                if (revalidation.valid || newRepairableErrors.length < repairableErrors.length) {
                  console.log(`[AIService] Repair reduced errors from ${repairableErrors.length} to ${newRepairableErrors.length}`);
                  response = repairedResponse;
                  validationErrors = revalidation.errors || [];
                  validationWarnings = revalidation.warnings || [];

                  if (revalidation.valid) {
                    console.log('[AIService] All repairable errors resolved!');
                    break;
                  }
                } else {
                  console.log('[AIService] Repair did not improve errors, trying again...');
                }
              } else {
                console.log('[AIService] Repair attempt failed');
              }
            }

            // Check if we still have errors after repair attempts
            const finalValidation = await this.validator.validateStoryGeneration(response);
            if (!finalValidation.valid) {
              console.error('[AIService] Story validation still failed after repair attempts:', finalValidation.errors);
              this.exportStoryDebug(response, finalValidation.errors || [], finalValidation.warnings || [], 'failed');
              throw new Error(`Story validation failed: ${(finalValidation.errors || []).map((e: any) => e.message || e).join(', ')}`);
            }
          } else {
            // Non-repairable errors - fail immediately
            console.error('[AIService] Story validation failed:', validationErrors);
            this.exportStoryDebug(response, validationErrors, validationWarnings, 'failed');
            throw new Error(`Story validation failed: ${validationErrors.map((e: any) => e.message || e).join(', ')}`);
          }
        }

        // Attempt to repair fixable warnings (like unreachable beats)
        if (validationWarnings.length > 0) {
          console.warn('[AIService] Story validation warnings:', validationWarnings);

          // Check for fixable warnings (unreachable beats, missing connections, etc.)
          const fixableWarnings = validationWarnings.filter(w =>
            w.includes('unreachable') ||
            w.includes('no other beat connects') ||
            w.includes('missing connection')
          );

          if (fixableWarnings.length > 0) {
            console.log(`[AIService] Found ${fixableWarnings.length} fixable warnings, attempting repair...`);

            for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
              console.log(`[AIService] Repair attempt ${attempt}/${MAX_REPAIR_ATTEMPTS}`);

              const repairedResponse = await this.attemptStoryRepair(response, fixableWarnings, request);

              if (repairedResponse) {
                // Re-validate the repaired response
                const revalidation = await this.validator.validateStoryGeneration(repairedResponse);
                const newWarnings = (revalidation.warnings || []).filter(w =>
                  w.includes('unreachable') ||
                  w.includes('no other beat connects') ||
                  w.includes('missing connection')
                );

                if (newWarnings.length < fixableWarnings.length) {
                  console.log(`[AIService] Repair reduced warnings from ${fixableWarnings.length} to ${newWarnings.length}`);
                  response = repairedResponse;
                  validationWarnings = revalidation.warnings || [];

                  if (newWarnings.length === 0) {
                    console.log('[AIService] All fixable warnings resolved!');
                    break;
                  }
                } else {
                  console.log('[AIService] Repair did not improve warnings, keeping original');
                  break;
                }
              } else {
                console.log('[AIService] Repair attempt failed, keeping original');
                break;
              }
            }
          }
        }
      }

      // Always export debug file on success too
      this.exportStoryDebug(response, validationErrors, validationWarnings, 'success');

      console.log('[AIService] Story generated successfully:', response.metadata.title);
      return response;

    } catch (error) {
      console.error('[AIService] Story generation failed:', error);
      throw error;
    }
  }

  /**
   * Attempt to repair story issues (counter thresholds, unreachable beats) by asking the AI
   */
  private async attemptStoryRepair(
    story: StoryGenerationResponse,
    issues: any[],
    originalRequest: StoryGenerationRequest
  ): Promise<StoryGenerationResponse | null> {
    try {
      const issueList = issues.map((issue, i) => {
        const msg = issue.message || issue;
        return `${i + 1}. ${msg}`;
      }).join('\n');

      const repairPrompt = `
STORY REPAIR REQUEST: The generated story has validation issues that need fixing.

## Issues Found:
${issueList}

## Common Fixes:

### Counter Threshold Issues (cannot satisfy condition):
The condition checks require counter values that cannot be reached.
- Add more setVariable beats with operation="add" for the counter
- Or increase the counterValue on existing choice effects
- Place counter increments BEFORE condition checks
- A condition "counter >= 3" needs at least 3 increments reachable before it

### Unreachable Beat Issues:
Some beats cannot be reached from the title screen.
- Add missing connections to orphaned beats
- Or connect them to an existing beat in the story flow
- Ensure every beat has at least one incoming connection (except title screen)

## Current Story JSON:
${JSON.stringify(story, null, 2)}

## Instructions:
1. Analyze each issue and determine the appropriate fix
2. For counter issues: Add setVariable beats or choice counter effects
3. For unreachable beats: Add connections from existing beats to orphaned ones
4. Preserve ALL existing content - only ADD beats/connections or MODIFY values
5. Do NOT remove any beats or break existing connections

## Important:
- Use setVariable beats with type="counter", operation="add" for counter increments
- Or add counter/counterOperation/counterValue to existing choices
- For unreachable beats, find logical places to add connections to them
- Every beat must be reachable from the title screen through some path

Return ONLY the corrected JSON, no explanation needed.
`;

      // Create a repair request
      const repairRequest: StoryGenerationRequest = {
        ...originalRequest,
        prompt: repairPrompt,
      };

      console.log('[AIService] Sending story repair request to AI...');
      let repairedResponse = await this.currentProvider!.generateStory(repairRequest);

      // Transform the repaired response
      repairedResponse = this.transformStoryResponse(repairedResponse);

      // Clean up redundant parameters
      this.cleanupRedundantParameters(repairedResponse);

      // Verify the repair didn't break the story
      if (!repairedResponse.beats || repairedResponse.beats.length === 0) {
        console.warn('[AIService] Story repair produced invalid response (no beats)');
        return null;
      }

      // Check that we didn't lose beats
      if (repairedResponse.beats.length < story.beats.length) {
        console.warn('[AIService] Story repair removed beats, rejecting');
        return null;
      }

      console.log('[AIService] Story repair completed, verifying...');
      return repairedResponse;

    } catch (error) {
      console.error('[AIService] Story repair failed:', error);
      return null;
    }
  }

  /**
   * Generate dialog tree
   */
  async generateDialog(request: DialogGenerationRequest): Promise<DialogGenerationResponse> {
    this.ensureReady();

    console.log('[AIService] Generating dialog for scene:', request.scene);

    try {
      const response = await this.currentProvider!.generateDialog(request);

      // Validate if enabled
      if (this.options.validateSchema) {
        const validation = await this.validator.validateDialogGeneration(response);

        if (!validation.valid) {
          console.error('[AIService] Dialog validation failed:', validation.errors);
          throw new Error(`Dialog validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('[AIService] Dialog validation warnings:', validation.warnings);
        }
      }

      console.log('[AIService] Dialog generated successfully');
      return response;

    } catch (error) {
      console.error('[AIService] Dialog generation failed:', error);
      throw error;
    }
  }

  /**
   * Suggest next beats
   */
  async suggestBeats(request: BeatSuggestionRequest): Promise<BeatSuggestionResponse> {
    this.ensureReady();

    console.log('[AIService] Generating beat suggestions for:', request.currentBeat.name);

    try {
      const response = await this.currentProvider!.suggestBeats(request);

      // Basic validation - ensure suggestions are for valid beat types
      if (this.options.validateSchema) {
        const schema = this.validator.getSchema();
        if (schema) {
          response.suggestions = response.suggestions.filter(s => {
            if (!schema.beatTypes[s.beatType]) {
              console.warn(`[AIService] Filtered invalid beat type suggestion: ${s.beatType}`);
              return false;
            }
            return true;
          });
        }
      }

      console.log('[AIService] Generated', response.suggestions.length, 'beat suggestions');
      return response;

    } catch (error) {
      console.error('[AIService] Beat suggestion failed:', error);
      throw error;
    }
  }

  /**
   * Create beat from natural language
   */
  async createBeatFromNL(request: NaturalLanguageBeatRequest): Promise<NaturalLanguageBeatResponse> {
    this.ensureReady();

    console.log('[AIService] Creating beat from description:', request.description);

    try {
      const response = await this.currentProvider!.createBeatFromNL(request);

      // Validate generated beat
      if (this.options.validateSchema) {
        const validation = await this.validator.validateBeat(response.beat);

        if (!validation.valid) {
          console.error('[AIService] Beat validation failed:', validation.errors);
          throw new Error(`Beat validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('[AIService] Beat validation warnings:', validation.warnings);
        }
      }

      console.log('[AIService] Beat created:', response.beat.type, response.beat.name);
      return response;

    } catch (error) {
      console.error('[AIService] Natural language beat creation failed:', error);
      throw error;
    }
  }

  /**
   * Get validator instance
   */
  getValidator() {
    return this.validator;
  }

  /**
   * Get beat schema
   */
  async getBeatSchema(): Promise<any> {
    await this.validator.ensureSchemaLoaded();
    return this.validator.getSchema();
  }
}

/**
 * Singleton instance
 */
let serviceInstance: AIService | null = null;

/**
 * Get shared AI service instance
 */
export function getAIService(options?: AIServiceOptions): AIService {
  if (!serviceInstance) {
    serviceInstance = new AIService(options);
  }
  return serviceInstance;
}

/**
 * Reset service instance (mainly for testing)
 */
export function resetAIService(): void {
  serviceInstance = null;
}
