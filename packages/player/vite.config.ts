import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'ASAPSPlayer',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => `asaps-player.${format}.js`
    },
    rollupOptions: {
      // @asaps/core and @asaps/renderer stay outside too. Bundled in, every
      // consumer that also uses them (the web player does) carried a second
      // copy, and what is kept once per window was kept twice: translated
      // runtime words were installed in one copy while the story engine read
      // the other, so a dialog's "Continue" stayed English in a translated
      // export.
      external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', '@asaps/core', '@asaps/renderer'],
      output: {
        globals: {
          '@asaps/core': 'ASAPSCore',
          '@asaps/renderer': 'ASAPSRenderer',
          react: 'React',
          'react/jsx-runtime': 'ReactJSXRuntime',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOMClient'
        }
      }
    },
    sourcemap: true,
    minify: false
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src')
    }
  }
});
