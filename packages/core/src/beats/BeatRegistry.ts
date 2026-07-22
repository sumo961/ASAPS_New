import { Beat } from './Beat';
import { TitleScreenBeat } from './TitleScreenBeat';
import { InfoTextBeat } from './InfoTextBeat';
import { DialogTreeBeat } from './DialogTreeBeat';
import { ConversationChoiceBeat } from './ConversationChoiceBeat';
import { MultiChoiceBeat } from './MultiChoiceBeat';
import { MovementChoiceBeat } from './MovementChoiceBeat';
import { PickPropBeat } from './PickPropBeat';
import { VideoBeat } from './VideoBeat';
import { EndScreenBeat } from './EndScreenBeat';
import { SetVariableBeat } from './SetVariableBeat';
import { ConditionBeat } from './ConditionBeat';
import { DurScreenBeat } from './DurScreenBeat';
import { RandomTargetBeat } from './RandomTargetBeat';
import { SetGpsLocationBeat } from './SetGpsLocationBeat';
import { SetTimerBeat } from './SetTimerBeat';
import { AddRemoveInventoryBeat } from './AddRemoveInventoryBeat';
import { UpdateAffectBeat } from './UpdateAffectBeat';
import { InputTextBeat } from './InputTextBeat';
import { InputImageBeat } from './InputImageBeat';
import { HyperTextBeat } from './HyperTextBeat';
import { KeypadBeat } from './KeypadBeat';
import { QRScanBeat } from './QRScanBeat';
import { WebViewBeat } from './WebViewBeat';
import { ARBeat } from './ARBeat';
import { PanoramaBeat } from './PanoramaBeat';
// XR beats (S4+)
import { GpsLocationBeat } from './GpsLocationBeat';
import { IndoorLocationBeat } from './IndoorLocationBeat';
// AI-powered beats
import { OnlineContentBeat } from './OnlineContentBeat';
import { AIConditionBeat } from './AIConditionBeat';
import { AIDialogTreeBeat } from './AIDialogTreeBeat';
import { AIConversationBeat } from './AIConversationBeat';
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
    this.registerBeatType('multiChoice', MultiChoiceBeat);
    this.registerBeatType('movementChoice', MovementChoiceBeat);
    this.registerBeatType('pickProp', PickPropBeat);
    this.registerBeatType('videoBeat', VideoBeat);
    this.registerBeatType('endScreen', EndScreenBeat);
    this.registerBeatType('durScreen', DurScreenBeat);
    this.registerBeatType('inputText', InputTextBeat);
    this.registerBeatType('inputImage', InputImageBeat);
    this.registerBeatType('hyperText', HyperTextBeat);
    this.registerBeatType('keypad', KeypadBeat);
    this.registerBeatType('qrScan', QRScanBeat);
    this.registerBeatType('webView', WebViewBeat);
    this.registerBeatType('arBeat', ARBeat);
    this.registerBeatType('panorama', PanoramaBeat);

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
    this.registerBeatType('setGpsLocation', SetGpsLocationBeat);
    this.registerBeatType('setTimer', SetTimerBeat);
    this.registerBeatType('addRemoveInventory', AddRemoveInventoryBeat);
    this.registerBeatType('updateAffect', UpdateAffectBeat);
    this.registerBeatType('gpsLocation', GpsLocationBeat);
    this.registerBeatType('indoorLocation', IndoorLocationBeat);
    this.registerBeatType('addInventory', AddRemoveInventoryBeat); // Common AI variation
    this.registerBeatType('removeInventory', AddRemoveInventoryBeat); // Common AI variation

    // AI-powered beats
    this.registerBeatType('onlineContent', OnlineContentBeat);
    this.registerBeatType('aiCondition', AIConditionBeat);
    this.registerBeatType('aiDialogTree', AIDialogTreeBeat);
    this.registerBeatType('aiSummary', AISummaryBeat);
    this.registerBeatType('aiInfoText', AIInfoTextBeat);
    this.registerBeatType('aiDurScreen', AIDurScreenBeat);
    this.registerBeatType('aiConversation', AIConversationBeat);
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
