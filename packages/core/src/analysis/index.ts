// Analysis tools for story structure

// Constraint-based path analysis
export { ConstraintPathAnalyzer } from './ConstraintPathAnalyzer';
export { BackwardAnalyzer } from './BackwardAnalyzer';
export { PathQueryEngine } from './PathQuery';

// The links the debug tools follow, and which beats branch
export { analysisLinks, isChoiceBeatType, CHOICE_BEAT_TYPES, SINGLE_LINK_BEAT_TYPES } from './analysisLinks';

// State-based simulation analysis (improved path finding)
export { StateSimulationAnalyzer, itemQuantity } from './StateSimulationAnalyzer';

// The states players arrive in at each beat (Story Logic, presets)
export { arrivalStates, arrivalStateAt, arrivalKey, arrivesDifferently, describeArrivalDifferences, stateMentions } from './arrivalStates';
export type { BeatArrival, ArrivalOptions, DescribeOptions } from './arrivalStates';
export type {
  SimulationState,
  SimulatedStep,
  SimulatedPath,
  SimulationAnalysisConfig,
  SimulationProgress,
  SituationSearch,
  SituationStep,
  SituationConfig,
  GateOnTheWay,
  RangeClosure,
  CounterRangeFacts,
} from './StateSimulationAnalyzer';
export type { Range } from './counterRanges';
export type {
  ConstraintAnalysisConfig,
} from './ConstraintPathAnalyzer';
export type {
  ConstraintSet,
  OutcomeGroup,
  PathEndType,
  PathStep,
  PathVariation,
  ConstraintPathResult,
  NumericRange,
  ValueConstraint,
} from './ConstraintSet';
export {
  createEmptyConstraintSet,
  constraintSetToStrings,
  hashConstraintSet,
} from './ConstraintSet';
export type {
  BackwardAnalysisResult,
  PathRequirement,
  DecisionPoint,
} from './BackwardAnalyzer';
export type {
  PathQuery,
  PathQueryType,
  QueryResult,
} from './PathQuery';

// Level-2 story warnings (soft-locks, ungated puzzles, unfulfillable requires)
export { detectStoryWarnings, looksLikeSameName } from './StoryWarnings';
export { analyzeRoleFindings, beatCastRoles, type RoleFinding } from './roleFindings';
export type {
  StoryWarning,
  StoryEvidence,
  StoryWarningCode,
} from './StoryWarnings';

// Collapsed path tree view
export { buildPathTree } from './PathTree';
export type {
  PathTreeNode,
  PathTreeBranch,
  PathTreeResult,
  HubOption,
  HubOptionItem,
  BeatRef,
  ConditionAnnotation,
  StateSummary,
  ChoiceVariant,
} from './PathTree';

// Reachability analysis
export { ReachabilityAnalyzer, describeGate, characterNamer } from './ReachabilityAnalyzer';
export type {
  ReachabilityResult,
  UnreachableBeat,
  ReachabilityWarning,
  BrokenConnection,
  ConditionBeatWarning
} from './ReachabilityAnalyzer';
