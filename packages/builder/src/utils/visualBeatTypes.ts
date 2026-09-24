/**
 * Which beats have a stage — one list for the Visual Editor tab and the
 * Inspector's Background Image field (UX-Eval B7). Was a private array
 * inside WorkspaceView.
 */
const VISUAL_BEAT_TYPES = new Set([
  'titleScreen', 'infoText', 'durScreen', 'pickProp', 'movementChoice', 'multiChoice',
  'dialogTree', 'endScreen', 'videoBeat', 'inputText', 'hyperText', 'onlineContent',
  'aiDialogTree', 'aiSummary', 'aiInfoText', 'aiDurScreen', 'aiConversation', 'keypad',
  'panorama', 'gpsLocation', 'indoorLocation',
  // Camera/embed slot-mode beats — the VE renders editor placeholders for
  // their webview/camera/AR slots.
  'webView', 'qrScan', 'arBeat',
]);

/**
 * Visual beats whose stage is filled by something else — a panorama, a
 * map, a video, a web page, the camera — so a background image would never
 * be seen.
 */
const OWN_FULL_SCREEN_CONTENT = new Set([
  'panorama', 'gpsLocation', 'indoorLocation', 'videoBeat', 'webView', 'qrScan', 'arBeat',
]);

export function supportsVisualEditor(beatType: string | undefined | null): boolean {
  return !!beatType && VISUAL_BEAT_TYPES.has(beatType);
}

export function supportsBackgroundImage(beatType: string | undefined | null): boolean {
  return supportsVisualEditor(beatType) && !OWN_FULL_SCREEN_CONTENT.has(beatType as string);
}
