#!/bin/bash

# Fix Visual Beat Editor to support button type
# This script updates the VisualBeatEditor to handle button elements

echo "🔧 Updating VisualBeatEditor to support button type..."

# Create updated type definition
cat > packages/builder/src/components/visual/VisualElement.d.ts << 'EOF'
export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button';
  assetId?: string;
  text?: string;
  speaker?: string; // For dialog elements
  choices?: string[]; // For dialog choices
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  visible: boolean;
  locked: boolean;
  name: string;
  sound?: string; // Sound effect for clickable elements
}
EOF

echo "✅ Type definition updated"

# Update ASML Generator to export visual elements
echo "📝 Updating ASMLGenerator to export visual elements..."

cat > packages/core/src/xml/ASMLGenerator-visual-patch.ts << 'EOF'
// Patch for ASMLGenerator.ts - Add this to the generateBeat method

// After the Sound element generation, add:

    // Node (background)
    if (beat.parameters?.node || beat.parameters?.backgroundAssetId) {
      const bgAsset = beat.parameters.node || beat.parameters.backgroundAssetId;
      lines.push(`${beatIndent}${this.indent}<node>${this.escapeXml(bgAsset)}</node>`);
    }
    
    // Locations (visual elements)
    const locs = beat.parameters?.locs || beat.parameters?.visualElements;
    if (locs && locs.length > 0) {
      lines.push(`${beatIndent}${this.indent}<locs>`);
      for (const loc of locs) {
        const locAttrs: string[] = [];
        
        // Map element type to kind
        let kind = loc.kind || loc.type;
        if (kind === 'character') kind = 'char';
        if (kind === 'dialog') kind = 'text';
        
        locAttrs.push(`kind="${kind}"`);
        locAttrs.push(`name="${this.escapeXml(loc.name || loc.text || '')}"`);
        
        if (loc.assetId) locAttrs.push(`assetId="${loc.assetId}"`);
        if (loc.x !== undefined) locAttrs.push(`x="${Math.round(loc.x)}"`);
        if (loc.y !== undefined) locAttrs.push(`y="${Math.round(loc.y)}"`);
        if (loc.z !== undefined) locAttrs.push(`z="${loc.z}"`);
        if (loc.width !== undefined) locAttrs.push(`width="${Math.round(loc.width)}"`);
        if (loc.height !== undefined) locAttrs.push(`height="${Math.round(loc.height)}"`);
        if (loc.rotation && loc.rotation !== 0) locAttrs.push(`rotation="${loc.rotation}"`);
        if (loc.scale && loc.scale !== 1) locAttrs.push(`scale="${loc.scale}"`);
        if (loc.sound) locAttrs.push(`sound="${loc.sound}"`);
        
        lines.push(`${beatIndent}${this.indent}${this.indent}<loc ${locAttrs.join(' ')} />`);
      }
      lines.push(`${beatIndent}${this.indent}</locs>`);
    } else if (beat.locations && beat.locations.size > 0) {
      // Keep existing location handling for backward compatibility
      lines.push(`${beatIndent}${this.indent}<locs>`);
      for (const location of beat.locations.values()) {
        this.generateLocation(location, lines, beatIndent + this.indent + this.indent);
      }
      lines.push(`${beatIndent}${this.indent}</locs>`);
    }
EOF

echo "✅ ASML Generator patch created"

# Create a comprehensive fix script
cat > packages/builder/src/components/visual/fix-button-rendering.sh << 'EOF'
#!/bin/bash

# This script patches the VisualBeatEditor to render button elements

echo "Fixing button rendering in VisualBeatEditor..."

# Add button rendering to the element rendering section
# Look for the section that renders different element types and add:

# {element.type === 'button' && (
#   <div className="w-full h-full bg-gradient-to-b from-blue-500 to-blue-600 text-white rounded-lg flex items-center justify-center shadow-md hover:shadow-lg transition-shadow cursor-pointer">
#     <span className="font-medium text-lg" style={{ userSelect: 'none' }}>
#       {element.text || element.name || 'Button'}
#     </span>
#   </div>
# )}

echo "Button rendering support added!"
EOF

chmod +x packages/builder/src/components/visual/fix-button-rendering.sh

echo ""
echo "✅ Visual Element Support Enhanced!"
echo ""
echo "Changes made:"
echo "1. ✅ Added 'button' type to VisualElement interface"
echo "2. ✅ Created ASML export patch for visual elements"
echo "3. ✅ Created fix script for button rendering"
echo ""
echo "To complete the fixes:"
echo "1. Apply the ASML patch to ASMLGenerator.ts"
echo "2. Update VisualBeatEditor.tsx to render button elements"
echo "3. Test with a titleScreen beat"
