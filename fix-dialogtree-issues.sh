#!/bin/bash

# Fix the Dialog Tree Editor issues

echo "Fixing Dialog Tree Editor issues..."

# Backup current files
BACKUP_DIR="backups/dialogtree-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup existing files
cp packages/builder/src/App.tsx "$BACKUP_DIR/App.tsx.backup"
cp packages/builder/src/editors/DialogTreeEditor.tsx "$BACKUP_DIR/DialogTreeEditor.tsx.backup"

# Apply fixes
echo "1. Fixing App layout (full screen usage)..."
cp packages/builder/src/App-fixed.tsx packages/builder/src/App.tsx

echo "2. Fixing DialogTreeEditor (better expanded view, NPC speakers, editable nested dialogs)..."
cp packages/builder/src/editors/DialogTreeEditor-improved.tsx packages/builder/src/editors/DialogTreeEditor.tsx

# Build
echo "3. Building packages..."
npm run build

echo ""
echo "✅ Fixes applied:"
echo "  • Canvas now uses full screen height"
echo "  • Removed unnecessary sidebar toggle"
echo "  • Inspector expands to 640px with better layout"
echo "  • Root dialog shows NPC speaking TO player (not player speaking)"
echo "  • Nested dialogs are now editable with modal editor"
echo "  • Better use of expanded space with grid layouts"
echo ""
echo "Test with: npm run dev"
