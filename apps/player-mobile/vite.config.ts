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
        // Function form: Vite 8's rolldown bundler rejects the object form
        // ("manualChunks is not a function") — broken since the vite→8 bump.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor';
          if (id.includes('@asaps/core') || id.includes('@asaps/player') || id.includes('@asaps/renderer')) return 'player';
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['@asaps/core', '@asaps/player', '@asaps/renderer'],
  },
});
