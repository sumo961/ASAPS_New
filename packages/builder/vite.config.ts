import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { viteAIProxyPlugin } from './src/api/vite-ai-proxy.ts';

const rootPkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf-8'));

// Read build number (incremented by CI workflow, tracked in git)
const buildNumberPath = resolve(import.meta.dirname, '../../build-number.json');
let buildData: { build: number };
try {
  buildData = JSON.parse(readFileSync(buildNumberPath, 'utf-8'));
} catch {
  buildData = { build: 0 };
}

export default defineConfig({
  plugins: [react(), viteAIProxyPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __BUILD_NUMBER__: JSON.stringify(buildData.build),
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src')
      // Removed @asaps aliases - use workspace resolution instead
    }
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/local-tts': {
        target: 'http://localhost:4123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-tts/, ''),
      },
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  }
});
