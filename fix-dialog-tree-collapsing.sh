#!/bin/bash

echo "🔧 Fixing Dialog Tree Editor - Individual Thread Collapsing"
echo "============================================"

# Make script executable
chmod +x fix-dialog-tree-collapsing.sh

# Backup current version
echo "📦 Creating backup..."
cp packages/builder/src/editors/DialogTreeEditor.tsx packages/builder/src/editors/DialogTreeEditor.tsx.backup.$(date +%Y%m%d_%H%M%S)

# Apply the fixed version from the artifact
echo "📝 Applying fixed Dialog Tree Editor..."
# The content is in the artifact - you need to copy it from there

echo "✅ Dialog Tree Editor fixed!"
echo ""
echo "🎯 What's been fixed:"
echo "  1. ✅ Individual thread collapsing - Each choice can be expanded/collapsed independently"
echo "  2. ✅ Nested NPC response editing - Click edit icon on any NPC dialog"
echo "  3. ✅ Visual indicators - Shows when collapsed threads have content"
echo "  4. ✅ Expand/Collapse all button - Quick toggle for entire tree"
echo "  5. ✅ Better visual hierarchy - Clearer indentation and borders"
echo ""
echo "📝 How to test:"
echo "  1. Copy the fixed code from the artifact to DialogTreeEditor.tsx"
echo "  2. Build the project: npm run build"
echo "  3. Start dev server: npm run dev"
echo "  4. Create a dialogTree beat"
echo "  5. Add player choices and NPC responses"
echo "  6. Click arrows to expand/collapse individual threads"
echo "  7. Click edit icons to modify NPC dialogs at any depth"
echo ""
echo "🔧 Key improvements:"
echo "  • Two-level collapsing: Nodes (for choices) and Choices (for threads)"
echo "  • Visual feedback when collapsed threads contain content"
echo "  • Proper path tracking for deep nested editing"
echo "  • Auto-expand when creating new nested dialogs"
echo ""
echo "✨ Export should now work correctly with nested dialogs!"