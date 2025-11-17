import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vite.config.ts',
        'vitest.config.ts'
      ],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 65,
        statements: 75
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../core/src')
    }
  }
});