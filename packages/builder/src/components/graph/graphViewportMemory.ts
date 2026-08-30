/**
 * Per-project memory of the flowchart viewport (zoom + pan).
 *
 * UI state on purpose: kept in localStorage keyed by project id, never in
 * the project file — looking around must not dirty the VCS diff. Untitled
 * projects (no id) and first opens have no memory and fit to view instead.
 */
const VIEWPORT_KEY_PREFIX = 'asaps.graphViewport.';

export type SavedViewport = { x: number; y: number; zoom: number };

export function readSavedViewport(projectId?: string): SavedViewport | null {
  if (!projectId) return null;
  try {
    const raw = window.localStorage.getItem(VIEWPORT_KEY_PREFIX + projectId);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.zoom) && v.zoom > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveViewport(projectId: string | undefined, viewport: SavedViewport): void {
  if (!projectId) return;
  try {
    window.localStorage.setItem(VIEWPORT_KEY_PREFIX + projectId, JSON.stringify({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }));
  } catch {
    /* storage unavailable — viewport memory is a convenience */
  }
}
