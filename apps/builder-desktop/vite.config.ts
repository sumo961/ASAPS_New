import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';
import { readFileSync } from 'fs';

// CI build number (build-number.json, incremented by the "Build Desktop Apps"
// workflow) — the main process needs it for Help ▸ Report a Bug…, which
// reports the same "0.9.x.N" the app header shows.
let buildNumber = 0;
try {
  buildNumber = JSON.parse(readFileSync(path.resolve(__dirname, '../../build-number.json'), 'utf-8')).build ?? 0;
} catch {
  /* local checkout without the file — report the bare version */
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    electron([
      {
        // Main process entry
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          define: {
            __BUILD_NUMBER__: JSON.stringify(buildNumber),
          },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'fsevents', 'child_process'],
            },
          },
        },
      },
      {
        // Preload scripts entry
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        // WebView-guest bridge: injected into <webview> guests via the
        // preload attribute so pages' parent.postMessage({asaps:'result'})
        // exit protocol works in the desktop app too (sendToHost relay).
        entry: 'src/preload/webview-bridge.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
  ],

  // The Electron app will load the builder package directly
  // In dev mode, it loads from the builder's dev server
  // In production, it loads the built builder files
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // We only need to build the Electron parts, the UI comes from @asaps/builder
    lib: {
      entry: 'src/renderer/main.tsx',
      formats: ['es'],
    },
  },
});
