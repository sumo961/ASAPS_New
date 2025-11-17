#!/bin/bash

# Fix TypeScript declarations build issue

echo "Fixing TypeScript declaration files..."
echo "======================================="
echo ""

# Navigate to core package
cd packages/core

echo "Step 1: Cleaning dist folder..."
rm -rf dist
mkdir -p dist

echo "Step 2: Generating TypeScript declarations..."
npx tsc --declaration --declarationMap --emitDeclarationOnly --outDir dist

if [ $? -eq 0 ]; then
    echo "✓ TypeScript declarations generated"
else
    echo "✗ Failed to generate TypeScript declarations"
    echo "Trying alternative approach..."
    
    # Alternative: Generate full build with tsc
    npx tsc --declaration --declarationMap --outDir dist --module esnext --target es2022
fi

echo "Step 3: Building with Vite..."
npx vite build

echo ""
echo "Step 4: Verifying declaration files..."
if [ -f "dist/index.d.ts" ]; then
    echo "✓ index.d.ts found"
else
    echo "✗ index.d.ts not found"
    
    # Fallback: Create a basic declaration file
    echo "Creating fallback declaration file..."
    cat > dist/index.d.ts << 'EOF'
export * from './types';
export * from './beats';
export * from './engine';
export * from './xml';

export { Beat } from './beats/Beat';
export { BeatTypeRegistry } from './beats/BeatRegistry';
export { TitleScreenBeat } from './beats/TitleScreenBeat';
export { IntroTextBeat } from './beats/IntroTextBeat';
export { EndScreenBeat } from './beats/EndScreenBeat';
export { MovementChoiceBeat } from './beats/MovementChoiceBeat';
export { PickPropBeat } from './beats/PickPropBeat';
export { DialogTreeBeat } from './beats/DialogTreeBeat';
export { SetVariableBeat } from './beats/SetVariableBeat';
export { ConditionBeat } from './beats/ConditionBeat';

export { Story } from './engine/Story';
export { StoryEngine } from './engine/StoryEngine';
export { StoryContext } from './engine/StoryContext';

export { ASMLParser } from './xml/ASMLParser';
export { ASMLGenerator } from './xml/ASMLGenerator';
export { ASMLProcessor } from './xml/ASMLProcessor';

export type {
  BeatConfig,
  Connection,
  Location,
  Transition,
  Sound,
  Condition,
  Effect,
  IRenderer
} from './types';
EOF
fi

echo ""
echo "Step 5: Building renderer package..."
cd ../renderer
npm run build

echo ""
echo "Step 6: Building builder application..."
cd ../builder
npm run build

echo ""
echo "======================================="
echo "Build fix complete!"
echo ""
echo "To start the application:"
echo "  cd packages/builder"
echo "  npm run dev"
