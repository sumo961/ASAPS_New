#!/bin/bash

echo "============================================="
echo "COMPREHENSIVE FIX FOR CRITICAL ASPS ISSUES"
echo "============================================="

cd "$(dirname "$0")"

# First, let's fix the TypeScript compilation issues
echo ""
echo "Step 1: Fixing TypeScript compilation errors..."
./fix-typescript-compilation.sh

echo ""
echo "Step 2: Creating backup of Inspector.tsx..."
cp packages/builder/src/components/Inspector.tsx packages/builder/src/components/Inspector.tsx.backup-$(date +%Y%m%d_%H%M%S)

echo ""
echo "Step 3: Adding connection UI to Inspector..."

# Create a comprehensive Inspector patch that adds back missing connection UI
cat > packages/builder/src/components/Inspector-connections-patch.tsx << 'EOF'
// ADD THIS CONNECTION UI SECTION AFTER THE BEAT-SPECIFIC PARAMETERS

{/* Connection Settings - CRITICAL FIX */}
{beat.type !== 'dialogTree' && beat.type !== 'movementChoice' && beat.type !== 'pickProp' && (
  <div className="border-t pt-4 mt-4">
    <h4 className="text-sm font-medium text-gray-700 mb-3">Connections</h4>
    
    {/* Single Connection Beats */}
    {connectionType === 'single' && beat.type !== 'endScreen' && (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Target Beat {beat.type === 'setTimer' ? '(Timer Expiry)' : '(Required)'}
          </label>
          <select
            value={localBeat.connections?.[0]?.targetId || localBeat.defaultTarget || ''}
            onChange={(e) => {
              const targetId = e.target.value;
              setLocalBeat((prev: any) => ({
                ...prev,
                connections: targetId ? [{ targetId, label: '' }] : [],
                defaultTarget: targetId || undefined
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
      </div>
    )}

    {/* Conditional Connection Beats */}
    {connectionType === 'conditional' && beat.type === 'conditionBeat' && (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            True Target <span className="text-red-500">*</span>
          </label>
          <select
            value={localBeat.connections?.find((c: any) => c.label === 'true')?.targetId || ''}
            onChange={(e) => {
              const targetId = e.target.value;
              const otherConns = localBeat.connections?.filter((c: any) => c.label !== 'true') || [];
              setLocalBeat((prev: any) => ({
                ...prev,
                connections: targetId 
                  ? [...otherConns, { targetId, label: 'true' }]
                  : otherConns
              }));
              setHasChanges(true);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select target...</option>
            {availableTargets.map(target => (
              <option key={target.id} value={target.id}>
                {target.name} ({target.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            False Target (Optional)
          </label>
          <select
            value={localBeat.connections?.find((c: any) => c.label === 'false')?.targetId || ''}
            onChange={(e) => {
              const targetId = e.target.value;
              const otherConns = localBeat.connections?.filter((c: any) => c.label !== 'false') || [];
              setLocalBeat((prev: any) => ({
                ...prev,
                connections: targetId 
                  ? [...otherConns, { targetId, label: 'false' }]
                  : otherConns
              }));
              setHasChanges(true);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select target...</option>
            {availableTargets.map(target => (
              <option key={target.id} value={target.id}>
                {target.name} ({target.type})
              </option>
            ))}
          </select>
        </div>
      </div>
    )}

    {/* Timer Target for setTimer beats */}
    {beat.type === 'setTimer' && (
      <div className="mt-3">
        <label className="block text-xs text-gray-600 mb-1">
          Timer Target <span className="text-red-500">*</span>
        </label>
        <select
          value={localBeat.parameters?.timerTarget || ''}
          onChange={(e) => {
            handleParameterChange('timerTarget', e.target.value);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select timer target...</option>
          {availableTargets.map(target => (
            <option key={target.id} value={target.id}>
              {target.name} ({target.type})
            </option>
          ))}
        </select>
      </div>
    )}

    {/* Random Target Choices */}
    {beat.type === 'randomTarget' && (
      <div className="space-y-3">
        <label className="block text-xs text-gray-600 mb-1">
          Random Target Beats
        </label>
        {(localBeat.parameters?.choices || []).map((choice: any, index: number) => (
          <div key={index} className="flex gap-2">
            <select
              value={choice.target || ''}
              onChange={(e) => {
                const newChoices = [...(localBeat.parameters?.choices || [])];
                newChoices[index] = { ...newChoices[index], target: e.target.value };
                handleParameterChange('choices', newChoices);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select target...</option>
              {availableTargets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.name} ({target.type})
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const newChoices = localBeat.parameters?.choices?.filter((_: any, i: number) => i !== index) || [];
                handleParameterChange('choices', newChoices);
              }}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const newChoices = [...(localBeat.parameters?.choices || []), { target: '' }];
            handleParameterChange('choices', newChoices);
          }}
          className="w-full px-3 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
        >
          Add Random Target
        </button>
      </div>
    )}
  </div>
)}

{/* Button Text for beats that have buttons */}
{(beat.type === 'titleScreen' || beat.type === 'introText' || beat.type === 'durScreen' || beat.type === 'endScreen') && (
  <div className="mt-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Button Text
    </label>
    <input
      type="text"
      value={localBeat.parameters?.buttonText || (
        beat.type === 'titleScreen' ? 'Start' :
        beat.type === 'endScreen' ? 'Play Again' :
        'Continue'
      )}
      onChange={(e) => handleParameterChange('buttonText', e.target.value)}
      placeholder={
        beat.type === 'titleScreen' ? 'Start' :
        beat.type === 'endScreen' ? 'Play Again' :
        'Continue'
      }
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
    />
  </div>
)}
EOF

echo "✅ Created connection UI patch"

echo ""
echo "Step 4: Fixing visual beat types list..."

# Fix the list of visual beats
cat > fix-visual-beats.patch << 'EOF'
// In Inspector.tsx, update supportsVisualEditor function:

const supportsVisualEditor = (beatType: string) => {
  const visualBeatTypes = [
    'titleScreen',
    'introText',
    'durScreen',
    'pickProp',
    'movementChoice',
    'dialogTree',
    'endScreen',     // ADDED - this is a visible beat
    'videoBeat'      // REMOVED: conversationChoice (merged into dialogTree)
                     // REMOVED: swfBeat (superseded by videoBeat)
  ];
  return visualBeatTypes.includes(beatType);
};
EOF

echo "✅ Created visual beats fix"

echo ""
echo "Step 5: Ensuring assets are passed to modal..."

# Create asset passing fix
cat > fix-asset-passing.patch << 'EOF'
// In Inspector.tsx, ensure assets are passed when opening modal:

// When handling asset selection:
const handleAssetSelection = (
  assetType: 'background' | 'character' | 'prop' | 'sound',
  callback: (asset: Asset) => void
) => {
  console.log('Opening asset modal with', assets.length, 'assets'); // Debug
  
  setAssetSelectionModal({
    isOpen: true,
    type: assetType === 'sound' ? 'audio' : assetType, // Map 'sound' to 'audio'
    callback
  });
};

// And ensure the modal receives the assets:
<AssetSelectionModal
  isOpen={assetSelectionModal.isOpen}
  onClose={() => setAssetSelectionModal({ isOpen: false, type: null, callback: null })}
  onSelect={handleAssetSelected}
  assets={assets} // ENSURE THIS IS PASSED
  onAssetAdd={onAssetAdd!}
  onAssetRemove={onAssetRemove!}
  onAssetUpdate={onAssetUpdate!}
  assetType={assetSelectionModal.type === 'sound' ? 'audio' : 
            (assetSelectionModal.type as 'image' | 'audio' | 'video' | 'font' | undefined)}
  assetSubType={assetSelectionModal.type === 'background' ? 'background' : 
                assetSelectionModal.type === 'character' ? 'character' :
                assetSelectionModal.type === 'prop' ? 'prop' : 
                assetSelectionModal.type === 'sound' ? 'sfx' : undefined}
  title={`Select ${assetSelectionModal.type || 'Asset'}`}
/>
EOF

echo "✅ Created asset passing fix"

echo ""
echo "Step 6: Verifying ASMLGenerator exports all sections..."

# Check if ASMLGenerator calls all necessary methods
grep -q "generateSettings" packages/core/src/xml/ASMLGenerator.ts
if [ $? -eq 0 ]; then
  echo "✅ ASMLGenerator has generateSettings method"
else
  echo "❌ ASMLGenerator missing generateSettings - needs fix"
fi

echo ""
echo "============================================="
echo "MANUAL FIXES REQUIRED"
echo "============================================="
echo ""
echo "1. Open packages/builder/src/components/Inspector.tsx"
echo "   - Find the 'Beat-specific Parameters' section"
echo "   - Add the connection UI code from Inspector-connections-patch.tsx"
echo "   - Ensure button text input is added for applicable beats"
echo ""
echo "2. Update the supportsVisualEditor function:"
echo "   - Add 'endScreen' to the list"
echo "   - Remove 'conversationChoice' and 'swfBeat'"
echo ""
echo "3. Check asset passing in Inspector:"
echo "   - Verify assets prop is passed to AssetSelectionModal"
echo "   - Add debug logging to see if assets are received"
echo ""
echo "4. Verify ASMLGenerator in packages/core/src/xml/ASMLGenerator.ts:"
echo "   - Check that generate() calls generateSettings()"
echo "   - Check that generate() calls generateEnvironment()"
echo "   - Check that generate() calls generateCharacters()"
echo ""
echo "5. Run: cd packages/builder && npm run build"
echo ""
echo "After making these changes, test:"
echo "- Create a beat and add a connection"
echo "- Export the story and check for settings/environment/characters"
echo "- Open visual editor for endScreen beat"
echo "- Import assets and try to select them"
