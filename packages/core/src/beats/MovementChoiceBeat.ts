import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { MovementChoiceParameters, MovementOption } from '../generated/beat-types';

export class MovementChoiceBeat extends Beat {
  public question: string;
  public choices: MovementOption[];
  public choiceDelay?: number; // Delay in seconds before showing choices

  constructor(config: BeatConfig & {
    parameters?: Partial<MovementChoiceParameters>;
  } & Partial<MovementChoiceParameters>) {
    super(config);
    this.question = config.question || config.parameters?.question || 'Where do you want to go?';
    this.choices = config.choices || config.parameters?.choices || [];
    this.choiceDelay = config.choiceDelay || config.parameters?.choiceDelay;

    console.log(`[MovementChoiceBeat constructor] config.node: ${(config as any).node}`);
    console.log(`[MovementChoiceBeat constructor] config.parameters.node: ${config.parameters?.node}`);
    console.log(`[MovementChoiceBeat constructor] this.node AFTER super(): ${this.node}`);
  }

  getParameters(): Record<string, any> {
    const params = {
      question: this.question,
      choices: this.choices,
      node: this.node,
      choiceDelay: this.choiceDelay
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
    if (params.choices !== undefined) this.choices = params.choices;
    if (params.node !== undefined) this.node = params.node;
    if (params.choiceDelay !== undefined) this.choiceDelay = params.choiceDelay;

    console.log('[MovementChoiceBeat.updateParameters] AFTER:', {
      question: this.question,
      choicesLength: this.choices.length,
      node: this.node,
      choiceDelay: this.choiceDelay
    });
  }

  /**
   * Override getConnections to extract all connections from movement choices
   * This ensures connections are dynamically generated from choices array
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    // Extract connections from each choice
    if (this.choices && Array.isArray(this.choices)) {
      for (const choice of this.choices) {
        if (choice.target) {
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
    // Set background asset ID in renderer state so it can be resolved
    if (this.node) {
      renderer.setState('backgroundAssetId', this.node);
    }

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
        location: c.location || ''
      })),
      locations
    );

    const selectedChoice = availableChoices.find(c => c.id === choiceId);
    if (selectedChoice) {
      // Apply any location effects
      if (selectedChoice.location) {
        context.setVariable('currentLocation', selectedChoice.location);
      }
      return selectedChoice.target;
    }

    return this.getNextBeat(context);
  }
}
