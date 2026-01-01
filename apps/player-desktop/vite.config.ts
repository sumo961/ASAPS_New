import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Watch the player package for changes
      ignored: ['!**/node_modules/@asaps/**'],
    },
  },

  build: {
    // Tauri uses Chromium, target esnext
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify in debug mode
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  // Env prefix for Tauri
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
