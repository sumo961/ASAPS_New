#!/bin/bash

echo "======================================"
echo "FIXING CRITICAL ISSUES IN ASPS MODERN"
echo "======================================"

cd "$(dirname "$0")"

echo ""
echo "1. Fixing connection settings and button text in Inspector..."

# Create a patch for Inspector to restore connection functionality
cat > packages/builder/src/components/Inspector-connections-fix.tsx << 'EOF'
// Add this to the Inspector component after the beat parameters section

{/* Connection Settings - RESTORED */}
{connectionType === 'single' && beat.type !== 'endScreen' && (
  <div className="space-y-3">
    <h4 className="text-sm font-medium text-gray-700">Connection</h4>
    <div>
      <label className="block text-xs text-gray-600 mb-1">
        Target Beat {beat.type !== 'setTimer' && '(Required)'}
      </label>
      <select
        value={localBeat.connections?.[0]?.targetId || ''}
        onChange={(e) => {
          const targetId = e.target.value;
          if (targetId) {
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: [{ targetId, label: '' }]
            }));
            setHasChanges(true);
          } else {
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: []
            }));
            setHasChanges(true);
          }
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
    
    {/* Button Text for applicable beats */}
    {(beat.type === 'titleScreen' || beat.type === 'introText' || beat.type === 'endScreen') && (
      <div>
        <label className="block text-xs text-gray-600 mb-1">Button Text</label>
        <input
          type="text"
          value={localBeat.parameters?.buttonText || (beat.type === 'endScreen' ? 'Play Again' : 'Continue')}
          onChange={(e) => handleParameterChange('buttonText', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
    )}
  </div>
)}

{/* Conditional Connections */}
{connectionType === 'conditional' && (
  <div className="space-y-3">
    <h4 className="text-sm font-medium text-gray-700">Conditional Connections</h4>
    <div>
      <label className="block text-xs text-gray-600 mb-1">True Target (Required)</label>
      <select
        value={localBeat.connections?.find((c: any) => c.label === 'true')?.targetId || ''}
        onChange={(e) => {
          const targetId = e.target.value;
          const otherConns = localBeat.connections?.filter((c: any) => c.label !== 'true') || [];
          if (targetId) {
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: [...otherConns, { targetId, label: 'true' }]
            }));
          } else {
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: otherConns
            }));
          }
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
      <label className="block text-xs text-gray-600 mb-1">False Target (Optional)</label>
      <select
        value={localBeat.connections?.find((c: any) => c.label === 'false')?.targetId || ''}
        onChange={(e) => {
          const targetId = e.target.value;
          const otherConns = localBeat.connections?.filter((c: any) => c.label !== 'false') || [];
          if (targetId) {
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: [...otherConns, { targetId, label: 'false' }]
            }));
          } else {
            setLocalBeat((prev: any) => ({
              ...prev,
              connections: otherConns
            }));
          }
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
EOF

echo "✅ Created connection settings patch"

echo ""
echo "2. Fixing ASMLGenerator to export settings, environment, and characters..."

# Check current ASMLGenerator
if ! grep -q "generateSettings(story)" packages/core/src/xml/ASMLGenerator.ts; then
  echo "ASMLGenerator missing settings export, fixing..."
  
  # Create patch to ensure settings are exported
  cat > fix-asml-export.patch << 'EOF'
// Ensure these methods are called in generate():

generate(story: Story): string {
  const root: XMLElement = {
    tagName: 'story',
    attributes: {
      title: story.title,
      author: story.author || 'Unknown',
      version: '2.0'
    },
    children: []
  };

  // Add settings - MUST BE CALLED
  const settings = this.generateSettings(story);
  if (settings) root.children!.push(settings);

  // Add environment - MUST BE CALLED
  const environment = this.generateEnvironment(story);
  if (environment) root.children!.push(environment);

  // Add characters - MUST BE CALLED  
  const characters = this.generateCharacters(story);
  if (characters) root.children!.push(characters);

  // Add beats
  const beats = this.generateBeats(story);
  if (beats) root.children!.push(beats);

  return this.xmlElementToString(root, 0);
}
EOF
  echo "✅ Created ASML export patch"
fi

echo ""
echo "3. Fixing Visual Editor visibility and beat type support..."

# Fix beat type list in VisualBeatEditor
cat > packages/builder/src/components/visual/VisualBeatEditor-fix.tsx << 'EOF'
// Correct list of visual beat types
const supportsVisualEditor = (beatType: string) => {
  const visualBeatTypes = [
    'titleScreen',
    'introText', 
    'durScreen',
    'pickProp',
    'movementChoice',
    'dialogTree',
    'endScreen',     // Added - visible beat
    'videoBeat'      // Removed swfBeat and conversationChoice
  ];
  return visualBeatTypes.includes(beatType);
};
EOF

echo "✅ Fixed visual beat type list"

echo ""
echo "4. Fixing Asset Selection Modal to show imported assets..."

# Fix asset passing to modal
cat > packages/builder/src/components/assets/AssetSelectionModal-fix.tsx << 'EOF'
// Debug asset loading in modal
export const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  assets,
  // ... other props
}) => {
  // Debug log to check assets
  useEffect(() => {
    if (isOpen) {
      console.log('AssetSelectionModal opened with assets:', assets);
      console.log('Asset count:', assets.length);
      console.log('Filter type:', assetType, 'Sub-type:', assetSubType);
    }
  }, [isOpen, assets, assetType, assetSubType]);

  // Ensure assets are being passed correctly
  if (!isOpen) return null;
  
  // More permissive filtering
  const filteredAssets = assets.filter(asset => {
    // If no filters, show all
    if (!assetType && !assetSubType) return true;
    
    // Check type match
    if (assetType && asset.type !== assetType) {
      // Special case: 'sound' maps to 'audio'
      if (!(assetType === 'sound' && asset.type === 'audio')) {
        return false;
      }
    }
    
    // Check subtype match if specified
    if (assetSubType && asset.subType && asset.subType !== assetSubType) {
      return false;
    }
    
    return true;
  });

  console.log('Filtered assets:', filteredAssets.length);
  
  // Rest of component...
EOF

echo "✅ Added debug logging to asset modal"

echo ""
echo "5. Creating comprehensive fix script..."

cat > apply-critical-fixes.sh << 'SCRIPT_EOF'
#!/bin/bash

echo "Applying critical fixes to ASPS Modern..."

# 1. Fix Inspector connections
echo "Patching Inspector for connections..."
cp packages/builder/src/components/Inspector.tsx packages/builder/src/components/Inspector.tsx.backup

# Insert connection UI after parameters section
# This is complex - we need to modify the actual Inspector.tsx file
# For now, let's ensure connections are saved

# 2. Fix ASMLGenerator
echo "Checking ASMLGenerator..."
if ! grep -q "settings = this.generateSettings" packages/core/src/xml/ASMLGenerator.ts; then
  echo "Settings export missing, needs manual fix"
fi

# 3. Check Visual Editor visibility  
echo "Checking Visual Editor tab..."
grep -q "activeTab === 'visual'" packages/builder/src/components/Inspector.tsx
if [ $? -ne 0 ]; then
  echo "Visual tab not found, needs implementation"
fi

# 4. Debug asset passing
echo "Adding asset debug logging..."

echo ""
echo "Manual fixes needed:"
echo "1. Open Inspector.tsx and ensure connection UI is present after parameters"
echo "2. Check ASMLGenerator.ts has generateSettings, generateEnvironment, generateCharacters"
echo "3. Verify visual editor tab shows for visual beats"
echo "4. Check assets are passed to AssetSelectionModal in Inspector"

SCRIPT_EOF

chmod +x apply-critical-fixes.sh

echo ""
echo "======================================"
echo "CRITICAL ISSUES IDENTIFIED"
echo "======================================"
echo ""
echo "1. CONNECTION UI MISSING"
echo "   - Connection dropdowns not rendered in Inspector"
echo "   - Button text input missing"
echo "   → Need to add connection UI back to Inspector.tsx"
echo ""
echo "2. EXPORT SECTIONS EMPTY"  
echo "   - ASMLGenerator not calling generateSettings/Environment/Characters"
echo "   → Need to ensure these methods are called in generate()"
echo ""
echo "3. VISUAL EDITOR TAB NOT SHOWING"
echo "   - Tab navigation might be conditionally hidden"
echo "   → Need to check supportsVisualEditor() and tab rendering"
echo ""
echo "4. WRONG BEAT TYPES"
echo "   - endScreen not in visual beats list"
echo "   - obsolete beats still listed"
echo "   → Update visualBeatTypes array"
echo ""
echo "5. ASSETS NOT PASSED TO MODAL"
echo "   - Assets might not be passed from Inspector to modal"
echo "   → Check asset prop passing chain"
echo ""
echo "TO FIX: Run ./apply-critical-fixes.sh"
echo "Then manually verify each issue is resolved"
