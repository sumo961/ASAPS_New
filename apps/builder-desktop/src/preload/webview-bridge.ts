/**
 * Guest-side bridge for the WebView beat's Electron `<webview>` path.
 *
 * In a browser iframe, embedded pages exit the beat via
 * `parent.postMessage({asaps:'result', value})` — the host window catches the
 * message event. In an Electron `<webview>` the guest is its own top-level
 * document, so `window.parent === window` and that postMessage never leaves
 * the guest (found during the Web View verification round: station B's button
 * did nothing on desktop). This preload runs inside the guest and relays the
 * SAME protocol to the host via the documented webview channel
 * (`ipcRenderer.sendToHost` → host's 'ipc-message' event) — so story pages
 * keep one protocol that works in both browser iframes and the desktop app.
 */
import { ipcRenderer } from 'electron';

window.addEventListener('message', (e: MessageEvent) => {
  const d = e?.data;
  if (d && typeof d === 'object' && (d as any).asaps === 'result') {
    ipcRenderer.sendToHost('asaps-result', (d as any).value);
  }
});
