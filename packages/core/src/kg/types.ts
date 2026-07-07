// Knowledge Graph types for IDN projects.
//
// Design note (see project memory `project_knowledge_graph_feature`):
// This schema is deliberately NOT grounded in Chatman's print/film narrative
// model. It is "emerging, not prescribing": the systemic layer uses the IDN's
// own native primitives (beats, choices, conditions, counters) and the cultural
// layer uses soft, overridable SEED types with an emergent escape hatch for
// content that doesn't fit a seed.

/** Which of the two graph layers a node/edge belongs to. */
export type KGLayer = 'systemic' | 'cultural';

/**
 * A node in the knowledge graph.
 *
 * `type` is an OPEN string. For the systemic layer it is one of
 * {@link SYSTEMIC_NODE_TYPES}; for the cultural layer it is one of
 * {@link CULTURAL_SEED_TYPES} or, when nothing fits, an emergent free type
 * (with `emergent: true`).
 */
export interface KGNode {
  id: string;
  layer: KGLayer;
  type: string;
  label: string;
  /** Beats this node is derived from / asserted in. Anchors cultural nodes. */
  sourceBeatIds: string[];
  /** Cultural layer only: true when the type was invented, not a seed. */
  emergent?: boolean;
  /** Cultural layer only: 0 (universal) .. 1 (highly culture-specific). */
  cultureBoundness?: number;
  /** Systemic layer only: which protostory element this node realises (SPP). */
  protostoryElement?: ProtostoryElement;
  /** Cultural layer only: sensitivity/contention flag (Nesterov). */
  contention?: ContentionInfo;
  props?: Record<string, unknown>;
}

/** A directed, typed edge between two {@link KGNode}s. */
export interface KGEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
  props?: Record<string, unknown>;
}

export interface KGGraphMeta {
  projectId?: string;
  projectName?: string;
  layers: KGLayer[];
  generatedFrom: 'systemic' | 'cultural' | 'combined';
  counts: { nodes: number; edges: number };
}

export interface KGGraph {
  nodes: KGNode[];
  edges: KGEdge[];
  meta: KGGraphMeta;
}

/** Systemic-layer node types — the IDN's own primitives. */
export const SYSTEMIC_NODE_TYPES = {
  Beat: 'Beat',
  Choice: 'Choice',
  Character: 'Character',
  Counter: 'Counter',
  Variable: 'Variable',
  /**
   * A sub-structure of the narrative design that provides motivation, retains
   * authorial control, sets boundaries, or facilitates a dramatic turn/ending
   * (Koenitz, SPP). Derived: e.g. counter-gated branches, condition beats, and
   * ending screens. Loosely coupled, not a fixed plot skeleton.
   */
  NarrativeVector: 'NarrativeVector',
} as const;

/**
 * Maps each systemic node type to the protostory ELEMENT it belongs to
 * (Koenitz, SPP / Part 3). Used to group/colour the graph by the author's own
 * model rather than by raw beat type. "Narrative design" = the arrangement of
 * beats and their connections (the possibility space); we deliberately avoid
 * the hypertext-theory term for those content units.
 */
export const PROTOSTORY_ELEMENT = {
  Beat: 'narrativeDesign',
  Choice: 'ui', // a point of agency exposed through the UI within the narrative design
  NarrativeVector: 'narrativeVector',
  Counter: 'procedural',
  Variable: 'procedural',
  Character: 'assets',
} as const;

export type ProtostoryElement =
  (typeof PROTOSTORY_ELEMENT)[keyof typeof PROTOSTORY_ELEMENT];

/** Systemic-layer edge types. */
export const SYSTEMIC_EDGE_TYPES = {
  /** beat → beat: an authored transition (the possibility space). */
  leadsTo: 'leadsTo',
  /** beat → choice: the beat presents this choice. */
  offersChoice: 'offersChoice',
  /** choice → choice: an intra-beat dialogue continuation. */
  continuesTo: 'continuesTo',
  /** choice → beat: selecting the choice routes here. */
  choiceLeadsTo: 'choiceLeadsTo',
  /** choice → counter: selecting the choice mutates this counter. */
  affects: 'affects',
  /** beat → counter|variable: a condition beat gates flow on this value. */
  gatedBy: 'gatedBy',
  /** beat → character: the beat is spoken by this character. */
  spokenBy: 'spokenBy',
  /** character → counter: the counter belongs to this character. */
  hasCounter: 'hasCounter',
} as const;

/**
 * Cultural-layer SEED types (soft, overridable). These are DESCRIPTIVE
 * ethnographic facets grounded in the cultural-KG literature, NOT Chatman:
 *  - Chansanam et al. 2025 (ethnographic diversity): religion, language &
 *    naming, festivals/practices, place/region, migration/origin, housing,
 *    ethnic/identity group.
 *  - Deshpande et al. 2022 (StereoKG): cultural knowledge vs. stereotype,
 *    traits, food.
 * The extractor may emit a free type instead and mark the node
 * `emergent: true` for human review. The NORMATIVE VALUE layer (Hofstede /
 * Schwartz / WVS / Moral Foundations) is encoded separately in
 * {@link VALUE_DIMENSION_TYPES} once the value-framework research lands.
 */
export const CULTURAL_SEED_TYPES = [
  'SocialRole',
  'KinshipRelation', // family structure / authority (Chansanam ethnographic)
  'Institution',
  'Religion', // belief system (Chansanam PRACTICES; StereoKG)
  'Practice', // ritual / tradition / festival (Chansanam SHARES_FESTIVAL_TRADITION)
  'Norm',
  'Value',
  'Place', // setting / region (Chansanam LOCATED_IN)
  'MaterialArtifact', // food, dress, housing (Chansanam housing; StereoKG food)
  'LanguageForm', // term, naming, autonym/exonym (Chansanam HAS_AUTONYM/EXONYM)
  'IdentityGroup', // ethnicity / group membership (Chansanam ethnic-group hub)
  'EmotionalFraming',
  'Stereotype', // a culturally-held belief about a group (StereoKG) — flag, don't endorse
] as const;

/**
 * Contention / sensitivity model (Nesterov et al. 2023, "contentious
 * terminology"). A cultural node may be flagged as contentious in a given
 * culture/context, optionally carrying suggested alternatives. This is the
 * primary substrate for adaptation HINTS: "this is culture-bound/sensitive
 * here — consider X."
 */
export const CONTENTION_EDGE_TYPES = {
  /** culturalNode → culturalNode: a less-contentious alternative in a target culture. */
  suggestedAlternative: 'suggestedAlternative',
  /** culturalNode → culturalNode: asserts a (often stereotyped) belief about a group. */
  assertsAbout: 'assertsAbout',
} as const;

/** Cultural-layer edge types (beyond the contention edges below). */
export const CULTURAL_EDGE_TYPES = {
  /** culturalNode → beat: this cultural element is asserted in that beat. */
  assertedIn: 'assertedIn',
  /** culturalNode → culturalNode: a generic association the extractor surfaced. */
  relatesTo: 'relatesTo',
} as const;

export type CulturalEdgeType =
  (typeof CULTURAL_EDGE_TYPES)[keyof typeof CULTURAL_EDGE_TYPES];

export interface ContentionInfo {
  /** True when this element is sensitive/contested in the relevant culture. */
  contentious: boolean;
  /** Why — e.g. derogatory, elides context, perspective-bound (Nesterov). */
  reason?: string;
  /** Whose perspective makes it contentious (Nesterov "perspective"). */
  perspective?: string;
  /** Source/provenance of the contention judgement. */
  provenance?: string;
}

/**
 * NORMATIVE VALUE dimensions — the layer the four ethnographic/heritage papers
 * do NOT cover, grounded in a deep search of value-framework scholarship (see
 * docs/KG/value-dimensions-research.md for citations). These are what actually
 * differ between e.g. Sweden and Sri Lanka for a coming-out narrative. Ontology
 * reuse targets: ValueNet (Schwartz BHV + Moral Foundations, OWL) and FOLK.
 */
export const VALUE_DIMENSION_TYPES = [
  // WVS / Inglehart–Welzel — the two most relevant axes
  'TraditionalVsSecularRational', // religiosity, family authority, deference
  'SurvivalVsSelfExpression', // tolerance, gender equality, gay acceptance, autonomy
  // Hofstede
  'IndividualismCollectivism',
  'PowerDistance',
  'GenderRoleRigidity', // Hofstede Masculinity + gender-role beliefs
  // Schwartz (culture level)
  'AutonomyVsEmbeddedness',
  // Dignity–Face–Honor model (captures family reputation)
  'HonorFaceDignity',
  // Moral Foundations (binding vs individualizing); Sanctity ⇒ anti-gay attitudes
  'MoralFoundations',
] as const;

export type ValueDimensionType = (typeof VALUE_DIMENSION_TYPES)[number];

/** A culture's stance on one value dimension. */
export interface CultureValuePosition {
  dimension: ValueDimensionType;
  /** Normalized position -1..1 where meaningful (else use `label`). */
  position?: number;
  /** Human-readable stance, e.g. 'highly traditional / religious'. */
  label?: string;
  /** Citation / provenance for this position. */
  source?: string;
  /** Whether the position is empirically measured or theory-inferred. */
  basis?: 'measured' | 'inferred';
}

/**
 * A cultural profile: descriptive context + normative value positions. Used as
 * BOTH the source-culture annotation and the target-culture goal in adaptation.
 * Reference profiles below are editable, inferred defaults — not measurements.
 */
export interface CultureProfile {
  id: string;
  label: string;
  /** Free-text descriptive context (religion, family structure…). */
  description?: string;
  /**
   * Region or ethnicity that refines the culture WITHIN it — a sub-national
   * region or an ethnic group, NOT a country. e.g. 'Tamil' (within Sri Lanka),
   * 'Karnataka' (within India), 'Bavaria' (within Germany). Culture is DISTINCT
   * from language: a project can be English-language but Tamil-culture.
   */
  region?: string;
  /**
   * Language(s) commonly associated with this culture (BCP-47), purely
   * informational. NOT the project's language setting — the two are decoupled.
   */
  languages?: string[];
  values: CultureValuePosition[];
}

const WVS = 'World Values Survey / Inglehart–Welzel (docs/KG/value-dimensions-research.md)';

/** Inferred reference profile — Sweden (secular-rational + self-expression). */
export const SWEDEN_PROFILE: CultureProfile = {
  id: 'sweden',
  label: 'Sweden',
  description:
    'Secular, individualist, high gender equality and acceptance of homosexuality; ' +
    'dignity-based; low family authority over adult/teen choices.',
  values: [
    { dimension: 'TraditionalVsSecularRational', position: 0.9, label: 'strongly secular-rational', source: WVS, basis: 'inferred' },
    { dimension: 'SurvivalVsSelfExpression', position: 0.95, label: 'strong self-expression / high tolerance', source: WVS, basis: 'inferred' },
    { dimension: 'IndividualismCollectivism', position: 0.85, label: 'highly individualist', source: 'Hofstede', basis: 'inferred' },
    { dimension: 'PowerDistance', position: -0.7, label: 'low power distance', source: 'Hofstede', basis: 'inferred' },
    { dimension: 'GenderRoleRigidity', position: -0.85, label: 'egalitarian gender roles', source: 'Hofstede', basis: 'inferred' },
    { dimension: 'HonorFaceDignity', label: 'dignity (internal worth)', source: 'Dignity–Face–Honor', basis: 'inferred' },
    { dimension: 'MoralFoundations', label: 'individualizing (Care/Fairness) dominant; low Sanctity', source: 'MFT', basis: 'inferred' },
  ],
};

/** Inferred reference profile — Sri Lanka (traditional + survival). */
export const SRI_LANKA_PROFILE: CultureProfile = {
  id: 'sri-lanka',
  label: 'Sri Lanka',
  description:
    'Religious, collectivist, strong family authority and honor/face concerns; ' +
    'lower acceptance of homosexuality; disclosure weighed against family reputation.',
  values: [
    { dimension: 'TraditionalVsSecularRational', position: -0.8, label: 'strongly traditional / religious', source: WVS, basis: 'inferred' },
    { dimension: 'SurvivalVsSelfExpression', position: -0.6, label: 'survival-oriented / lower tolerance', source: WVS, basis: 'inferred' },
    { dimension: 'IndividualismCollectivism', position: -0.8, label: 'collectivist', source: 'Hofstede', basis: 'inferred' },
    { dimension: 'PowerDistance', position: 0.7, label: 'high power distance', source: 'Hofstede', basis: 'inferred' },
    { dimension: 'GenderRoleRigidity', position: 0.6, label: 'more rigid gender roles', source: 'Hofstede', basis: 'inferred' },
    { dimension: 'HonorFaceDignity', label: 'honor / face (family reputation salient)', source: 'Dignity–Face–Honor', basis: 'inferred' },
    { dimension: 'MoralFoundations', label: 'binding (Loyalty/Authority/Sanctity) salient; high Sanctity', source: 'MFT', basis: 'inferred' },
  ],
};

export const REFERENCE_CULTURE_PROFILES: CultureProfile[] = [SWEDEN_PROFILE, SRI_LANKA_PROFILE];

export type SystemicNodeType =
  (typeof SYSTEMIC_NODE_TYPES)[keyof typeof SYSTEMIC_NODE_TYPES];
export type SystemicEdgeType =
  (typeof SYSTEMIC_EDGE_TYPES)[keyof typeof SYSTEMIC_EDGE_TYPES];
export type CulturalSeedType = (typeof CULTURAL_SEED_TYPES)[number];
export type ContentionEdgeType =
  (typeof CONTENTION_EDGE_TYPES)[keyof typeof CONTENTION_EDGE_TYPES];

// ---------------------------------------------------------------------------
// Narrow structural input shapes.
//
// These intentionally describe only the fields the builder reads, so that BOTH
// the serialized project.json story and the builder's runtime `Beat[]` satisfy
// them without coupling the KG module to the heavy engine classes.
// ---------------------------------------------------------------------------

export interface KGBeatConnectionInput {
  targetId?: string;
  target?: string;
  label?: string;
  condition?: KGConditionInput;
}

export interface KGConnectionInput {
  source: string;
  target: string;
  label?: string;
  condition?: KGConditionInput;
}

export interface KGConditionInput {
  type?: string;
  operator?: string;
  variableName?: string;
  value?: unknown;
  character?: string;
}

export interface KGEffectInput {
  type?: string;
  target?: string;
  value?: unknown;
}

export interface KGChoiceInput {
  id?: string;
  text?: string;
  target?: string;
  effects?: KGEffectInput[];
  dialogNode?: KGDialogNodeInput;
}

export interface KGDialogNodeInput {
  id?: string;
  text?: string;
  choices?: KGChoiceInput[];
}

export interface KGBeatInput {
  id: string;
  name?: string;
  type?: string;
  speaker?: string;
  parameters?: Record<string, unknown>;
  connections?: KGBeatConnectionInput[];
}

export interface KGCounterInput {
  name: string;
  displayName?: string;
  value?: number;
}

export interface KGCharacterInput {
  id?: string;
  name?: string;
  displayName?: string;
  counters?: KGCounterInput[];
}

export interface KGStoryInput {
  metadata?: { title?: string; author?: string };
  beats?: KGBeatInput[];
  connections?: KGConnectionInput[];
  characters?: KGCharacterInput[];
}

export interface KGVariableInput {
  name: string;
  type?: string;
  defaultValue?: unknown;
  description?: string;
}

export interface BuildSystemicOptions {
  /** Story-level variables (from globalSettings.variables). */
  variables?: KGVariableInput[];
  projectId?: string;
  projectName?: string;
  /** Include dialogue Choice nodes/edges. Default true. */
  includeChoices?: boolean;
}
