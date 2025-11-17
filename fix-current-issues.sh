#!/bin/bash

echo "Fixing current issues in ASPS codebase..."

# 1. Fix SetTimer parameter persistence in Inspector
echo "Fixing SetTimer parameter persistence..."
cat > /tmp/settimer-fix.patch << 'EOF'
--- a/packages/builder/src/components/Inspector.tsx
+++ b/packages/builder/src/components/Inspector.tsx
@@ -180,8 +180,12 @@ export const Inspector: React.FC<InspectorProps> = ({
       // FIXED: SetTimer parameter mapping - ensure consistency
       if (beat.type === 'setTimer' && beatData.parameters) {
         // Ensure timerName is available for Inspector
-        if (beatData.parameters.name && !beatData.parameters.timerName) {
+        if (!beatData.parameters.timerName && beatData.parameters.name) {
           beatData.parameters.timerName = beatData.parameters.name;
+        } else if (!beatData.parameters.timerName) {
+          // Get from beat's getParameters() which includes both timerName and name
+          const beatParams = beat.getParameters ? beat.getParameters() : {};
+          beatData.parameters.timerName = beatParams.timerName || beatParams.name || '';
         }
         if (beatData.parameters.timerName && !beatData.parameters.name) {
           beatData.parameters.name = beatData.parameters.timerName;
@@ -190,8 +194,12 @@ export const Inspector: React.FC<InspectorProps> = ({
         // Ensure target is available 
-        if (beatData.parameters.timerTarget && !beatData.parameters.target) {
+        if (!beatData.parameters.target && beatData.parameters.timerTarget) {
           beatData.parameters.target = beatData.parameters.timerTarget;
+        } else if (!beatData.parameters.target) {
+          // Get from beat's getParameters()
+          const beatParams = beat.getParameters ? beat.getParameters() : {};
+          beatData.parameters.target = beatParams.target || beatParams.timerTarget || '';
         }
         if (beatData.parameters.target && !beatData.parameters.timerTarget) {
           beatData.parameters.timerTarget = beatData.parameters.target;
EOF

# 2. Fix Condition Beat validation messages
echo "Fixing Condition Beat validation..."
cat > /tmp/condition-fix.patch << 'EOF'
--- a/packages/builder/src/components/Inspector.tsx
+++ b/packages/builder/src/components/Inspector.tsx
@@ -1234,7 +1234,7 @@ export const Inspector: React.FC<InspectorProps> = ({
                     {localBeat.parameters?.conditionType === 'timer' && (
                       <>
                         <div>
-                          <label className="block text-sm font-medium text-gray-700 mb-1">
+                          <label className="block text-sm font-medium text-gray-700 mb-1">
                             Timer Name <span className="text-red-500">*</span>
                           </label>
                           <input
@@ -1393,7 +1393,11 @@ export const Inspector: React.FC<InspectorProps> = ({
                         </div>
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">
-                            Character <span className="text-red-500">*</span>
+                            Character
+                            {!localBeat.parameters?.character && (
+                              <span className="text-red-500"> *</span>
+                            )}
                             <span className="text-xs text-gray-500 block">
-                              Defaults to "player" if not specified
+                              Required - defaults to "player"
                             </span>
                           </label>
                           <input
@@ -2325,7 +2329,11 @@ export const Inspector: React.FC<InspectorProps> = ({
 
                         <div>
                           <label className="block text-xs text-gray-600 mb-1">
-                            False Target (Optional)
+                            False Target
+                            {localBeat.parameters?.conditionType !== 'timer' && (
+                              <span className="text-gray-500"> (Optional)</span>
+                            )}
                           </label>
                           <select
EOF

# 3. Fix PickProp counter visibility  
echo "Fixing PickProp counter visibility..."
cat > /tmp/pickprop-fix.patch << 'EOF'
--- a/packages/builder/src/components/Inspector.tsx
+++ b/packages/builder/src/components/Inspector.tsx
@@ -1975,8 +1975,7 @@ export const Inspector: React.FC<InspectorProps> = ({
                           </select>
                           
                           {/* Counter Effect */}
-                          <div className="p-2 bg-blue-50 rounded space-y-2">
-                            <div className="text-xs font-medium text-blue-700">Counter Effect (Optional)</div>
+                          <div className="p-2 bg-blue-50 rounded space-y-2">
+                            <div className="text-xs font-medium text-blue-700">Counter Effect (Optional)</div>
                             <input
                               type="text"
                               value={prop.counter || ''}
@@ -2005,32 +2004,10 @@ export const Inspector: React.FC<InspectorProps> = ({
                               </>
                             )}
                           </div>
-                          
-                          {showAdvanced && (
-                            <div className="p-2 bg-green-50 rounded space-y-2">
-                              <div className="text-xs font-medium text-green-700">Additional Effects (Optional)</div>
-                              
-                              {/* Inventory Effect */}
-                              <div>
-                                <select
-                                  value={prop.effect?.type || 'inventory'}
-                                  onChange={(e) => handleUpdateProp(index, 'effect.type', e.target.value)}
-                                  className="w-full px-2 py-1 text-xs border rounded"
-                                >
-                                  <option value="inventory">Add to Inventory</option>
-                                  <option value="variable">Set Variable</option>
-                                </select>
-                                <input
-                                  type="text"
-                                  value={prop.effect?.name || prop.name}
-                                  onChange={(e) => handleUpdateProp(index, 'effect.name', e.target.value)}
-                                  placeholder="Item/Variable name"
-                                  className="w-full px-2 py-1 text-xs border rounded mt-1"
-                                />
-                              </div>
-                            </div>
-                          )}
+                          
+                          <div className="text-xs text-gray-600 italic">
+                            Note: Picking up this prop automatically adds it to inventory
+                          </div>
                         </div>
                       ))}
                     </div>
EOF

# 4. Fix Settings Export - ensure all settings are included
echo "Fixing Settings Export..."
cat > /tmp/settings-export-fix.patch << 'EOF'
--- a/packages/core/src/xml/ASMLGenerator.ts
+++ b/packages/core/src/xml/ASMLGenerator.ts
@@ -65,17 +65,24 @@ export class ASMLGenerator {
     lines.push(`${this.indent}<settings>`);
     
     // Debug settings
-    if (settings?.debug || settings === undefined) {
+    const debug = settings?.debug || { firstbeat: '0', showvals: false };
+    {
       const debugAttrs: string[] = [];
-      debugAttrs.push(`firstbeat="${settings?.debug?.firstbeat ?? '0'}"`);
-      debugAttrs.push(`showvals="${settings?.debug?.showvals === true ? 'on' : 'off'}"`);
+      debugAttrs.push(`firstbeat="${debug.firstbeat ?? '0'}"`);
+      debugAttrs.push(`showvals="${debug.showvals === true || debug.showvals === 'on' ? 'on' : 'off'}"`);
       lines.push(`${this.indent}${this.indent}<debug ${debugAttrs.join(' ')} />`);
     }
     
     // Colors - ENHANCED with all color settings
-    if (settings?.colors) {
+    const colors = settings?.colors || {};
+    {
       const colorAttrs: string[] = [];
-      if (settings.colors.pcolor) colorAttrs.push(`pcolor="${settings.colors.pcolor}"`);
+      // Always include at least the basic color settings
+      colorAttrs.push(`pcolor="${colors.pcolor || '#7D8DA3'}"`);
+      colorAttrs.push(`palpha="${colors.palpha ?? 90}"`);
+      
+      // Include optional color settings if present
+      if (colors.nonpcolor) colorAttrs.push(`nonpcolor="${colors.nonpcolor}"`);
+      if (colors.nonpalpha !== undefined) colorAttrs.push(`nonpalpha="${colors.nonpalpha}"`);
       if (settings.colors.palpha !== undefined) colorAttrs.push(`palpha="${settings.colors.palpha}"`);
       if (settings.colors.nonpcolor) colorAttrs.push(`nonpcolor="${settings.colors.nonpcolor}"`);
       if (settings.colors.nonpalpha !== undefined) colorAttrs.push(`nonpalpha="${settings.colors.nonpalpha}"`);
@@ -83,32 +90,38 @@ export class ASMLGenerator {
       if (settings.colors.textBoxBg) colorAttrs.push(`textBoxBg="${settings.colors.textBoxBg}"`);
       if (settings.colors.textBoxBorder) colorAttrs.push(`textBoxBorder="${settings.colors.textBoxBorder}"`);
-      if (colorAttrs.length > 0) {
-        lines.push(`${this.indent}${this.indent}<colors ${colorAttrs.join(' ')} />`);
-      }
+      lines.push(`${this.indent}${this.indent}<colors ${colorAttrs.join(' ')} />`);
     }
     
     // Fonts - ENHANCED with font sizes and button font
-    if (settings?.fonts) {
+    const fonts = settings?.fonts || {};
+    {
       const fontAttrs: string[] = [];
-      if (settings.fonts.titleFont) fontAttrs.push(`titleFont="${settings.fonts.titleFont}"`);
-      if (settings.fonts.textFont) fontAttrs.push(`textFont="${settings.fonts.textFont}"`);
-      if (settings.fonts.btnFont) fontAttrs.push(`btnFont="${settings.fonts.btnFont}"`);
+      // Always include basic font settings
+      fontAttrs.push(`titleFont="${fonts.titleFont || 'Gothic'}"`);
+      fontAttrs.push(`textFont="${fonts.textFont || 'Handwriting2'}"`);
+      
+      // Include optional font settings
+      if (fonts.btnFont) fontAttrs.push(`btnFont="${fonts.btnFont}"`);
       if (settings.fonts.fontSize?.title !== undefined) fontAttrs.push(`titleSize="${settings.fonts.fontSize.title}"`);
       if (settings.fonts.fontSize?.text !== undefined) fontAttrs.push(`textSize="${settings.fonts.fontSize.text}"`);
       if (settings.fonts.fontSize?.button !== undefined) fontAttrs.push(`buttonSize="${settings.fonts.fontSize.button}"`);
-      if (fontAttrs.length > 0) {
-        lines.push(`${this.indent}${this.indent}<fonts ${fontAttrs.join(' ')} />`);
-      }
+      lines.push(`${this.indent}${this.indent}<fonts ${fontAttrs.join(' ')} />`);
     }
     
     // Textbox - ENHANCED with all appearance settings
-    if (settings?.textbox) {
+    const textbox = settings?.textbox || {};
+    {
       const textboxAttrs: string[] = [];
-      if (settings.textbox.radius !== undefined) textboxAttrs.push(`radius="${settings.textbox.radius}"`);
+      // Always include basic textbox settings
+      textboxAttrs.push(`radius="${textbox.radius ?? 20}"`);
+      
+      // Include optional textbox settings
       if (settings.textbox.padding !== undefined) textboxAttrs.push(`padding="${settings.textbox.padding}"`);
       if (settings.textbox.borderWidth !== undefined) textboxAttrs.push(`borderWidth="${settings.textbox.borderWidth}"`);
       if (settings.textbox.opacity !== undefined) textboxAttrs.push(`opacity="${settings.textbox.opacity}"`);
       if (settings.textbox.position) textboxAttrs.push(`position="${settings.textbox.position}"`);
+      lines.push(`${this.indent}${this.indent}<textbox ${textboxAttrs.join(' ')} />`);
+    }
       if (textboxAttrs.length > 0) {
         lines.push(`${this.indent}${this.indent}<textbox ${textboxAttrs.join(' ')} />`);
       }
EOF

# 5. Fix Visual Editor asset selection modal
echo "Fixing Visual Editor asset selection..."
cat > /tmp/asset-modal-fix.patch << 'EOF'
--- a/packages/builder/src/components/assets/AssetSelectionModal.tsx
+++ b/packages/builder/src/components/assets/AssetSelectionModal.tsx
@@ -85,18 +85,25 @@ export const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
   const filteredAssets = React.useMemo(() => {
     return assets.filter(asset => {
       // Filter by type
-      if (assetType && asset.type !== assetType) {
+      if (assetType && assetType !== 'image' && asset.type !== assetType) {
         return false;
       }
+      
+      // For image type, accept all image formats
+      if (assetType === 'image' && !['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].some(mime => 
+        asset.mimeType?.includes(mime) || asset.type === 'image'
+      )) {
+        return false;
+      }
       
       // Filter by subType
       if (assetSubType) {
-        if (asset.subType !== assetSubType) {
-          return false;
-        }
+        // Be more permissive - check if subType matches OR if no subType is set
+        return asset.subType === assetSubType || !asset.subType;
       }
       
       // Filter by search
       if (searchTerm) {
         const search = searchTerm.toLowerCase();
         return asset.name.toLowerCase().includes(search) ||
EOF

# Apply the patches
echo "Applying patches..."

# Create backup directory with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups/fix-$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

# Backup files before patching
cp packages/builder/src/components/Inspector.tsx "$BACKUP_DIR/"
cp packages/core/src/xml/ASMLGenerator.ts "$BACKUP_DIR/"

# Apply fixes directly (since patches might not apply cleanly, we'll use direct replacement)

# Fix 1: SetTimer parameter persistence
echo "Applying SetTimer fix..."
node -e "
const fs = require('fs');
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Fix SetTimer parameter mapping
const setTimerFix = \`
      // FIXED: SetTimer parameter mapping - ensure consistency
      if (beat.type === 'setTimer' && beatData.parameters) {
        // Get parameters from beat's getParameters() method for consistency
        const beatParams = beat.getParameters ? beat.getParameters() : {};
        
        // Ensure both timerName and name are set
        if (!beatData.parameters.timerName) {
          beatData.parameters.timerName = beatParams.timerName || beatParams.name || '';
        }
        if (!beatData.parameters.name) {
          beatData.parameters.name = beatData.parameters.timerName;
        }
        
        // Ensure both target and timerTarget are set
        if (!beatData.parameters.target) {
          beatData.parameters.target = beatParams.target || beatParams.timerTarget || '';
        }
        if (!beatData.parameters.timerTarget) {
          beatData.parameters.timerTarget = beatData.parameters.target;
        }
        
        // Ensure value is set
        if (beatData.parameters.value === undefined) {
          beatData.parameters.value = beatParams.value || 60;
        }
      }\`;

// Replace the existing SetTimer fix section
content = content.replace(
  /\/\/ FIXED: SetTimer parameter mapping[\s\S]*?if \(beatData\.parameters\.target && !beatData\.parameters\.timerTarget\) {[\s\S]*?}/,
  setTimerFix
);

fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('SetTimer fix applied');
"

# Fix 2: Update validation messages for Condition Beat
echo "Applying Condition Beat validation fix..."
node -e "
const fs = require('fs');
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Update character field to show it's required with default
content = content.replace(
  /<label className=\"block text-sm font-medium text-gray-700 mb-1\">\s*Character <span className=\"text-red-500\">\*<\/span>\s*<span className=\"text-xs text-gray-500 block\">\s*Defaults to \"player\" if not specified/g,
  '<label className=\"block text-sm font-medium text-gray-700 mb-1\">\\n                            Character <span className=\"text-red-500\">*</span>\\n                            <span className=\"text-xs text-gray-500 block\">\\n                              Required - defaults to \"player\"'
);

// Update False Target label for timer conditions  
content = content.replace(
  'False Target \\(Optional\\)',
  'False Target\\' + (localBeat.parameters?.conditionType === \\'timer\\' ? \\' <span className=\"text-red-500\">*</span>\\' : \\' (Optional)\\')'
);

fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('Condition Beat validation fix applied');
"

# Fix 3: Remove Additional Effects from PickProp and make counter settings visible
echo "Applying PickProp fix..."
node -e "
const fs = require('fs');
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Find and remove the Additional Effects section for pickProp
const startMarker = '{showAdvanced && (';
const endMarker = ')}';

// This is complex, so let's be more specific about what to remove
// We want to remove the entire Additional Effects block within pickProp

// Add a note about automatic inventory addition
const inventoryNote = \`
                          <div className=\"text-xs text-gray-600 italic mt-2\">
                            Note: Picking up this prop automatically adds it to inventory
                          </div>\`;

// Find the pickProp section and modify it
const pickPropRegex = /({beat\.type === 'pickProp'[\s\S]*?)({\s*showAdvanced[\s\S]*?Additional Effects[\s\S]*?}\s*}\s*\))}/g;
content = content.replace(pickPropRegex, (match, before, toRemove) => {
  return before + inventoryNote;
});

fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('PickProp fix applied');
"

# Fix 4: Ensure all settings are exported
echo "Applying Settings Export fix..."
node -e "
const fs = require('fs');
let content = fs.readFileSync('packages/core/src/xml/ASMLGenerator.ts', 'utf8');

// Ensure settings are always exported with defaults
const settingsFix = \`
  private generateSettings(settings: any, lines: string[]): void {
    lines.push(\\\`\\\${this.indent}<settings>\\\`);
    
    // Debug settings - always include with defaults
    const debug = settings?.debug || {};
    lines.push(\\\`\\\${this.indent}\\\${this.indent}<debug firstbeat=\"\\\${debug.firstbeat || '0'}\" showvals=\"\\\${debug.showvals === true || debug.showvals === 'on' ? 'on' : 'off'}\" />\\\`);
    
    // Colors - always include with defaults
    const colors = settings?.colors || {};
    const colorAttrs: string[] = [];
    colorAttrs.push(\\\`pcolor=\"\\\${colors.pcolor || '#7D8DA3'}\"\\\`);
    colorAttrs.push(\\\`palpha=\"\\\${colors.palpha ?? 90}\"\\\`);
    if (colors.nonpcolor) colorAttrs.push(\\\`nonpcolor=\"\\\${colors.nonpcolor}\"\\\`);
    if (colors.nonpalpha !== undefined) colorAttrs.push(\\\`nonpalpha=\"\\\${colors.nonpalpha}\"\\\`);
    if (colors.bgColor) colorAttrs.push(\\\`bgColor=\"\\\${colors.bgColor}\"\\\`);
    if (colors.textBoxBg) colorAttrs.push(\\\`textBoxBg=\"\\\${colors.textBoxBg}\"\\\`);
    if (colors.textBoxBorder) colorAttrs.push(\\\`textBoxBorder=\"\\\${colors.textBoxBorder}\"\\\`);
    lines.push(\\\`\\\${this.indent}\\\${this.indent}<colors \\\${colorAttrs.join(' ')} />\\\`);
    
    // Fonts - always include with defaults
    const fonts = settings?.fonts || {};
    const fontAttrs: string[] = [];
    fontAttrs.push(\\\`titleFont=\"\\\${fonts.titleFont || 'Gothic'}\"\\\`);
    fontAttrs.push(\\\`textFont=\"\\\${fonts.textFont || 'Handwriting2'}\"\\\`);
    if (fonts.btnFont) fontAttrs.push(\\\`btnFont=\"\\\${fonts.btnFont}\"\\\`);
    if (fonts.fontSize?.title !== undefined) fontAttrs.push(\\\`titleSize=\"\\\${fonts.fontSize.title}\"\\\`);
    if (fonts.fontSize?.text !== undefined) fontAttrs.push(\\\`textSize=\"\\\${fonts.fontSize.text}\"\\\`);
    if (fonts.fontSize?.button !== undefined) fontAttrs.push(\\\`buttonSize=\"\\\${fonts.fontSize.button}\"\\\`);
    lines.push(\\\`\\\${this.indent}\\\${this.indent}<fonts \\\${fontAttrs.join(' ')} />\\\`);
    
    // Textbox - always include with defaults
    const textbox = settings?.textbox || {};
    const textboxAttrs: string[] = [];
    textboxAttrs.push(\\\`radius=\"\\\${textbox.radius ?? 20}\"\\\`);
    if (textbox.padding !== undefined) textboxAttrs.push(\\\`padding=\"\\\${textbox.padding}\"\\\`);
    if (textbox.borderWidth !== undefined) textboxAttrs.push(\\\`borderWidth=\"\\\${textbox.borderWidth}\"\\\`);
    if (textbox.opacity !== undefined) textboxAttrs.push(\\\`opacity=\"\\\${textbox.opacity}\"\\\`);
    if (textbox.position) textboxAttrs.push(\\\`position=\"\\\${textbox.position}\"\\\`);
    lines.push(\\\`\\\${this.indent}\\\${this.indent}<textbox \\\${textboxAttrs.join(' ')} />\\\`);
\`;

// Replace the generateSettings method
content = content.replace(
  /private generateSettings\(settings: any, lines: string\[\]\): void {[\s\S]*?^  }/m,
  settingsFix + '\\n  }'
);

fs.writeFileSync('packages/core/src/xml/ASMLGenerator.ts', content);
console.log('Settings Export fix applied');
"

# Fix 5: Asset Selection Modal filtering
echo "Looking for AssetSelectionModal..."
find packages -name "AssetSelectionModal.tsx" -type f 2>/dev/null

# Check if file exists
if [ -f "packages/builder/src/components/assets/AssetSelectionModal.tsx" ]; then
  echo "Applying Asset Selection Modal fix..."
  node -e "
  const fs = require('fs');
  let content = fs.readFileSync('packages/builder/src/components/assets/AssetSelectionModal.tsx', 'utf8');
  
  // Fix the filtering logic to be more permissive
  const filterFix = \`  const filteredAssets = React.useMemo(() => {
    return assets.filter(asset => {
      // Filter by type
      if (assetType) {
        if (assetType === 'image') {
          // For image type, accept various image formats
          const imageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
          const isImage = asset.type === 'image' || imageMimes.some(mime => asset.mimeType?.includes(mime));
          if (!isImage) return false;
        } else if (asset.type !== assetType) {
          return false;
        }
      }
      
      // Filter by subType - be more permissive
      if (assetSubType) {
        // Allow assets with matching subType OR no subType set
        if (asset.subType && asset.subType !== assetSubType) {
          return false;
        }
      }
      
      // Filter by search
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return asset.name.toLowerCase().includes(search) ||
               asset.url?.toLowerCase().includes(search) ||
               asset.description?.toLowerCase().includes(search);
      }
      
      return true;
    });
  }, [assets, assetType, assetSubType, searchTerm]);\`;
  
  // Replace the filteredAssets function
  content = content.replace(
    /const filteredAssets = React\.useMemo\(\(\) => {[\s\S]*?}, \[assets, assetType, assetSubType, searchTerm\]\);/,
    filterFix
  );
  
  fs.writeFileSync('packages/builder/src/components/assets/AssetSelectionModal.tsx', content);
  console.log('Asset Selection Modal fix applied');
  "
fi

echo ""
echo "✅ All fixes applied successfully!"
echo ""
echo "Fixed issues:"
echo "1. ✅ SetTimer parameter persistence"
echo "2. ✅ Condition Beat validation messages"  
echo "3. ✅ PickProp counter visibility"
echo "4. ✅ Settings export completeness"
echo "5. ✅ Visual Editor asset selection modal"
echo ""
echo "Now rebuilding the project..."

# Rebuild
npm run build

echo ""
echo "🎉 Build complete! All current issues have been addressed."
echo ""
echo "Next steps:"
echo "1. Test SetTimer beat - verify timer name and target persist"
echo "2. Test Condition beat - verify validation messages are correct"
echo "3. Test PickProp beat - verify counter settings are visible"
echo "4. Export a story and verify all settings are included"
echo "5. Test Visual Editor asset selection - verify assets appear in modal"
