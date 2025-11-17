import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { MovementChoiceParameters, MovementOption } from '../generated/beat-types';

export class MovementChoiceBeat extends Beat {
  public question: string;
  public choices: MovementOption[];

  constructor(config: BeatConfig & {
    parameters?: Partial<MovementChoiceParameters>;
  } & Partial<MovementChoiceParameters>) {
    super(config);
    this.question = config.question || config.parameters?.question || 'Where do you want to go?';
    this.choices = config.choices || config.parameters?.choices || [];

    console.log(`[MovementChoiceBeat constructor] config.node: ${(config as any).node}`);
    console.log(`[MovementChoiceBeat constructor] config.parameters.node: ${config.parameters?.node}`);
    console.log(`[MovementChoiceBeat constructor] this.node AFTER super(): ${this.node}`);
  }

  getParameters(): Record<string, any> {
    const params = {
      question: this.question,
      choices: this.choices,
      node: this.node
    };
    console.log('[MovementChoiceBeat.getParameters] Returning:', params);
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    console.log('[MovementChoiceBeat.updateParameters] BEFORE:', {
      question: this.question,
      choicesLength: this.choices.length,
      node: this.node
    });
    console.log('[MovementChoiceBeat.updateParameters] params:', {
      question: params.question,
      choicesLength: params.choices?.length,
      node: params.node
    });

    if (params.question !== undefined) this.question = params.question;
    if (params.choices !== undefined) this.choices = params.choices;
    if (params.node !== undefined) this.node = params.node;

    console.log('[MovementChoiceBeat.updateParameters] AFTER:', {
      question: this.question,
      choicesLength: this.choices.length,
      node: this.node
    });
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
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
