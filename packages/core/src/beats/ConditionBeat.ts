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
  public operator?: string;
  public val?: any;
  public value?: any;
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

  constructor(config: BeatConfig & {
    conditionType?: string;
    trueTarget?: string;
    falseTarget?: string;
    parameters?: Partial<ConditionBeatParameters>;
  } & Partial<ConditionBeatParameters>) {
    super(config);
    
    // Initialize from parameters if provided
    const params = config.parameters || {};
    
    this.conditionType = params.conditionType || config.conditionType || 'counter';
    this.trueTarget = params.trueTarget || config.trueTarget || '';
    this.falseTarget = params.falseTarget || config.falseTarget;
    
    // Store individual condition parameters
    this.left = params.left;
    this.operator = params.operator || 'eq';
    this.val = params.val;
    this.value = params.value;
    this.right = params.right;
    this.counter1 = params.counter1;
    this.counter2 = params.counter2;
    this.timer = params.timer;
    this.inventory = params.inventory;
    this.variable = params.variable;
    // Inventory-specific parameters
    this.item = params.item;
    this.character = params.character || (params.conditionType === 'inventory' ? 'player' : undefined);
    this.checkType = params.checkType || (params.conditionType === 'inventory' ? 'has' : undefined);
    
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
        condition.left = this.left;
        condition.right = this.val;
        break;
      case 'counterCompare':
        condition.counter1 = this.counter1;
        condition.counter2 = this.counter2;
        break;
      case 'timer':
        condition.timer = this.timer;
        condition.val = this.val;
        break;
      case 'inventory':
        condition.item = this.item;
        condition.character = this.character || 'player';
        condition.checkType = this.checkType || 'has';
        break;
      case 'variable':
        condition.variable = this.variable || this.left;
        condition.val = this.val;
        break;
      default:
        condition.left = this.left;
        condition.right = this.right || this.val;
    }
    
    return condition;
  }

  getParameters(): Record<string, any> {
    return {
      conditionType: this.conditionType,
      condition: this.condition,
      trueTarget: this.trueTarget,
      falseTarget: this.falseTarget,
      left: this.left,
      operator: this.operator,
      val: this.val,
      value: this.value,
      right: this.right,
      counter1: this.counter1,
      counter2: this.counter2,
      timer: this.timer,
      inventory: this.inventory,
      variable: this.variable,
      item: this.item,
      character: this.character,
      checkType: this.checkType
    };
  }

  updateParameters(params: Record<string, any>): void {
    // Update all parameters
    if (params.conditionType !== undefined) this.conditionType = params.conditionType;
    if (params.trueTarget !== undefined) this.trueTarget = params.trueTarget;
    if (params.falseTarget !== undefined) this.falseTarget = params.falseTarget;
    if (params.left !== undefined) this.left = params.left;
    if (params.operator !== undefined) this.operator = params.operator;
    if (params.val !== undefined) this.val = params.val;
    if (params.value !== undefined) this.value = params.value;
    if (params.right !== undefined) this.right = params.right;
    if (params.counter1 !== undefined) this.counter1 = params.counter1;
    if (params.counter2 !== undefined) this.counter2 = params.counter2;
    if (params.timer !== undefined) this.timer = params.timer;
    if (params.inventory !== undefined) this.inventory = params.inventory;
    if (params.variable !== undefined) this.variable = params.variable;
    if (params.item !== undefined) this.item = params.item;
    if (params.character !== undefined) this.character = params.character;
    if (params.checkType !== undefined) this.checkType = params.checkType;
    
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
        isValidCondition = !!(this.variable || this.left);
        break;
      default:
        isValidCondition = !!(this.left);
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
