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

/**
 * The links that lead to a beat, by the beat they start from (class
 * feedback: edit a beat's incoming links from that beat). Same rules as the
 * flowchart: a default target only when it can fire, one entry per source
 * and label, not the beat's links to itself.
 */
export function incomingLinks(beats: ReadonlyArray<any>, targetId: string): Array<{ source: string; label?: string }> {
  const seen = new Set<string>();
  const out: Array<{ source: string; label?: string }> = [];
  for (const b of beats) {
    const beat = typeof b?.toJSON === 'function' ? b.toJSON() : b;
    if (!beat || beat.id === targetId) continue;
    for (const l of walkBeatLinks(beat)) {
      if (l.target !== targetId) continue;
      if (l.via === 'default-target' && !defaultTargetIsLive(beat)) continue;
      const label = l.via === 'default-target' ? 'auto-advance' : l.label?.trim() || undefined;
      const key = `${l.source}\u0000${label ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source: l.source, label });
    }
  }
  return out;
}
