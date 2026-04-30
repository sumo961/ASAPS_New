export { PlayerContextBuilder, type PlayerContextOptions, type PlayerContextData } from './PlayerContextBuilder';
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
