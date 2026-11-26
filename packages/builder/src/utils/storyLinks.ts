/**
 * The link walk lives in @asaps/core (utils/storyLinks) since 2026-09-26, so
 * the knowledge graph behind the story overview reads the same links as the
 * review, the layout and the validators. Re-exported here for the builder's
 * existing imports.
 */
export { storyLinks, beatLinks, dedupeLinks, beatTargetIds, type StoryLink } from '@asaps/core';
import { beatLinks as walkBeatLinks, dedupeLinks as dedupeWalkLinks, defaultTargetIsLive } from '@asaps/core';


/**
 * The links of a beat as the app holds it: the shared walk, read from the
 * live beat. A live beat keeps its parameters behind getParameters(), its
 * link list behind getConnections() (for beats that derive their links from
 * their parameters the stored array can be stale) and its stage elements in
 * a Map; handed to the walk as it is, the walk saw none of these and missed
 * every link that lives in a parameter (a freshly loaded Dialog Tree's
 * exits, hypertext links, an AI conversation's exits). A default target is
 * a link only when it can fire. Serialized beats pass through unchanged.
 *
 * The flowchart draws exactly these; the header counts the lines drawn
 * (flowchartLineCount in components/graph/graphBuild).
 */
export function liveBeatLinks(
  beat: any,
  known?: { parameters?: Record<string, any>; connections?: any[] },
): ReturnType<typeof walkBeatLinks> {
  if (!beat) return [];
  const parameters = known?.parameters
    ?? (typeof beat.getParameters === 'function' ? beat.getParameters() : beat.parameters);
  const connections = known?.connections
    ?? (typeof beat.getConnections === 'function' ? beat.getConnections() : beat.connections);
  const locations = beat.locations instanceof Map ? Array.from(beat.locations.values()) : beat.locations;
  return walkBeatLinks({
    id: beat.id,
    type: beat.type,
    connections,
    defaultTarget: beat.defaultTarget,
    defaultTargetDelay: beat.defaultTargetDelay,
    requires: beat.requires,
    locations,
    parameters,
  }).filter((l) => l.via !== 'default-target' || defaultTargetIsLive(beat));
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
