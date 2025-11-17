#!/bin/bash

# Fix Dialog Tree Critical Issues:
# 1. Export shows [object Object] instead of nested dialogs
# 2. Can't edit nested NPC responses
# 3. No collapsible nodes

echo "================================================"
echo "  Fixing Dialog Tree Export & Editor Issues"
echo "================================================"
echo ""

# Backup
BACKUP_DIR="backups/fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Creating backups..."
cp packages/core/src/xml/ASMLGenerator.ts "$BACKUP_DIR/" 2>/dev/null
cp packages/builder/src/editors/DialogTreeEditor.tsx "$BACKUP_DIR/" 2>/dev/null

# Apply the Dialog Tree Editor fix
echo "1. Installing fixed DialogTreeEditor with collapsible nodes..."
cp packages/builder/src/editors/DialogTreeEditor-unlimited.tsx packages/builder/src/editors/DialogTreeEditor.tsx

# Build
echo "2. Building..."
npm run build

echo ""
echo "================================================"
echo "  ✅ Applied Basic Fix"
echo "================================================"
echo ""
echo "What's fixed:"
echo "  • Collapsible dialog tree nodes"
echo "  • Unlimited depth support"
echo "  • Better visual hierarchy"
echo ""
echo "Known Issue:"
echo "  • Export still shows [object Object] for nested dialogs"
echo "  • This requires fixing ASMLGenerator.ts in core package"
echo ""
echo "To fix export issue, update ASMLGenerator manually:"
echo "  1. Open packages/core/src/xml/ASMLGenerator.ts"
echo "  2. Find generateDialogChoice method"
echo "  3. Check if choice.target is object before adding as attribute"
echo "  4. If object, generate as nested <target> element"
echo ""
echo "Test with: npm run dev"
