// Analysis tools for story structure

// Constraint-based path analysis
export { ConstraintPathAnalyzer } from './ConstraintPathAnalyzer';
export { BackwardAnalyzer } from './BackwardAnalyzer';
export { PathQueryEngine } from './PathQuery';

// State-based simulation analysis (improved path finding)
export { StateSimulationAnalyzer } from './StateSimulationAnalyzer';
export type {
  SimulationState,
  SimulatedStep,
  SimulatedPath,
  SimulationAnalysisConfig,
} from './StateSimulationAnalyzer';
export type {
  ConstraintAnalysisConfig,
} from './ConstraintPathAnalyzer';
export type {
  ConstraintSet,
  OutcomeGroup,
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

// Reachability analysis
export { ReachabilityAnalyzer } from './ReachabilityAnalyzer';
export type {
  ReachabilityResult,
  UnreachableBeat,
  ReachabilityWarning,
  BrokenConnection,
  ConditionBeatWarning
} from './ReachabilityAnalyzer';
