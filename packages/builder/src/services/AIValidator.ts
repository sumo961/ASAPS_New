/**
 * AI Content Validator
 *
 * Validates AI-generated content against beat schema
 */

import type { GeneratedBeat, AIValidationResult, StoryGenerationResponse, DialogGenerationResponse } from '../types/ai';

/**
 * Load beat definitions schema
 */
async function loadBeatSchema(): Promise<any> {
  // Try API server first (if running)
  try {
    const apiResponse = await fetch('http://localhost:3001/api/schema/beats');
    if (apiResponse.ok) {
      console.log('[AIValidator] Schema loaded from API server');
      return await apiResponse.json();
    }
  } catch {
    // API server not running - this is fine, fall through to static file
  }

  // Fallback to static asset served from /public/beat-definitions/core-beats.json
  try {
    const staticResponse = await fetch('/beat-definitions/core-beats.json');
    if (staticResponse.ok) {
      console.log('[AIValidator] Schema loaded from static file');
      return await staticResponse.json();
    }
  } catch (error) {
    console.error('[AIValidator] Failed to load static schema:', error);
  }

  // Last resort fallback
  console.error('[AIValidator] All schema sources failed, using empty schema');
  return {
    schema: 'asaps-beat-definitions-v2.2',
    beatTypes: {}
  };
}

/**
 * AI Content Validator
 */
export class AIValidator {
  private schema: any | null = null;
  private schemaLoaded: Promise<void>;

  constructor() {
    this.schemaLoaded = this.loadSchema();
  }

  /**
   * Load beat definitions schema
   */
  private async loadSchema(): Promise<void> {
    this.schema = await loadBeatSchema();
    console.log('[AIValidator] Schema loaded with', Object.keys(this.schema.beatTypes).length, 'beat types');
  }

  /**
   * Ensure schema is loaded
   */
  async ensureSchemaLoaded(): Promise<void> {
    await this.schemaLoaded;
  }

  /**
   * Get loaded schema
   */
  getSchema(): any {
    return this.schema;
  }

  /**
   * Validate a single generated beat
   */
  async validateBeat(beat: GeneratedBeat): Promise<AIValidationResult> {
    await this.ensureSchemaLoaded();

    const errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }> = [];
    const warnings: string[] = [];

    // Check if beat type exists
    if (!this.schema?.beatTypes[beat.type]) {
      errors.push({
        path: 'type',
        message: `Unknown beat type: ${beat.type}`,
        severity: 'error'
      });
      return { valid: false, errors, warnings };
    }

    const beatDefinition = this.schema.beatTypes[beat.type];

    // Validate required parameters
    if (beatDefinition.parameters) {
      for (const [paramName, paramDef] of Object.entries(beatDefinition.parameters as any)) {
        if ((paramDef as any).required && !(paramName in beat.parameters)) {
          errors.push({
            path: `parameters.${paramName}`,
            message: `Required parameter '${paramName}' is missing`,
            severity: 'error'
          });
        }
      }
    }

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(beat.parameters)) {
      const paramDef = beatDefinition.parameters?.[paramName];
      if (!paramDef) {
        warnings.push(`Parameter '${paramName}' not defined in schema for beat type '${beat.type}'`);
        continue;
      }

      const typeValid = this.validateParameterType(paramValue, paramDef.type);
      if (!typeValid) {
        errors.push({
          path: `parameters.${paramName}`,
          message: `Parameter '${paramName}' has incorrect type. Expected ${paramDef.type}`,
          severity: 'error'
        });
      }
    }

    // Validate connections
    if (beat.connections) {
      for (let i = 0; i < beat.connections.length; i++) {
        const conn = beat.connections[i];
        if (!conn.targetId) {
          errors.push({
            path: `connections[${i}]`,
            message: 'Connection missing targetId',
            severity: 'error'
          });
        }
      }
    }

    // Check connection type constraints
    const connectionType = beatDefinition.connectionType;
    if (connectionType === 'none' && beat.connections && beat.connections.length > 0) {
      warnings.push(`Beat type '${beat.type}' should not have connections`);
    } else if (connectionType === 'single' && beat.connections && beat.connections.length > 1) {
      warnings.push(`Beat type '${beat.type}' should have at most one connection`);
    }

    // Beat-type-specific validation
    this.validateBeatTypeSpecific(beat, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Beat-type-specific validation to catch common AI generation issues
   */
  private validateBeatTypeSpecific(
    beat: GeneratedBeat,
    errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>,
    warnings: string[]
  ): void {
    const params = beat.parameters || {};

    // DialogTree validation
    if (beat.type === 'dialogTree') {
      const dt = params.dialogTree;
      if (!dt) {
        errors.push({
          path: 'parameters.dialogTree',
          message: 'DialogTree beat missing dialogTree parameter',
          severity: 'error'
        });
      } else {
        // Check for wrapped structure (common AI mistake)
        if (dt.root && !dt.id) {
          warnings.push('DialogTree has extra "root" wrapper - should be unwrapped');
        }
        // Check for content
        const node = dt.root || dt;
        if (!node.text && !node.speaker) {
          warnings.push('DialogTree has no speaker or text content');
        }
        if (!node.choices || !Array.isArray(node.choices) || node.choices.length === 0) {
          warnings.push('DialogTree has no choices');
        }
      }
    }

    // ConditionBeat validation
    if (beat.type === 'conditionBeat') {
      const cond = params.condition;
      if (!cond) {
        errors.push({
          path: 'parameters.condition',
          message: 'ConditionBeat missing condition parameter',
          severity: 'error'
        });
      } else {
        // Inventory conditions use 'item' and 'checkType' instead of 'variable' and 'operator'
        const isInventoryCondition = cond.type === 'inventory';

        if (isInventoryCondition) {
          // Check for item (inventory conditions)
          if (!cond.item) {
            warnings.push('ConditionBeat inventory condition missing item');
          }
          // checkType is optional (defaults to 'has'), so no warning needed
        } else {
          // Check for variable name (counter/variable conditions)
          if (!cond.variable && !cond.variableName && !cond.name) {
            warnings.push('ConditionBeat missing variable name in condition');
          }
          // Check for operator
          if (!cond.operator) {
            warnings.push('ConditionBeat missing operator in condition');
          }
        }
      }
      // Check for connection targets
      if (!params.trueConnection && !params.trueTarget) {
        warnings.push('ConditionBeat missing trueConnection/trueTarget');
      }

      // Detect incorrectly duplicated parameters at top level (common AI generation error)
      const forbiddenTopLevel = ['item', 'character', 'checkType', 'variable', 'variableName', 'operator', 'value', 'conditionType'];
      for (const field of forbiddenTopLevel) {
        if (params[field] !== undefined) {
          warnings.push(`ConditionBeat has '${field}' at top level - should only be inside 'condition' object`);
        }
      }
    }

    // HyperText validation
    if (beat.type === 'hyperText') {
      if (!params.text) {
        errors.push({
          path: 'parameters.text',
          message: 'HyperText beat missing text parameter',
          severity: 'error'
        });
      }
      if (!params.hyperlinks || !Array.isArray(params.hyperlinks) || params.hyperlinks.length === 0) {
        warnings.push('HyperText has no hyperlinks defined');
      } else if (params.text) {
        // Check if hyperlinks match text
        for (const link of params.hyperlinks) {
          const word = link.word || link.text || link.phrase;
          if (word && !params.text.includes(word)) {
            warnings.push(`HyperText link "${word}" not found in text`);
          }
        }
      }
    }

    // EndScreen validation
    if (beat.type === 'endScreen') {
      if (!params.message && !params.endMessage && !params.text) {
        warnings.push('EndScreen has no message/text content');
      }
    }

    // SetVariable validation
    if (beat.type === 'setVariable') {
      if (!params.name && !params.variableName) {
        warnings.push('SetVariable missing variable/counter name');
      }
      if (params.value === undefined) {
        warnings.push('SetVariable missing value');
      }
      // Check for type/operation mismatch
      if (params.operation && ['add', 'change', 'subtract', 'multiply', 'divide'].includes(params.operation)) {
        if (params.type === 'variable') {
          warnings.push('SetVariable has operation but type="variable" - should be type="counter"');
        }
      }
    }

    // PickProp validation
    if (beat.type === 'pickProp') {
      if (params.props && Array.isArray(params.props)) {
        for (const prop of params.props) {
          // Check if name looks like an action instead of an item name
          const name = prop.name || '';
          const actionWords = ['take', 'pick up', 'continue', 'leave', 'go', 'search', 'examine'];
          const lowerName = name.toLowerCase();
          if (actionWords.some(word => lowerName.startsWith(word))) {
            warnings.push(`PickProp prop "${name}" looks like an action description, not an item name`);
          }
        }
      }
    }
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        // Complex types or custom types - basic validation
        return value !== undefined && value !== null;
    }
  }

  /**
   * Validate complete story generation
   */
  async validateStoryGeneration(response: StoryGenerationResponse): Promise<AIValidationResult> {
    await this.ensureSchemaLoaded();

    const errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }> = [];
    const warnings: string[] = [];

    // Validate metadata
    if (!response.metadata.title || response.metadata.title.trim() === '') {
      errors.push({
        path: 'metadata.title',
        message: 'Story title is required',
        severity: 'error'
      });
    }

    if (!response.metadata.author || response.metadata.author.trim() === '') {
      warnings.push('Story author is missing');
    }

    // Validate beats
    if (!response.beats || response.beats.length === 0) {
      errors.push({
        path: 'beats',
        message: 'Story must have at least one beat',
        severity: 'error'
      });
      return { valid: false, errors, warnings };
    }

    // Check for title screen
    const hasTitleScreen = response.beats.some(b => b.type === 'titleScreen');
    if (!hasTitleScreen) {
      warnings.push('Story should start with a titleScreen beat');
    }

    // Validate each beat
    const beatIds = new Set<string>();
    for (let i = 0; i < response.beats.length; i++) {
      const beat = response.beats[i];

      // Check for duplicate IDs
      if (beatIds.has(beat.id)) {
        errors.push({
          path: `beats[${i}].id`,
          message: `Duplicate beat ID: ${beat.id}`,
          severity: 'error'
        });
      }
      beatIds.add(beat.id);

      // Validate individual beat
      const beatValidation = await this.validateBeat(beat);
      if (!beatValidation.valid) {
        for (const error of beatValidation.errors) {
          errors.push({
            path: `beats[${i}].${error.path}`,
            message: error.message,
            severity: error.severity
          });
        }
      }
      if (beatValidation.warnings) {
        warnings.push(...beatValidation.warnings.map(w => `beats[${i}]: ${w}`));
      }
    }

    // Validate connections reference existing beats
    for (let i = 0; i < response.beats.length; i++) {
      const beat = response.beats[i];
      if (beat.connections) {
        for (const conn of beat.connections) {
          if (!beatIds.has(conn.targetId)) {
            errors.push({
              path: `beats[${i}].connections`,
              message: `Connection references non-existent beat: ${conn.targetId}`,
              severity: 'error'
            });
          }
        }
      }
    }

    // Check for unreachable beats (beats that nothing connects to)
    // Build set of all target beat IDs
    const targetedBeatIds = new Set<string>();

    // Helper function to recursively extract targets from dialogTree nodes
    const extractDialogTreeTargets = (node: any, targets: Set<string>) => {
      if (!node) return;
      // Check if node itself has a target
      if (node.target) targets.add(node.target);
      if (node.targetId) targets.add(node.targetId);
      // Check choices array
      if (node.choices && Array.isArray(node.choices)) {
        for (const choice of node.choices) {
          if (choice.target) targets.add(choice.target);
          if (choice.targetId) targets.add(choice.targetId);
          // Recursively check nested dialogNode
          if (choice.dialogNode) {
            extractDialogTreeTargets(choice.dialogNode, targets);
          }
          // Also check if target is an object (nested node)
          if (typeof choice.target === 'object') {
            extractDialogTreeTargets(choice.target, targets);
          }
        }
      }
      // Check next node if present
      if (node.next) {
        if (typeof node.next === 'string') {
          targets.add(node.next);
        } else {
          extractDialogTreeTargets(node.next, targets);
        }
      }
    };

    for (const beat of response.beats) {
      // Add targets from connections array
      if (beat.connections) {
        for (const conn of beat.connections) {
          targetedBeatIds.add(conn.targetId);
        }
      }
      // Add targets from parameters (for beat types that store connections in params)
      const params = beat.parameters || {};
      if (params.defaultTarget) targetedBeatIds.add(params.defaultTarget);
      if (params.trueTarget) targetedBeatIds.add(params.trueTarget);
      if (params.falseTarget) targetedBeatIds.add(params.falseTarget);
      if (params.trueConnection?.target) targetedBeatIds.add(params.trueConnection.target);
      if (params.falseConnection?.target) targetedBeatIds.add(params.falseConnection.target);
      if (params.target) targetedBeatIds.add(params.target);
      if (params.timerTarget) targetedBeatIds.add(params.timerTarget);
      // Check choices arrays (movementChoice, pickProp, randomTarget)
      const choices = params.choices || params.props || [];
      for (const choice of choices) {
        if (choice.target) targetedBeatIds.add(choice.target);
        if (choice.targetId) targetedBeatIds.add(choice.targetId);
      }
      // Recursively extract targets from dialogTree (handles nested dialogNodes)
      if (params.dialogTree) {
        extractDialogTreeTargets(params.dialogTree, targetedBeatIds);
      }
      // Check hyperlinks for hyperText
      if (params.hyperlinks) {
        for (const link of params.hyperlinks) {
          if (link.targetBeatId) targetedBeatIds.add(link.targetBeatId);
        }
      }
    }

    // Check each beat (except first) is reachable
    for (let i = 1; i < response.beats.length; i++) {
      const beat = response.beats[i];
      if (!targetedBeatIds.has(beat.id)) {
        warnings.push(`Beat "${beat.name || beat.id}" (${beat.type}) is unreachable - no other beat connects to it`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate dialog generation
   */
  async validateDialogGeneration(response: DialogGenerationResponse): Promise<AIValidationResult> {
    const errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }> = [];
    const warnings: string[] = [];

    if (!response.dialogTree) {
      errors.push({
        path: 'dialogTree',
        message: 'Dialog tree is required',
        severity: 'error'
      });
      return { valid: false, errors, warnings };
    }

    // Validate dialog tree structure
    const nodeIds = new Set<string>();
    const validateNode = (node: any, path: string = 'dialogTree') => {
      // Check required fields
      if (!node.id) {
        errors.push({
          path: `${path}.id`,
          message: 'Dialog node must have an ID',
          severity: 'error'
        });
      } else if (nodeIds.has(node.id)) {
        errors.push({
          path: `${path}.id`,
          message: `Duplicate dialog node ID: ${node.id}`,
          severity: 'error'
        });
      } else {
        nodeIds.add(node.id);
      }

      if (!node.text || node.text.trim() === '') {
        errors.push({
          path: `${path}.text`,
          message: 'Dialog node must have text',
          severity: 'error'
        });
      }

      // Validate choices
      if (node.choices) {
        if (!Array.isArray(node.choices)) {
          errors.push({
            path: `${path}.choices`,
            message: 'Choices must be an array',
            severity: 'error'
          });
        } else {
          for (let i = 0; i < node.choices.length; i++) {
            const choice = node.choices[i];
            if (!choice.id) {
              errors.push({
                path: `${path}.choices[${i}].id`,
                message: 'Choice must have an ID',
                severity: 'error'
              });
            }
            if (!choice.text) {
              errors.push({
                path: `${path}.choices[${i}].text`,
                message: 'Choice must have text',
                severity: 'error'
              });
            }

            // Recursively validate nested dialog nodes
            if (typeof choice.target === 'object') {
              validateNode(choice.target, `${path}.choices[${i}].target`);
            }
          }
        }
      }

      // Validate next node if it's an object
      if (node.next && typeof node.next === 'object') {
        validateNode(node.next, `${path}.next`);
      }
    };

    validateNode(response.dialogTree);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get validation summary string
   */
  getValidationSummary(result: AIValidationResult): string {
    if (result.valid) {
      return '✓ Validation passed';
    }

    const errorCount = result.errors.length;
    const warningCount = result.warnings?.length || 0;

    let summary = `✗ Validation failed with ${errorCount} error(s)`;
    if (warningCount > 0) {
      summary += ` and ${warningCount} warning(s)`;
    }

    return summary;
  }
}

/**
 * Singleton instance
 */
let validatorInstance: AIValidator | null = null;

/**
 * Get shared validator instance
 */
export function getAIValidator(): AIValidator {
  if (!validatorInstance) {
    validatorInstance = new AIValidator();
  }
  return validatorInstance;
}
