# Visual Editor Redesign Planning Document

## Overview
The Visual Editor needs to be redesigned from a sliding panel to a tab-based interface that alternates with the flowchart view, providing a more intuitive and spacious workspace for visual beat editing.

## Current Issues

### Problems with Sliding Panel
1. **Limited Space**: Cramped workspace for complex visual layouts
2. **Cumbersome Navigation**: Sliding mechanism feels awkward
3. **Context Switching**: Difficult to maintain focus between flowchart and visual editing
4. **Discoverability**: Users may not realize visual editor exists
5. **Inconsistent UI**: Different interaction pattern from rest of the app

## Proposed Solution: Tab-Based Interface

### Architecture Changes

#### Canvas Component Refactor
```typescript
// packages/builder/src/components/Canvas.tsx
interface CanvasProps {
  // ... existing props
  view: 'flowchart' | 'visual';
  onViewChange: (view: 'flowchart' | 'visual') => void;
}

// Main canvas area becomes a container for both views
<div className="canvas-container">
  <CanvasTabs 
    activeView={view}
    onViewChange={onViewChange}
    currentBeat={selectedBeat}
  />
  
  {view === 'flowchart' ? (
    <FlowchartView {...flowchartProps} />
  ) : (
    <VisualEditorView {...visualProps} />
  )}
</div>
```

### UI Design

#### Tab Header Design
```
┌──────────────────────────────────────────────────────────┐
│ [🔀 Flowchart] [🎨 Visual Editor]     Beat: IntroText     │
├──────────────────────────────────────────────────────────┤
│                                                           │
│                    [Canvas Content]                       │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

#### Visual Editor Full View
```
┌──────────────────────────────────────────────────────────┐
│ Visual Editor - Beat: "Welcome Screen"            [🔀→📋] │
├──────────────────────────────────────────────────────────┤
│ Toolbar: [➕Add] [🖼️BG] [👤Char] [📦Prop] [🔤Text] [🎵] │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                  │    │
│  │              [Visual Canvas Area]                │    │
│  │                 1024 x 768                       │    │
│  │                                                  │    │
│  │     [Drop elements here]                         │    │
│  │                                                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│ Layers Panel          Properties Panel                    │
│ ┌─────────────┐      ┌──────────────────┐              │
│ │ 🔒 Background│      │ Selected: Text1   │              │
│ │ 👁 Character │      │ X: 100  Y: 200   │              │
│ │ 👁 Props     │      │ Font: [Gothic ▼] │              │
│ │ 👁 Text      │      │ Size: [24px]     │              │
│ └─────────────┘      └──────────────────┘              │
└──────────────────────────────────────────────────────────┘
```

## Features & Functionality

### Tab Switching Behavior
1. **Persistent State**: Visual layout saves when switching tabs
2. **Auto-Switch**: Automatically switch to visual tab when visual beat selected
3. **Keyboard Shortcuts**: Ctrl+1 for Flowchart, Ctrl+2 for Visual
4. **Tab Indicators**: Show dot indicator when beat has visual content
5. **Context Preservation**: Remember last selected element in each view

### Visual Editor Enhancements

#### Improved Workspace
- Full canvas width utilization
- Responsive canvas sizing based on project settings
- Zoom controls (25%, 50%, 75%, 100%, 150%, 200%)
- Grid snap with adjustable settings
- Ruler guides

#### Enhanced Tools
```typescript
interface VisualToolbar {
  tools: [
    { id: 'select', icon: 'cursor', shortcut: 'V' },
    { id: 'text', icon: 'type', shortcut: 'T' },
    { id: 'hotspot', icon: 'target', shortcut: 'H' },
    { id: 'background', icon: 'image', shortcut: 'B' },
    { id: 'character', icon: 'user', shortcut: 'C' },
    { id: 'prop', icon: 'box', shortcut: 'P' },
    { id: 'sound', icon: 'volume', shortcut: 'S' }
  ];
  
  alignment: [
    'align-left', 'align-center', 'align-right',
    'align-top', 'align-middle', 'align-bottom',
    'distribute-horizontal', 'distribute-vertical'
  ];
  
  arrangement: [
    'bring-forward', 'send-backward',
    'bring-to-front', 'send-to-back'
  ];
}
```

#### Side Panels
1. **Layers Panel** (Left)
   - Drag to reorder
   - Lock/unlock layers
   - Show/hide visibility
   - Group elements
   - Opacity control

2. **Properties Panel** (Right)
   - Context-sensitive properties
   - Transform controls
   - Effects and filters
   - Animation settings
   - Sound attachments

3. **Assets Panel** (Bottom - Collapsible)
   - Quick asset browser
   - Recent assets
   - Drag-and-drop support
   - Search and filter

### Integration Points

#### Beat Type Support
Only show visual tab for beats that support visual editing:
```typescript
const VISUAL_BEAT_TYPES = [
  'titleScreen',
  'introText', 
  'durScreen',
  'pickProp',
  'movementChoice',
  'dialogTree',
  'conversationChoice',
  'endScreen',
  'videoBeat',
  'swfBeat'
];

const showVisualTab = VISUAL_BEAT_TYPES.includes(selectedBeat?.type);
```

#### Data Synchronization
```typescript
interface VisualBeatData {
  background?: {
    asset: string;
    position?: { x: number; y: number };
    scale?: number;
  };
  
  elements: VisualElement[];
  
  layout: {
    textPosition: 'top' | 'bottom' | 'center' | 'custom';
    characterPosition: 'left' | 'right' | 'center' | 'custom';
  };
  
  animations?: AnimationSequence[];
}
```

## Implementation Plan

### Phase 1: Tab Infrastructure (3 days)
- [ ] Create tab switching mechanism
- [ ] Refactor Canvas component
- [ ] Move visual editor to main canvas area
- [ ] Implement view state management

### Phase 2: Visual Editor Core (5 days)
- [ ] Full-size canvas implementation
- [ ] Tool palette redesign
- [ ] Layer management system
- [ ] Properties panel
- [ ] Grid and guides

### Phase 3: Enhanced Features (5 days)
- [ ] Zoom controls
- [ ] Alignment tools
- [ ] Keyboard shortcuts
- [ ] Undo/redo for visual edits
- [ ] Copy/paste elements

### Phase 4: Asset Integration (3 days)
- [ ] Asset browser panel
- [ ] Drag-and-drop from assets
- [ ] Asset preview on hover
- [ ] Quick asset switching

### Phase 5: Polish & Testing (2 days)
- [ ] Performance optimization
- [ ] Accessibility features
- [ ] User preferences
- [ ] Documentation

## Benefits

### User Experience
1. **More Space**: Full canvas width for visual editing
2. **Better Context**: Clear separation between structure and visuals
3. **Intuitive Navigation**: Standard tab pattern
4. **Improved Workflow**: Quick switching between views
5. **Professional Feel**: Industry-standard interface

### Technical Benefits
1. **Cleaner Architecture**: Separation of concerns
2. **Better Performance**: Only render active view
3. **Easier Maintenance**: Modular components
4. **Extensibility**: Easy to add more views/tabs

## Migration Strategy

### Backward Compatibility
- Existing visual data preserved
- Automatic migration of layout data
- No breaking changes to ASML format

### User Onboarding
- First-time tooltip tour
- Keyboard shortcut overlay
- Video tutorial creation
- Documentation update

## Success Metrics

1. **Efficiency**: 50% reduction in clicks to access visual editor
2. **Discoverability**: 80% of users find visual editor without help
3. **Satisfaction**: Positive feedback on spacious workspace
4. **Performance**: No lag when switching tabs
5. **Adoption**: Increased usage of visual features

## Alternative Considerations

### Split View Option
- Allow split view with both flowchart and visual
- Resizable panes
- Synchronized selection
- More complex but powerful

### Floating Window Option
- Visual editor in separate window
- Multi-monitor support
- Independence from main UI
- Platform-specific challenges

## Decision: Tab-Based Approach

The tab-based approach is recommended because:
1. **Simplicity**: Easy to implement and understand
2. **Consistency**: Matches common UI patterns
3. **Space**: Maximum canvas utilization
4. **Performance**: Single view rendering
5. **Mobile-friendly**: Works on smaller screens

## Next Steps

1. **Approval**: Review and approve this design
2. **Prototype**: Create interactive mockup
3. **User Testing**: Validate with target users
4. **Implementation**: Begin Phase 1 development
5. **Iteration**: Refine based on feedback

---

*This redesign will transform the Visual Editor from a hidden, cramped feature into a prominent, spacious creative workspace that users will love to use.*
