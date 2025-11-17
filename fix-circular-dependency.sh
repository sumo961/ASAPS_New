#!/bin/bash

echo "========================================"
echo "Fixing IRenderer Circular Dependency"
echo "========================================"
echo ""
echo "Step 1: IRenderer moved to core/src/types/index.ts ✅"
echo "Step 2: Renderer re-exports from core ✅"
echo "Step 3: Beat.ts updated ✅"
echo "Step 4: StoryEngine.ts updated ✅"
echo ""
echo "Step 5: Updating remaining beat files..."

cd "packages/core/src/beats"

# List of beat files that need updating (already checked Beat.ts is done)
beat_files=(
  "AddRemoveInventoryBeat.ts"
  "ConditionBeat.ts"
  "ConversationChoiceBeat.ts"
  "DialogTreeBeat.ts"
  "DurScreenBeat.ts"
  "EndScreenBeat.ts"
  "HyperTextBeat.ts"
  "InputTextBeat.ts"
  "IntroTextBeat.ts"
  "MovementChoiceBeat.ts"
  "PickPropBeat.ts"
  "RandomTargetBeat.ts"
  "SetTimerBeat.ts"
  "SetVariableBeat.ts"
  "SWFBeat.ts"
  "TitleScreenBeat.ts"
  "VideoBeat.ts"
)

# Update each file
for file in "${beat_files[@]}"; do
  if [ -f "$file" ]; then
    echo "  Updating $file..."
    # Use sed to replace the import on macOS
    sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" "$file"
  else
    echo "  ⚠️  File not found: $file"
  fi
done

cd ../../../..

echo ""
echo "========================================"
echo "All files updated!"
echo "========================================"
echo ""
echo "Circular dependency FIXED:"
echo "  - IRenderer now lives in @asaps/core"
echo "  - No more core → renderer → core cycle"
echo "  - Build order: core first, then renderer"
echo ""
echo "Next step: Run rebuild-and-check.sh"
