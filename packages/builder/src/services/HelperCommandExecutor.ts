/**
 * Helper Command Executor Service
 *
 * Applies structured actions from helper commands to the story.
 * Generates preview of changes and creates undoable batch commands.
 */

import type { Beat, BeatConfig, Location, Transition, Sound } from '@asaps/core';
import type {
  StructuredAction,
  Modification,
  ChangePreview,
  PreviewChange,
  ExecutionResult,
  TextDiff,
  DiffSegment,
  ChangeGroup,
  SelectorTargetType,
  TextTransform,
} from '../types/helperCommand';
import { getHelperCommandFilter, type FilterResult, type LocationMatch } from './HelperCommandFilter';
import { BatchCommand, BatchCommandBuilder } from '../commands/BatchCommand';
import { UpdateBeatCommand, type BeatStateMutations } from '../commands/BeatCommands';
import { getAIService } from './AIService';

// ============================================================================
// Executor Service
// ============================================================================

/**
 * Executor service for helper commands
 */
export class HelperCommandExecutor {
  private mutations: BeatStateMutations | null = null;

  /**
   * Set the mutation callbacks for creating commands
   */
  setMutations(mutations: BeatStateMutations): void {
    this.mutations = mutations;
  }

  /**
   * Generate a preview of what changes would be made
   */
  async generatePreview(action: StructuredAction, filterResult: FilterResult): Promise<ChangePreview> {
    const changes: PreviewChange[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const changesByType = new Map<string, ChangeGroup>();

    // Process based on action type
    switch (action.actionType) {
      case 'setProperty':
        this.previewSetProperty(action, filterResult, changes, warnings);
        break;
      case 'addElement':
        this.previewAddElement(action, filterResult, changes, warnings);
        break;
      case 'removeElement':
        this.previewRemoveElement(action, filterResult, changes, warnings);
        break;
      case 'moveElement':
        this.previewMoveElement(action, filterResult, changes, warnings);
        break;
      case 'transformText':
        await this.previewTransformText(action, filterResult, changes, warnings);
        break;
      default:
        errors.push(`Unknown action type: ${action.actionType}`);
    }

    // Group changes by type
    for (const change of changes) {
      const key = `${change.elementType}:${change.property}`;
      if (!changesByType.has(key)) {
        changesByType.set(key, {
          type: change.elementType as SelectorTargetType,
          count: 0,
          sampleNames: [],
        });
      }
      const group = changesByType.get(key)!;
      group.count++;
      if (group.sampleNames.length < 5) {
        group.sampleNames.push(change.elementName);
      }
    }

    // Add warning if confidence is low
    if (action.confidence < 0.8) {
      warnings.push(`Low confidence (${Math.round(action.confidence * 100)}%) - please review carefully`);
    }

    return {
      totalAffected: changes.length,
      changesByType,
      changes,
      warnings,
      errors,
    };
  }

  /**
   * Execute the action and return a batch command
   */
  async execute(action: StructuredAction, filterResult: FilterResult): Promise<BatchCommand | null> {
    if (!this.mutations) {
      throw new Error('Mutations not set. Call setMutations first.');
    }

    const builder = new BatchCommandBuilder()
      .setDescription(action.interpretation);

    // Create commands based on action type
    switch (action.actionType) {
      case 'setProperty':
        this.executeSetProperty(action, filterResult, builder);
        break;
      case 'addElement':
        this.executeAddElement(action, filterResult, builder);
        break;
      case 'removeElement':
        this.executeRemoveElement(action, filterResult, builder);
        break;
      case 'moveElement':
        this.executeMoveElement(action, filterResult, builder);
        break;
      case 'transformText':
        await this.executeTransformText(action, filterResult, builder);
        break;
    }

    return builder.buildOrNull();
  }

  // ============================================================================
  // Set Property Operations
  // ============================================================================

  private previewSetProperty(
    action: StructuredAction,
    filterResult: FilterResult,
    changes: PreviewChange[],
    warnings: string[]
  ): void {
    const { modification } = action;
    const property = modification.property || '';

    if (action.targetSelector.targetType === 'beat') {
      for (const beat of filterResult.beats) {
        const oldValue = this.getBeatPropertyValue(beat, property);
        changes.push({
          id: `${beat.id}:${property}`,
          elementType: 'beat',
          elementId: beat.id,
          elementName: beat.name,
          property,
          oldValue,
          newValue: modification.value,
        });
      }
    } else if (action.targetSelector.targetType === 'location') {
      for (const match of filterResult.locations) {
        const oldValue = this.getLocationPropertyValue(match.location, property);
        changes.push({
          id: `${match.beat.id}:${match.location.name}:${property}`,
          elementType: 'location',
          elementId: match.location.name,
          elementName: `${match.beat.name} > ${match.location.name}`,
          property,
          oldValue,
          newValue: modification.value,
        });
      }
    }
  }

  private executeSetProperty(
    action: StructuredAction,
    filterResult: FilterResult,
    builder: BatchCommandBuilder
  ): void {
    const { modification } = action;
    const property = modification.property || '';

    console.log('[HelperCommandExecutor] executeSetProperty:', {
      targetType: action.targetSelector.targetType,
      property,
      value: modification.value,
      beatsCount: filterResult.beats.length,
      locationsCount: filterResult.locations.length,
    });

    if (action.targetSelector.targetType === 'beat') {
      for (const beat of filterResult.beats) {
        const oldValue = this.getBeatPropertyValue(beat, property);
        const newValues = this.createBeatUpdate(property, modification.value);
        const oldValues = this.createBeatUpdate(property, oldValue);

        console.log(`[HelperCommandExecutor] Creating UpdateBeatCommand for beat ${beat.id}:`, {
          oldValues,
          newValues,
        });

        const command = new UpdateBeatCommand(
          beat.id,
          oldValues,
          newValues,
          this.mutations!
        );
        builder.add(command);
      }
    } else if (action.targetSelector.targetType === 'location') {
      // Group location changes by beat
      const changesByBeat = new Map<string, { beat: Beat; locations: LocationMatch[] }>();
      for (const match of filterResult.locations) {
        if (!changesByBeat.has(match.beat.id)) {
          changesByBeat.set(match.beat.id, { beat: match.beat, locations: [] });
        }
        changesByBeat.get(match.beat.id)!.locations.push(match);
      }

      for (const [beatId, { beat, locations }] of changesByBeat) {
        const oldLocations = Array.from(beat.locations.values());
        const newLocations = oldLocations.map(loc => {
          const match = locations.find(m => m.location.name === loc.name);
          if (match) {
            return { ...loc, [property]: modification.value };
          }
          return loc;
        });

        const command = new UpdateBeatCommand(
          beatId,
          { locations: oldLocations },
          { locations: newLocations },
          this.mutations!
        );
        builder.add(command);
      }
    }
  }

  // ============================================================================
  // Add Element Operations
  // ============================================================================

  private previewAddElement(
    action: StructuredAction,
    filterResult: FilterResult,
    changes: PreviewChange[],
    warnings: string[]
  ): void {
    const { modification } = action;
    const property = modification.property || 'element';

    for (const beat of filterResult.beats) {
      changes.push({
        id: `${beat.id}:add:${property}`,
        elementType: 'beat',
        elementId: beat.id,
        elementName: beat.name,
        property: `add ${property}`,
        oldValue: null,
        newValue: modification.value,
      });
    }
  }

  private executeAddElement(
    action: StructuredAction,
    filterResult: FilterResult,
    builder: BatchCommandBuilder
  ): void {
    const { modification } = action;
    const property = modification.property || '';

    for (const beat of filterResult.beats) {
      if (property === 'location' && modification.value) {
        // Adding a location
        const oldLocations = Array.from(beat.locations.values());
        const newLocation: Location = modification.value as Location;
        const newLocations = [...oldLocations, newLocation];

        const command = new UpdateBeatCommand(
          beat.id,
          { locations: oldLocations },
          { locations: newLocations },
          this.mutations!
        );
        builder.add(command);
      } else {
        // Adding other property
        const oldValue = this.getBeatPropertyValue(beat, property);
        const newValue = Array.isArray(oldValue)
          ? [...oldValue, modification.value]
          : modification.value;

        const command = new UpdateBeatCommand(
          beat.id,
          { [property]: oldValue },
          { [property]: newValue },
          this.mutations!
        );
        builder.add(command);
      }
    }
  }

  // ============================================================================
  // Remove Element Operations
  // ============================================================================

  private previewRemoveElement(
    action: StructuredAction,
    filterResult: FilterResult,
    changes: PreviewChange[],
    warnings: string[]
  ): void {
    if (action.targetSelector.targetType === 'location') {
      for (const match of filterResult.locations) {
        changes.push({
          id: `${match.beat.id}:remove:${match.location.name}`,
          elementType: 'location',
          elementId: match.location.name,
          elementName: `${match.beat.name} > ${match.location.name}`,
          property: 'remove',
          oldValue: match.location,
          newValue: null,
        });
      }
    }
  }

  private executeRemoveElement(
    action: StructuredAction,
    filterResult: FilterResult,
    builder: BatchCommandBuilder
  ): void {
    if (action.targetSelector.targetType === 'location') {
      // Group by beat
      const removeByBeat = new Map<string, { beat: Beat; locationNames: Set<string> }>();
      for (const match of filterResult.locations) {
        if (!removeByBeat.has(match.beat.id)) {
          removeByBeat.set(match.beat.id, { beat: match.beat, locationNames: new Set() });
        }
        removeByBeat.get(match.beat.id)!.locationNames.add(match.location.name);
      }

      for (const [beatId, { beat, locationNames }] of removeByBeat) {
        const oldLocations = Array.from(beat.locations.values());
        const newLocations = oldLocations.filter(loc => !locationNames.has(loc.name));

        const command = new UpdateBeatCommand(
          beatId,
          { locations: oldLocations },
          { locations: newLocations },
          this.mutations!
        );
        builder.add(command);
      }
    }
  }

  // ============================================================================
  // Move Element Operations
  // ============================================================================

  private previewMoveElement(
    action: StructuredAction,
    filterResult: FilterResult,
    changes: PreviewChange[],
    warnings: string[]
  ): void {
    const { modification } = action;

    for (const match of filterResult.locations) {
      let newX = match.location.x;
      let newY = match.location.y;

      if (modification.relativePosition) {
        // Relative positioning would be calculated here
        // For now, just show offset
        const offset = modification.relativePosition.offset || 50;
        switch (modification.relativePosition.direction) {
          case 'left': newX -= offset; break;
          case 'right': newX += offset; break;
          case 'above': newY -= offset; break;
          case 'below': newY += offset; break;
        }
      } else if (modification.value) {
        // Absolute offset
        if (modification.value.x !== undefined) newX += modification.value.x;
        if (modification.value.y !== undefined) newY += modification.value.y;
      }

      changes.push({
        id: `${match.beat.id}:move:${match.location.name}`,
        elementType: 'location',
        elementId: match.location.name,
        elementName: `${match.beat.name} > ${match.location.name}`,
        property: 'position',
        oldValue: { x: match.location.x, y: match.location.y },
        newValue: { x: newX, y: newY },
      });
    }
  }

  private executeMoveElement(
    action: StructuredAction,
    filterResult: FilterResult,
    builder: BatchCommandBuilder
  ): void {
    const { modification } = action;

    // Group by beat
    const moveByBeat = new Map<string, { beat: Beat; moves: Map<string, { x: number; y: number }> }>();

    for (const match of filterResult.locations) {
      if (!moveByBeat.has(match.beat.id)) {
        moveByBeat.set(match.beat.id, { beat: match.beat, moves: new Map() });
      }

      let newX = match.location.x;
      let newY = match.location.y;

      if (modification.relativePosition) {
        const offset = modification.relativePosition.offset || 50;
        switch (modification.relativePosition.direction) {
          case 'left': newX -= offset; break;
          case 'right': newX += offset; break;
          case 'above': newY -= offset; break;
          case 'below': newY += offset; break;
        }
      } else if (modification.value) {
        if (modification.value.x !== undefined) newX += modification.value.x;
        if (modification.value.y !== undefined) newY += modification.value.y;
      }

      moveByBeat.get(match.beat.id)!.moves.set(match.location.name, { x: newX, y: newY });
    }

    for (const [beatId, { beat, moves }] of moveByBeat) {
      const oldLocations = Array.from(beat.locations.values());
      const newLocations = oldLocations.map(loc => {
        const newPos = moves.get(loc.name);
        if (newPos) {
          return { ...loc, x: newPos.x, y: newPos.y };
        }
        return loc;
      });

      const command = new UpdateBeatCommand(
        beatId,
        { locations: oldLocations },
        { locations: newLocations },
        this.mutations!
      );
      builder.add(command);
    }
  }

  // ============================================================================
  // Text Transform Operations
  // ============================================================================

  private async previewTransformText(
    action: StructuredAction,
    filterResult: FilterResult,
    changes: PreviewChange[],
    warnings: string[]
  ): Promise<void> {
    const { modification } = action;
    const transform = modification.textTransform;

    if (!transform) {
      warnings.push('No text transformation specified');
      return;
    }

    const filter = getHelperCommandFilter();
    const useAI = this.needsAITransform(transform);

    if (useAI) {
      warnings.push('Using AI for contextual text transformation - preview may take a moment...');
    }

    for (const beat of filterResult.beats) {
      const textFields = filter.getTextContent(beat);

      for (const { field, text } of textFields) {
        // Skip author fields - they should never be transformed
        if (field === 'author') {
          continue;
        }

        // Determine the text type for context
        const textType = this.getTextTypeForField(field);

        // For short UI elements (buttons, titles), use simple replacement even in AI mode
        // to prevent AI from turning them into long descriptions
        const useSimpleReplacement = textType === 'button' || textType === 'title';

        let transformed: string;

        if (useAI && !useSimpleReplacement) {
          // Use AI for contextual transformation on narrative/dialog text
          transformed = await this.transformTextWithAI(text, transform, {
            textType,
          });
        } else {
          // Simple replacement with case preservation (handles primary + additional replacements)
          transformed = this.transformText(text, transform);
        }

        if (transformed !== text) {
          changes.push({
            id: `${beat.id}:text:${field}`,
            elementType: 'text',
            elementId: beat.id,
            elementName: `${beat.name} > ${field}`,
            property: field,
            oldValue: text,
            newValue: transformed,
            textDiff: useAI && !useSimpleReplacement
              ? this.createAIDiff(text, transformed)  // For AI, show full diff
              : this.createTextDiff(text, transformed, transform),
          });
        }
      }
    }

    if (changes.length === 0) {
      // Build a list of all patterns that were searched
      const allPatterns = [transform.findPattern];
      if (transform.additionalReplacements) {
        allPatterns.push(...transform.additionalReplacements.map(r => r.find));
      }
      warnings.push(`No matches found for: ${allPatterns.map(p => `"${p}"`).join(', ')}`);
    }
  }

  /**
   * Create a diff for AI-transformed text (shows all changes)
   */
  private createAIDiff(original: string, modified: string): TextDiff {
    // For AI transformations, we show a simple before/after since changes may be semantic
    return {
      original,
      modified,
      segments: [
        { text: original, type: 'removed' },
        { text: modified, type: 'added' },
      ],
    };
  }

  private async executeTransformText(
    action: StructuredAction,
    filterResult: FilterResult,
    builder: BatchCommandBuilder
  ): Promise<void> {
    const { modification } = action;
    const transform = modification.textTransform;

    if (!transform) return;

    const filter = getHelperCommandFilter();
    const useAI = this.needsAITransform(transform);

    for (const beat of filterResult.beats) {
      const textFields = filter.getTextContent(beat);
      const params = beat.getParameters();
      // Updates are wrapped in parameters since text fields are beat parameters
      const updatesParams: Record<string, any> = {};
      const oldParams: Record<string, any> = {};
      let hasChanges = false;

      for (const { field, text } of textFields) {
        // Skip author fields - they should never be transformed
        if (field === 'author') {
          continue;
        }

        // Determine the text type for context
        const textType = this.getTextTypeForField(field);

        // For short UI elements (buttons, titles), use simple replacement even in AI mode
        const useSimpleReplacement = textType === 'button' || textType === 'title';

        let transformed: string;

        if (useAI && !useSimpleReplacement) {
          // Use AI for contextual transformation on narrative/dialog text
          transformed = await this.transformTextWithAI(text, transform, {
            textType,
          });
        } else {
          // Simple replacement with case preservation (handles primary + additional replacements)
          transformed = this.transformText(text, transform);
        }

        if (transformed !== text) {
          // Handle nested fields (e.g., dialogTree.text)
          const fieldParts = field.split('.');
          if (fieldParts[0] === 'dialogTree') {
            // For dialog tree with AI, we transform each text individually
            // For simple replacement, transform the whole tree at once
            if (!updatesParams.dialogTree) {
              if (useAI) {
                updatesParams.dialogTree = await this.transformDialogTreeWithAI(
                  params.dialogTree,
                  transform
                );
              } else {
                updatesParams.dialogTree = this.transformDialogTree(
                  params.dialogTree,
                  transform
                );
              }
              oldParams.dialogTree = params.dialogTree;
            }
          } else if (fieldParts[0] === 'location') {
            // Skip location fields - they're handled separately
            continue;
          } else {
            // Indexed/nested paths (choices[0].text, props[1].text,
            // textVariations[2]) write through the path into a cloned root —
            // a flat `updatesParams["choices[0].text"]` would create a
            // literal key instead of editing the array.
            const parts = field.split(/\.|\[|\]/).filter(Boolean);
            if (parts.length > 1) {
              const root = parts[0];
              if (!(root in updatesParams)) {
                updatesParams[root] = JSON.parse(JSON.stringify(params[root]));
                oldParams[root] = params[root];
              }
              let cur: any = updatesParams[root];
              for (let i = 1; i < parts.length - 1; i++) {
                const k = isNaN(Number(parts[i])) ? parts[i] : Number(parts[i]);
                cur = cur?.[k];
              }
              const last = parts[parts.length - 1];
              const lk = isNaN(Number(last)) ? last : Number(last);
              if (cur && cur[lk] === text) {
                cur[lk] = transformed;
              }
            } else {
              // Regular text fields (text, title, message, etc.)
              updatesParams[field] = transformed;
              oldParams[field] = text;
            }
          }
          hasChanges = true;
        }
      }

      if (hasChanges) {
        // Wrap in parameters for BeatConfig
        const command = new UpdateBeatCommand(
          beat.id,
          { parameters: oldParams },
          { parameters: updatesParams },
          this.mutations!
        );
        builder.add(command);
      }
    }
  }

  /**
   * Transform dialog tree using AI for contextual changes
   */
  private async transformDialogTreeWithAI(tree: any, transform: TextTransform): Promise<any> {
    if (!tree) return tree;

    const transformed = { ...tree };

    if (transformed.text) {
      transformed.text = await this.transformTextWithAI(transformed.text, transform, {
        textType: 'dialog',
      });
    }

    if (transformed.choices && Array.isArray(transformed.choices)) {
      transformed.choices = await Promise.all(
        transformed.choices.map(async (choice: any) => ({
          ...choice,
          text: choice.text
            ? await this.transformTextWithAI(choice.text, transform, { textType: 'dialog choice' })
            : choice.text,
          target: typeof choice.target === 'object'
            ? await this.transformDialogTreeWithAI(choice.target, transform)
            : choice.target,
        }))
      );
    }

    if (transformed.next && typeof transformed.next === 'object') {
      transformed.next = await this.transformDialogTreeWithAI(transformed.next, transform);
    }

    return transformed;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getBeatPropertyValue(beat: Beat, property: string): any {
    // Check direct beat properties
    if (property === 'transition') return beat.transition;
    if (property === 'sound') return beat.sound;
    if (property === 'node') return beat.node;
    if (property === 'cluster') return beat.cluster;
    if (property === 'defaultTarget') return beat.defaultTarget;
    if (property === 'defaultTargetDelay') return beat.defaultTargetDelay;

    // Check parameters
    const params = beat.getParameters();
    return params[property];
  }

  private getLocationPropertyValue(location: Location, property: string): any {
    return (location as any)[property];
  }

  private createBeatUpdate(property: string, value: any): Partial<BeatConfig> & Record<string, any> {
    // Handle special properties that are direct Beat properties (not parameters)
    if (property === 'transition') {
      return { transition: value as Transition };
    }
    if (property === 'sound') {
      return { sound: value as Sound };
    }
    if (property === 'cluster') {
      return { cluster: value };
    }
    if (property === 'defaultTarget') {
      return { defaultTarget: value };
    }

    // These are Beat class properties not in BeatConfig but set directly via Object.assign
    if (property === 'node' || property === 'defaultTargetDelay') {
      return { [property]: value };
    }

    // Handle as parameter (for beat-type-specific properties)
    return { parameters: { [property]: value } };
  }

  /**
   * Simple text transformation with case preservation for a single replacement
   */
  private transformTextSingle(text: string, find: string, replace: string): string {
    const regex = new RegExp(this.escapeRegex(find), 'gi');
    return text.replace(regex, (match) => {
      // Preserve the case pattern of the original match
      if (match === match.toUpperCase()) {
        // ALL CAPS -> ALL CAPS
        return replace.toUpperCase();
      } else if (match[0] === match[0].toUpperCase() && match.slice(1) === match.slice(1).toLowerCase()) {
        // Title Case -> Title Case
        return replace.charAt(0).toUpperCase() + replace.slice(1).toLowerCase();
      } else if (match === match.toLowerCase()) {
        // all lowercase -> all lowercase
        return replace.toLowerCase();
      }
      // Default: use replacement as-is
      return replace;
    });
  }

  /**
   * Apply all text transformations (primary + additional) with case preservation
   */
  private transformText(text: string, transform: TextTransform): string {
    // Apply primary replacement
    let result = this.transformTextSingle(text, transform.findPattern, transform.replacement);

    // Apply additional replacements if any
    if (transform.additionalReplacements && transform.additionalReplacements.length > 0) {
      for (const { find, replace } of transform.additionalReplacements) {
        result = this.transformTextSingle(result, find, replace);
      }
    }

    return result;
  }

  /**
   * AI-powered text transformation for contextual/semantic changes
   * Used when adjustPronouns or adaptContext is true
   */
  private async transformTextWithAI(
    text: string,
    transform: TextTransform,
    context?: { textType: string; speaker?: string }
  ): Promise<string> {
    try {
      const aiService = getAIService();

      // Build additional replacements array for the AI request
      const additionalReplacements = transform.additionalReplacements?.map(r => ({
        find: r.find,
        replace: r.replace,
      }));

      // Build a more detailed prompt for contextual adaptation
      const response = await aiService.transformText({
        originalText: text,
        transform: {
          find: transform.findPattern,
          replace: transform.replacement,
          additionalReplacements,
          adjustPronouns: transform.adjustPronouns,
          adaptContext: transform.adaptContext,
        },
        context,
      });

      return response.transformedText;
    } catch (error) {
      console.error('[HelperCommandExecutor] AI transformation failed, falling back to simple replace:', error);
      // Fallback to simple replacement with case preservation (handles all replacements)
      return this.transformText(text, transform);
    }
  }

  /**
   * Check if this transform needs AI processing
   */
  private needsAITransform(transform: TextTransform): boolean {
    return transform.adjustPronouns === true || transform.adaptContext === true;
  }

  /**
   * Determine the text type based on field name for proper context
   */
  private getTextTypeForField(field: string): string {
    // Button text fields
    if (field === 'buttonText' || field.startsWith('location.')) {
      return 'button';
    }
    // Title fields
    if (field === 'title') {
      return 'title';
    }
    // Dialog fields
    if (field.startsWith('dialogTree') || field.includes('choices')) {
      return 'dialog';
    }
    // Message fields (like end screen messages)
    if (field === 'message') {
      return 'message';
    }
    // Default to narration for text fields
    return 'narration';
  }

  private transformDialogTree(tree: any, transform: TextTransform): any {
    if (!tree) return tree;

    const transformed = { ...tree };

    if (transformed.text) {
      transformed.text = this.transformText(transformed.text, transform);
    }

    if (transformed.choices && Array.isArray(transformed.choices)) {
      transformed.choices = transformed.choices.map((choice: any) => ({
        ...choice,
        text: choice.text ? this.transformText(choice.text, transform) : choice.text,
        target: typeof choice.target === 'object'
          ? this.transformDialogTree(choice.target, transform)
          : choice.target,
      }));
    }

    if (transformed.next && typeof transformed.next === 'object') {
      transformed.next = this.transformDialogTree(transformed.next, transform);
    }

    return transformed;
  }

  private createTextDiff(original: string, modified: string, transform: TextTransform): TextDiff {
    const segments: DiffSegment[] = [];

    // Build regex for all patterns (primary + additional)
    const allPatterns = [transform.findPattern];
    if (transform.additionalReplacements) {
      allPatterns.push(...transform.additionalReplacements.map(r => r.find));
    }
    const combinedPattern = allPatterns.map(p => this.escapeRegex(p)).join('|');
    const regex = new RegExp(`(${combinedPattern})`, 'gi');

    let lastIndex = 0;
    let match;
    const originalParts: string[] = [];
    const originalMatches: number[] = [];

    // Find all matches in original
    while ((match = regex.exec(original)) !== null) {
      if (match.index > lastIndex) {
        originalParts.push(original.slice(lastIndex, match.index));
        originalMatches.push(0);
      }
      originalParts.push(match[0]);
      originalMatches.push(1);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < original.length) {
      originalParts.push(original.slice(lastIndex));
      originalMatches.push(0);
    }

    // Create segments showing removed and added
    for (let i = 0; i < originalParts.length; i++) {
      if (originalMatches[i]) {
        segments.push({ text: originalParts[i], type: 'removed' });
      } else {
        segments.push({ text: originalParts[i], type: 'unchanged' });
      }
    }

    return {
      original,
      modified,
      segments,
    };
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Singleton instance
let executorInstance: HelperCommandExecutor | null = null;

/**
 * Get the singleton executor instance
 */
export function getHelperCommandExecutor(): HelperCommandExecutor {
  if (!executorInstance) {
    executorInstance = new HelperCommandExecutor();
  }
  return executorInstance;
}
