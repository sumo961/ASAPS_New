import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { AddRemoveInventoryParameters } from '../generated/beat-types';

export class AddRemoveInventoryBeat extends Beat {
  private action: string;
  private item: string;
  private quantity: number | string;  // Can be a number or variable name (with $ prefix)
  private character: string;
  private fromChar: string;
  private toChar: string;

  constructor(config: BeatConfig & {
    parameters?: Partial<AddRemoveInventoryParameters>;
  } & Partial<AddRemoveInventoryParameters>) {
    super(config);
    this.action = config.action || config.parameters?.action || 'add';
    this.item = config.item || config.parameters?.item || '';
    this.quantity = config.quantity ?? config.parameters?.quantity ?? 1;
    this.character = config.character || config.parameters?.character || 'player';
    this.fromChar = config.fromChar || config.parameters?.fromChar || '';
    this.toChar = config.toChar || config.parameters?.toChar || '';
  }

  getParameters(): Record<string, any> {
    return {
      action: this.action,
      item: this.item,
      quantity: this.quantity,
      character: this.character,
      fromChar: this.fromChar,
      toChar: this.toChar
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.action !== undefined) this.action = params.action;
    if (params.item !== undefined) this.item = params.item;
    if (params.quantity !== undefined) this.quantity = params.quantity;
    if (params.character !== undefined) this.character = params.character;
    if (params.fromChar !== undefined) this.fromChar = params.fromChar;
    if (params.toChar !== undefined) this.toChar = params.toChar;
  }

  /**
   * Resolve quantity - can be a number or a variable/counter reference
   * Variable references are prefixed with $ (e.g., $goldAmount)
   */
  private resolveQuantity(context: StoryContext): number {
    if (typeof this.quantity === 'number') {
      return Math.max(1, this.quantity);
    }

    if (typeof this.quantity === 'string') {
      // Check if it's a variable reference (starts with $)
      if (this.quantity.startsWith('$')) {
        const varName = this.quantity.substring(1);
        // Try to resolve from variables first, then counters
        const resolved = context.getVariable(varName) ?? context.getCounter(varName) ?? 1;
        const numValue = typeof resolved === 'number' ? resolved : parseInt(resolved) || 1;
        return Math.max(1, numValue);
      }

      // Try to parse as a plain number string (e.g., "25")
      const parsed = parseInt(this.quantity);
      if (!isNaN(parsed)) {
        return Math.max(1, parsed);
      }

      // Fall back to treating as variable name (for backwards compatibility)
      const resolved = context.getVariable(this.quantity) ?? context.getCounter(this.quantity) ?? 1;
      const numValue = typeof resolved === 'number' ? resolved : parseInt(resolved) || 1;
      return Math.max(1, numValue);
    }

    return 1;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!this.item) {
      console.error(`AddRemoveInventoryBeat ${this.id} has no item specified`);
      return this.getNextBeat(context);
    }

    const qty = this.resolveQuantity(context);

    try {
      switch (this.action) {
        case 'add':
          context.addInventoryItem(this.character || 'player', this.item, qty);
          console.log(`AddRemoveInventoryBeat ${this.id}: Added ${qty}x '${this.item}' to ${this.character}'s inventory`);
          break;

        case 'remove':
          context.removeInventoryItem(this.character || 'player', this.item, qty);
          console.log(`AddRemoveInventoryBeat ${this.id}: Removed ${qty}x '${this.item}' from ${this.character}'s inventory`);
          break;

        case 'transfer':
          if (!this.fromChar || !this.toChar) {
            console.error(`AddRemoveInventoryBeat ${this.id}: Transfer requires fromChar and toChar`);
            break;
          }
          // Remove from source character
          context.removeInventoryItem(this.fromChar, this.item, qty);
          // Add to target character
          context.addInventoryItem(this.toChar, this.item, qty);
          console.log(`AddRemoveInventoryBeat ${this.id}: Transferred ${qty}x '${this.item}' from ${this.fromChar} to ${this.toChar}`);
          break;

        default:
          console.warn(`AddRemoveInventoryBeat ${this.id}: Unknown action '${this.action}'`);
      }
    } catch (error) {
      console.error(`Error in AddRemoveInventoryBeat ${this.id}:`, error);
    }

    // Invisible beats always proceed to next
    return this.getNextBeat(context);
  }
}
