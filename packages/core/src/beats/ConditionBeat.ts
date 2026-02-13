import { Beat } from './Beat';
import type { BeatConfig, Condition, FictionalTime } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { ConditionBeatParameters } from '../generated/beat-types';

export class ConditionBeat extends Beat {
  public condition: Condition;
  public conditionType: string;
  public trueTarget: string;
  public falseTarget?: string;

  // Store all possible condition parameters
  public variableName?: string;  // Canonical name for variable/counter name
  public operator?: string;
  public val?: any;
  public value?: any;  // Canonical name for comparison value
  public counter1?: string;
  public counter2?: string;
  public timer?: string;
  public inventory?: string;
  public variable?: string;
  // Inventory-specific parameters
  public item?: string;
  public character?: string;
  public checkType?: string;
  // Inventory quantity check parameters
  public quantityCheck?: boolean;
  public quantityOperator?: string;
  public quantityValue?: number | string;
  public compareSource?: 'inventory' | 'variable'; // What to compare: inventory quantity or variable value
  public compareVariable?: string; // Variable name when compareSource is 'variable'
  // VisitedBeat-specific parameter
  public beatId?: string;
  // FictionalTime-specific parameters
  public timeYear?: number;
  public timeMonth?: number;
  public timeDay?: number;
  public timeHour?: number;
  public timeMinute?: number;

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

    // IMPORTANT: ASML parser stores condition data in params.condition (nested object)
    // We need to extract fields from there if present
    const conditionObj = (params as any).condition || {};

    // Get conditionType from nested condition.type OR direct params.conditionType
    this.conditionType = conditionObj.type || params.conditionType || config.conditionType || 'counter';

    // Extract trueTarget/falseTarget - support both direct values and connection objects
    // AI generates: trueConnection: { target: "beat_id" }
    // We need: trueTarget: "beat_id"
    const trueConn = (params as any).trueConnection;
    const falseConn = (params as any).falseConnection;
    this.trueTarget = params.trueTarget || config.trueTarget ||
      (trueConn ? (typeof trueConn === 'string' ? trueConn : trueConn.target) : '') || '';
    this.falseTarget = params.falseTarget || config.falseTarget ||
      (falseConn ? (typeof falseConn === 'string' ? falseConn : falseConn.target) : undefined);

    // Store individual condition parameters
    // Priority: conditionObj (from ASML) > params (direct) > config
    this.variableName = conditionObj.variableName || params.variableName || (config as any).variableName;
    this.operator = conditionObj.operator || params.operator || (config as any).operator || '==';
    this.val = conditionObj.val ?? params.val ?? (config as any).val;
    this.value = conditionObj.value ?? params.value ?? (config as any).value;
    this.counter1 = conditionObj.counter1 || params.counter1 || (config as any).counter1;
    this.counter2 = conditionObj.counter2 || params.counter2 || (config as any).counter2;
    this.timer = conditionObj.timer || params.timer || (config as any).timer;
    this.inventory = conditionObj.inventory || params.inventory || (config as any).inventory;
    this.variable = conditionObj.variable || params.variable || (config as any).variable;
    // Inventory-specific parameters
    this.item = conditionObj.item || params.item || (config as any).item;
    this.character = conditionObj.character || params.character || (config as any).character || (this.conditionType === 'inventory' ? 'player' : undefined);
    this.checkType = conditionObj.checkType || params.checkType || (config as any).checkType || (this.conditionType === 'inventory' ? 'has' : undefined);
    // Inventory quantity check parameters
    this.quantityCheck = this.checkType === 'quantity';
    this.quantityOperator = conditionObj.quantityOperator || params.quantityOperator || (config as any).quantityOperator;
    this.quantityValue = conditionObj.quantityValue ?? params.quantityValue ?? (config as any).quantityValue;
    this.compareSource = conditionObj.compareSource || (params as any).compareSource || (config as any).compareSource || 'inventory';
    this.compareVariable = conditionObj.compareVariable || (params as any).compareVariable || (config as any).compareVariable;
    // VisitedBeat-specific parameter
    this.beatId = conditionObj.beatId || params.beatId || (config as any).beatId;
    // FictionalTime-specific parameters
    this.timeYear = conditionObj.timeYear ?? params.timeYear ?? (config as any).timeYear;
    this.timeMonth = conditionObj.timeMonth ?? params.timeMonth ?? (config as any).timeMonth;
    this.timeDay = conditionObj.timeDay ?? params.timeDay ?? (config as any).timeDay;
    this.timeHour = conditionObj.timeHour ?? params.timeHour ?? (config as any).timeHour;
    this.timeMinute = conditionObj.timeMinute ?? params.timeMinute ?? (config as any).timeMinute;

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
        condition.variableName = this.variableName || this.variable;
        condition.value = this.value ?? this.val ?? 0;
        break;
      case 'counterCompare':
        condition.counter1 = this.counter1;
        condition.counter2 = this.counter2;
        break;
      case 'timer':
        condition.timer = this.timer;
        condition.value = this.value ?? this.val ?? 0;
        break;
      case 'inventory':
        condition.item = this.item;
        condition.character = this.character || 'player';
        condition.checkType = this.checkType || 'has';
        // Add quantity check fields if checkType is 'quantity'
        if (this.checkType === 'quantity') {
          condition.quantityCheck = true;
          condition.quantityOperator = this.quantityOperator || '>=';
          condition.quantityValue = this.quantityValue;
          condition.compareSource = this.compareSource || 'inventory';
          condition.compareVariable = this.compareVariable;
        }
        break;
      case 'variable':
        condition.variableName = this.variableName || this.variable;
        condition.value = this.value ?? this.val;
        break;
      case 'visitedBeat':
        condition.beatId = this.beatId || this.variableName;
        break;
      case 'fictionalTime':
        condition.compareTime = {
          year: this.timeYear ?? 2024,
          month: this.timeMonth ?? 1,
          day: this.timeDay ?? 1,
          hour: this.timeHour ?? 0,
          minute: this.timeMinute ?? 0,
        };
        break;
      default:
        condition.variableName = this.variableName || this.variable;
        condition.value = this.value ?? this.val;
    }

    return condition;
  }

  getParameters(): Record<string, any> {
    return {
      conditionType: this.conditionType,
      condition: this.condition,
      trueTarget: this.trueTarget,
      falseTarget: this.falseTarget,
      // Canonical field names
      variableName: this.variableName,
      value: this.value,
      operator: this.operator,
      val: this.val,
      counter1: this.counter1,
      counter2: this.counter2,
      timer: this.timer,
      inventory: this.inventory,
      variable: this.variable,
      item: this.item,
      character: this.character,
      checkType: this.checkType,
      // Quantity check fields
      quantityCheck: this.quantityCheck,
      quantityOperator: this.quantityOperator,
      quantityValue: this.quantityValue,
      compareSource: this.compareSource,
      compareVariable: this.compareVariable,
      beatId: this.beatId,
      timeYear: this.timeYear,
      timeMonth: this.timeMonth,
      timeDay: this.timeDay,
      timeHour: this.timeHour,
      timeMinute: this.timeMinute,
    };
  }

  /**
   * Override getConnections to return connections from trueTarget/falseTarget
   * This ensures the graph visualization shows the condition branches
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    if (this.trueTarget) {
      connections.push({
        targetId: this.trueTarget,
        label: 'true'
      });
    }

    if (this.falseTarget) {
      connections.push({
        targetId: this.falseTarget,
        label: 'false'
      });
    }

    // Also include any base connections
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      if (!connections.some(c => c.targetId === conn.targetId && c.label === conn.label)) {
        connections.push(conn);
      }
    }

    return connections;
  }

  updateParameters(params: Record<string, any>): void {
    // Extract values from nested condition object if provided (used during deserialization)
    // Priority: direct params > conditionObj (direct params are from UI edits)
    const conditionObj = params.condition || {};

    // Update conditionType
    if (params.conditionType !== undefined) {
      this.conditionType = params.conditionType;
    } else if (conditionObj.type !== undefined) {
      this.conditionType = conditionObj.type;
    }

    // Update targets
    if (params.trueTarget !== undefined) this.trueTarget = params.trueTarget;
    if (params.falseTarget !== undefined) this.falseTarget = params.falseTarget;

    // Handle trueConnection/falseConnection objects (AI format)
    const trueConn = params.trueConnection;
    const falseConn = params.falseConnection;
    if (trueConn) {
      this.trueTarget = typeof trueConn === 'string' ? trueConn : trueConn.target;
    }
    if (falseConn) {
      this.falseTarget = typeof falseConn === 'string' ? falseConn : falseConn.target;
    }

    // Canonical field names - direct params take priority over conditionObj
    // This ensures UI edits (which set direct params) override deserialized values
    if (params.variableName !== undefined) {
      this.variableName = params.variableName;
    } else if (conditionObj.variableName !== undefined) {
      this.variableName = conditionObj.variableName;
    }

    if (params.value !== undefined) {
      this.value = params.value;
    } else if (conditionObj.value !== undefined) {
      this.value = conditionObj.value;
    }

    if (params.operator !== undefined) {
      this.operator = params.operator;
    } else if (conditionObj.operator !== undefined) {
      this.operator = conditionObj.operator;
    }

    if (params.val !== undefined) {
      this.val = params.val;
    } else if (conditionObj.val !== undefined) {
      this.val = conditionObj.val;
    }

    if (params.counter1 !== undefined) {
      this.counter1 = params.counter1;
    } else if (conditionObj.counter1 !== undefined) {
      this.counter1 = conditionObj.counter1;
    }

    if (params.counter2 !== undefined) {
      this.counter2 = params.counter2;
    } else if (conditionObj.counter2 !== undefined) {
      this.counter2 = conditionObj.counter2;
    }

    if (params.timer !== undefined) {
      this.timer = params.timer;
    } else if (conditionObj.timer !== undefined) {
      this.timer = conditionObj.timer;
    }

    if (params.inventory !== undefined) {
      this.inventory = params.inventory;
    } else if (conditionObj.inventory !== undefined) {
      this.inventory = conditionObj.inventory;
    }

    if (params.variable !== undefined) {
      this.variable = params.variable;
    } else if (conditionObj.variable !== undefined) {
      this.variable = conditionObj.variable;
    }

    if (params.item !== undefined) {
      this.item = params.item;
    } else if (conditionObj.item !== undefined) {
      this.item = conditionObj.item;
    }

    if (params.character !== undefined) {
      this.character = params.character;
    } else if (conditionObj.character !== undefined) {
      this.character = conditionObj.character;
    }

    if (params.checkType !== undefined) {
      this.checkType = params.checkType;
      // Update quantityCheck based on checkType
      this.quantityCheck = params.checkType === 'quantity';
    } else if (conditionObj.checkType !== undefined) {
      this.checkType = conditionObj.checkType;
      this.quantityCheck = conditionObj.checkType === 'quantity';
    }

    if (params.quantityOperator !== undefined) {
      this.quantityOperator = params.quantityOperator;
    } else if (conditionObj.quantityOperator !== undefined) {
      this.quantityOperator = conditionObj.quantityOperator;
    }

    if (params.quantityValue !== undefined) {
      this.quantityValue = params.quantityValue;
    } else if (conditionObj.quantityValue !== undefined) {
      this.quantityValue = conditionObj.quantityValue;
    }

    if ((params as any).compareSource !== undefined) {
      this.compareSource = (params as any).compareSource;
    } else if (conditionObj.compareSource !== undefined) {
      this.compareSource = conditionObj.compareSource;
    }

    if ((params as any).compareVariable !== undefined) {
      this.compareVariable = (params as any).compareVariable;
    } else if (conditionObj.compareVariable !== undefined) {
      this.compareVariable = conditionObj.compareVariable;
    }

    if (params.beatId !== undefined) {
      this.beatId = params.beatId;
    } else if (conditionObj.beatId !== undefined) {
      this.beatId = conditionObj.beatId;
    }

    // FictionalTime parameters
    if (params.timeYear !== undefined) {
      this.timeYear = params.timeYear;
    } else if (conditionObj.timeYear !== undefined) {
      this.timeYear = conditionObj.timeYear;
    }
    if (params.timeMonth !== undefined) {
      this.timeMonth = params.timeMonth;
    } else if (conditionObj.timeMonth !== undefined) {
      this.timeMonth = conditionObj.timeMonth;
    }
    if (params.timeDay !== undefined) {
      this.timeDay = params.timeDay;
    } else if (conditionObj.timeDay !== undefined) {
      this.timeDay = conditionObj.timeDay;
    }
    if (params.timeHour !== undefined) {
      this.timeHour = params.timeHour;
    } else if (conditionObj.timeHour !== undefined) {
      this.timeHour = conditionObj.timeHour;
    }
    if (params.timeMinute !== undefined) {
      this.timeMinute = params.timeMinute;
    } else if (conditionObj.timeMinute !== undefined) {
      this.timeMinute = conditionObj.timeMinute;
    }

    // Rebuild condition object from extracted canonical values
    // This ensures the condition object always reflects the extracted fields
    this.condition = this.buildCondition();
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
        isValidCondition = !!(this.variable || this.variableName);
        break;
      case 'visitedBeat':
        isValidCondition = !!(this.beatId || this.variableName);
        break;
      case 'fictionalTime':
        isValidCondition = true; // Always valid - compares against current fictional time
        break;
      case 'counter':
      default:
        isValidCondition = !!(this.variableName || this.variable);
    }
    
    if (!isValidCondition || this.trueTarget === '') {
      console.error(`ConditionBeat ${this.id} has invalid condition or target`);
      return this.getNextBeat(context);
    }

    try {
      const conditionResult = context.checkCondition(this.condition);
      
      // Log condition evaluation based on type
      const varName = this.variableName || this.variable;
      const compareValue = this.value ?? this.val;
      if (this.conditionType === 'counterCompare') {
        console.log(`ConditionBeat ${this.id}: ${this.counter1} ${this.operator} ${this.counter2} = ${conditionResult}`);
      } else if (this.conditionType === 'timer') {
        console.log(`ConditionBeat ${this.id}: timer ${this.timer} ${this.operator} ${compareValue} = ${conditionResult}`);
      } else if (this.conditionType === 'visitedBeat') {
        console.log(`ConditionBeat ${this.id}: visitedBeat ${this.beatId || varName} = ${conditionResult}`);
      } else if (this.conditionType === 'fictionalTime') {
        console.log(`ConditionBeat ${this.id}: fictionalTime ${this.operator} ${this.timeDay}/${this.timeMonth}/${this.timeYear} ${this.timeHour}:${this.timeMinute} = ${conditionResult}`);
      } else {
        console.log(`ConditionBeat ${this.id}: ${varName} ${this.operator} ${compareValue} = ${conditionResult}`);
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
