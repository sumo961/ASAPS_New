#!/bin/bash

# Add Visual Elements Export to ASMLGenerator
# This script patches the ASMLGenerator to export visual elements in ASML

echo "🔧 Patching ASMLGenerator to export visual elements..."

# Find the generateBeat method and add visual elements export
cat > packages/core/src/xml/visual-export-patch.ts << 'EOF'
// Add this code to the generateBeat method in ASMLGenerator.ts
// After the sound generation and before the locations

    // Get beat parameters for visual elements
    const params = beat.getParameters ? beat.getParameters() : (beat as any).parameters || {};
    
    // Node (background) - from visual editor
    if (params.node || params.backgroundAssetId) {
      const bgAsset = params.node || params.backgroundAssetId;
      lines.push(`${beatIndent}${this.indent}<node>${this.escapeXml(bgAsset)}</node>`);
    }
    
    // Locations (visual elements) - from visual editor
    const visualElements = params.locs || params.visualElements;
    if (visualElements && visualElements.length > 0) {
      lines.push(`${beatIndent}${this.indent}<locs>`);
      for (const loc of visualElements) {
        const locAttrs: string[] = [];
        
        // Map element type to kind for ASML compatibility
        let kind = loc.kind || loc.type;
        if (kind === 'character') kind = 'char';
        if (kind === 'dialog') kind = 'text';
        
        locAttrs.push(`kind="${kind}"`);
        locAttrs.push(`name="${this.escapeXml(loc.name || loc.text || '')}"`);
        
        // Add position and size
        if (loc.assetId) locAttrs.push(`assetId="${loc.assetId}"`);
        if (loc.x !== undefined) locAttrs.push(`x="${Math.round(loc.x)}"`);
        if (loc.y !== undefined) locAttrs.push(`y="${Math.round(loc.y)}"`);
        if (loc.z !== undefined) locAttrs.push(`z="${loc.z}"`);
        if (loc.width !== undefined) locAttrs.push(`width="${Math.round(loc.width)}"`);
        if (loc.height !== undefined) locAttrs.push(`height="${Math.round(loc.height)}"`);
        
        // Add optional properties
        if (loc.rotation && loc.rotation !== 0) locAttrs.push(`rotation="${loc.rotation}"`);
        if (loc.scale && loc.scale !== 1) locAttrs.push(`scale="${loc.scale}"`);
        if (loc.sound) locAttrs.push(`sound="${loc.sound}"`);
        
        // For character elements, add state if present
        if (kind === 'char' && loc.state) locAttrs.push(`state="${loc.state}"`);
        
        lines.push(`${beatIndent}${this.indent}${this.indent}<loc ${locAttrs.join(' ')} />`);
      }
      lines.push(`${beatIndent}${this.indent}</locs>`);
    }
EOF

echo "✅ Visual export patch created!"

# Create a manual patch instruction file
cat > packages/core/src/xml/APPLY_VISUAL_PATCH.md << 'EOF'
# How to Apply Visual Elements Export Patch

## Instructions:
1. Open `/packages/core/src/xml/ASMLGenerator.ts`
2. Find the `generateBeat` method
3. After the sound generation code (around line 290), add the code from `visual-export-patch.ts`
4. The visual elements will be exported between `<sound>` and `<defaulttarget>`

## What this adds:
- Exports `<node>` element for background images
- Exports `<locs>` container with `<loc>` elements for visual elements
- Maps element types to ASML kinds (character -> char, dialog -> text)
- Includes position, size, and optional properties

## Example ASML Output:
```xml
<beat>
  <id id="1" name="Title Screen"/>
  <transition type="Fade" duration="1"/>
  <sound name=""/>
  <node>background_asset_1</node>
  <locs>
    <loc kind="text" name="My Story" x="400" y="200" z="1" width="400" height="60"/>
    <loc kind="button" name="Start" x="400" y="500" z="2" width="200" height="50"/>
  </locs>
  <defaulttarget targetBeat="2" val="0"/>
  <function kind="titleScreen" title="My Story" author="Author Name"/>
</beat>
```
EOF

echo "✅ Manual patch instructions created!"
echo ""
echo "📋 Next Steps:"
echo "1. Apply the patch to ASMLGenerator.ts manually"
echo "2. See instructions in packages/core/src/xml/APPLY_VISUAL_PATCH.md"
echo "3. Test with a visual beat to verify export"
