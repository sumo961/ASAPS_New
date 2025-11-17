# Fix Visual Editor Layout Issues

## Issues to Fix:
1. Remove duplicate visual editor controls from Inspector
2. Fix flowchart being cut off at bottom - ensure full height

## Plan:
1. Remove visual editor tab and components from Inspector.tsx
2. Consolidate all visual controls in VisualWorkspace.tsx  
3. Fix height issues in WorkspaceView to ensure flowchart uses full height
4. Move character/prop/hotspot buttons to VisualWorkspace properties panel

## Files to modify:
- packages/builder/src/components/Inspector.tsx - Remove visual editor
- packages/builder/src/components/visual/VisualWorkspace.tsx - Add missing controls
- packages/builder/src/components/WorkspaceView.tsx - Fix height issues
