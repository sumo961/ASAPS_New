Assets_improvement_plan.md
  ⎿  Asset Management & Visual Editor Enhancement Plan

     Phase 1: Separate Asset Import System (3-4 hours)

     1.1 Add Type-Specific Import UI

     Files to modify:
     - packages/builder/src/components/assets/AssetManager.tsx

     Changes:
     - Add icon-based import buttons in toolbar (using Material UI icons or
      similar)
     - Each button pre-filters file picker by asset type (e.g., images for 
     characters/props/backgrounds)
     - On file selection, show modal to confirm/set asset subtype
     - Update handleFileUpload to accept target subtype parameter

     1.2 Improve Asset Subtype Assignment

     Files to modify:
     - packages/builder/src/components/assets/AssetManager.tsx

     Changes:
     - Add AssetSubtypeModal component for manual categorization
     - Show after file upload with preview and suggested subtype
     - Allow bulk subtype assignment for multiple files
     - Persist user's categorization preferences

     Phase 2: Complete Character/Prop Placement (4-5 hours)

     2.1 Add Character/Prop Toolbar Buttons

     Files to modify:
     - packages/builder/src/components/visual/VisualBeatEditor.tsx
     - packages/builder/src/components/visual/EnhancedVisualEditor.tsx

     Changes:
     - Add "Add Character" and "Add Prop" buttons to toolbar
     - Implement tool state: 'character' | 'prop'
     - Click on canvas → open asset selection modal filtered by subtype
     - Place element with selected asset at click position

     2.2 Fix Asset URL Population

     Files to modify:
     - packages/builder/src/components/visual/VisualWorkspace.tsx
     - packages/renderer/src/components/PositionedBeatView.tsx

     Changes:
     - Ensure assetUrl is consistently populated from assets array by 
     assetId
     - Add asset resolution helper function
     - Add fallback asset loading from Story environment/props
     - Display asset name/ID in placeholder if asset not found (for 
     debugging)

     2.3 Update Properties Panel

     Files to modify:
     - packages/builder/src/components/visual/VisualPropertiesPanel.tsx

     Changes:
     - Add "Change Asset" button for character/prop elements
     - Opens asset selection modal filtered by element type
     - Show asset preview thumbnail in properties
     - Add asset dimensions display

     Phase 3: Click Sound System (3-4 hours)

     3.1 Create Preset Sound Library

     New files:
     - packages/core/src/audio/presetSounds.ts - Preset sound definitions
     - packages/builder/public/sounds/ - Directory for built-in sound files

     Changes:
     - Include 8-10 common UI sounds (click, hover, success, error, etc.)
     - Use Base64-encoded small audio files or public CDN links
     - Create sound registry with metadata (name, description, duration)

     3.2 Add Sound Assignment UI

     Files to modify:
     - packages/builder/src/components/visual/VisualPropertiesPanel.tsx

     Changes:
     - Add "Click Sound" section with dropdown
     - Show two tabs: "Presets" and "Custom Assets"
     - Presets: List built-in sounds with preview button
     - Custom: Show user's uploaded audio assets filtered by subType='sfx'
     - Add "Preview" button (🔊 icon) to test sound

     3.3 Implement Sound Playback

     Files to modify:
     - packages/renderer/src/renderers/ReactRenderer.tsx
     - packages/renderer/src/components/PositionedBeatView.tsx

     Changes:
     - Create AudioManager class to handle sound playback
     - Use Web Audio API for better control
     - Wire up click handlers to play element.sound
     - Add sound preloading for better performance
     - Implement volume control and fade effects

     Phase 4: Animation Path System (6-8 hours)

     4.1 Define Animation Data Structures

     New files:
     - packages/core/src/types/animation.ts

     Changes:
     interface AnimationPath {
       id: string;
       name: string;
       elementId: string;  // Which element animates
       type: 'bezier' | 'linear';  // Extensible for future types
       waypoints: AnimationWaypoint[];
       duration: number;  // Total duration in ms
       easing?: string;  // CSS easing function
       loop?: boolean;
       autoPlay?: boolean;
       trigger?: 'onLoad' | 'onClick' | 'onVariable';  // When to start
     }

     interface AnimationWaypoint {
       x: number;
       y: number;
       controlPoint1?: { x: number; y: number };  // Bezier control
       controlPoint2?: { x: number; y: number };
       duration: number;  // Time to reach this waypoint from previous
       easing?: string;
       // Future properties for timeline system:
       scale?: number;
       rotation?: number;
       opacity?: number;
     }

     4.2 Build Path Editor UI

     New files:
     - packages/builder/src/components/animation/AnimationPathEditor.tsx
     - packages/builder/src/components/animation/PathCanvas.tsx
     - packages/builder/src/components/animation/WaypointList.tsx

     Changes:
     - Visual canvas overlay showing animation path
     - Click to add waypoints
     - Drag waypoint positions
     - Drag control points for bezier curves
     - Timeline scrubber to preview animation
     - Properties panel for timing/easing per waypoint
     - "Play" button to preview animation

     4.3 Add Animation Tab to Visual Editor

     Files to modify:
     - packages/builder/src/components/visual/VisualWorkspace.tsx

     Changes:
     - Add "Animations" tab next to "Elements"
     - List all animations for current beat
     - "Add Animation" button → opens path editor
     - Show element being animated with preview thumbnail

     4.4 Implement Animation Engine

     New files:
     - packages/renderer/src/animation/AnimationEngine.ts
     - packages/renderer/src/animation/PathInterpolator.ts

     Changes:
     - Bezier curve interpolation math
     - Frame-by-frame position calculation
     - RequestAnimationFrame-based playback
     - Support for easing functions (ease-in, ease-out, etc.)
     - Animation state management (playing, paused, completed)
     - Extensible architecture for future timeline features

     4.5 Integrate with Renderer

     Files to modify:
     - packages/renderer/src/components/PositionedBeatView.tsx
     - packages/renderer/src/renderers/ReactRenderer.tsx

     Changes:
     - Add animation controller to renderer
     - Trigger animations based on beat load/triggers
     - Animate element transforms (translate for now)
     - Add CSS transitions for smooth rendering

     Phase 5: Optional Text Boxes (2-3 hours)

     5.1 Update Auto-Generation Logic

     Files to modify:
     - packages/builder/src/components/visual/VisualWorkspace.tsx

     Changes:
     - Modify auto-generation to set visible: false by default for text 
     elements
     - Add textBoxesVisible property to beat parameters
     - Save visibility state when user toggles

     5.2 Add Text Box Visibility Toggle

     Files to modify:
     - packages/builder/src/components/visual/VisualBeatEditor.tsx
     - packages/builder/src/components/visual/EnhancedVisualEditor.tsx

     Changes:
     - Add "Show Text Boxes" toggle button in toolbar (eye icon: 👁️)
     - Filter text elements when rendering based on visibility
     - Persist toggle state per beat
     - Visual indicator when text boxes are hidden

     5.3 Update Renderer

     Files to modify:
     - packages/renderer/src/components/PositionedBeatView.tsx

     Changes:
     - Respect visible: false property on elements
     - Don't render invisible text boxes
     - Consider visibility in layout calculations

     Phase 6: Asset Storage Persistence (Bonus - 2-3 hours)

     Files to modify:
     - packages/builder/src/hooks/useAssetManager.ts

     Changes:
     - Add IndexedDB storage using idb library
     - Store asset metadata + File objects
     - Load assets on app initialization
     - Handle object URL recreation after reload
     - Add "Clear Asset Cache" utility

     ---
     Implementation Order:

     1. Phase 2 (Character/Prop Placement) - Most critical, unblocks visual
      work
     2. Phase 1 (Separate Import) - Improves workflow immediately
     3. Phase 5 (Optional Text) - Quick win, improves flexibility
     4. Phase 3 (Click Sounds) - Adds polish and interactivity
     5. Phase 4 (Animation Paths) - Most complex, builds on previous phases
     6. Phase 6 (Persistence) - Quality of life improvement

     Estimated Total Time: 20-27 hours

     Each phase is independently testable and can be implemented/reviewed 
     separately.
