/**
 * The link walk lives in @asaps/core (utils/storyLinks) since 2026-09-26, so
 * the knowledge graph behind the story overview reads the same links as the
 * review, the layout and the validators. Re-exported here for the builder's
 * existing imports.
 */
export { storyLinks, beatLinks, dedupeLinks, beatTargetIds, type StoryLink } from '@asaps/core';
