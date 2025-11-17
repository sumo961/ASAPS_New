import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ASAPSRenderer',
      formats: ['es', 'cjs'],
      fileName: (format) => `asaps-renderer.${format}.js`
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', '@asaps/core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOMClient',
          '@asaps/core': 'ASAPSCore'
        }
      }
    },
    sourcemap: true,
    minify: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
