#!/bin/bash

# ASAPS Package Update Script
# This script will update all package.json files to latest versions

echo "🚀 Starting ASAPS package update..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to create backup
backup_file() {
    if [ -f "$1" ]; then
        cp "$1" "$1.backup.$(date +%Y%m%d_%H%M%S)"
        echo -e "${GREEN}✓${NC} Backed up $1"
    fi
}

# Backup existing package.json files
echo -e "\n${YELLOW}Creating backups...${NC}"
backup_file "package.json"
backup_file "packages/core/package.json"
backup_file "packages/builder/package.json"
backup_file "packages/renderer/package.json"

# Update root package.json
echo -e "\n${YELLOW}Updating root package.json...${NC}"
cat > package.json << 'EOF'
{
  "name": "asaps-modern",
  "version": "2.0.0",
  "private": true,
  "description": "Advanced Story Authoring and Presentation System - Modern Implementation",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w @asaps/builder",
    "dev:all": "concurrently \"npm run dev -w @asaps/core\" \"npm run dev -w @asaps/builder\"",
    "build": "npm run build --workspaces",
    "build:core": "npm run build -w @asaps/core",
    "build:builder": "npm run build -w @asaps/builder",
    "test": "npm run test --workspaces",
    "lint": "eslint packages/*/src",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx,css}\"",
    "type-check": "tsc --noEmit",
    "clean": "rimraf packages/*/dist packages/*/node_modules node_modules",
    "install:all": "npm install"
  },
  "devDependencies": {
    "@eslint/js": "^9.8.0",
    "@types/node": "^22.0.0",
    "concurrently": "^9.0.0",
    "eslint": "^9.8.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "globals": "^15.0.0",
    "prettier": "^3.3.0",
    "rimraf": "^6.0.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=7.0.0"
  }
}
EOF
echo -e "${GREEN}✓${NC} Root package.json updated"

# Update packages/core/package.json
echo -e "\n${YELLOW}Updating packages/core/package.json...${NC}"
cat > packages/core/package.json << 'EOF'
{
  "name": "@asaps/core",
  "version": "2.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./beats": {
      "import": "./dist/beats/index.js",
      "types": "./dist/beats/index.d.ts"
    },
    "./engine": {
      "import": "./dist/engine/index.js",
      "types": "./dist/engine/index.d.ts"
    },
    "./xml": {
      "import": "./dist/xml/index.js",
      "types": "./dist/xml/index.d.ts"
    },
    "./filesystem": {
      "import": "./dist/filesystem/index.js",
      "types": "./dist/filesystem/index.d.ts"
    }
  },
  "scripts": {
    "dev": "vite build --watch",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "eventemitter3": "^5.0.1",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
EOF
echo -e "${GREEN}✓${NC} Core package.json updated"

# Update packages/builder/package.json
echo -e "\n${YELLOW}Updating packages/builder/package.json...${NC}"
cat > packages/builder/package.json << 'EOF'
{
  "name": "@asaps/builder",
  "version": "2.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui"
  },
  "dependencies": {
    "@asaps/core": "^2.0.0",
    "@asaps/renderer": "^2.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "reactflow": "^11.11.0",
    "d3": "^7.9.0",
    "zustand": "^5.0.0",
    "immer": "^10.1.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.454.0",
    "clsx": "^2.1.0",
    "react-dropzone": "^14.3.0",
    "file-saver": "^2.0.5",
    "browser-fs-access": "^0.35.0"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/file-saver": "^2.0.7",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "@vitest/ui": "^2.1.0"
  }
}
EOF
echo -e "${GREEN}✓${NC} Builder package.json updated"

# Update packages/renderer/package.json
echo -e "\n${YELLOW}Updating packages/renderer/package.json...${NC}"
cat > packages/renderer/package.json << 'EOF'
{
  "name": "@asaps/renderer",
  "version": "2.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "dev": "vite build --watch",
    "build": "tsc && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "@asaps/core": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
EOF
echo -e "${GREEN}✓${NC} Renderer package.json updated"

# Create new ESLint config
echo -e "\n${YELLOW}Creating new ESLint config...${NC}"
cat > eslint.config.js << 'EOF'
import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' }
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.ts'
    ]
  }
);
EOF
echo -e "${GREEN}✓${NC} ESLint config created"

# Remove old ESLint config if exists
if [ -f ".eslintrc.json" ]; then
    rm .eslintrc.json
    echo -e "${GREEN}✓${NC} Removed old .eslintrc.json"
fi

# Clean node_modules and package-lock
echo -e "\n${YELLOW}Cleaning old dependencies...${NC}"
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules packages/*/package-lock.json
echo -e "${GREEN}✓${NC} Cleaned old dependencies"

# Install new dependencies
echo -e "\n${YELLOW}Installing updated dependencies...${NC}"
npm install

# Build core package
echo -e "\n${YELLOW}Building core package...${NC}"
npm run build:core

echo -e "\n${GREEN}✅ Update complete!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Update any imports from 'react-flow-renderer' to 'reactflow'"
echo "2. Update Zustand imports from 'import create' to 'import { create }'"
echo "3. Run: npm run dev"
echo -e "\n${GREEN}Backups created with .backup extension${NC}"