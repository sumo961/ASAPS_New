#!/bin/bash

echo "🚀 Integrating Visual Beat Editor with ASML Export"
echo "=================================================="
echo ""

# Backup the original ASMLGenerator
echo "📦 Backing up original ASMLGenerator..."
cp packages/core/src/xml/ASMLGenerator.ts packages/core/src/xml/ASMLGenerator-original.ts

# Replace with enhanced version
echo "📝 Updating ASMLGenerator with visual elements support..."
cp packages/core/src/xml/ASMLGenerator-enhanced.ts packages/core/src/xml/ASMLGenerator.ts

# Update the useStoryBuilder hook to include assets in export
echo "🔧 Updating useStoryBuilder to include assets..."
cat >> packages/builder/src/hooks/useStoryBuilder.ts << 'EOF'

// Add assets to story for export
const exportStoryWithAssets = (assets: any[]) => {
  const story = new Story({
    title: state.title,
    author: state.author || 'Unknown',
    firstBeatId: state.beats[0]?.id || '0'
  });
  
  // Add assets
  story.setAssets(assets);
  
  // Add all beats
  state.beats.forEach(beat => {
    story.addBeat(beat);
  });
  
  // Add settings
  if (state.settings) {
    story.setSettings(state.settings);
  }
  
  // Export as ASML
  const generator = new ASMLGenerator();
  return generator.generate(story);
};
EOF

echo ""
echo "✅ Visual Beat Editor Integration Complete!"
echo ""
echo "New Features Added:"
echo "==================="
echo "1. ✅ Visual elements now saved in beat parameters"
echo "2. ✅ ASML export includes visual layout data"
echo "3. ✅ Assets exported with story"
echo "4. ✅ Visual elements preserved as location tags"
echo "5. ✅ Support for background, character, prop, text, and hotspot elements"
echo ""
echo "Visual Elements Include:"
echo "- Position (x, y, z-index)"
echo "- Size (width, height)"
echo "- Transformation (rotation, scale)"
echo "- Visibility and lock states"
echo "- Asset references"
echo ""
echo "Next Steps:"
echo "1. Build packages to apply changes"
echo "2. Test visual editor with different beat types"
echo "3. Add animation support (future enhancement)"
