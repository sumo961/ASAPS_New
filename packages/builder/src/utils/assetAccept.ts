/**
 * One accept-rule per asset kind (UX-Eval B7) — the file picker in the Asset
 * Manager and the one in the shared asset picker used to spell these out
 * separately, and drifted (a PNG background imported through one door and
 * was greyed out in the other).
 */
export const ACCEPT = {
  image: '.jpg,.jpeg,.png,.gif,.svg,.webp',
  /** Any image works as a background. */
  background: 'image/*',
  /** Characters and props need transparency. */
  sprite: '.png',
  audio: '.mp3,.ogg,.wav,.m4a',
  video: '.mp4,.webm,.mov',
  font: '.ttf,.otf,.woff,.woff2',
} as const;

export const ACCEPT_ANY = [ACCEPT.image, ACCEPT.audio, ACCEPT.video, ACCEPT.font].join(',');

/** The accept string for a picker opened for a given primary type / role. */
export function acceptFor(assetType?: string, assetSubType?: string): string {
  if (assetSubType === 'background') return ACCEPT.background;
  if (assetSubType === 'character' || assetSubType === 'prop') return ACCEPT.sprite;
  if (assetSubType === 'sfx' || assetSubType === 'sound') return 'audio/*';
  if (assetType === 'video') return 'video/*';
  if (assetType === 'audio') return 'audio/*';
  if (assetType === 'font') return ACCEPT.font;
  return 'image/*';
}
