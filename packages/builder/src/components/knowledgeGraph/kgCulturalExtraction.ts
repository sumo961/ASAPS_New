import {
  CulturalBeatText,
  CultureProfile,
  CulturalExtractionResult,
  extractCulturalLayer,
  GenerateFn,
  KGGraph,
  AdaptationResult,
  AdaptationHint,
  generateAdaptationHints,
  hintsToBeatNotes,
  REFERENCE_CULTURE_PROFILES,
} from '@asaps/core';
import { v4 as uuidv4 } from 'uuid';
import { getStorageManager } from '../../storage';

interface RuntimeBeatLike {
  id: string;
  type?: string;
  /** Present on runtime Beat instances (builder state). */
  getParameters?: () => Record<string, unknown>;
  /** Present on serialized beats (a project loaded from storage). */
  parameters?: Record<string, unknown>;
}

/**
 * Collect the SOURCE (English) narrative text per beat for cultural extraction.
 * Serializes runtime beats through getParameters() (dialogTree text + choices,
 * common text fields, movement-choice labels) into one string per beat.
 */
export function collectBeatTexts(beats: RuntimeBeatLike[]): CulturalBeatText[] {
  const out: CulturalBeatText[] = [];
  for (const b of beats) {
    const params = b.getParameters ? b.getParameters() : b.parameters ?? {};
    const parts: string[] = [];
    const push = (v: unknown) => {
      if (typeof v === 'string' && v.trim()) parts.push(v.trim());
    };

    for (const f of ['text', 'title', 'prompt', 'question', 'message', 'buttonText']) {
      push((params as Record<string, unknown>)[f]);
    }

    const dt = params.dialogTree as
      | { text?: string; choices?: Array<{ text?: string; dialogNode?: unknown }> }
      | undefined;
    const walk = (node: { text?: string; choices?: Array<{ text?: string; dialogNode?: unknown }> } | undefined) => {
      if (!node) return;
      push(node.text);
      for (const c of node.choices ?? []) {
        push(c.text);
        if (c.dialogNode) walk(c.dialogNode as typeof node);
      }
    };
    if (dt) walk(dt);

    for (const c of (params.choices as Array<{ displayText?: string }>) ?? []) {
      push(c.displayText);
    }

    if (parts.length) out.push({ id: b.id, text: parts.join(' — ') });
  }
  return out;
}

/**
 * Run cultural extraction over the live project's beats using an injected
 * `generate` (built from the configured AI service in the view).
 */
export function runCulturalExtraction(
  beats: RuntimeBeatLike[],
  profile: CultureProfile,
  generate: GenerateFn,
  opts: { projectId?: string; projectName?: string } = {}
): Promise<CulturalExtractionResult> {
  return extractCulturalLayer(
    { beats: collectBeatTexts(beats), profile, ...opts },
    generate
  );
}

export interface ComparableProject {
  id: string;
  name: string;
}

/** List projects in the library (for the "compare against" picker). */
export async function listComparableProjects(excludeId?: string): Promise<ComparableProject[]> {
  const res = await getStorageManager().listProjects();
  const projects = (res.success && res.data ? res.data : []) as Array<{ id: string; name?: string }>;
  return projects
    .filter((p) => p.id !== excludeId)
    .map((p) => ({ id: p.id, name: p.name || p.id }));
}

/** Generate per-beat cultural adaptation hints (source → target). */
export function runAdaptation(
  beats: RuntimeBeatLike[],
  cultural: KGGraph,
  source: CultureProfile,
  target: CultureProfile,
  generate: GenerateFn,
  opts: { projectName?: string } = {}
): Promise<AdaptationResult> {
  return generateAdaptationHints(
    { beats: collectBeatTexts(beats), cultural, source, target, projectName: opts.projectName },
    generate
  );
}

/**
 * Create a NEW project derived from the current one, with adaptation hints baked
 * into each beat's notes, the target culture set, and a derivedFrom lineage link.
 * Does not mutate or switch the active project.
 */
export async function createAdaptedProject(opts: {
  sourceProjectId: string;
  source: CultureProfile;
  target: CultureProfile;
  hints: AdaptationHint[];
}): Promise<{ id: string; name: string }> {
  const storage = getStorageManager();
  const res = await storage.getProject(opts.sourceProjectId);
  if (!res.success || !res.data) throw new Error('Could not load the current project to adapt.');
  const src = res.data as unknown as {
    name?: string;
    story?: { beats?: Array<{ id: string; notes?: string }> };
    globalSettings?: Record<string, unknown>;
  };

  const notes = hintsToBeatNotes(opts.hints, opts.target.label);
  const story = JSON.parse(JSON.stringify(src.story ?? {})) as { beats?: Array<{ id: string; notes?: string }> };
  for (const beat of story.beats ?? []) {
    const note = notes.get(beat.id);
    if (note) beat.notes = beat.notes ? `${beat.notes}\n\n${note}` : note;
  }

  const globalSettings = JSON.parse(JSON.stringify(src.globalSettings ?? {})) as Record<string, unknown>;
  globalSettings.culture = {
    label: opts.target.label,
    region: opts.target.region,
    profileId: REFERENCE_CULTURE_PROFILES.some((p) => p.id === opts.target.id) ? opts.target.id : undefined,
    derivedFrom: {
      projectId: opts.sourceProjectId,
      sourceCulture: opts.source.label,
      targetCulture: opts.target.label,
    },
  };

  const newId = uuidv4();
  const adapted = {
    ...(res.data as unknown as Record<string, unknown>),
    id: newId,
    name: `${src.name ?? 'Project'} → ${opts.target.label}`,
    story,
    globalSettings,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  const save = await storage.createProject(adapted as never);
  if (!save.success) throw new Error('Could not save the adapted project.');
  return { id: newId, name: adapted.name as string };
}

/** Load another project's serialized beats from storage (does NOT switch the active project). */
export async function loadProjectBeats(
  projectId: string
): Promise<{ name: string; beats: RuntimeBeatLike[] }> {
  const res = await getStorageManager().getProject(projectId);
  if (!res.success || !res.data) throw new Error('Could not load the selected project.');
  // Stored story is serialized plain data (the Story class type has a private
  // `beats`); read it structurally.
  const project = res.data as unknown as { name?: string; story?: { beats?: RuntimeBeatLike[] } };
  return { name: project.name || projectId, beats: project.story?.beats ?? [] };
}
