/**
 * Where an author left a project: which editor, which beat. UI state in
 * localStorage, per project and never in the project file, so looking around
 * does not dirty the VCS diff (same as the flowchart's viewport memory).
 */
export type WorkspaceViewName = 'flowchart' | 'visual' | 'script' | 'knowledgeGraph';

export interface ProjectUiState {
  view?: WorkspaceViewName;
  beatId?: string | null;
}

const KEY_PREFIX = 'asaps_ui_project_';

export function readProjectUiState(projectId: string | null | undefined): ProjectUiState {
  if (!projectId) return {};
  try {
    const raw = localStorage.getItem(KEY_PREFIX + projectId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeProjectUiState(projectId: string | null | undefined, patch: ProjectUiState): void {
  if (!projectId) return;
  try {
    localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify({ ...readProjectUiState(projectId), ...patch }));
  } catch {
    /* private mode etc.: the session still works, it just won't be remembered */
  }
}
