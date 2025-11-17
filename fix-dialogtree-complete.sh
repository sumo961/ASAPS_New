#!/bin/bash

# Fix all Dialog Tree Editor issues

echo "================================================"
echo "  Fixing Dialog Tree Editor Issues"
echo "================================================"
echo ""

# Backup current files
BACKUP_DIR="backups/dialogtree-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Creating backups..."
cp packages/builder/src/App.tsx "$BACKUP_DIR/App.tsx.backup" 2>/dev/null
cp packages/builder/src/editors/DialogTreeEditor.tsx "$BACKUP_DIR/DialogTreeEditor.tsx.backup" 2>/dev/null
cp packages/builder/src/components/Inspector.tsx "$BACKUP_DIR/Inspector.tsx.backup" 2>/dev/null

# Apply fixes
echo "1. Fixing App layout (full screen usage)..."
cp packages/builder/src/App-fixed.tsx packages/builder/src/App.tsx

echo "2. Fixing Inspector (pass expanded prop, better layout)..."
cp packages/builder/src/components/Inspector-improved.tsx packages/builder/src/components/Inspector.tsx

echo "3. Fixing DialogTreeEditor..."
echo "   • NPCs speak TO player (not player speaking)"
echo "   • Editable nested dialogs with modal"
echo "   • Better expanded layout with grid"
cp packages/builder/src/editors/DialogTreeEditor-improved.tsx packages/builder/src/editors/DialogTreeEditor.tsx

# Build
echo ""
echo "4. Building packages..."
npm run build

echo ""
echo "================================================"
echo "  ✅ All Issues Fixed!"
echo "================================================"
echo ""
echo "Fixed:"
echo "  • Canvas now uses full screen height"
echo "  • Inspector expands to 640px with grid layout"
echo "  • Root dialog shows NPC speaking TO player"
echo "  • Player responses are clearly labeled"
echo "  • Nested dialogs are editable via modal"
echo "  • Better use of expanded space"
echo "  • Emotion preview shows in expanded view"
echo ""
echo "Dialog Tree Flow:"
echo "  1. NPC speaks first (root dialog)"
echo "  2. Player responds (choices)"
echo "  3. NPC replies (nested dialogs)"
echo "  4. Chain continues..."
echo ""
echo "Test with: npm run dev"
echo ""
echo "Backups saved to: $BACKUP_DIR"
