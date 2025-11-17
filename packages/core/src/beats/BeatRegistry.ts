import { Beat } from './Beat';
import { TitleScreenBeat } from './TitleScreenBeat';
import { IntroTextBeat } from './IntroTextBeat';
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
import type { BeatConfig } from '../types';

type BeatConstructor = new (config: BeatConfig) => Beat;

export class BeatTypeRegistry {
  private static instance: BeatTypeRegistry;
  private beatTypes: Map<string, BeatConstructor> = new Map();

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
    this.registerBeatType('introText', IntroTextBeat);
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
    
    // Invisible beats
    this.registerBeatType('setVariable', SetVariableBeat);
    this.registerBeatType('setGlobal', SetVariableBeat); // Legacy alias
    // SetCounter is obsolete - use setVariable with type='counter' instead
    this.registerBeatType('conditionBeat', ConditionBeat);
    this.registerBeatType('conditionCheck', ConditionBeat); // Legacy alias
    this.registerBeatType('randomTarget', RandomTargetBeat);
    this.registerBeatType('setTimer', SetTimerBeat);
    this.registerBeatType('addRemoveInventory', AddRemoveInventoryBeat);
  }

  registerBeatType(type: string, constructor: BeatConstructor): void {
    this.beatTypes.set(type, constructor);
  }

  createBeat(type: string, config: BeatConfig): Beat {
    const BeatClass = this.beatTypes.get(type);
    if (!BeatClass) {
      console.warn(`Unknown beat type: ${type}, falling back to IntroTextBeat`);
      return new IntroTextBeat(config);
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
