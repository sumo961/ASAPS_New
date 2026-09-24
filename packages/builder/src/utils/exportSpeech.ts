/**
 * Whether an exported player reads text aloud — a PROJECT setting
 * (globalSettings.tts.exportSpeech, UX-Eval B3). Projects saved before it
 * existed have no value; for those the builder's old device toggle
 * (localStorage asaps_tts_enabled, default on) supplies the answer until the
 * author changes the checkbox in the export dialog, which writes it into the
 * project. So no existing author's next export silently changes.
 */
export function resolveExportSpeech(
  globalSettings: { tts?: { exportSpeech?: boolean } } | null | undefined,
  readDeviceToggle: () => string | null = () => {
    try { return localStorage.getItem('asaps_tts_enabled'); } catch { return null; }
  },
): boolean {
  const projectValue = globalSettings?.tts?.exportSpeech;
  if (typeof projectValue === 'boolean') return projectValue;
  return readDeviceToggle() !== 'false';
}
