import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.tsx'),
      name: 'ASAPSPlayerWeb',
      formats: ['es', 'umd'],
      fileName: (format) => `player-web.${format}.js`,
    },
    rollupOptions: {
      // Don't externalize React - we want it bundled for standalone use
      // For module imports, consumers can tree-shake if needed
      output: {
        // Provide global variables for UMD build
        globals: {},
        // Generate separate CSS file
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'player-web.css';
          return assetInfo.name || 'asset';
        },
      },
    },
    cssCodeSplit: false,
    minify: 'esbuild',
  },
  // Keep console for debugging (can be removed in production)
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
