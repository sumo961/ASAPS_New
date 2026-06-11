/**
 * At-a-glance metadata for a project, surfaced as badges on the
 * Project Browser cards: `beat count · layout mode · character count`.
 *
 * Read directly off project.story rather than fetching the full
 * project — storage.listProjects already returns full Project rows
 * with story attached, so this is a cheap derivation. Reads are
 * defensive because older / imported projects don't always carry
 * every field (legacy ASML imports skip layoutMode entirely).
 */
import type { Project } from '../storage/types';

export interface ProjectMeta {
  beatCount: number;
  layoutLabel: string | null;
  characterCount: number;
}

export function getProjectMeta(project: Project): ProjectMeta {
  const story = (project as any).story;
  const beats = Array.isArray(story?.beats) ? story.beats : [];
  const layoutMode = story?.layoutMode || story?.globalSettings?.layoutMode;
  const characters = Array.isArray(story?.characters) ? story.characters : [];
  const layoutLabel = layoutMode === 'responsive'
    ? 'Responsive'
    : layoutMode === 'fixed'
    ? 'Fixed'
    : null;
  return {
    beatCount: beats.length,
    layoutLabel,
    characterCount: characters.length,
  };
}
