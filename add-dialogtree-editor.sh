#!/bin/bash

# ASPS Dialog Tree Editor Fix
# Adds full dialog tree editor support to the Inspector

echo "================================================"
echo "  Adding Dialog Tree Editor Support"
echo "================================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${YELLOW}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

# Backup current Inspector
BACKUP_DIR="$SCRIPT_DIR/backups/dialogtree-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

print_status "Backing up current Inspector..."
cp "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx" "$BACKUP_DIR/Inspector.tsx.backup"
print_success "Backup created"

# Replace with enhanced version
print_status "Installing enhanced Inspector with dialog tree support..."
cp "$SCRIPT_DIR/packages/builder/src/components/Inspector-with-dialogtree.tsx" \
   "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx"
print_success "Enhanced Inspector installed"

# Build
print_status "Building packages..."
cd "$SCRIPT_DIR"
npm run build

echo ""
echo "================================================"
echo -e "${GREEN}  Dialog Tree Editor Ready!${NC}"
echo "================================================"
echo ""
echo "✅ Features added:"
echo "  • Full visual dialog tree editor"
echo "  • Nested dialog branches"
echo "  • Multiple speakers and emotions"
echo "  • Conditions and effects per node"
echo "  • Choice-based branching"
echo "  • Visual tree structure"
echo ""
echo "📋 How to use:"
echo "  1. Start dev server: npm run dev"
echo "  2. Add a 'dialogTree' beat from sidebar"
echo "  3. Select it to see the dialog tree editor"
echo "  4. Build your conversation tree visually!"
echo ""
echo "💡 Editor features:"
echo "  • Click nodes to edit text/speaker/emotion"
echo "  • Add choices for branching conversations"
echo "  • Toggle conditions/effects with toolbar buttons"
echo "  • Expand/collapse tree nodes"
echo "  • Connect to other beats when dialog ends"
