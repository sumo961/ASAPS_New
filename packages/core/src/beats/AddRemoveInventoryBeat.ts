import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { AddRemoveInventoryParameters } from '../generated/beat-types';

export class AddRemoveInventoryBeat extends Beat {
  private action: string;
  private item: string;
  private character: string;
  private fromChar: string;
  private toChar: string;

  constructor(config: BeatConfig & {
    parameters?: Partial<AddRemoveInventoryParameters>;
  } & Partial<AddRemoveInventoryParameters>) {
    super(config);
    this.action = config.action || config.parameters?.action || 'add';
    this.item = config.item || config.parameters?.item || '';
    this.character = config.character || config.parameters?.character || 'player';
    this.fromChar = config.fromChar || config.parameters?.fromChar || '';
    this.toChar = config.toChar || config.parameters?.toChar || '';
  }

  getParameters(): Record<string, any> {
    return {
      action: this.action,
      item: this.item,
      character: this.character,
      fromChar: this.fromChar,
      toChar: this.toChar
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.action !== undefined) this.action = params.action;
    if (params.item !== undefined) this.item = params.item;
    if (params.character !== undefined) this.character = params.character;
    if (params.fromChar !== undefined) this.fromChar = params.fromChar;
    if (params.toChar !== undefined) this.toChar = params.toChar;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!this.item) {
      console.error(`AddRemoveInventoryBeat ${this.id} has no item specified`);
      return this.getNextBeat(context);
    }

    try {
      switch (this.action) {
        case 'add':
          context.addInventoryItem(this.character || 'player', this.item);
          console.log(`AddRemoveInventoryBeat ${this.id}: Added '${this.item}' to ${this.character}'s inventory`);
          break;
          
        case 'remove':
          context.removeInventoryItem(this.character || 'player', this.item);
          console.log(`AddRemoveInventoryBeat ${this.id}: Removed '${this.item}' from ${this.character}'s inventory`);
          break;
          
        case 'transfer':
          if (!this.fromChar || !this.toChar) {
            console.error(`AddRemoveInventoryBeat ${this.id}: Transfer requires fromChar and toChar`);
            break;
          }
          // Remove from source character
          context.removeInventoryItem(this.fromChar, this.item);
          // Add to target character
          context.addInventoryItem(this.toChar, this.item);
          console.log(`AddRemoveInventoryBeat ${this.id}: Transferred '${this.item}' from ${this.fromChar} to ${this.toChar}`);
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
