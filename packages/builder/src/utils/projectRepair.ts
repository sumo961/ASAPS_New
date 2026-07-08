/**
 * Project corruption detection + repair.
 *
 * Some older / partially-written projects load with structural damage that used
 * to crash the app or render blank — most notably a `globalSettings` object
 * missing whole sub-sections (colors/fonts/…) and beat `locations` saved in the
 * builder's legacy `type` format instead of the renderer's canonical `kind`.
 *
 * Strategy (pragmatic, non-destructive to authored content):
 *   1. Detect the damage.
 *   2. Reset settings to full defaults (see normalizeGlobalSettings), keeping any
 *      valid values that were present.
 *   3. Salvage each beat: keep its content (params, connections, positions) and
 *      normalise its layout elements.
 *   4. Delete the parts that can't be salvaged (malformed / kind-less elements)
 *      so they regenerate cleanly instead of rendering as nothing.
 */

/** Canonical renderer location kinds (mirrors core Location['kind']). */
const VALID_LOCATION_KINDS = new Set([
  'text', 'hotspot', 'prop', 'character', 'button',
  'dialog', 'input', 'meter', 'keypad', 'webview', 'camera',
]);

export interface LocationSalvageResult {
  locations: any[];
  /** legacy `type`-only elements upgraded to `kind` */
  normalized: number;
  /** unrecoverable elements dropped */
  deleted: number;
}

/**
 * Normalise a beat's location array: upgrade legacy `type` → canonical `kind`,
 * and drop any element that has no recoverable kind (corrupted). Authored
 * geometry (x/y/size/text/etc.) is preserved for everything that survives.
 */
export function salvageBeatLocations(locations: unknown): LocationSalvageResult {
  if (!Array.isArray(locations)) return { locations: [], normalized: 0, deleted: 0 };

  let normalized = 0;
  let deleted = 0;
  const out: any[] = [];

  for (const loc of locations) {
    if (!loc || typeof loc !== 'object') { deleted++; continue; }
    const anyLoc = loc as any;

    if (typeof anyLoc.kind === 'string' && VALID_LOCATION_KINDS.has(anyLoc.kind)) {
      out.push(anyLoc); // already canonical
      continue;
    }
    // Salvage from the builder's VisualElement `type` field.
    if (typeof anyLoc.type === 'string' && VALID_LOCATION_KINDS.has(anyLoc.type)) {
      out.push({ ...anyLoc, kind: anyLoc.type });
      normalized++;
      continue;
    }
    // Neither a valid kind nor a mappable type → corrupted, delete it.
    deleted++;
  }

  return { locations: out, normalized, deleted };
}

/** Extract a plain beats array from the many shapes `project.story` can take. */
function extractBeats(project: any): any[] {
  const story = project?.story;
  if (!story) return Array.isArray(project?.beats) ? project.beats : [];
  if (typeof story.getAllBeats === 'function') return story.getAllBeats();
  if (story.beats instanceof Map) return Array.from(story.beats.values());
  if (Array.isArray(story.beats)) return story.beats;
  if (Array.isArray(story)) return story;
  return [];
}

export interface CorruptionReport {
  corrupted: boolean;
  /** human-readable summary lines describing what was (or would be) repaired */
  issues: string[];
}

const REQUIRED_SETTINGS_SECTIONS = ['colors', 'fonts', 'textbox', 'textEffects', 'hotspots'] as const;

/**
 * Inspect a project for the known corruption patterns. Pure/read-only — returns
 * a report the caller can surface to the user. The actual repair happens via
 * normalizeGlobalSettings (settings) + salvageBeatLocations (beats) on load.
 */
export function detectProjectCorruption(project: any): CorruptionReport {
  const issues: string[] = [];

  const gs = project?.globalSettings;
  const missing = !gs
    ? REQUIRED_SETTINGS_SECTIONS.slice()
    : REQUIRED_SETTINGS_SECTIONS.filter((k) => !gs[k]);
  if (missing.length > 0) {
    issues.push(`Display settings were incomplete (missing: ${missing.join(', ')}) — reset to defaults.`);
  }

  let legacyLocs = 0;
  let brokenLocs = 0;
  for (const beat of extractBeats(project)) {
    const locs = (beat as any)?.locations;
    if (!Array.isArray(locs)) continue;
    for (const loc of locs) {
      if (!loc || typeof loc !== 'object') { brokenLocs++; continue; }
      const anyLoc = loc as any;
      if (typeof anyLoc.kind === 'string' && VALID_LOCATION_KINDS.has(anyLoc.kind)) continue;
      if (typeof anyLoc.type === 'string' && VALID_LOCATION_KINDS.has(anyLoc.type)) legacyLocs++;
      else brokenLocs++;
    }
  }
  if (legacyLocs > 0) {
    issues.push(`${legacyLocs} layout element(s) used a legacy format — upgraded.`);
  }
  if (brokenLocs > 0) {
    issues.push(`${brokenLocs} corrupted layout element(s) — removed (they will regenerate).`);
  }

  return { corrupted: issues.length > 0, issues };
}

/** Projects already announced this session, so a reload doesn't re-alert. */
const _notifiedProjects = new Set<string>();

/**
 * Detect corruption and, the first time a given project is seen this session,
 * tell the user it was auto-repaired (and to save to persist). Returns the
 * report so callers can also branch on it. Safe to call on every load.
 */
export function notifyIfCorrupted(project: any): CorruptionReport {
  const report = detectProjectCorruption(project);
  const id = String(project?.id ?? '');
  if (report.corrupted && !_notifiedProjects.has(id)) {
    _notifiedProjects.add(id);
    console.warn('[projectRepair] Auto-repaired corrupted project:', report.issues);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      try {
        window.alert(
          'This project had some corrupted data and was automatically repaired:\n\n• ' +
          report.issues.join('\n• ') +
          '\n\nSave the project to keep the repairs.'
        );
      } catch { /* headless / non-interactive — the console warning is enough */ }
    }
  }
  return report;
}
