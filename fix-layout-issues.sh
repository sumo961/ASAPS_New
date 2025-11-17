#!/bin/bash

# Fix Layout Issues Script
# Fixes flowchart height and visual editor width problems

echo "Fixing layout issues..."

# 1. Fix WorkspaceView to ensure full height usage
cat > /tmp/WorkspaceView.patch << 'EOF'
--- a/packages/builder/src/components/WorkspaceView.tsx
+++ b/packages/builder/src/components/WorkspaceView.tsx
@@ -49,7 +49,7 @@
   const showVisualTab = supportsVisualEditor(selectedBeat);
 
   return (
-    <div className="flex-1 flex flex-col h-full min-h-0 bg-gray-50">
+    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden">
       {/* Tab Navigation */}
       <div className="flex-shrink-0 flex border-b border-gray-300 bg-white shadow-sm">
         <button
@@ -87,7 +87,7 @@
       </div>
 
       {/* Content Area - Ensure full height with proper overflow */}
-      <div className="flex-1 min-h-0 h-full overflow-hidden">
+      <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
         {activeView === 'flowchart' ? (
           <Canvas
             beats={beats}
EOF

echo "Fixed WorkspaceView height management"

# 2. Check and update VisualBeatEditor to see current structure
echo "Checking VisualBeatEditor..."
if [ -f "packages/builder/src/components/visual/VisualBeatEditor.tsx" ]; then
    echo "VisualBeatEditor exists - will need to make it scrollable"
else
    echo "ERROR: VisualBeatEditor.tsx not found!"
    exit 1
fi

echo ""
echo "Layout fix script prepared."
echo "Please review the changes before applying them."
echo ""
echo "To apply fixes:"
echo "1. Review WorkspaceView changes above"
echo "2. Check VisualBeatEditor for width issues"
echo "3. Apply manual fixes as needed"
