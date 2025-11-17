# Preview Element Positioning Fix - Testing Guide

**Date:** October 9, 2025  
**Status:** ✅ COMPLETE - Awaiting Testing  
**Priority:** CRITICAL

---

## Problem Summary

Preview was not respecting visual editor element positions. Elements appeared small and squeezed in the corner instead of matching the visual editor layout.

### Before Fix
- Visual Editor: Elements properly centered at specific coordinates
- Preview: Elements rendered with flexbox centering, ignoring positions
- Result: Mismatch between editor and preview

### After Fix
- Preview now uses exact coordinates from visual editor
- Elements appear at same positions and sizes
- Visual editor and preview are now in sync

---

## What Was Fixed

### Architectural Changes

**1. Renderer Interface Extended**
```typescript
// Added optional locations parameter
renderTitleScreen(title, author, buttonText, locations?: Location[])
```

**2. Beat Passes Location Data**
```typescript
// TitleScreenBeat now passes locations to renderer
const locations = Array.from(this.locations.values());
await renderer.renderTitleScreen(title, author, buttonText, locations);
```

**3. ReactRenderer Uses Positioned Layout**
```typescript
// Checks for locations and uses absolute positioning
if (locations && locations.length > 0) {
  return renderTitleScreenPositioned(...);
}
```

---

## Testing Instructions

### Test 1: Basic Position Verification

**Steps:**
1. Open ASPS Builder
2. Create or open a story with a titleScreen beat
3. Click on titleScreen beat in flowchart
4. Open Visual Editor tab
5. Note the positions of:
   - Title text (should be around x=312, y=200)
   - Author text (should be around x=362, y=270)
   - Start button (should be around x=412, y=500)
6. Click "Preview" button
7. Click "Start Preview"

**Expected Result:**
- ✅ Title appears at same position as in visual editor
- ✅ Author appears at same position as in visual editor
- ✅ Button appears at same position as in visual editor
- ✅ All elements same size as in visual editor
- ✅ No console errors

**If This Fails:**
- Check console for location data logs
- Verify visual editor saved positions
- Check if locations being passed to renderer

---

### Test 2: Custom Positioning

**Steps:**
1. In visual editor, drag title to a different position (e.g., top-left corner)
2. Drag author to bottom-right corner
3. Drag button to center
4. Click "Save Visual Changes"
5. Click "Preview"
6. Click "Start Preview"

**Expected Result:**
- ✅ Elements appear at new custom positions
- ✅ Preview matches visual editor exactly
- ✅ No visual artifacts or glitches

---

### Test 3: Size Adjustments

**Steps:**
1. In visual editor, select title text
2. Change width to 600px
3. Change height to 100px
4. Click "Save Visual Changes"
5. Preview the story

**Expected Result:**
- ✅ Title renders at 600x100px in preview
- ✅ Size matches visual editor

---

### Test 4: Element Interaction

**Steps:**
1. Open preview with default titleScreen
2. Verify button position matches visual editor
3. Click the "Start" button

**Expected Result:**
- ✅ Button clickable at shown position
- ✅ Story advances to next beat
- ✅ No console errors

---

### Test 5: Missing Locations (Backwards Compatibility)

**Steps:**
1. Create a new story with new titleScreen beat
2. Do NOT open visual editor (no locations saved)
3. Preview the story immediately

**Expected Result:**
- ✅ Preview uses default centered layout
- ✅ Elements appear centered on screen
- ✅ Backwards compatible fallback works
- ✅ No errors about missing locations

---

### Test 6: Round-Trip Save/Load

**Steps:**
1. Position elements in visual editor
2. Save visual changes
3. Export story to ASML
4. Close and reopen builder
5. Import the ASML file
6. Open titleScreen in visual editor
7. Verify positions maintained
8. Preview the story

**Expected Result:**
- ✅ Positions preserved through export/import
- ✅ Visual editor shows correct positions
- ✅ Preview matches visual editor

---

## Console Verification

### Look For These Logs

**On Preview Start:**
```
[ReactRenderer abc123] renderTitleScreen called: {..., hasLocations: true}
[ReactRenderer abc123] Using positioned layout with 3 elements
[ReactRenderer abc123] Found locations: {titleLoc: ..., authorLoc: ..., buttonLoc: ...}
[ReactRenderer abc123] Positioned TitleScreen rendered
```

**What To Check:**
- ✅ `hasLocations: true` means locations were passed
- ✅ Element count should match visual editor
- ✅ All three locations (title, author, button) found

**If Missing:**
```
[ReactRenderer abc123] renderTitleScreen called: {..., hasLocations: false}
```
This means fallback to centered layout (expected for new beats without visual editor data).

---

## Known Issues & Limitations

### Current Implementation
- ✅ **titleScreen** - Fully implemented and positioned
- ⏳ **introText** - Still needs positioning support
- ⏳ **endScreen** - Still needs positioning support
- ⏳ **other beats** - Still need positioning support

### Expected Behavior
- titleScreen should respect positions
- Other beat types will still use centered layouts until updated
- This is expected and not a bug

---

## Troubleshooting

### Elements Still Centered in Preview

**Possible Causes:**
1. Visual editor changes not saved
   - Solution: Click "Save Visual Changes" button

2. No location data in beat
   - Solution: Open visual editor, positions auto-generate, save

3. Locations not being passed
   - Check console: Should see `hasLocations: true`
   - If false, check TitleScreenBeat.performAction()

### Elements At Wrong Positions

**Possible Causes:**
1. Element names don't match expected
   - Check: Title, Author, Start (case-insensitive)
   - Check kind: 'text', 'button', 'hotspot'

2. Container size mismatch
   - Preview container should be full screen
   - Check CSS: `h-screen` applied

3. Coordinates scaled incorrectly
   - Should be pixel-perfect
   - No scaling applied

### Click Not Working

**Possible Causes:**
1. Button z-index too low
   - Check: Button should be on top
   - Verify: Other elements not covering button

2. Button not found in locations
   - Check console: `buttonLoc` should be defined
   - Check visual editor: Button exists

---

## Success Criteria

✅ All tests pass  
✅ Preview matches visual editor exactly  
✅ Positions accurate to the pixel  
✅ Sizes match visual editor  
✅ Button clickable and functional  
✅ No console errors  
✅ Backwards compatible (works without locations)  
✅ Round-trip save/load works  

---

## Next Steps After Testing

### If Successful ✅
1. Apply same pattern to introText beat
2. Apply to endScreen beat
3. Apply to all other visual beats
4. Test each beat type
5. Ensure complete parity

### If Issues Found ❌
1. Document specific failure cases
2. Check console logs for clues
3. Verify element names and kinds
4. Check if locations correctly saved
5. Report bugs with screenshots

---

## Technical Reference

### Element Finding Logic
```typescript
// Title
titleLoc = locations.find(loc => 
  loc.name === 'Title' || 
  (loc.kind === 'text' && loc.name.toLowerCase().includes('title'))
);

// Author  
authorLoc = locations.find(loc => 
  loc.name === 'Author' || 
  (loc.kind === 'text' && loc.name.toLowerCase().includes('author'))
);

// Button
buttonLoc = locations.find(loc => 
  loc.kind === 'hotspot' || 
  loc.kind === 'button' || 
  loc.name === 'Start'
);
```

### Default Visual Editor Positions (1024x768)
- **Title:** x=312, y=200, width=400, height=60
- **Author:** x=362, y=270, width=300, height=40
- **Button:** x=412, y=500, width=200, height=50

### Rendering Style
```tsx
style={{
  left: `${loc.x}px`,
  top: `${loc.y}px`,
  width: `${loc.width}px`,
  height: `${loc.height}px`
}}
```

---

## Related Documentation

- `Issues.md` - Preview Element Positioning Fix section
- `Progress.md` - Session 12 entry
- Visual editor positioning logic in `VisualWorkspace.tsx`
- Renderer interface in `packages/renderer/src/types.ts`

---

*Testing guide by: Senior Software Engineer*  
*Date: October 9, 2025*  
*Status: Ready for user testing*
