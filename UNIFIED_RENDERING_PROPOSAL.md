# Unified Rendering Architecture Proposal

## Problem

Currently, we have **two separate rendering systems**:

1. **Visual Editor** (VisualWorkspace.tsx)
   - Uses Konva canvas
   - Custom shape rendering
   - Drag-and-drop positioning
   - Editable elements

2. **Preview** (ReactRenderer.tsx)
   - Uses React components
   - DOM-based rendering
   - User interaction for story progression
   - Non-editable

**Issues with current approach:**
- Code duplication (2 systems doing similar things)
- Maintenance burden (changes needed in both places)
- Inconsistencies (different rendering = different bugs)
- Not WYSIWYG (What You See Is NOT What You Get)
- Double the complexity

## Your Proposal: Use One System

**You're absolutely right!** Both should use the same rendering core.

## Recommended Solution: Unified ReactRenderer

### Architecture

```
┌─────────────────────────────────────────────────────┐
│           Shared: ReactRenderer Core                │
│  (positioned rendering, styling, backgrounds)       │
└─────────────────┬───────────────────┬───────────────┘
                  │                   │
     ┌────────────▼──────────┐  ┌────▼────────────────┐
     │  Visual Editor Mode   │  │   Preview Mode      │
     │  + Drag handles       │  │   + Click to play   │
     │  + Edit on click      │  │   + Story logic     │
     │  + Resize controls    │  │   + No editing      │
     └───────────────────────┘  └─────────────────────┘
```

### Benefits

1. **WYSIWYG** - Editor shows EXACTLY what preview/player will show
2. **Less code** - One rendering system instead of two
3. **Consistency** - Same bugs (or lack thereof) in both modes
4. **Easier maintenance** - Fix once, works everywhere
5. **Faster development** - No need to implement features twice

### Implementation Plan

#### Phase 1: Extract Positioned Renderer Core (DONE ✅)
- ReactRenderer already has positioned rendering
- Can render elements at exact x,y coordinates
- Supports all element types (text, button, dialog, etc.)

#### Phase 2: Create EditableReactRenderer (NEW)
```typescript
class EditableReactRenderer extends ReactRenderer {
  private editMode: boolean = true;
  private onElementSelect?: (element: Element) => void;
  private onElementDrag?: (element: Element, position: {x: y}) => void;
  
  // Wraps rendered elements in draggable containers
  protected wrapWithEditControls(element: ReactNode, location: Location) {
    return (
      <DraggableElement
        position={{ x: location.x, y: location.y }}
        onDrag={(pos) => this.onElementDrag?.(element, pos)}
        onClick={() => this.onElementSelect?.(element)}
      >
        {element}
        {this.editMode && <ResizeHandles />}
      </DraggableElement>
    );
  }
}
```

#### Phase 3: Replace VisualWorkspace Konva
- Remove Konva canvas entirely
- Use EditableReactRenderer instead
- Pass callbacks for drag/select/resize events
- Update state when elements move

#### Phase 4: Unified Component Library
```
src/components/shared/
  ├── TextElement.tsx       // Used by both editor and preview
  ├── ButtonElement.tsx     // Styled button component
  ├── DialogBox.tsx         // Dialog display
  └── BackgroundLayer.tsx   // Background image handling
```

### Code Example

**Before (Current - Two systems):**
```typescript
// VisualWorkspace.tsx - Konva version
<Layer>
  <Rect x={loc.x} y={loc.y} width={loc.width} height={loc.height} />
  <Text x={loc.x} y={loc.y} text={text} />
</Layer>

// ReactRenderer.tsx - React version  
<div style={{ position: 'absolute', left: loc.x, top: loc.y }}>
  {text}
</div>
```

**After (Unified - One system):**
```typescript
// SharedTextElement.tsx
export const TextElement = ({ text, location, editable }) => (
  <div style={{ 
    position: 'absolute', 
    left: location.x, 
    top: location.y,
    width: location.width,
    height: location.height 
  }}>
    {editable ? (
      <EditableText value={text} onChange={...} />
    ) : (
      <span>{text}</span>
    )}
  </div>
);

// Used in both:
// VisualEditor: <TextElement editable={true} />
// Preview: <TextElement editable={false} />
```

### Migration Strategy

1. **Week 1**: Create EditableReactRenderer class
2. **Week 2**: Build draggable wrapper components
3. **Week 3**: Replace VisualWorkspace Konva with EditableReactRenderer
4. **Week 4**: Test and refine
5. **Week 5**: Remove old Konva code

### Estimated Impact

**Code reduction**: ~40% less code (remove entire Konva system)
**Development speed**: 2x faster (implement once, use twice)
**Consistency**: 100% WYSIWYG
**Bugs**: ~50% fewer rendering bugs (one system to fix)

## Alternative: Keep Konva for Editor, Share Layout Logic

If you want to keep Konva for editing (has some advantages):

```typescript
// Shared layout calculator
class LayoutEngine {
  calculateElementPosition(element, container) { ... }
  calculateTextSize(text, constraints) { ... }
}

// Used by both:
const layout = new LayoutEngine();

// Konva editor uses it
const konvaRect = new Konva.Rect(layout.calculateElementPosition(...));

// React preview uses it
const reactDiv = <div style={layout.calculateElementPosition(...)} />;
```

## Recommendation

**Go with unified ReactRenderer approach** because:
- Simpler architecture
- True WYSIWYG
- Less code overall
- React is already in the codebase
- Easier for other developers to understand

The only advantage Konva has is slightly better performance for dragging, but React's performance is sufficient for an authoring tool with dozens (not thousands) of elements.

## Next Steps

1. Run the background debug script to see what's happening:
   ```bash
   chmod +x fix-background-debug.sh
   ./fix-background-debug.sh
   npm run build
   ```

2. Test and check browser console for [Beat] logs

3. Once backgrounds work, we can start on unified rendering if you agree this is the right direction

What do you think about this architectural change?
