# Text Not Visible in Visual Editor - FIXED

## Issue
After saving visual changes and navigating to another beat, when returning to the visual editor, text boxes appeared as empty black rectangles with no visible text content.

## Root Cause

**The Problem:**
1. When exporting to ASML, dialog/text element locs correctly exclude text content (text is in `<function>`)
2. When importing from ASML, locs are converted back to visualElements
3. BUT there's no text in the loc to populate the element with!
4. Result: visualElements have no `text` property
5. VisualBeatEditor renders empty dialog boxes

**Example:**
```xml
<!-- ASML Export (correct, no duplication) -->
<loc kind="text" name="Main Text" x="100" y="400" ... />
<function kind="introText" text="Welcome to your story..." />
```

When this is imported and converted:
```typescript
// ❌ BEFORE FIX
element.text = loc.text;  // undefined! (loc has no text)
```

## Solution

### Part 1: Populate Text from Beat Parameters on Import

When converting locs to visualElements, check if the element is a dialog/text element without text, and populate it from the beat's function parameters:

```typescript
// CRITICAL FIX: If element is a dialog/text and has no text, get it from beat parameters
if ((element.type === 'dialog' || loc.kind === 'text') && !element.text) {
  // For different beat types, get text from appropriate parameter
  if (beat.type === 'introText' || beat.type === 'durScreen') {
    element.text = params.text;
  } else if (beat.type === 'hyperText') {
    element.text = params.text;
  } else if (beat.type === 'endScreen' && loc.name === 'End Message') {
    element.text = params.message || 'The End';
  } else if (beat.type === 'dialogTree') {
    element.text = params.dialogTree?.text || params.text;
  }
}
```

### Part 2: Sync Text Updates from Inspector

When text is changed in the Inspector and the visual editor reloads, update existing visual elements with the new text:

```typescript
// Update existing dialog text if changed
elements = elements.map((e: VisualElement) => {
  if (e.type === 'dialog' && e.name === 'Main Text' && e.text !== params.text) {
    return { ...e, text: params.text };
  }
  return e;
});
```

Applied to:
- **introText/durScreen**: Main Text syncs with params.text
- **inputText**: Prompt syncs with params.prompt
- **hyperText**: HyperText syncs with params.text
- **endScreen**: End Message syncs with params.message

## Files Modified

**`packages/builder/src/components/visual/VisualWorkspace.tsx`**

1. **Locs-to-elements conversion** (lines ~115-127)
   - Added logic to populate text from beat parameters when missing

2. **IntroText/DurScreen sync** (lines ~378-386)
   - Update Main Text when params.text changes

3. **InputText sync** (lines ~233-241)
   - Update Prompt when params.prompt changes

4. **HyperText sync** (lines ~304-312)
   - Update HyperText when params.text changes

5. **EndScreen sync** (lines ~337-345)
   - Update End Message when params.message changes

## Data Flow

### Before Fix ❌
```
Export → ASML (no text in loc) 
  ↓
Import → loc has no text
  ↓
Convert → element.text = undefined
  ↓
Visual Editor → Empty black box (no text to display)
```

### After Fix ✅
```
Export → ASML (no text in loc, text in function)
  ↓
Import → loc has no text
  ↓
Convert → Check beat params → element.text = params.text
  ↓
Visual Editor → Text displays correctly!
```

## Text Mapping by Beat Type

| Beat Type | Text Source | Visual Element | Parameter |
|-----------|-------------|----------------|-----------|
| introText | params.text | dialog "Main Text" | text |
| durScreen | params.text | dialog "Main Text" | text |
| inputText | params.prompt | text "Prompt" | prompt |
| hyperText | params.text | dialog "HyperText" | text |
| endScreen | params.message | dialog "End Message" | message |
| dialogTree | params.dialogTree.text | dialog | dialogTree.text |

## Testing

### Test Case 1: Text Visibility After Import
1. Create introText beat with text: "Welcome to your story..."
2. Switch to Visual Editor
3. Save visual changes
4. Export to ASML and verify clean structure (no text in loc)
5. Close and reopen project (or refresh)
6. Import ASML
7. Switch to Visual Editor
8. **✅ Expected:** Text is visible in the dialog box

### Test Case 2: Text Updates from Inspector
1. Create introText beat
2. Switch to Visual Editor - see text
3. Switch back to Flowchart
4. In Inspector, change text to something else
5. Switch to Visual Editor
6. **✅ Expected:** Text box shows updated text

### Test Case 3: All Beat Types
Repeat Test Case 1 for:
- ✅ introText (params.text)
- ✅ durScreen (params.text)
- ✅ inputText (params.prompt)
- ✅ hyperText (params.text)
- ✅ endScreen (params.message)

## Benefits

### For Users
- ✅ Text is always visible in visual editor
- ✅ Text updates when edited in inspector
- ✅ No more empty black boxes
- ✅ Visual editor accurately represents story content

### For System
- ✅ Proper separation: positioning in locs, content in function
- ✅ Clean ASML (no text duplication)
- ✅ Correct round-trip import/export
- ✅ Single source of truth for text content

### For Development
- ✅ Consistent data flow
- ✅ Easy to maintain and debug
- ✅ Clear parameter mapping
- ✅ Extensible for future beat types

---

**Implementation Date:** October 6, 2025  
**Status:** Complete ✅  
**Priority:** CRITICAL  
**Testing:** Required  
**Developer:** Senior Software Engineer
