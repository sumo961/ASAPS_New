import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: true, // Allow access from mobile devices on same network
  },

  build: {
    // Target modern mobile browsers
    target: 'es2020',
    // Optimize for mobile
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'player': ['@asaps/core', '@asaps/player', '@asaps/renderer'],
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['@asaps/core', '@asaps/player', '@asaps/renderer'],
  },
});
