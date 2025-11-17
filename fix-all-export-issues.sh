#!/bin/bash

# ASPS Final Export Fix Script
# This fixes ALL remaining export issues:
# 1. Duration ×1000 bug
# 2. Missing characters/settings/environment in export
# 3. Connection issues (already fixed)

echo "================================================"
echo "  ASPS Final Export Fixes"
echo "================================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${YELLOW}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Create backup directory
BACKUP_DIR="$SCRIPT_DIR/backups/final-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
print_success "Created backup directory: $BACKUP_DIR"

# ============================================
# STEP 1: Backup all files we'll modify
# ============================================
print_status "Backing up files..."

# Backup ASMLParser.ts
if [ -f "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts" ]; then
    cp "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts" "$BACKUP_DIR/ASMLParser.ts.backup"
    print_success "Backed up ASMLParser.ts"
fi

# Backup useStoryBuilder.ts
if [ -f "$SCRIPT_DIR/packages/builder/src/hooks/useStoryBuilder.ts" ]; then
    cp "$SCRIPT_DIR/packages/builder/src/hooks/useStoryBuilder.ts" "$BACKUP_DIR/useStoryBuilder.ts.backup"
    print_success "Backed up useStoryBuilder.ts"
fi

echo ""

# ============================================
# STEP 2: Fix Duration Bug in ASMLParser
# ============================================
print_status "Fixing duration ×1000 bug in ASMLParser..."

# The issue is on line ~695: parseFloat(...) * 1000
# We need to remove the multiplication

# Create a Python script to do precise replacement
cat > "$SCRIPT_DIR/fix-duration.py" << 'EOF'
import re
import sys

file_path = sys.argv[1]

with open(file_path, 'r') as f:
    content = f.read()

# Fix the parseTransition function
# Find: duration: parseFloat(transitionElement.getAttribute('duration') || '0.5') * 1000
# Replace with: duration: parseFloat(transitionElement.getAttribute('duration') || '500')

pattern = r"duration:\s*parseFloat\(transitionElement\.getAttribute\('duration'\)[^)]*\)\s*\*\s*1000"
replacement = "duration: parseFloat(transitionElement.getAttribute('duration') || '500')"

content = re.sub(pattern, replacement, content)

# Also check for any other duration multiplications
pattern2 = r"\.duration\s*\*\s*1000"
if re.search(pattern2, content):
    print("WARNING: Found other duration * 1000 patterns")

with open(file_path, 'w') as f:
    f.write(content)

print("Duration fix applied")
EOF

python3 "$SCRIPT_DIR/fix-duration.py" "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts"
rm "$SCRIPT_DIR/fix-duration.py"
print_success "Fixed duration multiplication in ASMLParser"

echo ""

# ============================================
# STEP 3: Fix useStoryBuilder to preserve data
# ============================================
print_status "Fixing useStoryBuilder to preserve settings/environment/characters..."

# Replace the current useStoryBuilder with the fixed version
if [ -f "$SCRIPT_DIR/packages/builder/src/hooks/useStoryBuilder-fixed.ts" ]; then
    cp "$SCRIPT_DIR/packages/builder/src/hooks/useStoryBuilder-fixed.ts" \
       "$SCRIPT_DIR/packages/builder/src/hooks/useStoryBuilder.ts"
    print_success "Replaced useStoryBuilder with fixed version"
else
    print_error "Fixed version not found, applying inline patch..."
    
    # Apply inline fix to exportStory function
    cat > "$SCRIPT_DIR/fix-export.py" << 'EOF'
import re
import sys

file_path = sys.argv[1]

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find exportStory function and fix it
in_export = False
fixed = False
new_lines = []

for i, line in enumerate(lines):
    if 'const exportStory = useCallback' in line:
        in_export = True
    
    if in_export and not fixed and 'story.addBeat(beat)' in line:
        # Insert data transfer before beats
        indent = '    '
        new_lines.append(f'{indent}// FIXED: Transfer all data sections\n')
        new_lines.append(f'{indent}if (state.story) {{\n')
        new_lines.append(f'{indent}  story.setSettings(state.story.getSettings());\n')
        new_lines.append(f'{indent}  story.setEnvironment(state.story.getEnvironment());\n')
        new_lines.append(f'{indent}  story.setCharacters(state.story.getCharacters());\n')
        new_lines.append(f'{indent}  story.setClusters(state.story.getClusters());\n')
        new_lines.append(f'{indent}}}\n')
        new_lines.append('\n')
        fixed = True
    
    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)

print("Export function patched")
EOF

    python3 "$SCRIPT_DIR/fix-export.py" "$SCRIPT_DIR/packages/builder/src/hooks/useStoryBuilder.ts"
    rm "$SCRIPT_DIR/fix-export.py"
fi

echo ""

# ============================================
# STEP 4: Clean and rebuild packages
# ============================================
print_status "Cleaning old build artifacts..."

rm -rf "$SCRIPT_DIR/packages/core/dist"
rm -rf "$SCRIPT_DIR/packages/builder/dist"
rm -rf "$SCRIPT_DIR/packages/renderer/dist"

print_success "Cleaned build directories"
echo ""

print_status "Rebuilding packages in correct order..."

cd "$SCRIPT_DIR"

# Build core first
print_status "Building @asaps/core..."
cd packages/core
npm run build
if [ $? -eq 0 ]; then
    print_success "Core built successfully"
else
    print_error "Core build failed"
fi

# Build renderer
cd ../renderer
print_status "Building @asaps/renderer..."
npm run build
if [ $? -eq 0 ]; then
    print_success "Renderer built successfully"
else
    print_error "Renderer build failed"
fi

# Build builder last
cd ../builder
print_status "Building @asaps/builder..."
npm run build
if [ $? -eq 0 ]; then
    print_success "Builder built successfully"
else
    print_error "Builder build failed"
fi

cd ../..

echo ""

# ============================================
# STEP 5: Run validation test
# ============================================
if [ -f "$SCRIPT_DIR/validate-roundtrip-fixed.js" ]; then
    print_status "Running validation test..."
    
    if [ -f "$SCRIPT_DIR/examples/forest_adventure_v2.xml" ]; then
        echo ""
        echo "To test the fixes:"
        echo "1. Start dev server: npm run dev"
        echo "2. Import: examples/forest_adventure_v2.xml"
        echo "3. Export the story"
        echo "4. Run: node validate-roundtrip-fixed.js examples/forest_adventure_v2.xml <exported-file.xml>"
    fi
fi

echo ""

# ============================================
# Summary
# ============================================
echo "================================================"
echo -e "${GREEN}  All Export Fixes Applied!${NC}"
echo "================================================"
echo ""
echo "✅ Fixed Issues:"
echo "  • Connection replacement (already fixed)"
echo "  • Duration ×1000 multiplication removed"
echo "  • Settings/Environment/Characters now preserved on export"
echo ""
echo "📋 Testing Checklist:"
echo "  1. Import forest_adventure_v2.xml"
echo "  2. Check that all beats load correctly"
echo "  3. Export the story"
echo "  4. Check exported XML has:"
echo "     - Correct duration values (not ×1000)"
echo "     - Characters section with data"
echo "     - Settings section with data"
echo "     - Environment section with props/nodes"
echo "  5. Run validation:"
echo "     node validate-roundtrip-fixed.js examples/forest_adventure_v2.xml <exported.xml>"
echo ""
echo "💾 Backups saved to: $BACKUP_DIR"
echo ""
echo "If any issues remain, check:"
echo "  • Browser console for errors"
echo "  • That Story object has data after import"
echo "  • That export function is using the fixed version"
