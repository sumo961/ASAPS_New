import React from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Beat,
  KGGraph,
  CultureProfile,
  REFERENCE_CULTURE_PROFILES,
  mergeCulturalLayer,
  compareProfiles,
  compareCulturalGraphsSemantic,
  inferCultureProfile,
  ValueGap,
  CulturalDiff,
  AdaptationResult,
  GenerateFn,
  SYSTEMIC_NODE_TYPES as N,
} from '@asaps/core';
import type { Character } from '../../types/character';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import { useAI } from '../../hooks/useAI';
import { buildWorkspaceKG, layoutKG, legendColor } from './kgAdapter';
import {
  runCulturalExtraction,
  runAdaptation,
  createAdaptedProject,
  listComparableProjects,
  loadProjectBeats,
  ComparableProject,
} from './kgCulturalExtraction';

interface WorkspaceConnection {
  source: string;
  target: string;
  label?: string;
}

interface KnowledgeGraphViewProps {
  beats: Beat[];
  connections: WorkspaceConnection[];
  characters?: Character[];
  globalSettings?: GlobalSettings;
  projectName?: string;
  projectId?: string;
}

const TYPE_ORDER = [N.Character, N.Counter, N.Variable, N.Beat, N.Choice];

/** Sentinel for the "type any culture" target option. */
const CUSTOM_TARGET = '__custom_target__';

/** A culture identity (decoupled from language): name + optional region/ethnicity. */
interface CultureSpec {
  id: string;
  label: string;
  region?: string;
  language?: string;
}

const slugifyCulture = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'culture';

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  beats,
  connections,
  characters = [],
  globalSettings,
  projectName,
  projectId,
}) => {
  const { isConfigured, generateConversationTurn } = useAI();

  /** Shared LLM completion built from the configured provider. */
  const generate = React.useCallback<GenerateFn>(
    async (prompt) => {
      const res = await generateConversationTurn({
        systemPrompt:
          'You are a precise cultural analyst. Output STRICT JSON only — no prose, no markdown fences.',
        messages: [{ role: 'user', content: prompt }],
        // Generous cap: reasoning models (gpt-5.x) spend completion tokens on
        // hidden reasoning, so a small cap leaves nothing for the JSON output.
        maxTokens: 32000,
      });
      const text = (res as { text?: string } | null)?.text ?? '';
      if (!text.trim()) {
        throw new Error(
          'The model returned empty output — likely the token budget was consumed by reasoning. Try a non-reasoning model.'
        );
      }
      return text;
    },
    [generateConversationTurn]
  );

  const systemicGraph: KGGraph = React.useMemo(
    () =>
      buildWorkspaceKG(beats as any, connections, characters as any, globalSettings?.variables ?? [], {
        projectName,
      }),
    [beats, connections, characters, globalSettings?.variables, projectName]
  );

  // --- Culture: SOURCE is the project's own cultural setting (Settings →
  // Translation); TARGET is any reference culture or an ad-hoc one typed here.
  // Both are decoupled from language; non-reference cultures have their value
  // positions inferred via the LLM on demand.
  const [error, setError] = React.useState<string | null>(null);
  const [inferredProfiles, setInferredProfiles] = React.useState<Record<string, CultureProfile>>({});
  const [inferring, setInferring] = React.useState(false);

  const resolveSpec = React.useCallback(
    (spec: CultureSpec | null): CultureProfile | undefined => {
      if (!spec) return undefined;
      return REFERENCE_CULTURE_PROFILES.find((p) => p.id === spec.id) ?? inferredProfiles[spec.id];
    },
    [inferredProfiles]
  );

  // SOURCE comes from the project's culture metadata — not a free choice.
  const sourceSpec: CultureSpec | null = React.useMemo(() => {
    const c = globalSettings?.culture;
    const ref = REFERENCE_CULTURE_PROFILES.find((p) => p.id === c?.profileId);
    if (ref) return { id: ref.id, label: ref.label, region: ref.region };
    if (c?.label) {
      return { id: `proj:${slugifyCulture(c.label)}`, label: c.label, region: c.region, language: c.language };
    }
    return null;
  }, [globalSettings?.culture]);

  // TARGET: pick a reference, or "Custom target…" to type any culture.
  const [targetChoice, setTargetChoice] = React.useState<string>(
    REFERENCE_CULTURE_PROFILES.find((p) => p.id !== globalSettings?.culture?.profileId)?.id ??
      REFERENCE_CULTURE_PROFILES[0]?.id ??
      ''
  );
  const [customTarget, setCustomTarget] = React.useState({ label: '', region: '', language: '' });

  const targetSpec: CultureSpec | null = React.useMemo(() => {
    if (targetChoice === CUSTOM_TARGET) {
      const label = customTarget.label.trim();
      return label
        ? {
            id: `tgt:${slugifyCulture(label)}`,
            label,
            region: customTarget.region.trim() || undefined,
            language: customTarget.language.trim() || undefined,
          }
        : null;
    }
    const ref = REFERENCE_CULTURE_PROFILES.find((p) => p.id === targetChoice);
    return ref ? { id: ref.id, label: ref.label, region: ref.region } : null;
  }, [targetChoice, customTarget]);

  const sourceProfile = resolveSpec(sourceSpec);
  const targetProfile = resolveSpec(targetSpec);

  const specNeedsInfer = (spec: CultureSpec | null) =>
    Boolean(spec && !REFERENCE_CULTURE_PROFILES.some((p) => p.id === spec.id) && !inferredProfiles[spec.id]);

  const inferSpec = async (spec: CultureSpec | null) => {
    if (!spec || !specNeedsInfer(spec)) return;
    setInferring(true);
    setError(null);
    try {
      const p = await inferCultureProfile(
        { label: spec.label, region: spec.region, language: spec.language },
        generate
      );
      setInferredProfiles((prev) => ({ ...prev, [spec.id]: { ...p, id: spec.id } }));
    } catch (e) {
      setError((e as Error).message || 'Could not infer the culture profile.');
    } finally {
      setInferring(false);
    }
  };

  const valueGaps: ValueGap[] = React.useMemo(
    () => (sourceProfile && targetProfile ? compareProfiles(sourceProfile, targetProfile) : []),
    [sourceProfile, targetProfile]
  );

  // --- Cultural layer (LLM-extracted, on demand) -------------------------
  const [culturalGraph, setCulturalGraph] = React.useState<KGGraph | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  // Drop derived state if the underlying project changes.
  React.useEffect(() => {
    setCulturalGraph(null);
    setWarnings([]);
    setError(null);
    setDiff(null);
    setOtherName(null);
    setAdaptResult(null);
    setCreated(null);
    setAdaptError(null);
  }, [systemicGraph]);

  const graph: KGGraph = React.useMemo(
    () => (culturalGraph ? mergeCulturalLayer(systemicGraph, culturalGraph) : systemicGraph),
    [systemicGraph, culturalGraph]
  );

  const runExtraction = async () => {
    if (!sourceProfile) return;
    setExtracting(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await runCulturalExtraction(beats as any, sourceProfile, generate, { projectName });
      setCulturalGraph(result.graph);
      setWarnings(result.warnings);
      if (result.graph.nodes.length === 0) {
        setError('No cultural nodes were extracted. Check the AI provider / try again.');
      }
    } catch (e) {
      setError((e as Error).message || 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  // --- Adaptation (source → target hints + derived project) --------------
  const [adaptResult, setAdaptResult] = React.useState<AdaptationResult | null>(null);
  const [adapting, setAdapting] = React.useState(false);
  const [adaptError, setAdaptError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = React.useState(false);

  const runAdaptationHints = async () => {
    if (!culturalGraph || !sourceProfile || !targetProfile) return;
    setAdapting(true);
    setAdaptError(null);
    setCreated(null);
    try {
      const result = await runAdaptation(beats as any, culturalGraph, sourceProfile, targetProfile, generate, {
        projectName,
      });
      setAdaptResult(result);
      if (result.hints.length === 0) setAdaptError('No adaptation hints were produced — try again.');
    } catch (e) {
      setAdaptError((e as Error).message || 'Adaptation failed.');
    } finally {
      setAdapting(false);
    }
  };

  const createAdapted = async () => {
    if (!projectId || !adaptResult || !sourceProfile || !targetProfile) return;
    setCreating(true);
    setAdaptError(null);
    try {
      const res = await createAdaptedProject({
        sourceProjectId: projectId,
        source: sourceProfile,
        target: targetProfile,
        hints: adaptResult.hints,
      });
      setCreated(res);
    } catch (e) {
      setAdaptError((e as Error).message || 'Could not create the adapted project.');
    } finally {
      setCreating(false);
    }
  };

  // --- Comparison against another project ---------------------------------
  const [projects, setProjects] = React.useState<ComparableProject[]>([]);
  const [compareId, setCompareId] = React.useState('');
  const [comparing, setComparing] = React.useState(false);
  const [diff, setDiff] = React.useState<CulturalDiff | null>(null);
  const [otherName, setOtherName] = React.useState<string | null>(null);
  const [compareError, setCompareError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listComparableProjects(projectId)
      .then((list) => {
        setProjects(list);
        setCompareId((cur) => cur || list[0]?.id || '');
      })
      .catch(() => setProjects([]));
  }, [projectId]);

  const runComparison = async () => {
    if (!culturalGraph || !compareId || !targetProfile) return;
    setComparing(true);
    setCompareError(null);
    setDiff(null);
    try {
      const { name, beats: otherBeats } = await loadProjectBeats(compareId);
      const other = await runCulturalExtraction(otherBeats as any, targetProfile, generate, {
        projectName: name,
      });
      setOtherName(name);
      // Semantic alignment (LLM) so paraphrased concepts count as shared; falls
      // back to exact-label matching internally if alignment yields nothing.
      setDiff(await compareCulturalGraphsSemantic(culturalGraph, other.graph, generate));
    } catch (e) {
      setCompareError((e as Error).message || 'Comparison failed.');
    } finally {
      setComparing(false);
    }
  };

  // --- Filters / search --------------------------------------------------
  const typeLayer = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) if (!m.has(n.type)) m.set(n.type, n.layer);
    return m;
  }, [graph]);

  const presentTypes = React.useMemo(() => {
    const set = new Set(graph.nodes.map((n) => n.type));
    const ordered = TYPE_ORDER.filter((t) => set.has(t));
    const extras = [...set].filter((t) => !TYPE_ORDER.includes(t as any)).sort();
    return [...ordered, ...extras];
  }, [graph]);

  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');

  const visibleTypes = React.useMemo(
    () => new Set(presentTypes.filter((t) => !hiddenTypes.has(t))),
    [presentTypes, hiddenTypes]
  );

  const matchIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [graph, query]);

  const { nodes, edges } = React.useMemo(
    () => layoutKG(graph, { visibleTypes, matchIds }),
    [graph, visibleTypes, matchIds]
  );

  const toggleType = (t: string) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of graph.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
    return counts;
  }, [graph]);

  const contentionCount = React.useMemo(
    () => graph.nodes.filter((n) => n.contention?.contentious).length,
    [graph]
  );

  const aiBusy = extracting || comparing || inferring || adapting || creating;

  return (
    <div className="h-full w-full flex">
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white p-4 overflow-y-auto text-sm">
        <h3 className="font-semibold text-gray-700 mb-1">Knowledge Graph</h3>
        <p className="text-xs text-gray-500 mb-3">
          {culturalGraph ? 'Systemic + cultural layers' : 'Systemic / protostory layer'} —{' '}
          {graph.meta.counts.nodes} nodes, {graph.meta.counts.edges} edges.
        </p>

        {/* Cultural extraction (source culture) — pink-500 matches the cultural nodes */}
        <div className="mb-3 p-3 rounded border border-pink-200 bg-pink-50">
          <div className="text-xs font-semibold text-pink-700 mb-2">Cultural layer</div>
          <label className="block text-xs text-gray-600 mb-1">Source culture (this project)</label>
          {sourceSpec ? (
            <div className="mb-2 px-2 py-1.5 bg-white border rounded text-sm">
              {sourceSpec.label}
              {sourceSpec.region ? <span className="text-gray-500"> · {sourceSpec.region}</span> : null}
            </div>
          ) : (
            <p className="text-xs text-amber-700 mb-2">
              No culture set for this project. Set it in Settings → Translation → Cultural setting.
            </p>
          )}
          {specNeedsInfer(sourceSpec) && (
            <div className="mb-2">
              <button
                onClick={() => inferSpec(sourceSpec)}
                disabled={aiBusy || !isConfigured}
                className={`w-full px-2 py-1.5 rounded font-medium ${
                  aiBusy || !isConfigured
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {inferring ? 'Inferring profile…' : `Infer profile for ${sourceSpec?.label}`}
              </button>
              <p className="text-xs text-gray-500 mt-1">
                Custom culture — infer its value-dimension profile (LLM) before extracting.
              </p>
            </div>
          )}
          <button
            onClick={runExtraction}
            disabled={aiBusy || !isConfigured || !sourceProfile}
            className={`w-full px-2 py-1.5 rounded font-medium ${
              aiBusy || !isConfigured || !sourceProfile
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-pink-600 text-white hover:bg-pink-700'
            }`}
          >
            {extracting ? 'Extracting…' : culturalGraph ? 'Re-extract cultural layer' : 'Generate cultural layer'}
          </button>
          {!isConfigured && (
            <p className="text-xs text-amber-700 mt-1">Configure an AI provider (AI menu) to extract.</p>
          )}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          {culturalGraph && (
            <p className="text-xs text-gray-600 mt-2">
              {contentionCount > 0 && (
                <span className="text-red-600 font-medium">{contentionCount} contentious</span>
              )}
              {contentionCount > 0 ? ' · ' : ''}
              {warnings.length > 0 ? `${warnings.length} warning(s)` : 'no warnings'}
            </p>
          )}
        </div>

        {/* Adaptation target + value gap */}
        <div className="mb-3 p-3 rounded border border-indigo-200 bg-indigo-50">
          <div className="text-xs font-semibold text-indigo-700 mb-2">Adaptation target</div>
          <select
            value={targetChoice}
            onChange={(e) => setTargetChoice(e.target.value)}
            className="w-full px-2 py-1.5 border rounded mb-2"
            disabled={aiBusy}
          >
            {REFERENCE_CULTURE_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM_TARGET}>Custom target…</option>
          </select>
          {targetChoice === CUSTOM_TARGET && (
            <div className="space-y-2 mb-2">
              <input
                placeholder="Target culture / country (e.g. Tamil Nadu, Japan)"
                value={customTarget.label}
                onChange={(e) => setCustomTarget((c) => ({ ...c, label: e.target.value }))}
                className="w-full px-2 py-1.5 border rounded text-xs"
              />
              <input
                placeholder="Region or ethnicity (optional, e.g. Tamil)"
                value={customTarget.region}
                onChange={(e) => setCustomTarget((c) => ({ ...c, region: e.target.value }))}
                className="w-full px-2 py-1.5 border rounded text-xs"
              />
              {specNeedsInfer(targetSpec) && (
                <button
                  onClick={() => inferSpec(targetSpec)}
                  disabled={aiBusy || !isConfigured || !targetSpec}
                  className={`w-full px-2 py-1.5 rounded text-xs font-medium ${
                    aiBusy || !isConfigured || !targetSpec
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {inferring ? 'Inferring…' : `Infer profile for ${targetSpec?.label ?? 'target'}`}
                </button>
              )}
            </div>
          )}
          {!sourceProfile ? (
            <p className="text-xs text-gray-500">Set/infer the source culture to see the value gap.</p>
          ) : !targetProfile ? (
            <p className="text-xs text-gray-500">
              {targetChoice === CUSTOM_TARGET ? 'Enter and infer a target culture.' : 'Inferring target…'}
            </p>
          ) : sourceSpec?.id === targetSpec?.id ? (
            <p className="text-xs text-gray-500">Pick a different target to see the value gap.</p>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-gray-500 mb-1">Value gaps (largest first):</div>
              {valueGaps.slice(0, 5).map((g) => (
                <div key={g.dimension} className="text-xs text-gray-700">
                  <span className="font-medium">{g.dimension}</span>
                  {g.delta !== undefined && (
                    <span className="text-indigo-600"> Δ{g.delta.toFixed(2)}</span>
                  )}
                  <div className="text-gray-500 truncate" title={`${g.sourceLabel} → ${g.targetLabel}`}>
                    {g.sourceLabel} → {g.targetLabel}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Adaptation hints (source → target) */}
          {sourceSpec?.id !== targetSpec?.id && culturalGraph && (
            <div className="mt-3 pt-3 border-t border-indigo-200">
              <button
                onClick={runAdaptationHints}
                disabled={aiBusy || !isConfigured}
                className={`w-full px-2 py-1.5 rounded font-medium ${
                  aiBusy || !isConfigured
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {adapting ? 'Analysing…' : `Adaptation hints → ${targetProfile?.label ?? 'target'}`}
              </button>
              {adaptError && <p className="text-xs text-red-600 mt-1">{adaptError}</p>}
              {adaptResult && adaptResult.hints.length > 0 && (
                <div className="mt-2 text-xs">
                  {adaptResult.summary && (
                    <p className="text-gray-600 mb-2 italic">{adaptResult.summary}</p>
                  )}
                  <div className="font-medium text-gray-700 mb-1">{adaptResult.hints.length} hint(s)</div>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {adaptResult.hints.slice(0, 20).map((h, i) => (
                      <li key={i} className="text-gray-700">
                        <span
                          className={
                            h.severity === 'high'
                              ? 'text-red-600 font-medium'
                              : h.severity === 'medium'
                                ? 'text-amber-600'
                                : 'text-gray-400'
                          }
                        >
                          [{h.severity}]
                        </span>{' '}
                        <span className="font-medium">{h.concern}</span> — {h.suggestion}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={createAdapted}
                    disabled={aiBusy || !projectId}
                    className={`w-full mt-2 px-2 py-1.5 rounded font-medium ${
                      aiBusy || !projectId
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-700 text-white hover:bg-indigo-800'
                    }`}
                    title={!projectId ? 'Save the project first' : undefined}
                  >
                    {creating ? 'Creating…' : 'Create adapted project'}
                  </button>
                  {created && (
                    <p className="text-xs text-green-700 mt-1">
                      Created “{created.name}” — open it from Projects. Hints are saved in each
                      affected beat's notes.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Compare against another project */}
        <div className="mb-3 p-3 rounded border border-emerald-200 bg-emerald-50">
          <div className="text-xs font-semibold text-emerald-700 mb-2">Compare with project</div>
          {projects.length === 0 ? (
            <p className="text-xs text-gray-500">No other projects in the library.</p>
          ) : (
            <>
              <select
                value={compareId}
                onChange={(e) => setCompareId(e.target.value)}
                className="w-full px-2 py-1.5 border rounded mb-2"
                disabled={aiBusy}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={runComparison}
                disabled={aiBusy || !isConfigured || !culturalGraph}
                className={`w-full px-2 py-1.5 rounded font-medium ${
                  aiBusy || !isConfigured || !culturalGraph
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
                title={!culturalGraph ? 'Generate this project’s cultural layer first' : undefined}
              >
                {comparing ? 'Comparing…' : 'Compare cultural layers'}
              </button>
              {!culturalGraph && (
                <p className="text-xs text-gray-500 mt-1">Generate the cultural layer above first.</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Extracts the other project with the <em>target</em> profile, then diffs.
              </p>
              {compareError && <p className="text-xs text-red-600 mt-1">{compareError}</p>}
            </>
          )}

          {diff && (
            <div className="mt-3 text-xs">
              <div className="font-medium text-gray-700 mb-1">
                {diff.counts.common} shared · {diff.counts.onlyA} only here · {diff.counts.onlyB} only in{' '}
                {otherName}
              </div>
              <DiffList title="Only in this project" nodes={diff.onlyA} color="text-pink-700" />
              <DiffList title={`Only in ${otherName}`} nodes={diff.onlyB} color="text-emerald-700" />
            </div>
          )}
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">Search nodes</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by label…"
          className="w-full px-2 py-1.5 border rounded mb-1"
        />
        {matchIds && <p className="text-xs text-gray-500 mb-3">{matchIds.size} match(es) highlighted</p>}

        <div className="mt-3">
          <div className="text-xs font-medium text-gray-600 mb-2">Node types</div>
          <div className="space-y-1.5">
            {presentTypes.map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!hiddenTypes.has(t)}
                  onChange={() => toggleType(t)}
                  className="rounded"
                />
                <span
                  className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: legendColor(t, typeLayer.get(t)) }}
                />
                <span className="flex-1 truncate" title={t}>
                  {t}
                </span>
                <span className="text-xs text-gray-400">{typeCounts[t] ?? 0}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 h-full">
        {graph.nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            No beats yet — add some to see the knowledge graph.
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable minZoom={0.1} proOptions={{ hideAttribution: true }}>
            <Background />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const d = n.data as { kgType?: string; kgLayer?: string };
                return legendColor(d?.kgType ?? '', d?.kgLayer);
              }}
              pannable
              zoomable
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};

const DiffList: React.FC<{ title: string; nodes: { label: string; contention?: { contentious?: boolean } }[]; color: string }> = ({
  title,
  nodes,
  color,
}) => {
  if (nodes.length === 0) return null;
  const shown = nodes.slice(0, 10);
  return (
    <div className="mt-1">
      <div className={`font-medium ${color}`}>{title}</div>
      <ul className="text-gray-600">
        {shown.map((n, i) => (
          <li key={i} className="truncate" title={n.label}>
            {n.contention?.contentious ? '⚠ ' : '• '}
            {n.label}
          </li>
        ))}
        {nodes.length > shown.length && <li className="text-gray-400">+{nodes.length - shown.length} more</li>}
      </ul>
    </div>
  );
};

export default KnowledgeGraphView;
