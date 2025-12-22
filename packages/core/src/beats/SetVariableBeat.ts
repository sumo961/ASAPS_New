import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { SetVariableParameters } from '../generated/beat-types';

export class SetVariableBeat extends Beat {
  private variableType: string;  // 'variable' or 'counter'
  private variableName: string;
  private value: any;
  private operation: string;

  constructor(config: BeatConfig & {
    variable?: string;  // legacy support
    parameters?: Partial<SetVariableParameters>;
  } & Partial<SetVariableParameters>) {
    super(config);

    // Support both new and legacy parameter names
    // Note: config.type is the BEAT type ('setVariable'), so we check parameters.type first
    this.variableType = config.parameters?.type || 'variable';
    // Support multiple naming conventions: name (schema), variable (legacy), variableName (AI variation)
    // IMPORTANT: Do NOT use config.name as fallback - that's the beat DISPLAY name, not the variable name!
    this.variableName = config.parameters?.name || config.parameters?.variableName || config.variable || config.parameters?.variable || '';
    this.value = config.parameters?.value ?? config.value ?? '';
    this.operation = config.parameters?.operation || config.operation || 'set';
  }

  getParameters(): Record<string, any> {
    return {
      type: this.variableType,
      name: this.variableName,
      value: this.value,
      operation: this.operation
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.type !== undefined) this.variableType = params.type;
    if (params.name !== undefined) this.variableName = params.name;
    if (params.variable !== undefined) this.variableName = params.variable; // legacy
    if (params.variableName !== undefined) this.variableName = params.variableName; // AI variation
    if (params.value !== undefined) this.value = params.value;
    if (params.operation !== undefined) this.operation = params.operation;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!this.variableName) {
      console.error(`SetVariableBeat ${this.id} has no variable/counter name specified`);
      return this.getNextBeat(context);
    }

    try {
      if (this.variableType === 'counter') {
        // Handle counter operations
        const currentValue = context.getCounter(this.variableName) || 0;
        const numValue = Number(this.value) || 0;
        let newValue: number;

        switch (this.operation) {
          case 'change':
          case 'add':
            // Add to current value (change is legacy name for add)
            newValue = currentValue + numValue;
            break;
          case 'subtract':
            // Subtract from current value
            newValue = currentValue - numValue;
            break;
          case 'multiply':
            // Multiply current value
            newValue = currentValue * numValue;
            break;
          case 'divide':
            // Divide current value (avoid division by zero)
            newValue = numValue !== 0 ? currentValue / numValue : currentValue;
            break;
          case 'set':
          default:
            // Set to specific value
            newValue = numValue;
            break;
        }

        context.setCounter(this.variableName, newValue);
        console.log(`SetVariableBeat ${this.id}: Counter '${this.variableName}' ${this.operation} → ${newValue} (was ${currentValue})`);
      } else {
        // Handle variable (always set operation)
        context.setVariable(this.variableName, this.value);
        console.log(`SetVariableBeat ${this.id}: Variable '${this.variableName}' = ${this.value}`);
      }
    } catch (error) {
      console.error(`Error in SetVariableBeat ${this.id}:`, error);
    }

    // Invisible beats always proceed to next
    return this.getNextBeat(context);
  }
}
