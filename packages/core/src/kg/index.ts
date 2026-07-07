// Knowledge Graph module for IDN projects.
//
// Phase 0 (this commit): the systemic / protostory layer — a pure, deterministic
// transform of a story into the IDN's own native primitives. The cultural layer
// (LLM-extracted) and the query / comparison / adaptation tooling build on these
// types in later phases. See project memory `project_knowledge_graph_feature`.

export * from './types';
export { buildSystemicGraph } from './buildSystemicGraph';
export {
  buildCulturalExtractionPrompt,
  parseCulturalExtraction,
  extractCulturalLayer,
  mergeCulturalLayer,
  extractJSONObject,
} from './culturalExtraction';
export type {
  CulturalBeatText,
  CulturalExtractionRequest,
  CulturalExtractionResult,
  GenerateFn,
} from './culturalExtraction';
export {
  compareProfiles,
  compareCulturalGraphs,
  compareCulturalGraphsSemantic,
  buildAlignmentPrompt,
  parseAlignment,
  diffFromAlignment,
  normalizeLabel,
} from './culturalComparison';
export type { ValueGap, CulturalDiff } from './culturalComparison';
export {
  buildCultureProfilePrompt,
  parseCultureProfile,
  inferCultureProfile,
} from './cultureProfileInference';
export type { CultureInferenceRequest } from './cultureProfileInference';
export {
  buildAdaptationPrompt,
  parseAdaptationHints,
  generateAdaptationHints,
  hintsToBeatNotes,
} from './adaptation';
export type {
  AdaptationHint,
  AdaptationRequest,
  AdaptationResult,
  AdaptationSeverity,
} from './adaptation';
