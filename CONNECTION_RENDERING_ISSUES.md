# Connection Rendering Issues - Architectural Analysis

## Problem Summary

Connections between beats in the flowchart do not update immediately when modified in the Inspector or Visual Editor. Different beat types exhibit different behaviors, creating an inconsistent user experience.

## Current Behavior

### Works Correctly (Immediate Update)
These beat types show connections immediately without requiring save or beat reselection:
- `titleScreen`
- `introText`
- `durScreen`
- `inputText`
- `endScreen`
- `setVariable`
- `conditionBeat`
- `addRemoveInventory`

### Broken (Requires Beat Click to Update)
These beat types do not show connections until you click another beat in the flowchart:
- `movementChoice`
- `pickProp`
- `dialogTree`
- `randomTarget`

### Severely Broken
- `hyperText`: No connections shown at all, settings don't persist
- `setTimer`: Missing second (default) connection entirely

## Root Cause Analysis

### 1. Single-Connection Beats (Working)

**Why they work:**
- Inspector line ~1435-1437 immediately calls `onUpdate()` when connection changes
- This triggers the command system (`handleBeatUpdateCommand` in App.tsx)
- Command system increments `renderKey` (App.tsx:354)
- `renderKey` is passed to WorkspaceView (App.tsx:692), forcing React re-render

**Example from Inspector.tsx:**
```typescript
onChange={(e) => {
  const targetId = e.target.value;
  // ... update local state ...

  // IMMEDIATE UPDATE - calls parent immediately
  onUpdate(beat.id, {
    connections: newConnections
  });
}}
```

### 2. Multiple-Connection Beats (Broken)

**Why they're broken:**
- Connections are only created in `handleSave()` (Inspector.tsx:581-589)
- User must explicitly click "Save" button
- Even after save, connections are created on the beat object but don't trigger re-render
- The `renderKey` increment in `handleBeatUpdateCommand` doesn't fire because connections are updated inside the beat object, not as a parameter change

**Example from Inspector.tsx:581-589:**
```typescript
// Only happens on handleSave(), not on change
if (beat.type === 'movementChoice' && localBeat.parameters?.choices) {
  localBeat.parameters.choices.forEach((choice: any) => {
    if (choice.target) {
      beat.addConnection({
        targetId: choice.target,
        label: choice.text
      });
    }
  });
}
```

### 3. Visual Editor Save (Also Broken)

**Why Visual Workspace doesn't trigger updates:**
- VisualWorkspace.handleSave() calls `onBeatUpdate()` (line 1131)
- But only passes `{ parameters: beat.getParameters() }`
- Doesn't rebuild connections from choices
- Doesn't trigger the graph re-render even with renderKey

## File Locations

### Key Files
- **App.tsx:354** - `renderKey` increment in `handleBeatUpdateCommand`
- **App.tsx:692** - `key={renderKey}` on WorkspaceView
- **Inspector.tsx:456-640** - `handleSave()` with connection building logic
- **Inspector.tsx:1435-1437** - Immediate `onUpdate()` call for single connections
- **VisualWorkspace.tsx:1056-1132** - Visual editor save logic
- **WorkspaceView.tsx** - Renders Canvas (flowchart) and VisualWorkspace

### Connection Building Logic
- **Inspector.tsx:507-640** - Comprehensive connection building for all beat types
- Different strategies for each beat type:
  - `dialogTree`: Recursive extraction from dialog tree structure
  - `setTimer`: Two connections (timer target + continue)
  - `randomTarget`: Loop through choices array
  - `movementChoice`: Loop through choices, create connection per choice
  - `pickProp`: Loop through props, create connection per prop
  - `hyperText`: Loop through hyperlinks array

## Potential Solutions

### Option 1: Immediate Update Pattern (Recommended)

**Approach:** Make all beat types follow the same pattern as single-connection beats.

**Implementation:**
1. Add immediate `onUpdate()` calls when choices/props/hyperlinks change
2. Call `onUpdate()` with both parameters AND connections
3. Let the command system handle re-rendering via `renderKey`

**Pros:**
- Consistent with working beats
- Uses existing command/undo system
- No architectural changes needed

**Cons:**
- Lots of onChange handlers to update
- Could create many undo history entries
- Need to rebuild connections on every change

**Example for movementChoice:**
```typescript
const handleUpdateChoice = (index: number, field: string, value: any) => {
  const newChoices = [...(localBeat.parameters?.choices || [])];
  newChoices[index] = { ...newChoices[index], [field]: value };

  // Update local state
  setLocalBeat(prev => ({
    ...prev,
    parameters: { ...prev.parameters, choices: newChoices }
  }));

  // Rebuild connections from choices
  const connections = newChoices
    .filter(c => c.target)
    .map(c => ({ targetId: c.target, label: c.text }));

  // IMMEDIATE UPDATE - trigger re-render
  onUpdate(beat.id, {
    parameters: { ...localBeat.parameters, choices: newChoices },
    connections: connections
  });
};
```

### Option 2: Auto-Save with Debouncing

**Approach:** Automatically save after short delay when choices change.

**Implementation:**
1. Add `useEffect` to watch choices/props/hyperlinks
2. Debounce 500ms
3. Automatically call `handleSave()`

**Pros:**
- No manual save needed
- Still batches changes to avoid spam
- Minimal code changes

**Cons:**
- Unexpected auto-save behavior
- Still relies on `handleSave()` logic
- May conflict with user expectations

### Option 3: Connection as Parameter

**Approach:** Store connections as beat parameters instead of separate array.

**Implementation:**
1. Change Beat interface to store connections in parameters
2. Update all beat creation/update logic
3. Connections become part of normal parameter updates

**Pros:**
- Connections treated like any other parameter
- Automatic re-render with parameter changes
- Simpler mental model

**Cons:**
- Major refactor across entire codebase
- Breaking change for beat data structure
- May affect ASML import/export

### Option 4: Force Graph Update Hook

**Approach:** Add a callback from Canvas/GraphEditor to force updates.

**Implementation:**
1. Add `onConnectionsChanged` prop to GraphEditor
2. Call from Inspector/VisualWorkspace after connection changes
3. GraphEditor forces ReactFlow to re-render

**Pros:**
- Surgical fix, minimal changes
- Doesn't require save button
- GraphEditor controls its own updates

**Cons:**
- Bypasses React's normal flow
- Could cause performance issues
- Band-aid solution, doesn't address root cause

## Recommended Implementation Plan

### Phase 1: Fix Critical Bugs (Immediate)
1. **Fix setTimer missing connection**
   - Verify beat definition has both connections
   - Add second connection field to Inspector UI

2. **Fix hyperText not saving**
   - Add `onUpdate()` call in hyperlink onChange handlers
   - Rebuild connections from hyperlinks in handleSave

### Phase 2: Standardize Multi-Connection Beats (Short Term)
1. **Implement Option 1 for movementChoice**
   - Add immediate `onUpdate()` to `handleUpdateChoice`
   - Test thoroughly with undo/redo

2. **Apply same pattern to pickProp, dialogTree, randomTarget**

3. **Update VisualWorkspace**
   - Add connection rebuilding to `handleSave()`
   - Call `onUpdate()` instead of `onBeatUpdate()`

### Phase 3: Optimize (Long Term)
1. Consider debouncing immediate updates
2. Evaluate if connection-as-parameter makes sense
3. Performance testing with large graphs

## Additional Notes

### Why `renderKey` Exists
The `renderKey` on WorkspaceView (App.tsx:692) was added to force React to re-render the entire workspace when connections change. Without it, ReactFlow's internal state doesn't detect the beat.connections array changes.

### Inspector vs Visual Editor
The Inspector has comprehensive connection handling in `handleSave()`, but the Visual Editor was not designed with this in mind. Visual Editor needs to:
1. Understand connection semantics (which parameters create connections)
2. Rebuild connections when those parameters change
3. Trigger the same update flow as Inspector

### Testing Considerations
When implementing fixes:
1. Test undo/redo functionality
2. Verify connection persistence on save/load
3. Check performance with 50+ beats
4. Ensure ASML export includes correct connections
5. Test all beat types individually
