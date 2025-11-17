# Unified Rendering Investigation - October 13, 2025

## Purpose
Investigate why unified rendering isn't working despite code being in place.

## Test Setup Needed

### 1. Check if Locations Are Being Saved

**Test in Visual Editor:**
```
1. Open a TitleScreen beat
2. Make sure it has positioned elements (Title, Author, Start button)
3. Open browser console
4. Click "Save visual changes"
5. Check console logs for: "[VisualWorkspace] Saved X locations to beat"
```

**Expected:** Should see "Saved 3 locations to beat" (or similar)
**If fails:** Locations are not being saved

### 2. Check if Locations Persist to Beat Object

**Test in Browser Console:**
```javascript
// While viewing a beat in visual editor:
// 1. Get the selected beat reference
// 2. Check its locations Map
console.log('Locations count:', selectedBeat.locations.size);
console.log('Locations:', Array.from(selectedBeat.locations.entries()));
```

**Expected:** Should show non-empty locations Map with positioned elements
**If fails:** Beat.locations Map is not being populated

### 3. Check if Preview Gets Locations

**Test in Preview:**
```
1. Save visual changes in editor
2. Open Preview
3. Check console for: "[TitleScreenBeat] Rendering with X locations"
```

**Expected:** Should see "Rendering with 3 locations" (matching saved count)
**If fails:** Locations are lost between editor and preview

### 4. Check if Renderer Uses Positioned Rendering

**Test in Preview:**
```
1. Open Preview
2. Check console for: "[ReactRenderer] - Using POSITIONED rendering"
```

**Expected:** Should see "Using POSITIONED rendering" not "Using CENTERED fallback"
**If fails:** Renderer is falling back to centered layout

### 5. Check Background Asset URL

**Test in Both Editor and Preview:**
```javascript
// In browser console while in visual editor:
console.log('Background asset ID:', backgroundAssetId);

// In preview:
console.log('Renderer background URL:', renderer.backgroundImageUrl);
```

**Expected:** Both should show the same asset URL/ID
**If fails:** Background not being passed to renderer

## Root Cause Scenarios

### Scenario A: Locations Not Saved Properly
**Symptoms:**
- Test 1 fails (no console log about saving)
- OR Test 2 fails (locations Map is empty)

**Fix:**
- Check VisualWorkspace.handleSave() execution
- Verify beat.locations.set() is being called
- Add more detailed logging

### Scenario B: Locations Lost Between Editor and Preview
**Symptoms:**
- Tests 1-2 pass (locations saved)
- Test 3 fails (Preview gets 0 locations)

**Fix:**
- Preview might be using a different beat instance
- Need to ensure Preview uses the SAME beat objects from the story
- Check StoryPreview.tsx beat reference

### Scenario C: Renderer Logic Problem
**Symptoms:**
- Tests 1-3 pass (locations reach renderer)
- Test 4 fails (falls back to centered rendering)

**Fix:**
- Check renderTitleScreen conditions
- Verify locations array is not empty at render time
- Add logging to renderTitleScreen

### Scenario D: Background URL Not Set
**Symptoms:**
- Positioned rendering works
- But backgrounds don't show or scale wrong

**Fix:**
- Check how backgroundAssetUrl is resolved
- Verify renderer.backgroundImageUrl is set before rendering
- Check PositionedBeatView background CSS

## Quick Debugging Additions

### Add to ReactRenderer.renderTitleScreen (after line 416):
```typescript
console.log('[ReactRenderer] renderTitleScreen called');
console.log('[ReactRenderer]   - locations:', locations?.length || 0);
console.log('[ReactRenderer]   - backgroundImageUrl:', this.backgroundImageUrl);
console.log('[ReactRenderer]   - Will use:', locations && locations.length > 0 ? 'POSITIONED' : 'CENTERED');
```

### Add to PositionedBeatView (at start of component):
```typescript
console.log('[PositionedBeatView] Rendering');
console.log('[PositionedBeatView]   - elements:', elements.length);
console.log('[PositionedBeatView]   - backgroundUrl:', backgroundUrl);
console.log('[PositionedBeatView]   - stageSize:', { width: stageWidth, height: stageHeight });
```

### Add to VisualWorkspace.handleSave (after line 299):
```typescript
console.log('[VisualWorkspace] Saving visual elements');
console.log('[VisualWorkspace]   - visualElements count:', visualElements.length);
console.log('[VisualWorkspace]   - backgroundAssetId:', backgroundAssetId);
console.log('[VisualWorkspace]   - beat.locations before:', beat.locations.size);
```

### Add to VisualWorkspace.handleSave (after line 316):
```typescript
console.log('[VisualWorkspace] After saving to beat.locations');
console.log('[VisualWorkspace]   - beat.locations after:', beat.locations.size);
console.log('[VisualWorkspace]   - locations:', Array.from(beat.locations.entries()));
```

## Expected Console Output (Working System)

```
When saving in Visual Editor:
[VisualWorkspace] Saving visual elements
[VisualWorkspace]   - visualElements count: 3
[VisualWorkspace]   - backgroundAssetId: bg-123
[VisualWorkspace]   - beat.locations before: 0
[VisualWorkspace] After saving to beat.locations  
[VisualWorkspace]   - beat.locations after: 3
[VisualWorkspace]   - locations: [['Title', {...}], ['Author', {...}], ['Start', {...}]]
[VisualWorkspace] Saved 3 locations to beat

When running in Preview:
[TitleScreenBeat] Rendering with 3 locations
[TitleScreenBeat] Background node: bg-123
[ReactRenderer] renderTitleScreen called
[ReactRenderer]   - locations: 3
[ReactRenderer]   - backgroundImageUrl: /assets/bg-123.jpg
[ReactRenderer]   - Will use: POSITIONED
[ReactRenderer] Rendering positioned titleScreen with 3 elements
[PositionedBeatView] Rendering
[PositionedBeatView]   - elements: 3
[PositionedBeatView]   - backgroundUrl: /assets/bg-123.jpg
[PositionedBeatView]   - stageSize: { width: 1024, height: 768 }
```

## Next Steps

1. Add all debugging logs to the codebase
2. Test in application
3. Collect console output
4. Compare with expected output
5. Identify which scenario matches the actual behavior
6. Implement targeted fix

---

*Created: October 13, 2025*
*Status: Investigation framework ready*
