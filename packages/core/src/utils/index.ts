export { PlayerContextBuilder, type PlayerContextOptions, type PlayerContextData } from './PlayerContextBuilder';
export {
  normalizeDurationToSeconds,
  durationSecondsToMs,
  suggestDurationSeconds,
  type SuggestDurationOptions,
} from './duration';
export {
  isSlotIntent,
  slotIntentFor,
  type SlotAnchor,
  type SlotIntentEntry,
  type SlotIntent,
  type SlotIntentResolution,
} from './slotIntent';
export {
  isSlotAnimations,
  slotAnimationsFor,
  type SlotAnimationPreset,
  type SlotAnimation,
  type SlotAnimationEntry,
  type SlotAnimations,
  type SlotWaypoint,
  type SlotPath,
} from './slotAnimation';
export {
  isSpatialAnimations,
  type SpatialAnimationPreset,
  type SpatialAnimation,
  type SpatialAnimations,
  type SpatialWaypoint,
  type SpatialPath,
} from './spatialAnimation';
export {
  isHotspot,
  resolveHotspotRect,
  type Hotspot,
} from './hotspot';
export {
  resolveAssetVariant,
  detectDeviceClass,
  detectOrientation,
  type AssetVariant,
  type AssetVariantContext,
  type AssetOrientation,
  type AssetDeviceClass,
} from './assetVariant';
export { waitForTTS, waitForReadingTime } from './ttsWait';
export { resolveCharacter, resolveCharacterKey, isKnownCharacter } from './characterRef';
export { buildDossier, buildDossierForRef, describeMoodAxis, type BuildDossierOptions, type DossierInteraction } from './dossier';
export { resolveCharacterWithVariant, findCharacterVariant } from './characterVariant';
export {
  beatsForCharacter,
  choicesForCharacter,
  interactionsForCharacter,
  relationshipBetween,
  type CharacterBeatEntry,
  type CharacterChoiceEntry,
  type CharacterInteraction,
} from './narrativeMemory';
export {
  // Types
  type AIProxyRequest,
  type AIProxyResponse,
  type ClaudeRequestConfig,
  type OpenAIRequestConfig,
  // Endpoint resolution
  resolveClaudeEndpoint,
  resolveOpenAIEndpoint,
  // Header construction
  buildClaudeHeaders,
  buildOpenAIHeaders,
  // Request config builders
  buildClaudeRequestConfig,
  buildOpenAIRequestConfig,
  // Response processing
  parseAIResponse,
  // Validation
  validateProxyRequest,
  // Constants
  CORS_HEADERS,
  DEFAULT_CLAUDE_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_PROXY_PORT,
  DEFAULT_AI_TIMEOUT_MS,
} from './AIProxyHandlers';
export {
  ensureXRPermission,
  type XRPermissionVerdict,
  type XRPermissionPolicy,
} from './xrPermissions';
export {
  parseAsapsUri,
  formatAsapsUri,
  type AsapsAction,
} from './asapsUri';
