import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { MovementChoiceParameters, MovementOption } from '../generated/beat-types';
import { migrateChoiceEffects } from '../migration/effectsMigration';

export class MovementChoiceBeat extends Beat {
  public question: string;
  public choices: MovementOption[];
  public choiceDelay?: number; // Delay in seconds before showing choices
  public markVisited?: boolean; // Block and dim choices leading to previously visited beats
  public showTextOnHover?: boolean; // Only show choice text when hovering over the hotspot

  constructor(config: BeatConfig & {
    parameters?: Partial<MovementChoiceParameters>;
  } & Partial<MovementChoiceParameters>) {
    super(config);
    this.question = config.question || config.parameters?.question || 'Where do you want to go?';
    this.choices = config.choices || config.parameters?.choices || [];
    this.choiceDelay = config.choiceDelay || config.parameters?.choiceDelay;
    this.markVisited = config.markVisited ?? config.parameters?.markVisited ?? false;
    this.showTextOnHover = config.showTextOnHover ?? config.parameters?.showTextOnHover ?? false;

    // Migrate flat counter fields → canonical effects on all choices
    this.choices.forEach(c => migrateChoiceEffects(c as any));

    console.log(`[MovementChoiceBeat constructor] config.node: ${(config as any).node}`);
    console.log(`[MovementChoiceBeat constructor] config.parameters.node: ${config.parameters?.node}`);
    console.log(`[MovementChoiceBeat constructor] this.node AFTER super(): ${this.node}`);
  }

  getParameters(): Record<string, any> {
    const params = {
      question: this.question,
      choices: this.choices,
      node: this.node,
      choiceDelay: this.choiceDelay,
      markVisited: this.markVisited,
      showTextOnHover: this.showTextOnHover
    };
    console.log('[MovementChoiceBeat.getParameters] Returning:', params);
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    console.log('[MovementChoiceBeat.updateParameters] BEFORE:', {
      question: this.question,
      choicesLength: this.choices.length,
      node: this.node,
      choiceDelay: this.choiceDelay
    });
    console.log('[MovementChoiceBeat.updateParameters] params:', {
      question: params.question,
      choicesLength: params.choices?.length,
      node: params.node,
      choiceDelay: params.choiceDelay
    });

    if (params.question !== undefined) this.question = params.question;
    if (params.choices !== undefined) {
      this.choices = params.choices;
      // CRITICAL FIX: Rebuild connections from choices to ensure they're in sync
      // This fixes the long-standing bug where targets added later weren't reflected
      this.clearConnections();
      for (const choice of this.choices) {
        if (choice.target && choice.target !== '__self__') {
          this.addConnection({
            targetId: choice.target,
            label: choice.text || choice.id
          });
        }
      }
    }
    if (params.node !== undefined) this.node = params.node;
    if (params.choiceDelay !== undefined) this.choiceDelay = params.choiceDelay;
    if (params.markVisited !== undefined) this.markVisited = params.markVisited;
    if (params.showTextOnHover !== undefined) this.showTextOnHover = params.showTextOnHover;

    console.log('[MovementChoiceBeat.updateParameters] AFTER:', {
      question: this.question,
      choicesLength: this.choices.length,
      node: this.node,
      choiceDelay: this.choiceDelay,
      markVisited: this.markVisited,
      showTextOnHover: this.showTextOnHover
    });
  }

  /**
   * Override getConnections to extract all connections from movement choices
   * This ensures connections are dynamically generated from choices array
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    // Extract connections from each choice (skip __self__ targets)
    if (this.choices && Array.isArray(this.choices)) {
      for (const choice of this.choices) {
        if (choice.target && choice.target !== '__self__') {
          connections.push({
            targetId: choice.target,
            label: choice.text || choice.id,
            condition: choice.conditions
          });
        }
      }
    }

    // Also include regular connections from base class (if any)
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      // Avoid duplicates
      if (!connections.some(c => c.targetId === conn.targetId && c.label === conn.label)) {
        connections.push(conn);
      }
    }

    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Background is now handled centrally in Beat.execute()

    // Set markVisited state for renderer to use when rendering choices
    renderer.setState('markVisited', this.markVisited || false);

    // Reset visited choice IDs to this beat's choices (empty on first visit).
    // Prevents stale visitedChoiceIds from a previous beat causing false-positive dimming.
    if (renderer.setVisitedChoiceIds) {
      renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
    }

    // Set showTextOnHover state for renderer to use when rendering hotspots
    renderer.setState('showTextOnHover', this.showTextOnHover || false);

    // While loop supports __self__ target (return to choices)
    while (true) {
      // Filter choices based on conditions
      const availableChoices = this.choices.filter(choice => {
        if (!choice.conditions) return true;
        return choice.conditions.every(condition => context.checkCondition(condition));
      });

      if (availableChoices.length === 0) {
        console.warn(`No available movement choices for beat ${this.id}`);
        return this.getNextBeat(context);
      }

      // Process text with variable interpolation
      const processedQuestion = this.processText(this.question, context);

      // Get locations array for positioned rendering
      const locations = Array.from(this.locations.values());

      // Apply delay if configured (before showing any content)
      if (this.choiceDelay && this.choiceDelay > 0) {
        // Wait for the delay duration before rendering
        await new Promise(resolve => setTimeout(resolve, this.choiceDelay! * 1000));
      }

      // Render the movement interface with locations
      const choiceId = await renderer.renderMovement(
        processedQuestion,
        availableChoices.map(c => ({
          id: c.id,
          text: this.processText(c.text, context),
          displayText: c.displayText ? this.processText(c.displayText, context) : undefined,
          location: c.location || '',
          locationName: c.locationName  // Pass locationName for hotspot/prop association
        })),
        locations
      );

      // Find selected choice - match by id first, then by text (for choices without id)
      let selectedChoice = availableChoices.find(c => c.id === choiceId);
      if (!selectedChoice) {
        // Fallback: match by text (case-insensitive)
        const choiceIdLower = choiceId?.toLowerCase();
        selectedChoice = availableChoices.find(c =>
          c.text?.toLowerCase() === choiceIdLower
        );
      }

      if (selectedChoice) {
        // Mark this choice as visited for per-choice tracking
        context.markChoiceVisited(this.id, selectedChoice.id);

        // Update renderer's visited choice IDs so UI reflects the change
        if (renderer.setVisitedChoiceIds) {
          renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
        }

        // Record this choice for AI context
        context.recordChoice({
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'movementChoice',
          choiceText: selectedChoice.text,
          choiceContext: this.question,
        });

        // Apply any location effects
        if (selectedChoice.location) {
          context.setVariable('currentLocation', selectedChoice.location);
        }

        // Apply effects from choice (canonical effects array, migrated from flat counter fields)
        if (selectedChoice.effects) {
          selectedChoice.effects.forEach(effect => context.applyEffect(effect));
        }

        // Play sound effect
        if (selectedChoice.soundEffect && renderer.playSound) {
          await renderer.playSound({ file: selectedChoice.soundEffect });
        }

        if (selectedChoice.target === '__self__') {
          // Loop back to show choices again with updated visited state
          continue;
        }

        return selectedChoice.target;
      }

      console.warn(`[MovementChoiceBeat] No matching choice found for "${choiceId}". Available: ${availableChoices.map(c => c.id || c.text).join(', ')}`);
      break;
    }

    return this.getNextBeat(context);
  }
}
