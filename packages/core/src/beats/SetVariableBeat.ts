import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { SetVariableParameters } from '../generated/beat-types';

export class SetVariableBeat extends Beat {
  private variableType: string;  // 'variable', 'counter', or 'fictionalTime'
  private variableName: string;
  private value: any;
  private operation: string;
  // Optional counter owner. Omitted/empty ⇒ story-global counter (unchanged
  // behavior). A Character id/name scopes the counter to that character's
  // per-character store. Only meaningful when type='counter'.
  private character?: string;
  // Fictional time properties
  private timeUnit: string;
  private timeYear: number;
  private timeMonth: number;
  private timeDay: number;
  private timeHour: number;
  private timeMinute: number;

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
    const charRaw =
      (config.parameters as any)?.character ?? (config as any).character;
    const charTrimmed = typeof charRaw === 'string' ? charRaw.trim() : '';
    this.character = charTrimmed ? charTrimmed : undefined;
    // Fictional time properties
    this.timeUnit = config.parameters?.timeUnit || 'hours';
    this.timeYear = config.parameters?.timeYear ?? 2024;
    this.timeMonth = config.parameters?.timeMonth ?? 1;
    this.timeDay = config.parameters?.timeDay ?? 1;
    this.timeHour = config.parameters?.timeHour ?? 0;
    this.timeMinute = config.parameters?.timeMinute ?? 0;
  }

  getParameters(): Record<string, any> {
    return {
      type: this.variableType,
      name: this.variableName,
      value: this.value,
      operation: this.operation,
      character: this.character,
      timeUnit: this.timeUnit,
      timeYear: this.timeYear,
      timeMonth: this.timeMonth,
      timeDay: this.timeDay,
      timeHour: this.timeHour,
      timeMinute: this.timeMinute,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.type !== undefined) this.variableType = params.type;
    if (params.name !== undefined) this.variableName = params.name;
    if (params.variable !== undefined) this.variableName = params.variable; // legacy
    if (params.variableName !== undefined) this.variableName = params.variableName; // AI variation
    if (params.value !== undefined) this.value = params.value;
    if (params.operation !== undefined) this.operation = params.operation;
    if (params.character !== undefined) {
      const t = typeof params.character === 'string' ? params.character.trim() : '';
      this.character = t ? t : undefined;
    }
    if (params.timeUnit !== undefined) this.timeUnit = params.timeUnit;
    if (params.timeYear !== undefined) this.timeYear = params.timeYear;
    if (params.timeMonth !== undefined) this.timeMonth = params.timeMonth;
    if (params.timeDay !== undefined) this.timeDay = params.timeDay;
    if (params.timeHour !== undefined) this.timeHour = params.timeHour;
    if (params.timeMinute !== undefined) this.timeMinute = params.timeMinute;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!this.variableName && this.variableType !== 'fictionalTime') {
      console.error(`SetVariableBeat ${this.id} has no variable/counter name specified`);
      return this.getNextBeat(context);
    }

    try {
      if (this.variableType === 'fictionalTime') {
        // Handle fictional time operations
        const unit = (this.timeUnit || 'hours') as 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
        if (this.operation === 'set') {
          context.setFictionalTime({
            year: this.timeYear ?? 2024,
            month: this.timeMonth ?? 1,
            day: this.timeDay ?? 1,
            hour: this.timeHour ?? 0,
            minute: this.timeMinute ?? 0,
          });
          console.log(`SetVariableBeat ${this.id}: FictionalTime set to ${this.timeDay}/${this.timeMonth}/${this.timeYear} ${this.timeHour}:${this.timeMinute}`);
        } else if (this.operation === 'advance') {
          context.advanceFictionalTime(Number(this.value) || 0, unit);
          console.log(`SetVariableBeat ${this.id}: FictionalTime advance ${this.value} ${unit}`);
        } else if (this.operation === 'subtract') {
          context.advanceFictionalTime(-(Number(this.value) || 0), unit);
          console.log(`SetVariableBeat ${this.id}: FictionalTime subtract ${this.value} ${unit}`);
        }
      } else if (this.variableType === 'counter') {
        // Handle counter operations. When `character` is set, the counter is
        // scoped to that character's per-character store (mirrors the
        // inventory owner model); omitted ⇒ the story-global counter, exactly
        // as before. Same arithmetic either way — only the store differs.
        const scoped = !!this.character;
        const currentValue = scoped
          ? context.getCharacterCounter(this.character!, this.variableName)
          : context.getCounter(this.variableName) || 0;
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

        if (scoped) {
          context.setCharacterCounter(this.character!, this.variableName, newValue);
        } else {
          context.setCounter(this.variableName, newValue);
        }
        console.log(`SetVariableBeat ${this.id}: Counter '${this.variableName}'${scoped ? ` @${this.character}` : ''} ${this.operation} → ${newValue} (was ${currentValue})`);
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
