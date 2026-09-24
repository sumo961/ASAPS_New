/**
 * Publish targets — the "Publish for players" half of the Export menu
 * (UX-Eval B6 reframed, 2026-09-24). A player is the same artifact whether
 * the story is a playtest draft or finished work, so publishing is one
 * group, organised as a LIST of targets: new targets (the planned app
 * project — Field App plan, "Per-story branded apps": a ready-to-build
 * native project with the story baked in, submitted by the institution
 * under its own Apple / Play account) plug in here instead of becoming
 * another top-level menu item.
 */

export type PublishTargetId = 'web' | 'app';

export interface PublishTarget {
  id: PublishTargetId;
  /** Menu label, action-first. */
  label: string;
  /** One line in the recipient's terms. */
  description: string;
  /** Unavailable targets are defined (for planning and tests) but not shown. */
  available: boolean;
}

export const PUBLISH_TARGETS: readonly PublishTarget[] = [
  {
    id: 'web',
    label: 'Web page (HTML)…',
    description: 'Plays in any browser — send it, put it on a website, or embed it',
    available: true,
  },
  {
    id: 'app',
    label: 'App project…',
    description: 'A ready-to-build desktop or phone app with this story inside, for your own store account',
    available: false,
  },
];

export function availablePublishTargets(): PublishTarget[] {
  return PUBLISH_TARGETS.filter((t) => t.available);
}
