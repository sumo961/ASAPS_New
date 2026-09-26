/**
 * The link walk lives in @asaps/core (utils/storyLinks) since 2026-09-26, so
 * the knowledge graph behind the story overview reads the same links as the
 * review, the layout and the validators. Re-exported here for the builder's
 * existing imports.
 */
export { storyLinks, beatLinks, dedupeLinks, beatTargetIds, type StoryLink } from '@asaps/core';
import { beatLinks as walkBeatLinks, dedupeLinks as dedupeWalkLinks, defaultTargetIsLive } from '@asaps/core';


/**
 * How many links the flowchart shows: every exit the link walk finds (restart,
 * fallback and field links included), one per source→target pair, to beats
 * that exist — a default target only when it can actually fire, as drawn.
 * The header used to count a separately maintained list that missed the
 * restart link it had just drawn.
 */
export function flowchartLinkCount(beats: ReadonlyArray<any>): number {
  const ids = new Set(beats.map((b) => b?.id));
  const links = beats.flatMap((beat) =>
    walkBeatLinks(beat).filter((l) => l.via !== 'default-target' || defaultTargetIsLive(beat)),
  );
  return dedupeWalkLinks(links).filter((l) => ids.has(l.target)).length;
}
