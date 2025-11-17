#!/bin/bash

echo "🔧 Applying AssetSelectionModal Fix"
echo "=================================="
echo ""

TARGET_FILE="packages/builder/src/components/assets/AssetSelectionModal.tsx"
FIXED_FILE="AssetSelectionModal_FIXED.tsx"
BACKUP_FILE="AssetSelectionModal_BACKUP_$(date +%Y%m%d_%H%M%S).tsx"

# Check if files exist
if [ ! -f "$TARGET_FILE" ]; then
    echo "❌ Target file not found: $TARGET_FILE"
    exit 1
fi

if [ ! -f "$FIXED_FILE" ]; then
    echo "❌ Fixed file not found: $FIXED_FILE"
    exit 1
fi

echo "📦 Creating backup..."
cp "$TARGET_FILE" "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"

echo ""
echo "🔧 Applying fix..."

# Try to copy the fixed file
if cp "$FIXED_FILE" "$TARGET_FILE" 2>/dev/null; then
    echo "✅ Fix applied successfully!"
    echo ""
    echo "📋 What was fixed:"
    echo "   - Enhanced asset filtering with fallback logic"
    echo "   - Background detection: JPG/JPEG files OR name contains 'bg'/'background'"
    echo "   - Character detection: PNG files OR name contains 'char'/'character'"
    echo "   - Prop detection: PNG files OR name contains 'prop'/'item'"
    echo "   - Sound detection: Any audio file"
    echo "   - More permissive type matching"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Build the project: npm run build"
    echo "   2. Test asset modal: npm run dev"
    echo "   3. Verify assets show up correctly in Visual Editor"
else
    echo "❌ Permission denied. Manual fix required."
    echo ""
    echo "🔧 MANUAL FIX INSTRUCTIONS:"
    echo ""
    echo "1. Open in your editor:"
    echo "   $TARGET_FILE"
    echo ""
    echo "2. Find this section (around lines 34-47):"
    echo "   // Enhanced filtering based on type, subtype, and search"
    echo "   const filteredAssets = assets.filter(asset => {"
    echo ""
    echo "3. Replace the entire filtering block with the enhanced version from:"
    echo "   $FIXED_FILE"
    echo ""
    echo "4. Look for the comment '// FIXED: Enhanced filtering' in the fixed file"
    echo "   and copy that entire filteredAssets function"
    echo ""
    echo "5. The key improvement is more permissive filtering that checks:"
    echo "   - File extensions (.jpg/.jpeg for backgrounds, .png for characters/props)"
    echo "   - Asset subType property"
    echo "   - Filename patterns (bg, background, char, character, prop, item)"
    echo ""
    echo "📁 Files available:"
    echo "   - Original (to edit): $TARGET_FILE"
    echo "   - Fixed version (to copy from): $FIXED_FILE"
    echo "   - Backup: $BACKUP_FILE"
fi

echo ""
echo "✅ Fix procedure complete!"
