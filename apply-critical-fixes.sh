#!/bin/bash

echo "================================================"
echo "ASPS MODERN - CRITICAL ISSUES FIX SCRIPT"
echo "================================================"
echo ""
echo "This script will help restore the lost functionality:"
echo "1. Connection settings in Inspector"
echo "2. Button text inputs"
echo "3. Settings/Environment/Characters export"
echo "4. Visual editor for all visual beats"
echo "5. Asset selection functionality"
echo ""

cd "$(dirname "$0")"

# Step 1: Apply TypeScript fixes first
echo "Step 1: Fixing TypeScript compilation issues..."
if [ -f "fix-typescript-compilation.sh" ]; then
  chmod +x fix-typescript-compilation.sh
  ./fix-typescript-compilation.sh
else
  echo "TypeScript fix script not found, skipping..."
fi

echo ""
echo "Step 2: Backing up critical files..."
BACKUP_DIR="backups/critical-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp packages/builder/src/components/Inspector.tsx "$BACKUP_DIR/" 2>/dev/null
cp packages/core/src/xml/ASMLGenerator.ts "$BACKUP_DIR/" 2>/dev/null
cp packages/builder/src/components/assets/AssetSelectionModal.tsx "$BACKUP_DIR/" 2>/dev/null

echo "✅ Backups created in $BACKUP_DIR"

echo ""
echo "================================================"
echo "MANUAL FIXES REQUIRED"
echo "================================================"
echo ""
echo "### FIX 1: RESTORE CONNECTION UI ###"
echo "File: packages/builder/src/components/Inspector.tsx"
echo ""
echo "After the 'Beat-specific Parameters' section, add:"
echo ""
cat << 'CODE'
{/* Connection Settings - RESTORED */}
{beat.type !== 'dialogTree' && beat.type !== 'movementChoice' && beat.type !== 'pickProp' && (
  <div className="mt-4 pt-4 border-t">
    <h4 className="text-sm font-medium text-gray-700 mb-3">Connections</h4>
    
    {connectionType === 'single' && beat.type !== 'endScreen' && (
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Target Beat {beat.type === 'setTimer' ? '(Timer Expiry)' : '(Required)'}
        </label>
        <select
          value={localBeat.connections?.[0]?.targetId || ''}
          onChange={(e) => {
            const targetId = e.target.value;
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: targetId ? [{ targetId, label: '' }] : []
            }));
            setHasChanges(true);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select target beat...</option>
          {availableTargets.map(target => (
            <option key={target.id} value={target.id}>
              {target.name} ({target.type})
            </option>
          ))}
        </select>
      </div>
    )}
  </div>
)}
CODE

echo ""
echo "### FIX 2: ADD BUTTON TEXT ###"
echo "In the same section, add:"
echo ""
cat << 'CODE'
{/* Button Text */}
{(beat.type === 'titleScreen' || beat.type === 'introText' || 
  beat.type === 'durScreen' || beat.type === 'endScreen') && (
  <div className="mt-3">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Button Text
    </label>
    <input
      type="text"
      value={localBeat.parameters?.buttonText || (
        beat.type === 'titleScreen' ? 'Start' :
        beat.type === 'endScreen' ? 'Play Again' : 'Continue'
      )}
      onChange={(e) => handleParameterChange('buttonText', e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
    />
  </div>
)}
CODE

echo ""
echo "### FIX 3: UPDATE VISUAL BEAT TYPES ###"
echo "Find supportsVisualEditor function and update to:"
echo ""
cat << 'CODE'
const supportsVisualEditor = (beatType: string) => {
  const visualBeatTypes = [
    'titleScreen',
    'introText',
    'durScreen',
    'pickProp',
    'movementChoice',
    'dialogTree',
    'endScreen',  // ADDED
    'videoBeat'   // conversationChoice and swfBeat REMOVED
  ];
  return visualBeatTypes.includes(beatType);
};
CODE

echo ""
echo "### FIX 4: ENSURE ASSETS PASSED TO MODAL ###"
echo "At the bottom of Inspector.tsx, verify AssetSelectionModal has:"
echo ""
cat << 'CODE'
<AssetSelectionModal
  isOpen={assetSelectionModal.isOpen}
  onClose={() => setAssetSelectionModal({ isOpen: false, type: null, callback: null })}
  onSelect={handleAssetSelected}
  assets={assets}  // CRITICAL: Must be passed!
  onAssetAdd={onAssetAdd!}
  onAssetRemove={onAssetRemove!}
  onAssetUpdate={onAssetUpdate!}
  assetType={assetSelectionModal.type === 'sound' ? 'audio' : assetSelectionModal.type}
  assetSubType={...}
  title={...}
/>
CODE

echo ""
echo "### FIX 5: CHECK ASMLGENERATOR ###"
echo "File: packages/core/src/xml/ASMLGenerator.ts"
echo ""
echo "Verify the generate() method calls:"
echo "- this.generateSettings(story.getSettings(), lines);"
echo "- this.generateEnvironment(story.getEnvironment(), lines);"
echo "- this.generateCharacters(story.getCharacters(), lines);"
echo ""

echo "================================================"
echo "TESTING AFTER FIXES"
echo "================================================"
echo ""
echo "1. Build the project:"
echo "   cd packages/builder && npm run build"
echo ""
echo "2. Test connections:"
echo "   - Create a titleScreen beat"
echo "   - Should see 'Target Beat' dropdown"
echo "   - Should see 'Button Text' input"
echo ""
echo "3. Test export:"
echo "   - Export story to XML"
echo "   - Check for non-empty <settings>, <environment>, <characters>"
echo ""
echo "4. Test visual editor:"
echo "   - Create an endScreen beat"
echo "   - Should see 'Visual Editor' tab"
echo ""
echo "5. Test asset selection:"
echo "   - Import assets via Asset Manager"
echo "   - Try to select background in visual editor"
echo "   - Should see imported assets in modal"
echo ""
echo "================================================"
echo "Press Enter to continue..."
read

echo ""
echo "Opening Inspector.tsx for editing..."
echo "Please apply the fixes shown above."
echo ""

# Try to open in default editor
if command -v code &> /dev/null; then
  code packages/builder/src/components/Inspector.tsx
elif command -v nano &> /dev/null; then
  nano packages/builder/src/components/Inspector.tsx
else
  echo "Please open packages/builder/src/components/Inspector.tsx in your editor"
fi
