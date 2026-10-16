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

/**
 * MIME type by file extension. Browsers fill File.type from the operating
 * system, and Windows usually leaves it empty for fonts (and sometimes for
 * other types too), so the extension is the reliable signal.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The asset kind for an uploaded file, from its MIME type or else its extension. */
export function assetTypeForFile(file: { name: string; type: string }): 'image' | 'audio' | 'video' | 'font' | null {
  const ext = extensionOf(file.name);
  if (ACCEPT.font.split(',').includes(`.${ext}`)) return 'font';
  const mime = file.type && file.type !== 'application/octet-stream' ? file.type : MIME_BY_EXTENSION[ext] || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.includes('font') || mime.includes('ttf') || mime.includes('otf')) return 'font';
  return null;
}

/**
 * The same file with a MIME type taken from its extension when the browser
 * gave none, so storage and @font-face see what the file really is.
 */
export function withMimeFromName(file: File): File {
  if (file.type && file.type !== 'application/octet-stream') return file;
  const mime = MIME_BY_EXTENSION[extensionOf(file.name)];
  return mime ? new File([file], file.name, { type: mime, lastModified: file.lastModified }) : file;
}
