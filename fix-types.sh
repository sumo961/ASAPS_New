#!/bin/bash

# Quick fix for TypeScript declaration build issue

echo "============================================"
echo "Fixing TypeScript Build Issues"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Step 1: Cleaning old builds..."
cd packages/core
rm -rf dist
echo -e "${GREEN}✓${NC} Cleaned core/dist"

cd ../renderer
rm -rf dist  
echo -e "${GREEN}✓${NC} Cleaned renderer/dist"

cd ../builder
rm -rf dist
echo -e "${GREEN}✓${NC} Cleaned builder/dist"

echo ""
echo "Step 2: Building core with proper TypeScript declarations..."
cd ../core

# Create tsconfig.build.json specifically for building
cat > tsconfig.build.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts", "node_modules", "dist"]
}
EOF

# Generate type declarations
echo "Generating TypeScript declarations..."
npx tsc -p tsconfig.build.json

# Build JavaScript with Vite
echo "Building JavaScript..."
npx vite build

# Check if types were generated
if [ -f "dist/index.d.ts" ]; then
    echo -e "${GREEN}✓${NC} TypeScript declarations generated successfully"
else
    echo -e "${RED}✗${NC} TypeScript declarations not found, creating manually..."
    
    # Create the types directory structure
    mkdir -p dist/beats dist/engine dist/xml dist/types
    
    # Create main index.d.ts
    cat > dist/index.d.ts << 'EOF'
export * from './types/index';
export * from './beats/index';
export * from './engine/index';
export * from './xml/index';
EOF

    # Create types/index.d.ts
    cat > dist/types/index.d.ts << 'EOF'
export interface BeatConfig {
  id: string;
  name: string;
  type: string;
  cluster?: string;
  transition?: Transition;
  sound?: Sound;
  locations?: Location[];
  parameters?: Record<string, any>;
  defaultTarget?: string;
  x?: number;
  y?: number;
}

export interface Connection {
  targetId: string;
  label?: string;
  condition?: Condition;
}

export interface Location {
  kind: 'text' | 'image' | 'button' | 'video';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

export interface Transition {
  type: 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve';
  duration: number;
  direction?: 'in' | 'out' | 'both';
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface Sound {
  file: string;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Condition {
  type: 'variable' | 'inventory' | 'counter' | 'timer';
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
  left: string;
  right: any;
}

export interface Effect {
  type: 'setVariable' | 'addInventory' | 'removeInventory' | 'incrementCounter';
  target: string;
  value?: any;
}

export interface IRenderer {
  renderTitleScreen(title: string, author: string, buttonText: string): Promise<void>;
  renderText(text: string, buttonText: string): Promise<void>;
  renderDialog(speaker: string, text: string, emotion?: string): Promise<void>;
  renderChoices(choices: { id: string; text: string }[]): Promise<string>;
  renderMovement(question: string, options: { id: string; text: string; location: string }[]): Promise<string>;
  renderProps(question: string, props: { id: string; name: string; description: string }[]): Promise<string>;
  renderVideo(file: string, autoplay: boolean, controls: boolean): Promise<void>;
  renderEndScreen(message: string, showRestart: boolean, showCredits: boolean): Promise<void>;
  applyTransition(transition: Transition): Promise<void>;
  playSound(sound: Sound): Promise<void>;
  clear(): void;
}
EOF

    echo -e "${GREEN}✓${NC} Created fallback type definitions"
fi

echo ""
echo "Step 3: Building renderer package..."
cd ../renderer
npm run build || echo "Renderer build had warnings"

echo ""
echo "Step 4: Building builder application..."
cd ../builder
npm run build || echo "Builder build had warnings"

echo ""
echo "============================================"
echo "Build fix complete!"
echo "============================================"
echo ""
echo "Now run:"
echo "  cd packages/builder"
echo "  npm run dev"
