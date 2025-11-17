# Visual Editor UI Improvements - Design Document

## Current Issues

The current visual editor uses a sliding mechanism within the Inspector panel, which has several drawbacks:
1. **Limited screen space** - Constrained within inspector width
2. **Cumbersome navigation** - Sliding between properties and visual tabs
3. **Context switching** - Difficult to see both properties and visual layout
4. **Poor discoverability** - Visual editor hidden behind tab

## Proposed Solution: Tab-Based Layout

### Option 1: Main Canvas Tabs (RECOMMENDED)

Replace the flowchart canvas with a tabbed interface that switches between:
- **Flowchart View** - Current node-based editor
- **Visual Editor** - Full-screen visual beat editor
- **Preview** - Live preview of current beat

#### Benefits:
- Maximum screen real estate for visual editing
- Clear separation of concerns
- Better context awareness
- Easier to switch between views
- More professional workflow

#### Implementation:
```tsx
<div className="flex-1 flex flex-col">
  <TabBar>
    <Tab icon="GitBranch" label="Flowchart" active={view === 'flowchart'} />
    <Tab icon="Image" label="Visual" active={view === 'visual'} />
    <Tab icon="Play" label="Preview" active={view === 'preview'} />
  </TabBar>
  
  <TabContent>
    {view === 'flowchart' && <Canvas />}
    {view === 'visual' && <VisualEditor />}
    {view === 'preview' && <BeatPreview />}
  </TabContent>
</div>
```

### Option 2: Split View

Maintain both flowchart and visual editor visible simultaneously:
- **Left**: Flowchart (resizable)
- **Right**: Visual Editor (resizable)
- **Toggle**: Switch to full screen for either view

#### Benefits:
- See both structure and visuals
- Quick navigation between beats
- Better for complex stories

#### Drawbacks:
- Less space for each view
- May be overwhelming for new users

### Option 3: Modal-Based Visual Editor

Open visual editor as a full-screen modal:
- Triggered by button in Inspector
- Overlay on top of main interface
- Save/Cancel to return to flowchart

#### Benefits:
- Maximum focus on visual editing
- Clean separation from main workflow
- Easy to implement

#### Drawbacks:
- Disconnected from main interface
- Can't see flowchart context
- Extra clicks to access

## Recommended Approach: Tab-Based with Context

### 1. Main Canvas Tabs
```
[Flowchart] [Visual] [Preview]
```

### 2. Smart Tab Switching
- Auto-switch to Visual when selecting visual-enabled beat
- Maintain tab selection per beat
- Keyboard shortcuts (Ctrl+1, Ctrl+2, Ctrl+3)

### 3. Visual Editor Enhancements

#### Full-Screen Stage
```typescript
interface VisualEditorProps {
  beat: Beat;
  projectSize: { width: number; height: number };
  assets: Asset[];
  onUpdate: (visualData: VisualData) => void;
}
```

#### Tool Palette
- **Select Tool** - Select and move elements
- **Text Tool** - Add text elements
- **Hotspot Tool** - Create interactive areas
- **Character Tool** - Place characters
- **Prop Tool** - Place props
- **Background Tool** - Set background

#### Property Inspector
- Context-sensitive based on selected element
- Quick actions (duplicate, delete, bring to front)
- Transform controls (position, scale, rotation)
- Animation settings

#### Layers Panel
- Drag to reorder
- Show/hide layers
- Lock/unlock layers
- Group elements

#### Zoom Controls
- Fit to screen
- Zoom in/out
- 1:1 pixel view
- Pan tool

### 4. Integration with Beat Types

Each beat type has specific visual requirements:

#### TitleScreen
- Background image
- Title text placement
- Author text placement
- Start button styling

#### IntroText
- Background image
- Text box positioning
- Typography settings
- Continue button

#### MovementChoice
- Background scene
- Hotspot placement for choices
- Visual indicators
- Character position

#### DialogTree
- Character placement
- Speech bubble positioning
- Emotion states
- Background context

#### PickProp
- Prop placement
- Highlight effects
- Description popups
- Inventory preview

### 5. Workflow Improvements

#### Quick Actions
- **Space + Drag**: Pan the canvas
- **Ctrl + Scroll**: Zoom
- **Double-click**: Edit text inline
- **Right-click**: Context menu

#### Smart Guides
- Alignment guides
- Grid snapping
- Element spacing
- Safe zones

#### Templates
- Pre-built layouts
- Reusable compositions
- Style presets
- Animation templates

## Implementation Phases

### Phase 1: Tab System
1. Add tab bar to main canvas area
2. Create tab switching logic
3. Move current Canvas to Flowchart tab
4. Create placeholder Visual tab

### Phase 2: Visual Editor Migration
1. Extract VisualBeatEditor from Inspector
2. Create full-screen VisualEditor component
3. Enhance with proper canvas size
4. Add zoom/pan controls

### Phase 3: Tool System
1. Implement tool palette
2. Add selection system
3. Create transform controls
4. Implement layers panel

### Phase 4: Beat Integration
1. Connect visual data to beats
2. Implement beat-specific templates
3. Add visual validation
4. Create preview system

### Phase 5: Polish
1. Add keyboard shortcuts
2. Implement undo/redo
3. Add animation preview
4. Create help tooltips

## Migration Strategy

1. **Keep existing visual editor** during transition
2. **Add new tab system** alongside current implementation
3. **Gradually migrate** features to new system
4. **Deprecate old system** once feature-complete
5. **Remove old code** after testing period

## Success Metrics

- **Efficiency**: 50% reduction in clicks to edit visuals
- **Space**: 3x more canvas area for visual editing
- **Discoverability**: 90% of users find visual editor without help
- **Satisfaction**: Positive feedback on workflow improvements

## Next Steps

1. Get user feedback on proposed designs
2. Create interactive mockups
3. Implement Phase 1 (Tab System)
4. Test with sample stories
5. Iterate based on feedback
