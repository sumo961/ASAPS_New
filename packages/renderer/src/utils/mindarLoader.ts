/**
 * Runtime loader for mind-ar that bypasses our bundler entirely.
 *
 * Why this exists: mind-ar's npm build imports `sRGBEncoding` from
 * `three`, an export Three removed in r152. Our transitive Three
 * (via @photo-sphere-viewer) is 0.179, so a normal `import` from
 * mind-ar errors at build time. Loading mind-ar via a <script type=
 * "module"> tag injects its self-contained CDN bundle which carries
 * its own Three internally, sidestepping the version conflict.
 *
 * Side effect: mind-ar attaches its constructors to
 * window.MINDAR.IMAGE. We resolve the loader's promise with that
 * global so callers don't have to repeat the attachment dance.
 *
 * The CDN URL is pinned to a specific version so a silent upstream
 * change doesn't break our runtime. Bump it manually after testing.
 */

// Mind-ar's prod bundle does bare `import { ... } from "three"` which
// the browser can't resolve without an importmap. The bundle and the
// importmap are pinned together so an upstream change doesn't silently
// shift versions under us.
const MINDAR_VERSION = '1.2.5';
const THREE_VERSION = '0.147.0'; // pinned: mind-ar needs an export removed in 0.152
const MINDAR_CDN_URL = `https://cdn.jsdelivr.net/npm/mind-ar@${MINDAR_VERSION}/dist/mindar-image-three.prod.js`;

let loadPromise: Promise<MindARGlobal> | null = null;
let importMapInjected = false;

export interface MindARGlobal {
  MindARThree: any;
}

/**
 * Inject a tiny importmap that resolves bare `three` and `three/addons/*`
 * specifiers to a CDN version compatible with mind-ar. Browsers ignore
 * importmaps inserted after any module has loaded; the loader runs
 * before mind-ar's first import resolves, so timing is fine here.
 */
function ensureImportMap() {
  if (importMapInjected) return;
  // If the page already has an importmap with `three`, respect it.
  const existing = document.querySelector('script[type="importmap"]');
  if (existing) {
    importMapInjected = true;
    return;
  }
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({
    imports: {
      'three': `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`,
      'three/addons/': `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/`,
    },
  });
  document.head.appendChild(map);
  importMapInjected = true;
}

export function loadMindAR(): Promise<MindARGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('mind-ar can only load in a browser'));
  }
  // If already present (e.g. previous mount on the same page), reuse.
  const existing = (window as any).MINDAR?.IMAGE?.MindARThree;
  if (existing) {
    return Promise.resolve({ MindARThree: existing });
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<MindARGlobal>((resolve, reject) => {
    ensureImportMap();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = MINDAR_CDN_URL;
    script.async = true;
    script.onload = () => {
      // The CDN bundle pushes to window.MINDAR.IMAGE on import.
      // Module scripts execute asynchronously, so even after `load`
      // we may need a few microtasks to see the global. Retry briefly.
      let tries = 0;
      const check = () => {
        const ctor = (window as any).MINDAR?.IMAGE?.MindARThree;
        if (ctor) {
          resolve({ MindARThree: ctor });
          return;
        }
        if (tries++ > 60) {
          reject(new Error('mind-ar loaded but MindARThree was not exposed'));
          return;
        }
        setTimeout(check, 25);
      };
      check();
    };
    script.onerror = () => {
      loadPromise = null; // allow retry on next mount
      reject(new Error(`Failed to load mind-ar from ${MINDAR_CDN_URL}`));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
