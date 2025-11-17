#!/bin/bash

echo "Updating IRenderer imports in beat files..."

# List of files that need updating
files=(
  "packages/core/src/beats/AddRemoveInventoryBeat.ts"
  "packages/core/src/beats/Beat.ts"
  "packages/core/src/beats/ConditionBeat.ts"
  "packages/core/src/beats/ConversationChoiceBeat.ts"
  "packages/core/src/beats/DialogTreeBeat.ts"
  "packages/core/src/beats/DurScreenBeat.ts"
  "packages/core/src/beats/EndScreenBeat.ts"
  "packages/core/src/beats/HyperTextBeat.ts"
  "packages/core/src/beats/InputTextBeat.ts"
  "packages/core/src/beats/IntroTextBeat.ts"
  "packages/core/src/beats/MovementChoiceBeat.ts"
  "packages/core/src/beats/PickPropBeat.ts"
  "packages/core/src/beats/RandomTargetBeat.ts"
  "packages/core/src/beats/SetTimerBeat.ts"
  "packages/core/src/beats/SetVariableBeat.ts"
  "packages/core/src/beats/SWFBeat.ts"
  "packages/core/src/beats/TitleScreenBeat.ts"
  "packages/core/src/beats/VideoBeat.ts"
  "packages/core/src/engine/StoryEngine.ts"
)

# Replace @asaps/renderer with ../types (relative import)
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Updating $file..."
    sed -i '' "s/@asaps\/renderer/..\/types/g" "$file"
  else
    echo "File not found: $file"
  fi
done

echo ""
echo "All imports updated!"
echo "IRenderer is now imported from local types instead of @asaps/renderer"
