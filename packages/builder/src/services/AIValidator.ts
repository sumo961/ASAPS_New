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
  try {
    // Prefer live schema from API server (explicit URL to avoid dev-server HTML responses)
    const apiResponse = await fetch('http://localhost:3001/api/schema/beats');
    if (apiResponse.ok) {
      return await apiResponse.json();
    }

    // Fallback to static asset served from /public/beat-definitions/core-beats.json
    const staticResponse = await fetch('/beat-definitions/core-beats.json');
    if (staticResponse.ok) {
      return await staticResponse.json();
    }

    throw new Error('Failed to load beat schema from API or static asset');
  } catch (error) {
    console.error('[AIValidator] Failed to load beat schema:', error);
    // Return minimal schema as fallback
    return {
      schema: 'asaps-beat-definitions-v2.2',
      beatTypes: {}
    };
  }
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

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
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
