/**
 * Which web output to suggest (UX-Eval B6 reframed): not a fixed default.
 *
 *  - One file is the easiest to send, but it carries every picture and
 *    sound inside it; phones in the iPhone-SE class run out of memory near
 *    25 MB (measured 2026-05, see HtmlExportDialog size gate), and 10 MB is
 *    where the dialog already starts warning.
 *  - A folder streams the story, so it is the safe choice for media-heavy
 *    stories, and it is what hosting needs anyway (the AI relay lives next
 *    to it).
 */

export type WebExportMode = 'folder' | 'single-file';

export const SINGLE_FILE_SUGGESTION_LIMIT_BYTES = 10 * 1024 * 1024;

export function recommendWebExportMode(mediaBytes: number | undefined): { mode: WebExportMode; reason: string } {
  if (mediaBytes === undefined || !Number.isFinite(mediaBytes)) {
    return { mode: 'folder', reason: 'A folder works for stories of any size.' };
  }
  const mb = mediaBytes / (1024 * 1024);
  if (mediaBytes < SINGLE_FILE_SUGGESTION_LIMIT_BYTES) {
    return {
      mode: 'single-file',
      reason: `This story's media add up to ${mb < 1 ? 'under 1' : mb.toFixed(0)} MB — small enough for one file, the easiest to send.`,
    };
  }
  return {
    mode: 'folder',
    reason: `This story's media add up to ${mb.toFixed(0)} MB — a folder loads them as needed, which phones handle far better than one big file.`,
  };
}
