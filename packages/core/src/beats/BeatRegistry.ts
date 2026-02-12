import { Beat } from './Beat';
import { TitleScreenBeat } from './TitleScreenBeat';
import { InfoTextBeat } from './InfoTextBeat';
import { DialogTreeBeat } from './DialogTreeBeat';
import { ConversationChoiceBeat } from './ConversationChoiceBeat';
import { MovementChoiceBeat } from './MovementChoiceBeat';
import { PickPropBeat } from './PickPropBeat';
import { VideoBeat } from './VideoBeat';
import { EndScreenBeat } from './EndScreenBeat';
import { SetVariableBeat } from './SetVariableBeat';
import { ConditionBeat } from './ConditionBeat';
import { DurScreenBeat } from './DurScreenBeat';
import { SWFBeat } from './SWFBeat';
import { RandomTargetBeat } from './RandomTargetBeat';
import { SetTimerBeat } from './SetTimerBeat';
import { AddRemoveInventoryBeat } from './AddRemoveInventoryBeat';
import { InputTextBeat } from './InputTextBeat';
import { HyperTextBeat } from './HyperTextBeat';
import { KeypadBeat } from './KeypadBeat';
// AI-powered beats
import { OnlineContentBeat } from './OnlineContentBeat';
import { AIConditionBeat } from './AIConditionBeat';
import { AIDialogTreeBeat } from './AIDialogTreeBeat';
import { AISummaryBeat } from './AISummaryBeat';
import { AIInfoTextBeat } from './AIInfoTextBeat';
import { AIDurScreenBeat } from './AIDurScreenBeat';
import type { BeatConfig } from '../types';

type BeatConstructor = new (config: BeatConfig) => Beat;

export class BeatTypeRegistry {
  private static instance: BeatTypeRegistry;
  private beatTypes: Map<string, BeatConstructor> = new Map();
  // Case-insensitive lookup map (lowercase -> canonical type)
  private typeNormalization: Map<string, string> = new Map();
  // Set of invisible beat type patterns for better fallback behavior
  private invisibleBeatPatterns: RegExp[] = [
    /^set/i,           // setVariable, setTimer, setGlobal, SetVariable, etc.
    /^condition/i,     // conditionBeat, conditionCheck, Condition, etc.
    /^random/i,        // randomTarget, randomChoice, etc.
    /inventory/i,      // addRemoveInventory, inventory, etc.
    /^add/i,           // addRemoveInventory, add*, etc.
    /^remove/i,        // removeInventory, etc.
    /^aiCondition/i,   // aiCondition (AI-powered invisible beat)
  ];

  private constructor() {
    this.registerDefaultBeats();
  }

  static getInstance(): BeatTypeRegistry {
    if (!BeatTypeRegistry.instance) {
      BeatTypeRegistry.instance = new BeatTypeRegistry();
    }
    return BeatTypeRegistry.instance;
  }

  private registerDefaultBeats(): void {
    // Visible beats
    this.registerBeatType('titleScreen', TitleScreenBeat);
    this.registerBeatType('infoText', InfoTextBeat);
    this.registerBeatType('introText', InfoTextBeat); // Legacy alias - renamed to infoText in v2.3
    this.registerBeatType('dialogTree', DialogTreeBeat);
    this.registerBeatType('conversationChoice', ConversationChoiceBeat); // Legacy
    this.registerBeatType('movementChoice', MovementChoiceBeat);
    this.registerBeatType('pickProp', PickPropBeat);
    this.registerBeatType('videoBeat', VideoBeat);
    this.registerBeatType('endScreen', EndScreenBeat);
    this.registerBeatType('durScreen', DurScreenBeat);
    this.registerBeatType('SWFBeat', SWFBeat); // Legacy
    this.registerBeatType('inputText', InputTextBeat);
    this.registerBeatType('hyperText', HyperTextBeat);
    this.registerBeatType('keypad', KeypadBeat);

    // Invisible beats
    this.registerBeatType('setVariable', SetVariableBeat);
    this.registerBeatType('setGlobal', SetVariableBeat); // Legacy alias
    this.registerBeatType('setCounter', SetVariableBeat); // Legacy - now use setVariable with type='counter'
    this.registerBeatType('counter', SetVariableBeat); // Common AI variation - treats as setVariable with type='counter'
    this.registerBeatType('variable', SetVariableBeat); // Common AI variation - treats as setVariable with type='variable'
    // SetCounter is obsolete - use setVariable with type='counter' instead
    this.registerBeatType('conditionBeat', ConditionBeat);
    this.registerBeatType('conditionCheck', ConditionBeat); // Legacy alias
    this.registerBeatType('condition', ConditionBeat); // Common AI variation
    this.registerBeatType('randomTarget', RandomTargetBeat);
    this.registerBeatType('setTimer', SetTimerBeat);
    this.registerBeatType('addRemoveInventory', AddRemoveInventoryBeat);
    this.registerBeatType('addInventory', AddRemoveInventoryBeat); // Common AI variation
    this.registerBeatType('removeInventory', AddRemoveInventoryBeat); // Common AI variation

    // AI-powered beats
    this.registerBeatType('onlineContent', OnlineContentBeat);
    this.registerBeatType('aiCondition', AIConditionBeat);
    this.registerBeatType('aiDialogTree', AIDialogTreeBeat);
    this.registerBeatType('aiSummary', AISummaryBeat);
    this.registerBeatType('aiInfoText', AIInfoTextBeat);
    this.registerBeatType('aiDurScreen', AIDurScreenBeat);
  }

  registerBeatType(type: string, constructor: BeatConstructor): void {
    this.beatTypes.set(type, constructor);
    // Also register case-insensitive lookup
    this.typeNormalization.set(type.toLowerCase(), type);
  }

  /**
   * Check if a type looks like an invisible beat based on naming patterns
   */
  private looksLikeInvisibleBeat(type: string): boolean {
    return this.invisibleBeatPatterns.some(pattern => pattern.test(type));
  }

  createBeat(type: string, config: BeatConfig): Beat {
    // First, try exact match
    let BeatClass = this.beatTypes.get(type);

    // If not found, try case-insensitive lookup
    if (!BeatClass) {
      const normalizedType = this.typeNormalization.get(type.toLowerCase());
      if (normalizedType) {
        BeatClass = this.beatTypes.get(normalizedType);
        console.log(`[BeatRegistry] Normalized beat type "${type}" -> "${normalizedType}"`);
      }
    }

    if (!BeatClass) {
      // Determine better fallback based on type pattern
      if (this.looksLikeInvisibleBeat(type)) {
        // For invisible beat types that we don't recognize, use SetVariableBeat
        // This ensures they don't render anything visible
        console.warn(`[BeatRegistry] Unknown invisible beat type: "${type}", falling back to SetVariableBeat (no-op)`);
        return new SetVariableBeat({
          ...config,
          type: 'setVariable',
          parameters: {
            ...config.parameters,
            variable: '_unknownBeat_' + type,
            value: true,
            type: 'variable'
          }
        });
      }

      // For unknown visible beat types, fall back to InfoTextBeat
      console.warn(`[BeatRegistry] Unknown visible beat type: "${type}", falling back to InfoTextBeat`);
      return new InfoTextBeat(config);
    }
    return new BeatClass(config);
  }

  getBeatTypes(): string[] {
    return Array.from(this.beatTypes.keys());
  }

  hasBeatType(type: string): boolean {
    return this.beatTypes.has(type);
  }
}
