import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

// Transform lucide-react barrel imports into direct icon imports.
// Without this, vitest hangs trying to transform 1700+ individual icon modules
// from lucide-react's barrel export file.
function lucideDirectImports(): Plugin {
  return {
    name: 'lucide-direct-imports',
    enforce: 'pre',
    transform(code, id) {
      if (!code.includes("from 'lucide-react'") && !code.includes('from "lucide-react"')) {
        return null;
      }
      // Match: import { X, Bug, GitBranch } from 'lucide-react'
      const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
      let result = code;
      let match;
      while ((match = importRegex.exec(code)) !== null) {
        const names = match[1].split(',').map(n => n.trim()).filter(Boolean);
        const directImports = names.map(name => {
          // Handle "X as Y" aliases
          const parts = name.split(/\s+as\s+/);
          const iconName = parts[0].trim();
          const alias = parts.length > 1 ? parts[1].trim() : iconName;
          // Convert PascalCase to kebab-case. Lucide names with
          // trailing digits (Wand2, Tally5) live in wand-2.js /
          // tally-5.js — the letter→digit boundary needs its own
          // hyphen, which the original two-rule conversion misses.
          const kebab = iconName
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
            .replace(/([A-Za-z])(\d)/g, '$1-$2')
            .toLowerCase();
          return `import ${alias} from 'lucide-react/dist/esm/icons/${kebab}.js';`;
        }).join('\n');
        result = result.replace(match[0], directImports);
      }
      if (result !== code) {
        return { code: result, map: null };
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [lucideDirectImports(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'vite.config.ts',
        'vitest.config.ts'
      ],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@test': path.resolve(__dirname, './src/test')
    }
  }
});
