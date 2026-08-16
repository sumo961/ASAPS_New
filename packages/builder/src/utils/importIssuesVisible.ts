/**
 * Should the import-issues banner still be shown?
 *
 * The naive lifecycle — clear on project switch — fails in both directions.
 * Importing a story CREATES a project, so clearing on project-id change erases
 * the banner in the same breath that raised it; and never clearing leaves a
 * "3 choices lead nowhere" banner hanging over a healthy project the author
 * opened afterwards.
 *
 * So the banner is not cleared, it is scoped: the issues remember which beats
 * they were raised about, and the banner shows only while most of those beats
 * are in the workspace. Switch away and it vanishes; switch back (undismissed)
 * and the still-broken story shows its banner again.
 *
 * "Most", not "any": beat ids are conventional (`beat_title` is in half of all
 * stories), so a single shared id must not carry a stale banner into an
 * unrelated project — that happened live, a night-train banner hanging over a
 * freshly instantiated GPS template because both start at `beat_title`. And
 * not "all": an author deleting one imported beat mid-triage should not lose
 * the banner for the rest.
 */
export function importIssuesVisible(
  issueBeatIds: string[] | undefined,
  workspaceBeats: ReadonlyArray<{ id: string }>,
): boolean {
  if (!issueBeatIds || issueBeatIds.length === 0) return false;
  const present = new Set(workspaceBeats.map((b) => b.id));
  const overlap = issueBeatIds.filter((id) => present.has(id)).length;
  return overlap * 2 > issueBeatIds.length;
}
