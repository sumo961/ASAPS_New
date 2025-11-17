import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

export class ConversationChoiceBeat extends Beat {
  public questioner: string;
  public question: string;
  public choices: Array<{
    id: string;
    text: string;
    targetBeat: string;
  }>;

  constructor(config: BeatConfig & {
    questioner?: string;
    question?: string;
    choices?: Array<{id: string; text: string; targetBeat: string;}>;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.questioner = config.questioner || config.parameters?.questioner || 'Character';
    this.question = config.question || config.parameters?.question || '';
    this.choices = config.choices || config.parameters?.choices || [];
  }

  getParameters(): Record<string, any> {
    return {
      questioner: this.questioner,
      question: this.question,
      choices: this.choices
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.questioner !== undefined) this.questioner = params.questioner;
    if (params.question !== undefined) this.question = params.question;
    if (params.choices !== undefined) this.choices = params.choices;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Process text with variable interpolation
    const processedQuestioner = this.processText(this.questioner, context);
    const processedQuestion = this.processText(this.question, context);

    // Render dialog with question
    await renderer.renderDialog(processedQuestioner, processedQuestion);

    // Show choices
    const choiceOptions = this.choices.map(c => ({
      id: c.id,
      text: this.processText(c.text, context)
    }));
    
    const selectedId = await renderer.renderChoices(choiceOptions);
    
    // Find the target beat for the selected choice
    const selected = this.choices.find(c => c.id === selectedId);
    if (selected) {
      return selected.targetBeat;
    }
    
    return this.getNextBeat(context);
  }
}
