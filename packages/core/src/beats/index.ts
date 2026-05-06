export { Beat } from './Beat';
export { InfoTextBeat } from './InfoTextBeat';
export { TitleScreenBeat } from './TitleScreenBeat';
export { MovementChoiceBeat } from './MovementChoiceBeat';
export { PickPropBeat } from './PickPropBeat';
export { ConditionBeat } from './ConditionBeat';
export { EndScreenBeat } from './EndScreenBeat';
export { SetVariableBeat } from './SetVariableBeat';
export { RandomTargetBeat } from './RandomTargetBeat';
export { SetTimerBeat } from './SetTimerBeat';
export { AddRemoveInventoryBeat } from './AddRemoveInventoryBeat';
//export { DialogTreeBeat, DialogNode, DialogChoice } from './DialogTreeBeat';
export type { DialogNode, DialogChoice } from '../generated/beat-types';
export { DialogTreeBeat, type PhaseOverride } from './DialogTreeBeat';
export { DurScreenBeat } from './DurScreenBeat';
export { VideoBeat } from './VideoBeat';
export { ConversationChoiceBeat } from './ConversationChoiceBeat';
export { SWFBeat } from './SWFBeat';
export { InputTextBeat } from './InputTextBeat';
export { HyperTextBeat } from './HyperTextBeat';
export { PanoramaBeat } from './PanoramaBeat';
// UpdateAffectBeat: the class itself + the v0.9.45 legacy-to-Effect[]
// migration helper. Don't re-export UpdateAffectParameters here — it's
// already exported from generated/beat-types.ts as the canonical home.
export { UpdateAffectBeat, synthesizeEffectsFromLegacyParams } from './UpdateAffectBeat';
// XR beats (S4+) — see docs/XR-Roadmap.md for the broader plan.
export { GpsLocationBeat, type GpsLocationBeatParameters } from './GpsLocationBeat';
export { IndoorLocationBeat, type IndoorLocationBeatParameters } from './IndoorLocationBeat';
export { BeatTypeRegistry } from './BeatRegistry';

// AI-powered beats
export { OnlineContentBeat, type OnlineContentBeatParams } from './OnlineContentBeat';
export { AIConditionBeat, type AIConditionCategory, type AIConditionBeatParams } from './AIConditionBeat';
export { AIDialogTreeBeat, type AIDialogExitTarget, type AIDialogTreeBeatParams } from './AIDialogTreeBeat';
export { AIConversationBeat, type AIConversationBeatParams } from './AIConversationBeat';
export { AISummaryBeat, type AISummaryBeatParams } from './AISummaryBeat';
export { AIInfoTextBeat, type AIInfoTextBeatParams } from './AIInfoTextBeat';
export { AIDurScreenBeat, type AIDurScreenBeatParams } from './AIDurScreenBeat';
