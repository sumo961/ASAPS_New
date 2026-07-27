/**
 * WebViewElement — embeds an external URL in the renderable surface.
 *
 * Runtime detection picks the right embed primitive:
 *   - Electron (window.process.versions.electron present): uses <webview>,
 *     which can navigate cross-origin without honoring X-Frame-Options
 *     and exposes navigation events back to the host. The console
 *     warning about <webview> needing webviewTag:true should be visible
 *     in dev — confirm before shipping.
 *   - Browser / PW (default): uses <iframe>. Most public sites set
 *     X-Frame-Options: DENY which the iframe must respect, so authors
 *     should be aware their target needs to allow framing.
 *
 * Exit paths (any one resolves):
 *   - Player taps Done button → 'done'
 *   - Embedded page navigates to a URL matching exitUrlPattern → URL
 *     (only observable in Electron; iframe origin restrictions hide it
 *     for cross-origin pages)
 *   - Page sends window.postMessage({asaps:'result', value: ...}) →
 *     the posted value. Works in both modes because postMessage doesn't
 *     hit the cross-origin restriction the same way.
 */
import React, { useEffect, useRef, useState } from 'react';

export interface WebViewElementProps {
  url: string;
  exitUrlPattern?: string;
  /** Pre-resolved hash fragment (URL-encoded key=value pairs). */
  contextHash?: string;
  doneButtonText?: string;
  /**
   * Fill the parent's height instead of forcing a 16:10 aspect frame.
   * The slot-flow path sets this so the frame takes the REMAINING stage
   * height after the prompt — the fixed aspect used to overflow the stage
   * and visually clip the prompt above it.
   */
  fill?: boolean;
  onExit: (value: string) => void;
  theme?: {
    buttonBg?: string;
    buttonText?: string;
    buttonBorder?: string;
  };
}

function isElectron(): boolean {
  // Two probes, because the environment differs by security config:
  //  1. userAgent contains "Electron" in every Electron renderer,
  //     INCLUDING sandboxed/contextIsolation:true windows — this is the
  //     one that actually fires in the desktop app (found during the
  //     Web View verification round: the old process.versions check
  //     never matched under contextIsolation, so the <webview> path was
  //     dead code and Electron behaved exactly like a browser iframe).
  //  2. window.process.versions.electron as a fallback for legacy
  //     nodeIntegration setups.
  if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) return true;
  const proc = (typeof window !== 'undefined' && (window as any).process) as
    | { versions?: { electron?: string } }
    | undefined;
  return !!proc?.versions?.electron;
}

export const WebViewElement: React.FC<WebViewElementProps> = ({
  url,
  exitUrlPattern,
  contextHash,
  doneButtonText = 'Done',
  fill = false,
  onExit,
  theme,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const exitedRef = useRef(false);
  const [usingElectron] = useState(isElectron());

  // Compose the final URL: append the context hash (if any) as the
  // fragment. We replace any existing fragment to keep behavior
  // predictable — authors who need fragment routing inside the
  // embedded page can stop using passContext.
  const finalUrl = React.useMemo(() => {
    if (!contextHash) return url;
    const hashless = url.split('#')[0];
    return `${hashless}#${contextHash}`;
  }, [url, contextHash]);

  // Compile exit regex once. Invalid patterns are silently ignored so
  // a typo in the schema doesn't strand the player.
  const exitRegex = React.useMemo(() => {
    if (!exitUrlPattern) return null;
    try { return new RegExp(exitUrlPattern); }
    catch (e) { console.warn(`[WebViewElement] invalid exitUrlPattern: ${e}`); return null; }
  }, [exitUrlPattern]);

  const exitOnce = (value: string) => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    onExit(value);
  };

  // postMessage listener — the browser-iframe exit path. The embedded page
  // calls parent.postMessage({asaps:'result', value}) and the host window
  // receives it. NOTE: this can NEVER fire in Electron <webview> mode — the
  // guest is its own top-level document, so window.parent === window and the
  // message stays inside the guest. The webview path instead relies on the
  // guest preload bridge relaying the same protocol via sendToHost (below).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && typeof data === 'object' && data.asaps === 'result') {
        const value = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
        exitOnce(value);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Electron webview postMessage relay — the guest preload bridge
  // (webview-bridge.js, injected via the preload attribute) catches the
  // page's parent.postMessage({asaps:'result'}) inside the guest and
  // forwards it with ipcRenderer.sendToHost('asaps-result', value), which
  // surfaces here as an 'ipc-message' event. Found during the Web View
  // verification round: without this, station-B-style exits silently did
  // nothing in the desktop app.
  useEffect(() => {
    if (!usingElectron) return;
    const wv = containerRef.current?.querySelector('webview') as any;
    if (!wv) return;
    const handler = (e: any) => {
      if (e?.channel === 'asaps-result') {
        const raw = Array.isArray(e.args) ? e.args[0] : undefined;
        exitOnce(typeof raw === 'string' ? raw : JSON.stringify(raw));
      }
    };
    wv.addEventListener('ipc-message', handler);
    return () => wv.removeEventListener('ipc-message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingElectron]);

  // Electron webview navigation observer — fires onExit when the URL
  // matches exitUrlPattern. The <webview> tag dispatches
  // 'did-navigate' / 'did-navigate-in-page' events.
  useEffect(() => {
    if (!usingElectron || !exitRegex) return;
    const wv = containerRef.current?.querySelector('webview') as any;
    if (!wv) return;
    const handler = (e: any) => {
      const navUrl = e?.url as string | undefined;
      if (navUrl && exitRegex.test(navUrl)) exitOnce(navUrl);
    };
    wv.addEventListener('did-navigate', handler);
    wv.addEventListener('did-navigate-in-page', handler);
    return () => {
      wv.removeEventListener('did-navigate', handler);
      wv.removeEventListener('did-navigate-in-page', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingElectron, exitRegex]);

  // Guest preload bridge (Electron only): exposed by the desktop app's main
  // preload as an absolute file:// URL. Absent in browsers / older builds —
  // the webview still works, only the postMessage exit falls back to Done.
  const webviewPreload = usingElectron
    ? (window as any).electronAPI?.webviewPreloadUrl as string | undefined
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        ...(fill ? { height: '100%', minHeight: 0 } : null),
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 'min(95%, 1200px)',
          // fill: take the remaining column height (prompt keeps its own
          // space above); default: legacy fixed aspect for author-positioned
          // rect layouts.
          ...(fill ? { flex: '1 1 0', minHeight: 0 } : { aspectRatio: '16 / 10' }),
          borderRadius: 12,
          overflow: 'hidden',
          background: '#fff',
          border: '2px solid rgba(255,255,255,0.25)',
        }}
      >
        {usingElectron ? (
          // The <webview> element is an Electron-only Custom Element.
          // React doesn't know it natively, so we use lowercase
          // dangerously-set props. The TypeScript type is left as any
          // to avoid maintaining an electron-only declaration file
          // inside this shared renderer package.
          React.createElement('webview' as any, {
            src: finalUrl,
            style: { width: '100%', height: '100%', border: 'none' },
            allowpopups: 'true',
            ...(webviewPreload ? { preload: webviewPreload } : {}),
          })
        ) : (
          <iframe
            src={finalUrl}
            title="Embedded content"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => exitOnce('done')}
        style={{
          marginTop: 'clamp(8px, 2vh, 16px)',
          padding: 'clamp(8px, 1.5vh, 14px) clamp(16px, 4vw, 32px)',
          fontSize: 'clamp(14px, 1.6vw, 18px)',
          background: theme?.buttonBg ?? 'rgba(0,0,0,0.6)',
          color: theme?.buttonText ?? '#fff',
          border: `2px solid ${theme?.buttonBorder ?? 'rgba(255,255,255,0.4)'}`,
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        {doneButtonText}
      </button>
    </div>
  );
};

export default WebViewElement;
