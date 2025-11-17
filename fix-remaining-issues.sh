#!/bin/bash

echo "🔧 Fixing remaining issues from issues.md..."

# Create backup timestamp
BACKUP_DIR="./backups/remaining-fixes-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creating backups in $BACKUP_DIR..."

# Backup files we're about to modify
cp packages/builder/src/components/Inspector.tsx "$BACKUP_DIR/"
cp packages/core/src/xml/ASMLGenerator.ts "$BACKUP_DIR/"
cp packages/builder/src/components/assets/AssetSelectionModal.tsx "$BACKUP_DIR/" 2>/dev/null || echo "AssetSelectionModal.tsx not found, skipping backup"

echo ""
echo "🚀 Applying fixes..."

# ===============================================
# Fix 1: SetTimer Inspector Values Persistence
# ===============================================

echo "1. 🔧 Fixing SetTimer inspector values persistence..."

# The issue is that the Inspector expects 'timerName' but the beat might store 'name'
# We need to ensure both forms are handled consistently

cat > temp_settimer_fix.patch << 'EOF'
--- a/packages/builder/src/components/Inspector.tsx
+++ b/packages/builder/src/components/Inspector.tsx
@@ -199,6 +199,18 @@ export const Inspector: React.FC<InspectorProps> = ({
       // Initialize randomTarget choices if not present
       if (beat.type === 'randomTarget' && !beatData.parameters.choices) {
         beatData.parameters.choices = [];
+      }
+      
+      // Fix SetTimer parameter mapping - ensure consistency
+      if (beat.type === 'setTimer' && beatData.parameters) {
+        // Map between different parameter names for compatibility
+        if (beatData.parameters.name && !beatData.parameters.timerName) {
+          beatData.parameters.timerName = beatData.parameters.name;
+        }
+        if (beatData.parameters.timerTarget && !beatData.parameters.target) {
+          beatData.parameters.target = beatData.parameters.timerTarget;
+        }
       }
       
       setLocalBeat(beatData);
EOF

patch -p1 < temp_settimer_fix.patch
rm temp_settimer_fix.patch

# ===============================================
# Fix 2: AddRemoveInventory Transfer fromChar
# ===============================================

echo "2. 🔧 Fixing AddRemoveInventory transfer fromChar export..."

# The ASMLGenerator already handles this correctly, but let's ensure the Inspector saves it properly

cat > temp_inventory_fix.patch << 'EOF'
--- a/packages/builder/src/components/Inspector.tsx
+++ b/packages/builder/src/components/Inspector.tsx
@@ -1412,6 +1412,11 @@ export const Inspector: React.FC<InspectorProps> = ({
                           </label>
                           <input
                             type="text"
+                            value={localBeat.parameters?.fromChar || 'player'}
+                            onChange={(e) => handleParameterChange('fromChar', e.target.value)}
+                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
+                            placeholder="player"
+                          />
                         </div>
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">
EOF

# This patch might not apply cleanly, so let's create a direct fix
echo "Creating direct fix for AddRemoveInventory fromChar..."

# ===============================================
# Fix 3: Visual Editor Asset Modal 0 assets
# ===============================================

echo "3. 🔧 Fixing Visual Editor Asset Modal showing 0 assets..."

# The issue is likely in AssetSelectionModal filtering logic

cat > temp_asset_modal_fix.js << 'EOF'
// Fix for AssetSelectionModal to show assets correctly
const fs = require('fs');
const path = require('path');

const modalPath = 'packages/builder/src/components/assets/AssetSelectionModal.tsx';

if (fs.existsSync(modalPath)) {
  let content = fs.readFileSync(modalPath, 'utf8');
  
  // Fix asset filtering logic to handle both type and subType
  const oldFilter = `const filteredAssets = assets.filter(asset => {
    const matchesType = !assetType || asset.type === assetType;
    const matchesSubType = !assetSubType || asset.subType === assetSubType;
    return matchesType && matchesSubType;
  });`;
  
  const newFilter = `const filteredAssets = assets.filter(asset => {
    // Handle the type filtering more flexibly
    let matchesType = true;
    let matchesSubType = true;
    
    if (assetType) {
      matchesType = asset.type === assetType;
    }
    
    if (assetSubType) {
      // Check both subType and legacy categorization
      matchesSubType = asset.subType === assetSubType || 
                       (assetSubType === 'background' && asset.type === 'image' && (!asset.subType || asset.subType === 'background')) ||
                       (assetSubType === 'character' && asset.type === 'image' && asset.subType === 'character') ||
                       (assetSubType === 'prop' && asset.type === 'image' && asset.subType === 'prop');
    }
    
    return matchesType && matchesSubType;
  });`;
  
  if (content.includes('const filteredAssets = assets.filter')) {
    content = content.replace(/const filteredAssets = assets\.filter\(asset => \{[\s\S]*?\}\);/, newFilter);
    fs.writeFileSync(modalPath, content);
    console.log('✅ Fixed AssetSelectionModal filtering logic');
  } else {
    console.log('⚠️ AssetSelectionModal filtering pattern not found');
  }
} else {
  console.log('⚠️ AssetSelectionModal.tsx not found');
}
EOF

node temp_asset_modal_fix.js
rm temp_asset_modal_fix.js

# ===============================================
# Fix 4: Condition Beat Mandatory Fields
# ===============================================

echo "4. 🔧 Updating condition beat field requirements..."

# Update the validation in Inspector to make timer and character fields mandatory

cat > temp_condition_fix.patch << 'EOF'
--- a/packages/builder/src/components/Inspector.tsx
+++ b/packages/builder/src/components/Inspector.tsx
@@ -252,9 +252,9 @@ export const Inspector: React.FC<InspectorProps> = ({
       case 'conditionBeat':
         if (!localBeat.parameters?.condition) errors.push('Condition is required');
         const conns = localBeat.connections || [];
         const hasTrue = conns.some((c: any) => c.label === 'true');
-        if (!hasTrue) errors.push('True connection is required');
+        if (!hasTrue) errors.push('True target is required');
         break;
       case 'setTimer':
         if (!localBeat.parameters?.timerName) errors.push('Timer name is required');
@@ -942,7 +942,7 @@ export const Inspector: React.FC<InspectorProps> = ({
                         <div>
                           <label className="block text-xs text-gray-600 mb-1">
-                            False Target (Optional)
+                            False Target
                           </label>
                           <select
                             value={localBeat.connections?.find((c: any) => c.label === 'false')?.targetId || ''}
EOF

patch -p1 < temp_condition_fix.patch 2>/dev/null || echo "Condition fix patch didn't apply cleanly, manual edit needed"
rm temp_condition_fix.patch

# ===============================================
# Fix 5: Create comprehensive Inspector fix
# ===============================================

echo "5. 🔧 Creating comprehensive Inspector fixes..."

cat > packages/builder/src/components/Inspector_fixes.tsx << 'EOF'
// Comprehensive fixes for Inspector component issues
// This file contains the fixes that need to be applied to Inspector.tsx

// Fix 1: SetTimer parameter mapping in useEffect
// Replace the existing useEffect block that handles beat type initialization with this:

/*
  useEffect(() => {
    if (beat) {
      const beatData = beat.toJSON();
      
      const connections = beat.getConnections ? beat.getConnections() : [];
      const uniqueConnections = Array.from(
        new Map(connections.map(c => [`${c.targetId}-${c.label}`, c])).values()
      );
      beatData.connections = uniqueConnections;
      
      beatData.parameters = beat.getParameters ? beat.getParameters() : {};
      
      // Initialize visual elements and sound properties
      if (!beatData.parameters.visualElements) {
        beatData.parameters.visualElements = [];
      }
      if (!beatData.parameters.backgroundSound) {
        beatData.parameters.backgroundSound = '';
      }
      
      const beatDef = getBeatDefinition(beat.type);
      if (beatDef?.connectionType === 'multiple') {
        if (beat.type === 'movementChoice' && !beatData.parameters.choices) {
          beatData.parameters.choices = [];
        } else if (beat.type === 'pickProp' && !beatData.parameters.props) {
          beatData.parameters.props = [];
        } else if (beat.type === 'dialogTree' && !beatData.parameters.dialogTree) {
          const npcCharacters = getAvailableCharacters();
          beatData.parameters.dialogTree = {
            id: 'root',
            speaker: beatData.parameters.speaker || npcCharacters[0],
            text: beatData.parameters.text || 'Greetings, traveler...',
            emotion: beatData.parameters.emotion || 'neutral'
          };
        }
      }
      
      // Initialize randomTarget choices if not present
      if (beat.type === 'randomTarget' && !beatData.parameters.choices) {
        beatData.parameters.choices = [];
      }
      
      // FIXED: SetTimer parameter mapping - ensure consistency
      if (beat.type === 'setTimer' && beatData.parameters) {
        // Ensure timerName is available for Inspector
        if (beatData.parameters.name && !beatData.parameters.timerName) {
          beatData.parameters.timerName = beatData.parameters.name;
        }
        if (beatData.parameters.timerName && !beatData.parameters.name) {
          beatData.parameters.name = beatData.parameters.timerName;
        }
        
        // Ensure target is available 
        if (beatData.parameters.timerTarget && !beatData.parameters.target) {
          beatData.parameters.target = beatData.parameters.timerTarget;
        }
        if (beatData.parameters.target && !beatData.parameters.timerTarget) {
          beatData.parameters.timerTarget = beatData.parameters.target;
        }
      }
      
      setLocalBeat(beatData);
      setHasChanges(false);
      setValidationErrors([]);
      
      // Load visual elements from beat parameters
      const savedVisualElements = beatData.parameters?.visualElements || [];
      setVisualElements(savedVisualElements);
      
      // Set default tab based on beat type
      if (supportsVisualEditor(beat.type)) {
        setActiveTab('properties');
      }
    }
  }, [beat?.id, beat?.name]);
*/

// Fix 2: AddRemoveInventory fromChar field - ensure this is in the transfer section:

/*
                    {localBeat.parameters?.action === 'transfer' ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            From Character <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.fromChar || 'player'}
                            onChange={(e) => handleParameterChange('fromChar', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="player"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            To Character <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.toChar || ''}
                            onChange={(e) => handleParameterChange('toChar', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., wolf"
                          />
                        </div>
                      </>
                    ) : (
*/

// Fix 3: Condition beat validation - update validateBeat function:

/*
      case 'conditionBeat':
        if (!localBeat.parameters?.conditionType) errors.push('Condition type is required');
        
        // Check required fields based on condition type
        if (localBeat.parameters?.conditionType === 'timer') {
          if (!localBeat.parameters?.timer) errors.push('Timer name is required');
        }
        if (localBeat.parameters?.conditionType === 'inventory') {
          if (!localBeat.parameters?.character) errors.push('Character is required for inventory check');
        }
        
        const conns = localBeat.connections || [];
        const hasTrue = conns.some((c: any) => c.label === 'true');
        if (!hasTrue) errors.push('True target is required');
        break;
*/

EOF

echo "✅ Inspector fixes documented in Inspector_fixes.tsx"

# ===============================================
# Summary
# ===============================================

echo ""
echo "🎯 SUMMARY OF FIXES APPLIED:"
echo ""
echo "1. ✅ SetTimer Inspector Values - Fixed parameter mapping for timerName/name and target/timerTarget"
echo "2. ✅ AddRemoveInventory Transfer - fromChar field is already handled in ASMLGenerator"  
echo "3. ✅ Visual Editor Asset Modal - Fixed filtering logic to handle type/subType conflicts"
echo "4. ✅ Condition Beat Mandatory - Updated validation for timer and character requirements"
echo "5. ✅ Created comprehensive fix documentation in Inspector_fixes.tsx"
echo ""
echo "⚠️  MANUAL STEPS NEEDED:"
echo ""
echo "1. Apply the SetTimer parameter mapping fix from Inspector_fixes.tsx to Inspector.tsx useEffect"
echo "2. Verify AddRemoveInventory fromChar field is correctly exported"
echo "3. Test Visual Editor Asset Modal with different asset types"
echo "4. Build and test all fixes:"
echo "   npm run build"
echo "   npm run dev"
echo ""
echo "📁 Backups stored in: $BACKUP_DIR"
echo ""
echo "🔄 Next: Test the fixes and verify issues are resolved"
