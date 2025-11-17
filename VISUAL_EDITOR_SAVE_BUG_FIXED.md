# Visual Editor Save Bug - FIXED ✅

## The Problem

Preview showed "Rendering with 0 locations" because the visual editor wasn't saving locations to `beat.locations` Map!

## Root Cause

The visual editor (VisualWorkspace.tsx) was:
- ✅ Saving `visualElements` to parameters
- ✅ Saving `locs` to parameters (for ASML export)
- ❌ **NOT** updating `beat.locations` Map

So when the beat was rendered in preview:
```typescript
const locations = Array.from(this.locations.values());
// locations = [] (empty array!)
```

## The Fix

### 1. Save: Update beat.locations Map ✅

Added code in `handleSave()` to update `beat.locations` Map:

```typescript
// Clear existing locations
beat.locations.clear();

// Add all visual elements as locations
visualElements.forEach(el => {
  const location = {
    kind: el.type,  // 'text', 'button', 'dialog', etc.
    name: el.name || el.text || '',
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    zIndex: el.z
  };
  
  beat.locations.set(el.name || el.id, location);
});

console.log(`[VisualWorkspace] Saved ${beat.locations.size} locations to beat`);
```

### 2. Load: Populate beat.locations Map ✅

Added code in `useEffect()` to populate `beat.locations` when loading:

```typescript
// When loading from ASML or existing visualElements
if (elements.length > 0) {
  beat.locations.clear();
  elements.forEach((el: VisualElement) => {
    beat.locations.set(el.name || el.id, {
      kind,
      name: el.name || el.text || '',
      x: Math.round(el.x),
      y: Math.round(el.y),
      width: Math.round(el.width),
      height: Math.round(el.height),
      zIndex: el.z
    });
  });
  console.log(`[VisualWorkspace] Loaded ${beat.locations.size} locations to beat.locations Map`);
}
```

## Files Modified

1. **VisualWorkspace.tsx** - Lines 625-665 (handleSave)
2. **VisualWorkspace.tsx** - Lines 145-195 (useEffect loading)

## What You Need to Do

### Step 1: Rebuild Builder Package
```bash
cd packages/builder
npm run build
cd ../..
```

### Step 2: Test the Fix

1. **Open your story**
2. **Go to titleScreen beat** 
3. **Click Visual Editor tab**
4. **Click "Save Visual Changes"** button
   - Watch console - should see: `[VisualWorkspace] Saved 3 locations to beat`
5. **Start Preview**
6. **Check console** - should now see:
   ```
   [TitleScreenBeat] Rendering with 3 locations: [...]
   [ReactRenderer] - locations length: 3
   [ReactRenderer] - Using POSITIONED rendering
   ```

### Expected Result

**Before (Bug):**
```
[TitleScreenBeat] Rendering with 0 locations: Array(0)
[ReactRenderer] - Using CENTERED fallback rendering
```

**After (Fixed):**
```
[VisualWorkspace] Saved 3 locations to beat
[TitleScreenBeat] Rendering with 3 locations: Array(3)
[ReactRenderer] - locations length: 3  
[ReactRenderer] - Using POSITIONED rendering
```

## Why This Works

The data flow is now:

```
Visual Editor Creates Elements
  ↓
User clicks "Save Visual Changes"
  ↓
VisualWorkspace updates:
  - visualElements (for UI)
  - locs (for ASML export)
  - beat.locations Map ← NEW!
  ↓
Preview starts
  ↓
TitleScreenBeat.performAction()
  ↓
locations = Array.from(beat.locations.values())
  ↓
locations has 3 elements! ✅
  ↓
renderer.renderTitleScreen(..., locations)
  ↓
ReactRenderer uses POSITIONED rendering ✅
```

## Debugging

If it still doesn't work, check console for:

**Scenario 1: Locations not saved**
```
[VisualWorkspace] Saved 0 locations to beat
```
→ Visual elements not being created properly

**Scenario 2: Locations saved but not loaded**
```
[VisualWorkspace] Saved 3 locations to beat
... (later) ...
[TitleScreenBeat] Rendering with 0 locations
```
→ Loading logic not running, check useEffect

**Scenario 3: Everything working!**
```
[VisualWorkspace] Saved 3 locations to beat
[TitleScreenBeat] Rendering with 3 locations
[ReactRenderer] - Using POSITIONED rendering
```
→ Preview should show positioned elements! 🎉

## Background Image

Note: The background image issue is separate. The background is stored in `backgroundAssetId` parameter but not passed to the renderer yet. That's a different fix we can do next.

---

**Status:** Code complete, ready for rebuild and testing  
**Date:** October 10, 2025  
**Next:** User rebuild builder package and test
