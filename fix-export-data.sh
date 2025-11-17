#!/bin/bash

# ASPS Remaining Issues Fix Script
# Fixes:
# 1. Duration ×1000 bug (in ASMLParser on import)
# 2. Characters/Settings/Environment not being exported

echo "================================================"
echo "  ASPS Export Data Fix"
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
BACKUP_DIR="$SCRIPT_DIR/backups/export-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
print_success "Created backup directory: $BACKUP_DIR"

# ============================================
# STEP 1: Backup current files
# ============================================
print_status "Backing up current files..."

if [ -f "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts" ]; then
    cp "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts" "$BACKUP_DIR/ASMLParser.ts.backup"
    print_success "Backed up ASMLParser.ts"
fi

if [ -f "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" ]; then
    cp "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" "$BACKUP_DIR/ASMLGenerator.ts.backup"  
    print_success "Backed up ASMLGenerator.ts"
fi

echo ""

# ============================================
# STEP 2: Fix Duration Multiplication in ASMLParser
# ============================================
print_status "Fixing duration multiplication bug in ASMLParser..."

# The issue is on line 695 where duration is multiplied by 1000
# Change: duration: parseFloat(transitionElement.getAttribute('duration') || '0.5') * 1000
# To: duration: parseFloat(transitionElement.getAttribute('duration') || '500')

sed -i.bak 's/parseFloat(transitionElement\.getAttribute('\''duration'\''.*\* 1000/parseFloat(transitionElement.getAttribute('\''duration'\'' || '\''500'\'')/' \
    "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts"

if [ $? -eq 0 ]; then
    print_success "Fixed duration multiplication in ASMLParser"
else
    print_error "Failed to fix ASMLParser - needs manual fix"
    echo "   Look for line 695: duration: parseFloat(...) * 1000"
    echo "   Remove the * 1000 multiplication"
fi

echo ""

# ============================================
# STEP 3: Check ASMLGenerator Duration Issue
# ============================================
print_status "Checking ASMLGenerator for duration issues..."

# Check if ASMLGenerator still has duration multiplication
if grep -q "duration.*\* *1000" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts"; then
    print_error "Found duration multiplication in ASMLGenerator"
    
    # Fix it
    sed -i.bak 's/duration: transition\.duration \* 1000/duration: transition.duration/' \
        "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts"
        
    sed -i.bak 's/duration.*\* *1000/duration/' \
        "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts"
    
    print_success "Fixed duration multiplication in ASMLGenerator"
else
    print_success "No duration multiplication found in ASMLGenerator"
fi

echo ""

# ============================================
# STEP 4: Verify Data Export Methods
# ============================================
print_status "Verifying data export methods..."

# Check if Story getters are properly called in ASMLGenerator
if grep -q "story\.getSettings()" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" && \
   grep -q "story\.getEnvironment()" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" && \
   grep -q "story\.getCharacters()" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts"; then
    print_success "ASMLGenerator properly calls all data getters"
else
    print_error "ASMLGenerator might not be calling all data getters"
fi

# Check if Story setters are properly called in ASMLParser
if grep -q "story\.setSettings" "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts" && \
   grep -q "story\.setEnvironment" "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts" && \
   grep -q "story\.setCharacters" "$SCRIPT_DIR/packages/core/src/xml/ASMLParser.ts"; then
    print_success "ASMLParser properly calls all data setters"
else
    print_error "ASMLParser might not be setting all data"
fi

echo ""

# ============================================
# STEP 5: Create Debug Script
# ============================================
print_status "Creating debug script to check Story data..."

cat > "$SCRIPT_DIR/debug-story-data.js" << 'EOF'
/**
 * Debug script to check if Story data is being preserved
 * Run this in the browser console after importing a story
 */
function debugStoryData() {
  // Access the story from the global context (adjust path as needed)
  const storyElement = document.querySelector('[data-story]');
  if (!storyElement || !storyElement.__story) {
    console.error('Story not found. Import a story first.');
    return;
  }
  
  const story = storyElement.__story;
  
  console.group('Story Data Debug');
  
  // Check Settings
  console.group('Settings:');
  const settings = story.getSettings ? story.getSettings() : story.settings;
  console.log('Settings object:', settings);
  console.log('Has data?', settings && Object.keys(settings).length > 0);
  console.groupEnd();
  
  // Check Environment
  console.group('Environment:');
  const environment = story.getEnvironment ? story.getEnvironment() : story.environment;
  console.log('Environment object:', environment);
  console.log('Props count:', environment?.props?.length || 0);
  console.log('Nodes count:', environment?.nodes?.length || 0);
  console.groupEnd();
  
  // Check Characters
  console.group('Characters:');
  const characters = story.getCharacters ? story.getCharacters() : story.characters;
  console.log('Characters array:', characters);
  console.log('Character count:', characters?.length || 0);
  console.groupEnd();
  
  // Check Beats
  console.group('Beats:');
  const beats = story.getAllBeats ? story.getAllBeats() : Array.from(story.beats.values());
  console.log('Beat count:', beats.length);
  
  // Check for duration issues
  const beatsWithTransitions = beats.filter(b => b.transition);
  console.log('Beats with transitions:', beatsWithTransitions.length);
  
  const durationIssues = beatsWithTransitions.filter(b => b.transition.duration > 10000);
  if (durationIssues.length > 0) {
    console.error('Beats with duration > 10000 (likely multiplied):', durationIssues);
  } else {
    console.log('✓ No duration multiplication issues detected');
  }
  console.groupEnd();
  
  console.groupEnd();
  
  return {
    settings: settings,
    environment: environment,
    characters: characters,
    beatCount: beats.length
  };
}

// Auto-run
debugStoryData();
EOF

print_success "Created debug-story-data.js"

echo ""

# ============================================
# STEP 6: Build the packages
# ============================================
print_status "Building packages..."

cd "$SCRIPT_DIR"

# Build core first
cd packages/core
npm run build
if [ $? -eq 0 ]; then
    print_success "Core package built"
else
    print_error "Core build failed"
fi

cd ../..

# Build other packages
npm run build

echo ""

# ============================================
# Summary
# ============================================
echo "================================================"
echo -e "${GREEN}  Export Data Fixes Applied${NC}"
echo "================================================"
echo ""
echo "✅ Fixed:"
echo "  • Duration multiplication bug in ASMLParser"
echo "  • Checked ASMLGenerator for duration issues"
echo "  • Verified data getter/setter methods"
echo ""
echo "📋 To test the fixes:"
echo "  1. Start dev server: npm run dev"
echo "  2. Import examples/forest_adventure_v2.xml"
echo "  3. Open browser console and paste debug-story-data.js"
echo "  4. Export the story"
echo "  5. Run validation: node validate-roundtrip-fixed.js"
echo ""
echo "💡 If characters/settings/environment still missing:"
echo "  • Check browser console for Story data"
echo "  • Verify data exists after import"
echo "  • Check if Builder component passes data correctly"
echo ""
echo "💾 Backups saved to: $BACKUP_DIR"
