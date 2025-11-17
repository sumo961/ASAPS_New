# Preview Positioning Debug Guide

## The Problem

Preview is showing centered layout instead of positioned layout from visual editor:
- **Visual Editor**: Shows elements at correct positions with background
- **Preview**: Shows elements centered without background

## What I Just Fixed

### 1. TitleScreenBeat Not Passing Locations ✅

**Problem:** TitleScreenBeat.performAction() wasn't passing locations to renderer

**Fix:** Updated to extract and pass locations:
```typescript
const locations = Array.from(this.locations.values());
await renderer.renderTitleScreen(this.title, this.author, this.buttonText, locations);
```

### 2. Added Comprehensive Debugging ✅

Added console logging at multiple points:
- TitleScreenBeat: Logs number of locations before rendering
- IntroTextBeat: Logs number of locations before rendering  
- ReactRenderer: Logs detailed info about locations received

## How to Debug

### Step 1: Rebuild the packages
```bash
cd packages/core
npm run build
cd ../renderer
npm run build
cd ../..
```

### Step 2: Start the application
```bash
npm run dev
```

### Step 3: Open browser console

### Step 4: Start Preview

Click "Start Preview" and watch the console output. You should see:

```
[TitleScreenBeat] Rendering with X locations: [...]
[ReactRenderer abc123] renderTitleScreen called
[ReactRenderer abc123] - locations: [...]
[ReactRenderer abc123] - locations length: X
[ReactRenderer abc123] - has locations: true/false
[ReactRenderer abc123] - Using POSITIONED/CENTERED rendering
```

## What to Look For

### Scenario 1: No Locations
```
[TitleScreenBeat] Rendering with 0 locations: []
[ReactRenderer] - Using CENTERED fallback rendering
```

**Problem:** Visual editor isn't saving locations to beat
**Check:** 
- Are locations being created in visual editor?
- Are they being saved when you save the story?
- Are they being loaded when you load the story?

### Scenario 2: Locations Not Reaching Renderer
```
[TitleScreenBeat] Rendering with 3 locations: [...]
[ReactRenderer] - locations: undefined
[ReactRenderer] - Using CENTERED fallback rendering
```

**Problem:** Type mismatch or build issue
**Fix:** Rebuild packages with `./rebuild-and-check.sh`

### Scenario 3: Locations Received But Not Used
```
[TitleScreenBeat] Rendering with 3 locations: [...]
[ReactRenderer] - locations: [...]
[ReactRenderer] - locations length: 3
[ReactRenderer] - Using POSITIONED rendering
```

**This is GOOD!** Positioned rendering should work.
If you still see centered layout, check:
- Is renderPositioned() working correctly?
- Are the positions correct in the locations array?

## Background Image Issue

The background image in visual editor is **not** part of the beat's locations.

**Current State:**
- Visual editor shows background as part of canvas
- Preview doesn't know about this background
- Beat.locations only contains UI elements (title, author, button)

**Solutions:**

### Option 1: Add background to beat parameters
```typescript
// In TitleScreenBeat
public backgroundImage?: string;

// Pass to renderer
await renderer.renderTitleScreen(
  this.title, 
  this.author, 
  this.buttonText, 
  locations,
  this.backgroundImage  // NEW parameter
);
```

### Option 2: Add background as a location
```typescript
// In visual editor, when saving
locations.set('background', {
  kind: 'background',
  name: 'background',
  x: 0,
  y: 0,
  width: 1024,
  height: 768,
  imageUrl: '...'
});
```

### Option 3: Use node system
```typescript
// IntroTextBeat already has this
public node?: string; // Background asset ID
```

## Quick Test

Create a simple test story:
1. Create new titleScreen beat
2. Open visual editor
3. Add/position elements
4. Save story
5. Export to ASML
6. Check if `<loc>` elements are in the XML
7. Import ASML
8. Start preview
9. Check console logs

## Expected ASML Structure

```xml
<beat id="beat_0" name="Title" type="titleScreen">
  <loc kind="text" name="Title" x="312" y="200" width="400" height="60" />
  <loc kind="text" name="Author" x="362" y="270" width="300" height="40" />
  <loc kind="button" name="Start" x="412" y="500" width="200" height="50" />
  <function kind="titleScreen" 
    title="My Interactive Story" 
    author="Story Author" 
    buttonText="Start" />
</beat>
```

## Files Modified

1. `/packages/core/src/beats/TitleScreenBeat.ts` - Now passes locations
2. `/packages/core/src/beats/IntroTextBeat.ts` - Added debug logging
3. `/packages/renderer/src/renderers/ReactRenderer.tsx` - Added debug logging

## Next Steps

1. **Rebuild packages** with the fixes
2. **Test in preview** and check console
3. **Report what you see** in the console logs
4. Based on logs, we'll know:
   - Are locations being saved?
   - Are locations being passed?
   - Is positioned rendering being used?
   - What's the actual issue?

---

**Status:** Debug logging added, awaiting test results  
**Date:** October 10, 2025
