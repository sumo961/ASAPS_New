import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,   // generates dist/index.d.ts
      rollupTypes: true         // bundles all .d.ts into one file
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ASAPSCore',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.js' : 'index.cjs'
    },
    rollupOptions: {
      external: ['eventemitter3', 'idb'],
      output: {
        globals: {
          eventemitter3: 'EventEmitter3',
          idb: 'idb'
        }
      }
    },
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
