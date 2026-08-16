/**
 * AI Content Validator
 *
 * Validates AI-generated content against beat schema
 */

import type { GeneratedBeat, AIValidationResult, StoryGenerationResponse, DialogGenerationResponse } from '../types/ai';
import { beatLinks } from '../utils/storyLinks';

/**
 * Load beat definitions schema.
 *
 * Priority order:
 *   1. Static file at /beat-definitions/core-beats.json — this is the
 *      single source of truth. In the web builder, Vite serves it from
 *      packages/builder/public/beat-definitions/, which is symlinked to
 *      the canonical /beat-definitions/core-beats.json at the repo root.
 *   2. Local API server (http://localhost:3001/api/schema/beats) — only
 *      consulted if the static fetch fails. Historically used by the
 *      Electron desktop app, but its in-memory cache can go stale, so
 *      it must NEVER win against the static file. (This was the
 *      v0.9.51 schema-divergence bug: the desktop app on 3001 was
 *      caching v2.2 while the static file was correctly v2.3.)
 */
async function loadBeatSchema(): Promise<any> {
  // 1. Static file — canonical.
  // Resolve RELATIVE to the document base, not as an absolute "/…" path: under
  // file:// (the packaged / dev Electron app) an absolute path resolves to the
  // filesystem root and 404s (net::ERR_FILE_NOT_FOUND), silently downgrading to
  // the possibly-stale API-server fallback. `new URL(rel, document.baseURI)`
  // yields http://host/beat-definitions/… on the dev server and
  // file:///…/builder/beat-definitions/… in Electron — both resolve correctly.
  try {
    const schemaUrl = typeof document !== 'undefined' && document.baseURI
      ? new URL('beat-definitions/core-beats.json', document.baseURI).href
      : '/beat-definitions/core-beats.json';
    const staticResponse = await fetch(schemaUrl);
    if (staticResponse.ok) {
      console.log('[AIValidator] Schema loaded from static file');
      return await staticResponse.json();
    }
  } catch {
    // Fall through
  }

  // 2. API server fallback (e.g. when running outside Vite without /public)
  try {
    const apiResponse = await fetch('http://localhost:3001/api/schema/beats');
    if (apiResponse.ok) {
      console.warn('[AIValidator] Static schema unavailable; falling back to API server. This may be stale.');
      return await apiResponse.json();
    }
  } catch {
    // No API server either
  }

  // Last resort
  console.error('[AIValidator] All schema sources failed, using empty schema');
  return {
    schema: 'asaps-beat-definitions-v2.3',
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

    // Validate required parameters.
    //
    // Nested-block parameters (e.g. conditionBeat.condition) are deleted
    // by the v0.9.51+ schema-driven pipeline after their fields are
    // flattened to top-level params. The schema still marks them
    // required because the *contract* is fulfilled by the discriminator
    // (params.conditionType) plus the per-condition-type required-field
    // map in the conditionTypes registry — which the pipeline's
    // validateBeat (in @asaps/core/normalize) already enforces.
    // So skip any parameter whose name is declared as a nested block.
    const nestedBlockNames = new Set(Object.keys((beatDefinition as any).nested || {}));
    if (beatDefinition.parameters) {
      for (const [paramName, paramDef] of Object.entries(beatDefinition.parameters as any)) {
        if (nestedBlockNames.has(paramName)) continue;
        if ((paramDef as any).required && !(paramName in beat.parameters)) {
          errors.push({
            path: `parameters.${paramName}`,
            message: `Required parameter '${paramName}' is missing`,
            severity: 'error'
          });
        }
      }
    }

    // Validate parameter types.
    //
    // Two cases get a free pass on the "not defined in schema" warning:
    // 1. conditionBeat top-level fields (sentimentTarget, baseline, …) are
    //    declared per-condition-type in the schema's `conditionTypes` registry
    //    — not in beatDefinition.parameters — and the schema-driven pipeline
    //    intentionally lifts them to top-level for the inspector.
    // 2. Aliases declared on a parameter spec (e.g. trueTarget on
    //    conditionBeat.trueConnection) are valid alternate names.
    //
    // Without these passes, every post-pipeline conditionBeat would emit a
    // dozen false-positive warnings.
    const conditionFieldsRegistry = new Set<string>();
    if (beat.type === 'conditionBeat' && this.schema?.conditionTypes) {
      for (const [, ct] of Object.entries(this.schema.conditionTypes as any)) {
        if (typeof ct !== 'object' || !ct) continue;
        for (const f of [...((ct as any).required || []), ...((ct as any).optional || [])]) {
          conditionFieldsRegistry.add(f);
        }
        // Also accept aliased forms registered for any canonical field.
        const aliases = (ct as any).aliases;
        if (aliases) for (const list of Object.values(aliases)) {
          if (Array.isArray(list)) for (const a of list) conditionFieldsRegistry.add(a as string);
        }
      }
      // The discriminator itself.
      conditionFieldsRegistry.add('conditionType');
    }
    const allAliases = new Set<string>();
    for (const [, ps] of Object.entries(beatDefinition.parameters || {})) {
      const aliases = (ps as any)?.aliases;
      if (Array.isArray(aliases)) for (const a of aliases) allAliases.add(a);
    }
    for (const [paramName, paramValue] of Object.entries(beat.parameters)) {
      const paramDef = beatDefinition.parameters?.[paramName];
      if (!paramDef) {
        if (conditionFieldsRegistry.has(paramName)) continue;
        if (allAliases.has(paramName)) continue;
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
      // Post-pipeline (v0.9.51+) condition fields live at top-level
      // (params.conditionType + params.character / sentimentTarget / …).
      // Pre-pipeline / unprocessed input still has them nested under
      // params.condition. Read from whichever exists so this validator
      // works for both — pipeline output and raw test fixtures.
      const cond: any = params.conditionType
        ? { type: params.conditionType, ...params }
        : params.condition;
      if (!cond) {
        errors.push({
          path: 'parameters.condition',
          message: 'ConditionBeat missing condition parameter',
          severity: 'error'
        });
      }
      // Per-condition-type required-field validation now lives in the
      // schema-driven pipeline (packages/core/src/normalize/validateBeat.ts),
      // which reads the conditionTypes registry from core-beats.json.
      // The legacy hardcoded map here had stale field names (axis vs
      // moodAxis, emotion vs emotionName, trait vs traitName) that caused
      // false-positive warnings; removed in the v0.9.51 refactor.
      // Check for connection targets
      if (!params.trueConnection && !params.trueTarget) {
        warnings.push('ConditionBeat missing trueConnection/trueTarget');
      }
      // Note: the v0.9.51 normalize/validate pipeline intentionally lifts
      // condition.* to top-level params for the inspector. The legacy
      // "forbidden top-level params" warning was removed in that refactor —
      // top-level fields are now the canonical post-pipeline shape.
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
    // One walk, shared with the validators, layout and both importers —
    // storyLinks. This file's own copy missed keypad failTarget, hotspots and
    // QR jumps, so beats reachable only those ways were reported unreachable.
    const targetedBeatIds = new Set<string>(
      response.beats.flatMap((b: any) => beatLinks(b)).map((l) => l.target),
    );

    // Check each beat (except first) is reachable
    const unreachableBeats: string[] = [];
    for (let i = 1; i < response.beats.length; i++) {
      const beat = response.beats[i];
      if (!targetedBeatIds.has(beat.id)) {
        unreachableBeats.push(`"${beat.name || beat.id}" (${beat.type})`);
      }
    }

    // ANY unreachable beats indicate broken story flow - this is an error
    if (unreachableBeats.length > 0) {
      errors.push({
        path: 'beats',
        message: `Story has ${unreachableBeats.length} unreachable beat(s): ${unreachableBeats.slice(0, 5).join(', ')}${unreachableBeats.length > 5 ? ` and ${unreachableBeats.length - 5} more` : ''}. Every beat must be reachable from the title screen. Please add connections to these orphaned beats.`,
        severity: 'error'
      });
    }

    // Check for unreachable condition branches (counter thresholds that can never be satisfied)
    const unreachableConditions = this.analyzeConditionThresholds(response.beats);
    if (unreachableConditions.length > 0) {
      for (const issue of unreachableConditions) {
        errors.push({
          path: `beats`,
          message: `ConditionBeat "${issue.beatName}" (${issue.beatId}): ${issue.branch} branch to "${issue.targetId}" is unreachable. Counter "${issue.counterName}" cannot satisfy ${issue.operator} ${issue.requiredValue}. Possible range: ${issue.minValue} to ${issue.maxValue}. ${issue.suggestion}`,
          severity: 'error'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Analyze counter modifications and check if conditionBeat thresholds are satisfiable
   */
  private analyzeConditionThresholds(beats: GeneratedBeat[]): Array<{
    beatId: string;
    beatName: string;
    branch: 'true' | 'false';
    targetId: string;
    counterName: string;
    operator: string;
    requiredValue: number;
    minValue: number;
    maxValue: number;
    suggestion: string;
  }> {
    const issues: Array<{
      beatId: string;
      beatName: string;
      branch: 'true' | 'false';
      targetId: string;
      counterName: string;
      operator: string;
      requiredValue: number;
      minValue: number;
      maxValue: number;
      suggestion: string;
    }> = [];

    // Step 1: Analyze all counter modifications
    const counterRanges = this.analyzeCounterModifications(beats);

    // Step 2: Check all conditionBeats
    for (const beat of beats) {
      if (beat.type !== 'conditionBeat') continue;

      const params = beat.parameters || {};
      const condition = params.condition as any;
      if (!condition) continue;

      // Only analyze counter-type conditions
      const condType = condition.type || params.conditionType;
      if (condType !== 'counter') continue;

      const counterName = condition.variable || condition.variableName || params.variable;
      const operator = condition.operator || params.operator || '>=';
      const requiredValue = Number(condition.value ?? params.value ?? 0);
      const trueTarget = params.trueTarget || params.trueConnection?.target;
      const falseTarget = params.falseTarget || params.falseConnection?.target;

      if (!counterName) continue;

      const range = counterRanges.get(counterName) || { min: 0, max: 0 };

      // Check if the condition can ever be true
      const canBeTrue = this.checkCounterCondition(range, operator, requiredValue);
      if (!canBeTrue && trueTarget) {
        const needed = requiredValue - range.max;
        issues.push({
          beatId: beat.id,
          beatName: beat.name || beat.id,
          branch: 'true',
          targetId: trueTarget,
          counterName,
          operator,
          requiredValue,
          minValue: range.min,
          maxValue: range.max,
          suggestion: needed > 0
            ? `Add ${needed} more to "${counterName}" via setVariable or choice effects.`
            : `Adjust condition threshold or add setVariable beats that modify "${counterName}".`
        });
      }

      // Check if the condition can ever be false (for false branch)
      const canBeFalse = this.checkCounterConditionCanBeFalse(range, operator, requiredValue);
      if (!canBeFalse && falseTarget) {
        issues.push({
          beatId: beat.id,
          beatName: beat.name || beat.id,
          branch: 'false',
          targetId: falseTarget,
          counterName,
          operator,
          requiredValue,
          minValue: range.min,
          maxValue: range.max,
          suggestion: `Condition is always true. Adjust threshold or counter modifications.`
        });
      }
    }

    return issues;
  }

  /**
   * Analyze all counter modifications in the story
   */
  private analyzeCounterModifications(beats: GeneratedBeat[]): Map<string, { min: number; max: number }> {
    const counterRanges = new Map<string, { min: number; max: number }>();

    for (const beat of beats) {
      const params = beat.parameters || {};

      // Analyze SetVariable beats
      if (beat.type === 'setVariable' || beat.type === 'variable') {
        const varType = params.type;
        const varName = params.name;
        const varValue = Number(params.value) || 0;
        const operation = params.operation || 'set';

        if (!varName || varType !== 'counter') continue;

        if (!counterRanges.has(varName)) {
          counterRanges.set(varName, { min: 0, max: 0 });
        }

        const range = counterRanges.get(varName)!;
        this.applyCounterOperation(range, operation, varValue);
      }

      // Analyze choice-based beats with counter effects
      if (beat.type === 'movementChoice' || beat.type === 'pickProp') {
        const choices = params.choices || params.props || [];
        for (const choice of choices) {
          const counterName = choice.counterEffect?.counter || choice.counter;
          const counterValue = Number(choice.counterEffect?.value ?? choice.counterValue ?? 0);
          const operation = choice.counterEffect?.operation || choice.counterOperation || 'change';

          if (counterName && counterValue !== undefined) {
            if (!counterRanges.has(counterName)) {
              counterRanges.set(counterName, { min: 0, max: 0 });
            }
            const range = counterRanges.get(counterName)!;
            this.applyCounterOperation(range, operation, counterValue);
          }
        }
      }

      // Analyze dialogTree choices
      if (beat.type === 'dialogTree' && params.dialogTree) {
        this.analyzeDialogTreeCounters(params.dialogTree, counterRanges);
      }
    }

    return counterRanges;
  }

  /**
   * Recursively analyze dialog tree for counter modifications
   */
  private analyzeDialogTreeCounters(node: any, counterRanges: Map<string, { min: number; max: number }>): void {
    if (!node) return;

    if (node.choices) {
      for (const choice of node.choices) {
        const counterName = choice.counterEffect?.counter || choice.counter;
        const counterValue = Number(choice.counterEffect?.value ?? choice.counterValue ?? 0);
        const operation = choice.counterEffect?.operation || choice.counterOperation || 'change';

        if (counterName && counterValue !== undefined) {
          if (!counterRanges.has(counterName)) {
            counterRanges.set(counterName, { min: 0, max: 0 });
          }
          const range = counterRanges.get(counterName)!;
          this.applyCounterOperation(range, operation, counterValue);
        }

        // Recursively check nested dialog nodes
        if (choice.dialogNode) {
          this.analyzeDialogTreeCounters(choice.dialogNode, counterRanges);
        }
      }
    }
  }

  /**
   * Apply a counter operation to a range
   */
  private applyCounterOperation(range: { min: number; max: number }, operation: string, value: number): void {
    if (operation === 'set') {
      range.max = Math.max(range.max, value);
      range.min = Math.min(range.min, value);
    } else if (operation === 'change' || operation === 'add') {
      if (value > 0) {
        range.max += value;
      } else {
        range.min += value;
      }
    } else if (operation === 'subtract') {
      if (value > 0) {
        range.min -= value;
      } else {
        range.max -= value;
      }
    } else if (operation === 'multiply' && value !== 0) {
      const newMax = Math.max(range.max * value, range.min * value);
      const newMin = Math.min(range.max * value, range.min * value);
      range.max = newMax;
      range.min = newMin;
    } else if (operation === 'divide' && value !== 0) {
      const newMax = Math.max(range.max / value, range.min / value);
      const newMin = Math.min(range.max / value, range.min / value);
      range.max = newMax;
      range.min = newMin;
    }
  }

  /**
   * Check if a counter condition can be satisfied
   */
  private checkCounterCondition(range: { min: number; max: number }, operator: string, value: number): boolean {
    switch (operator) {
      case '==': return range.min <= value && value <= range.max;
      case '!=': return true; // Always possible unless range is a single point
      case '>': return range.max > value;
      case '>=': return range.max >= value;
      case '<': return range.min < value;
      case '<=': return range.min <= value;
      default: return true;
    }
  }

  /**
   * Check if a counter condition can ever be false
   */
  private checkCounterConditionCanBeFalse(range: { min: number; max: number }, operator: string, value: number): boolean {
    switch (operator) {
      case '==': return range.min < value || value < range.max; // Can be != if range spans more than value
      case '!=': return range.min <= value && value <= range.max; // Can be == if value is in range
      case '>': return range.min <= value; // Can be <= value
      case '>=': return range.min < value; // Can be < value
      case '<': return range.max >= value; // Can be >= value
      case '<=': return range.max > value; // Can be > value
      default: return true;
    }
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
