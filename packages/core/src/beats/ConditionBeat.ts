import { Beat } from './Beat';
import type { BeatConfig, Condition } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { ConditionBeatParameters } from '../generated/beat-types';

export class ConditionBeat extends Beat {
  public condition: Condition;
  public conditionType: string;
  public trueTarget: string;
  public falseTarget?: string;

  // Store all possible condition parameters
  public left?: string;
  public variableName?: string;  // New canonical name for variable/counter name
  public operator?: string;
  public val?: any;
  public value?: any;  // New canonical name for comparison value
  public right?: any;
  public counter1?: string;
  public counter2?: string;
  public timer?: string;
  public inventory?: string;
  public variable?: string;
  // Inventory-specific parameters
  public item?: string;
  public character?: string;
  public checkType?: string;
  // VisitedBeat-specific parameter
  public beatId?: string;

  constructor(config: BeatConfig & {
    conditionType?: string;
    trueTarget?: string;
    falseTarget?: string;
    parameters?: Partial<ConditionBeatParameters>;
    beatId?: string;
  } & Partial<ConditionBeatParameters>) {
    super(config);

    // Initialize from parameters if provided
    const params = config.parameters || {};

    this.conditionType = params.conditionType || config.conditionType || 'counter';
    this.trueTarget = params.trueTarget || config.trueTarget || '';
    this.falseTarget = params.falseTarget || config.falseTarget;

    // Store individual condition parameters
    // Try params first, then config (which has Partial<ConditionBeatParameters>)
    // Support both new (variableName/value) and legacy (left/right) field names
    this.variableName = params.variableName || (config as any).variableName;
    this.left = params.left || (config as any).left;
    this.operator = params.operator || (config as any).operator || 'eq';
    this.val = params.val !== undefined ? params.val : (config as any).val;
    this.value = params.value !== undefined ? params.value : (config as any).value;
    this.right = params.right !== undefined ? params.right : (config as any).right;
    this.counter1 = params.counter1 || (config as any).counter1;
    this.counter2 = params.counter2 || (config as any).counter2;
    this.timer = params.timer || (config as any).timer;
    this.inventory = params.inventory || (config as any).inventory;
    this.variable = params.variable || (config as any).variable;
    // Inventory-specific parameters
    this.item = params.item || (config as any).item;
    this.character = params.character || (config as any).character || (params.conditionType === 'inventory' ? 'player' : undefined);
    this.checkType = params.checkType || (config as any).checkType || (params.conditionType === 'inventory' ? 'has' : undefined);
    // VisitedBeat-specific parameter
    this.beatId = params.beatId || (config as any).beatId;
    
    // Build condition object based on type
    this.condition = this.buildCondition();
  }
  
  private buildCondition(): Condition {
    const condition: any = {
      type: this.conditionType,
      operator: this.operator
    };

    switch (this.conditionType) {
      case 'counter':
        condition.variableName = this.variableName || this.variable || this.left;
        condition.value = this.value ?? this.val ?? this.right;
        break;
      case 'counterCompare':
        condition.counter1 = this.counter1;
        condition.counter2 = this.counter2;
        break;
      case 'timer':
        condition.timer = this.timer;
        condition.value = this.value ?? this.val ?? this.right;
        break;
      case 'inventory':
        condition.item = this.item;
        condition.character = this.character || 'player';
        condition.checkType = this.checkType || 'has';
        break;
      case 'variable':
        condition.variableName = this.variableName || this.variable || this.left;
        condition.value = this.value ?? this.val ?? this.right;
        break;
      case 'visitedBeat':
        condition.beatId = this.beatId || this.variableName || this.left;
        break;
      default:
        condition.variableName = this.variableName || this.variable || this.left;
        condition.value = this.value ?? this.val ?? this.right;
    }

    return condition;
  }

  getParameters(): Record<string, any> {
    return {
      conditionType: this.conditionType,
      condition: this.condition,
      trueTarget: this.trueTarget,
      falseTarget: this.falseTarget,
      // New canonical field names
      variableName: this.variableName,
      value: this.value,
      // Legacy field names for backwards compatibility
      left: this.left,
      operator: this.operator,
      val: this.val,
      right: this.right,
      counter1: this.counter1,
      counter2: this.counter2,
      timer: this.timer,
      inventory: this.inventory,
      variable: this.variable,
      item: this.item,
      character: this.character,
      checkType: this.checkType,
      beatId: this.beatId
    };
  }

  updateParameters(params: Record<string, any>): void {
    // Update all parameters
    if (params.conditionType !== undefined) this.conditionType = params.conditionType;
    if (params.trueTarget !== undefined) this.trueTarget = params.trueTarget;
    if (params.falseTarget !== undefined) this.falseTarget = params.falseTarget;
    // New canonical field names
    if (params.variableName !== undefined) this.variableName = params.variableName;
    if (params.value !== undefined) this.value = params.value;
    // Legacy field names
    if (params.left !== undefined) this.left = params.left;
    if (params.operator !== undefined) this.operator = params.operator;
    if (params.val !== undefined) this.val = params.val;
    if (params.right !== undefined) this.right = params.right;
    if (params.counter1 !== undefined) this.counter1 = params.counter1;
    if (params.counter2 !== undefined) this.counter2 = params.counter2;
    if (params.timer !== undefined) this.timer = params.timer;
    if (params.inventory !== undefined) this.inventory = params.inventory;
    if (params.variable !== undefined) this.variable = params.variable;
    if (params.item !== undefined) this.item = params.item;
    if (params.character !== undefined) this.character = params.character;
    if (params.checkType !== undefined) this.checkType = params.checkType;
    if (params.beatId !== undefined) this.beatId = params.beatId;

    // Rebuild condition object
    this.condition = this.buildCondition();

    // Also update the generic condition if provided directly
    if (params.condition !== undefined) {
      this.condition = { ...this.condition, ...params.condition };
    }
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Validate condition based on type
    let isValidCondition = false;

    switch (this.conditionType) {
      case 'counterCompare':
        isValidCondition = !!(this.counter1 && this.counter2);
        break;
      case 'timer':
        isValidCondition = !!(this.timer);
        break;
      case 'inventory':
        isValidCondition = !!(this.item);
        break;
      case 'variable':
        isValidCondition = !!(this.variable || this.variableName || this.left);
        break;
      case 'visitedBeat':
        isValidCondition = !!(this.beatId || this.left);
        break;
      case 'counter':
      default:
        // Support both new (variableName) and legacy (left) field names
        isValidCondition = !!(this.variableName || this.left);
    }
    
    if (!isValidCondition || this.trueTarget === '') {
      console.error(`ConditionBeat ${this.id} has invalid condition or target`);
      return this.getNextBeat(context);
    }

    try {
      const conditionResult = context.checkCondition(this.condition);
      
      // Log condition evaluation based on type
      if (this.conditionType === 'counterCompare') {
        console.log(`ConditionBeat ${this.id}: ${this.counter1} ${this.operator} ${this.counter2} = ${conditionResult}`);
      } else if (this.conditionType === 'timer') {
        console.log(`ConditionBeat ${this.id}: timer ${this.timer} ${this.operator} ${this.val} = ${conditionResult}`);
      } else if (this.conditionType === 'visitedBeat') {
        console.log(`ConditionBeat ${this.id}: visitedBeat ${this.beatId || this.left} = ${conditionResult}`);
      } else {
        console.log(`ConditionBeat ${this.id}: ${this.left} ${this.operator} ${this.val || this.right} = ${conditionResult}`);
      }
      
      if (conditionResult) {
        return this.trueTarget;
      } else if (this.falseTarget) {
        return this.falseTarget;
      } else {
        // If no false target, proceed to next beat in sequence
        return this.getNextBeat(context);
      }
      
    } catch (error) {
      console.error(`Error evaluating condition in beat ${this.id}:`, error);
      return this.getNextBeat(context);
    }
  }
}
