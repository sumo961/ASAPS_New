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
  onExit: (value: string) => void;
  theme?: {
    buttonBg?: string;
    buttonText?: string;
    buttonBorder?: string;
  };
}

function isElectron(): boolean {
  // window.process.versions.electron only exists in the Electron
  // renderer process. The check guards against undefined paths so it
  // doesn't throw in the browser.
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

  // postMessage listener — works in both iframe and Electron webview
  // modes. The host listens on the window; the embedded page calls
  // window.parent.postMessage(...) (iframe) or sends via the
  // ipc-message channel (Electron). For simplicity here we only handle
  // the standard postMessage shape; Electron-only signaling can be
  // layered later if needed.
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

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 'min(95%, 1200px)',
          aspectRatio: '16 / 10',
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
