/**
 * applyGeneratedStory — the ONE path that turns an AI-produced story object
 * (in-app generator, Ideator handoff, or Claude-Desktop MCP injection) into
 * builder state.
 *
 * History: App.tsx carried two ~350-line handlers for this, and they drifted
 * for a year. The injection handler never applied the suggested theme or the
 * fictional-time HUD, left the previous project's characters in place when
 * the story had none, and dropped the beats' notes; the generation handler
 * skipped the legacy "Interactor" speaker migration, fell back to no position
 * at all, and re-rendered once per beat (addBeat ×N) instead of once. Every
 * fix landed in one and had to be re-discovered in the other (the variables
 * drop, the cluster drop, the link-walk fork — see storyLinks.ts).
 *
 * Everything the builder needs is injected through `deps`, so this module has
 * no React and can be unit-tested with fakes. The callers keep only what is
 * genuinely theirs: the "replace the workspace?" confirm (generation), the
 * WebSocket de-dup (injection), and the deferred create-project + save.
 */
import type { Beat } from '@asaps/core';
import { normalizeStory, buildClustersFromBeats } from '@asaps/core';
import type { Character } from '../types/character';
import type { GlobalSettings } from '../components/settings/GlobalSettingsInspector';
import { applyTreeLayoutToBeats } from './TreeLayoutAlgorithm';
import { storyLinks as storyLinksOf, dedupeLinks } from './storyLinks';
import { mergeGeneratedVariables } from './generatedVariables';
import { validateStoryLogic, formatLogicValidationResult } from './storyLogicValidator';
import { themeToGlobalSettings } from '../themes/migration/GlobalSettingsAdapter';

export interface ApplyGeneratedStoryDeps {
  /** Store actions — only the batch-safe pair is needed. */
  actions: {
    createBeat: (type: string, position?: { x: number; y: number }, options?: { id?: string; name?: string }) => Beat;
    loadStoryData: (storyData: any) => void;
  };
  /** Current author, kept when the story carries none. */
  currentAuthor?: string;
  /** Current global settings (ref-backed so it is never a render behind). */
  getGlobalSettings: () => GlobalSettings;
  /**
   * Commit new global settings. Callers write BOTH the ref and React state
   * here — the deferred project save reads the ref before the state→ref
   * effect has run.
   */
  commitGlobalSettings: (next: GlobalSettings) => void;
  setCharacters: (characters: Character[]) => void;
  /** Runs the import validators and raises the import-issues banner. */
  reportImportValidation: (story: any) => void;
  /** Previous project's translations must not bleed into the new one. */
  clearTranslations?: () => void;
  /** Queue the cluster-aware auto-arrange for the next render. */
  requestClusterArrange: () => void;
  /**
   * Called synchronously right before the single loadStoryData. The App
   * sets its "project switch pending" guard here so the load effect does
   * not reload the previous project when the new beats land in state.
   */
  beforeStateLoad?: () => void;
  /** Loads the beat schema for the normalize pipeline (only used when `normalize` is set). */
  loadSchema?: () => Promise<any | undefined>;
  /** Resolves a suggested theme id to a theme definition; return null when unknown. */
  resolveTheme?: (themeId: string) => Promise<any | null>;
}

export interface ApplyGeneratedStoryOptions {
  /** Title used when the story metadata has none. */
  fallbackTitle: string;
  /**
   * Run the schema-driven normalize pipeline in here. The in-app generator
   * already normalizes inside AIService.generateStory; the MCP injection
   * path receives raw JSON and needs it. Not idempotent for clusters
   * (buildClustersFromBeats), so never run it twice.
   */
  normalize?: boolean;
}

export interface ApplyGeneratedStoryResult {
  title: string;
  beatCount: number;
  connectionCount: number;
  clusterCount: number;
  characterCount: number;
  themeApplied: string | null;
  fictionalTimeHudEnabled: boolean;
  unknownBeatTypes: string[];
  logicIssueCount: number;
}

/** Beat types the generators may emit, including the aliases the registry maps. */
const KNOWN_BEAT_TYPES = new Set([
  'titleScreen', 'infoText', 'dialogTree', 'conversationChoice', 'multiChoice', 'movementChoice',
  'pickProp', 'videoBeat', 'endScreen', 'durScreen', 'inputText', 'hyperText',
  'setVariable', 'setGlobal', 'setCounter', 'counter', 'variable', 'conditionBeat', 'conditionCheck', 'condition',
  'randomTarget', 'setTimer', 'addRemoveInventory', 'addInventory', 'removeInventory',
]);

/**
 * conditionBeat parameter shapes the generators emit. The normalize
 * pipeline flattens `condition.*` these days; this is the safety net for
 * un-normalized input plus the trueConnection/falseConnection → target
 * extraction the runtime needs regardless.
 */
export function flattenConditionParams(params: Record<string, any>): Record<string, any> {
  const out = { ...params };
  if (out.condition && typeof out.condition === 'object') {
    const cond = out.condition;
    out.conditionType = cond.type || out.conditionType;
    // AI may generate 'variable', 'variableName', or 'left' — support all
    out.variableName = cond.variableName || cond.variable || cond.left || out.variableName;
    out.operator = cond.operator || out.operator;
    out.value = cond.value ?? cond.right ?? out.value;
    delete out.condition;
  }
  if (out.trueConnection?.target) {
    out.trueTarget = out.trueConnection.target;
    delete out.trueConnection;
  }
  if (out.falseConnection?.target) {
    out.falseTarget = out.falseConnection.target;
    delete out.falseConnection;
  }
  return out;
}

/**
 * Auto-enable the fictional-time HUD when (and only when) the story uses
 * fictional time. Generators reliably set up the data side (setVariable
 * type fictionalTime, conditionBeat type fictionalTime) but forget the
 * display toggle, leaving the in-story clock invisible. Returns `prev`
 * untouched when nothing needs to change.
 */
export function withFictionalTimeHud(prev: GlobalSettings, story: any): GlobalSettings {
  if (!Array.isArray(story?.beats)) return prev;
  let usesFictionalTime = false;
  let earliestSetTime: { year: number; month: number; day: number; hour: number; minute: number } | null = null;

  for (const b of story.beats) {
    const t = b?.type;
    const p = b?.parameters || {};
    if (t === 'setVariable' && p.type === 'fictionalTime') {
      usesFictionalTime = true;
      if (p.operation === 'set' && earliestSetTime == null) {
        earliestSetTime = {
          year: Number(p.timeYear ?? 2024),
          month: Number(p.timeMonth ?? 1),
          day: Number(p.timeDay ?? 1),
          hour: Number(p.timeHour ?? 9),
          minute: Number(p.timeMinute ?? 0),
        };
      }
    }
    if (t === 'conditionBeat') {
      const cond = p.condition || p;
      if (cond?.type === 'fictionalTime' || cond?.conditionType === 'fictionalTime') usesFictionalTime = true;
    }
  }
  if (!usesFictionalTime) return prev;
  const hud: any = prev.hudOverlays || {};
  if (hud.fictionalTime?.enabled) return prev;

  const initialTime = earliestSetTime || { year: 2024, month: 1, day: 1, hour: 9, minute: 0 };
  return {
    ...prev,
    hudOverlays: {
      ...hud,
      fictionalTime: {
        enabled: true,
        initialTime,
        displayFormat: 'datetime-12h',
        showInTimerHud: true,
      },
      // The Timer HUD container must be on for anything to render.
      timerHud: hud.timerHud?.enabled
        ? hud.timerHud
        : {
            enabled: true,
            timerName: '',
            staticText: '',
            position: 'top-right',
            style: 'digital',
            fontSize: 18,
            textColor: '#FFFFFF',
            backgroundColor: '#000000',
            backgroundOpacity: 70,
            borderRadius: 6,
            padding: 8,
            showLabel: false,
            label: '',
            showWhenInactive: false,
          },
    },
  } as GlobalSettings;
}

export async function applyGeneratedStory(
  story: any,
  deps: ApplyGeneratedStoryDeps,
  options: ApplyGeneratedStoryOptions,
): Promise<ApplyGeneratedStoryResult> {
  const title: string = story?.metadata?.title || options.fallbackTitle;

  // 1. Structural validation → import-issues banner. The import proceeds
  //    (a story with a few bad links is mostly good work).
  deps.reportImportValidation(story);

  // 2. Narrative-logic validation (console only).
  let logicIssueCount = 0;
  try {
    const logic = validateStoryLogic(story);
    logicIssueCount = logic.issues.length;
    console.log('[applyGeneratedStory] Story logic validation:\n' + formatLogicValidationResult(logic));
  } catch (err) {
    console.warn('[applyGeneratedStory] Logic validation failed; continuing:', err);
  }

  // Beat schema: the authority on beat types (the hardcoded list below is
  // only the fallback when no schema is loadable — it went stale and
  // flagged aiConversation / aiSummary as unknown).
  let schema: any;
  if (deps.loadSchema) {
    try { schema = await deps.loadSchema(); } catch (err) { console.warn('[applyGeneratedStory] Schema unavailable:', err); }
  }
  const knownBeatTypes = new Set<string>([...KNOWN_BEAT_TYPES, ...Object.keys(schema?.beatTypes ?? {})]);

  // 3. Schema-driven normalize pipeline (raw MCP input only — see option doc).
  if (options.normalize) {
    try {
      if (schema?.beatTypes) {
        const result = normalizeStory(story, schema);
        if (result.story) Object.assign(story, result.story); // in place: the rest reads `story`
        if (result.report.changes.length > 0) {
          console.log(
            `[applyGeneratedStory] Pipeline applied ${result.report.changes.length} changes ` +
              `(${result.report.beatsNormalized} beats, ${result.report.charactersNormalized} characters, ` +
              `${result.report.clustersCreated.length} clusters auto-created)`,
          );
        }
      }
    } catch (err) {
      console.warn('[applyGeneratedStory] Pipeline failed; continuing with raw story:', err);
    }
  }

  // 4. A generated story is a new project: nothing of the previous one bleeds through.
  deps.clearTranslations?.();

  // 5. Characters. Always set — leaving the previous project's characters in
  //    place when the story has none was the v0.9.50 stale-characters bug.
  const storyCharacters: Character[] = Array.isArray(story.characters) ? story.characters : [];
  deps.setCharacters(storyCharacters);

  // 6. Global settings: variables → suggested theme → fictional-time HUD.
  //    Each step builds on the previous commit, so the theme sees the
  //    merged variables and the HUD sees the theme.
  let settings = deps.getGlobalSettings();
  const mergedVars = mergeGeneratedVariables(settings, story.variables);
  if (mergedVars) {
    settings = mergedVars;
    deps.commitGlobalSettings(settings);
    console.log(`[applyGeneratedStory] Wired ${settings.variables?.length ?? 0} variable(s) into globalSettings.variables`);
  }

  let themeApplied: string | null = null;
  const themeId = story.suggestedTheme?.themeId;
  if (themeId && deps.resolveTheme) {
    try {
      const theme = await deps.resolveTheme(themeId);
      if (theme) {
        settings = themeToGlobalSettings(theme, settings);
        deps.commitGlobalSettings(settings);
        themeApplied = theme.meta?.name ?? themeId;
        console.log('[applyGeneratedStory] Applied suggested theme:', themeApplied, '-', story.suggestedTheme?.reason);
      } else {
        console.warn('[applyGeneratedStory] Suggested theme not found:', themeId);
      }
    } catch (err) {
      console.warn('[applyGeneratedStory] Failed to apply suggested theme:', err);
    }
  }

  const withHud = withFictionalTimeHud(settings, story);
  const fictionalTimeHudEnabled = withHud !== settings;
  if (fictionalTimeHudEnabled) {
    settings = withHud;
    deps.commitGlobalSettings(settings);
    console.log('[applyGeneratedStory] Auto-enabled fictional-time HUD for generated story');
  }

  // 7. Layout: tree layout from the connection graph.
  const beatsIn: any[] = Array.isArray(story.beats) ? story.beats : [];
  const externalConnections = Array.isArray(story.connections)
    ? story.connections.map((conn: any) => ({
        source: conn.sourceId || conn.source,
        target: conn.targetId || conn.target,
      }))
    : [];
  const firstBeatId = story.metadata?.firstBeatId || story.firstBeatId || beatsIn[0]?.id;
  const adjustedPositions: Map<string, { x: number; y: number }> = beatsIn.length
    ? applyTreeLayoutToBeats(beatsIn, undefined, externalConnections, firstBeatId)
    : new Map();

  // 8. Build every Beat instance WITHOUT touching state (createBeat, not
  //    addBeat) so the whole story lands in ONE state update below.
  const unknownBeatTypes: string[] = [];
  const createdBeats: Beat[] = beatsIn.map((beatData: any) => {
    const position = adjustedPositions.get(beatData.id) ||
      beatData.position ||
      { x: beatData.x || 200, y: beatData.y || 200 };
    const beatType: string = beatData.type || 'infoText';
    if (!knownBeatTypes.has(beatType)) unknownBeatTypes.push(beatType);

    const beat = deps.actions.createBeat(beatType, position, {
      id: beatData.id,
      name: beatData.name || beatData.label,
    });

    if (typeof beatData.cluster === 'string' && beatData.cluster.trim()) {
      (beat as any).cluster = beatData.cluster.trim();
    }
    if (typeof beatData.notes === 'string' && beatData.notes.trim()) {
      (beat as any).notes = beatData.notes;
    }
    if (beatData.parameters) {
      // updateParameters (not Object.assign) so beat-specific handling runs
      // (e.g. DialogTree migration).
      const params = beatType === 'conditionBeat'
        ? flattenConditionParams(beatData.parameters)
        : { ...beatData.parameters };
      beat.updateParameters(params);
    }
    return beat;
  });
  if (unknownBeatTypes.length) {
    console.warn('[applyGeneratedStory] Unknown beat type(s) from generator:', unknownBeatTypes);
  }

  // Legacy "Interactor" speaker → the player character's name.
  const pc = storyCharacters.find((c: any) => c.role === 'player');
  if (pc) {
    const pcName = (pc as any).displayName || pc.name;
    for (const beat of createdBeats) {
      if (beat.speaker === 'Interactor') beat.speaker = pcName;
    }
  }

  // 9. Connections from the one shared walk (storyLinks) — wired onto the
  //    source instances BEFORE the load because the graph reads
  //    beat.getConnections(), not state.connections.
  const connections = dedupeLinks(storyLinksOf(story)).map((l) => ({
    source: l.source, target: l.target, ...(l.label ? { label: l.label } : {}),
  }));
  const beatMap = new Map(createdBeats.map((b) => [b.id, b]));
  for (const conn of connections) {
    const sourceBeat = beatMap.get(conn.source);
    const targetBeat = beatMap.get(conn.target);
    if (sourceBeat && targetBeat) {
      sourceBeat.addConnection({ targetId: conn.target, label: conn.label || `To ${targetBeat.name}` });
    }
  }

  // 10. The single batch load. Clusters ride along (loadStoryData takes
  //     them) instead of an addCluster per cluster after the fact.
  //     Beats that name a cluster no object exists for get a shell built
  //     the same way the pipeline builds them — otherwise the graph shows
  //     "orphaned" beats (84 of 84 on the 2026-09-08 dragon story, whose
  //     repair pass had dropped the clusters array).
  const clusters: any[] = Array.isArray(story.clusters) ? [...story.clusters] : [];
  const referencedClusters = new Set<string>(
    beatsIn.map((b: any) => (typeof b.cluster === 'string' ? b.cluster.trim() : '')).filter(Boolean),
  );
  const missingClusters = [...referencedClusters].filter(
    (name) => !clusters.some((c: any) => c.id === name || c.name === name),
  );
  if (missingClusters.length > 0) {
    const positioned = beatsIn
      .filter((b: any) => missingClusters.includes(String(b.cluster ?? '').trim()))
      .map((b: any) => ({ ...b, position: adjustedPositions.get(b.id) || b.position || { x: b.x || 200, y: b.y || 200 } }));
    clusters.push(...buildClustersFromBeats(positioned));
    console.warn('[applyGeneratedStory] Built cluster shell(s) for beats whose cluster object was missing:', missingClusters);
  }
  deps.beforeStateLoad?.();
  deps.actions.loadStoryData({
    title,
    author: story.metadata?.author || deps.currentAuthor,
    beats: createdBeats,
    connections,
    characters: storyCharacters,
    clusters,
    environment: story.environment,
  });
  if (clusters.length > 0) {
    deps.requestClusterArrange();
  }

  const result: ApplyGeneratedStoryResult = {
    title,
    beatCount: createdBeats.length,
    connectionCount: connections.length,
    clusterCount: clusters.length,
    characterCount: storyCharacters.length,
    themeApplied,
    fictionalTimeHudEnabled,
    unknownBeatTypes,
    logicIssueCount,
  };
  console.log('[applyGeneratedStory] Applied:', result);
  return result;
}
