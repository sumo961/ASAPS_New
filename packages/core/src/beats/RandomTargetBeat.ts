import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { RandomTargetParameters } from '../generated/beat-types';

export class RandomTargetBeat extends Beat {
  private choices: string[];

  constructor(config: BeatConfig & {
    choices?: string[] | Array<{ id: string; target: string }>;
    parameters?: Partial<RandomTargetParameters>;
  }) {
    super(config);
    const params = config.parameters || {};

    // Handle both formats: array of strings or array of Connection objects
    let choices = params.choices || config.choices || [];

    // Convert Connection format to string format if needed
    if (choices.length > 0 && typeof choices[0] === 'object' && 'targetId' in choices[0]) {
      // Connection[] format
      choices = choices.map((c: any) => c.targetId).filter(Boolean);
    } else if (choices.length > 0 && typeof choices[0] === 'object') {
      // Legacy object format { id, target }
      choices = choices.map((c: any) => c.target || c.id || c).filter(Boolean);
    }

    this.choices = choices as string[];

    // Create connections for each choice
    this.updateConnections();
  }
  
  private updateConnections(): void {
    // Clear existing connections
    this.connections = [];
    
    // Add connection for each valid choice
    this.choices.forEach((choice, index) => {
      if (choice) {
        this.addConnection({
          targetId: choice,
          label: `Random ${index + 1}`
        });
      }
    });
  }

  getParameters(): Record<string, any> {
    return {
      choices: this.choices
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.choices !== undefined) {
      // Handle both formats
      let choices = params.choices;
      if (choices.length > 0 && typeof choices[0] === 'object') {
        choices = choices.map((c: any) => c.target || c.id || c).filter(Boolean);
      }
      this.choices = choices;
      
      // Update connections when choices change
      this.updateConnections();
    }
  }
  
  // toXML(doc: Document): Element {
  //   const element = super.toXML(doc);
    
  //   // Add choice elements for export
  //   const functionEl = element.querySelector('function');
  //   if (functionEl && this.choices) {
  //     this.choices.forEach((choice) => {
  //       if (choice) {
  //         const choiceEl = doc.createElement('choice');
  //         choiceEl.setAttribute('targetBeat', choice);
  //         functionEl.appendChild(choiceEl);
  //       }
  //     });
  //   }
    
  //   return element;
  // }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Filter valid choices
    const validChoices = this.choices.filter(c => c);
    
    if (validChoices.length === 0) {
      console.warn(`RandomTargetBeat ${this.id} has no valid choices`);
      return this.getNextBeat(context);
    }

    // Pick a random choice
    const randomIndex = Math.floor(Math.random() * validChoices.length);
    const selectedChoice = validChoices[randomIndex];
    
    console.log(`RandomTargetBeat ${this.id}: Randomly selected choice ${randomIndex + 1} -> ${selectedChoice}`);
    
    return selectedChoice;
  }
}
