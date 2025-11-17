# Preview Positioning Fix - Quick Summary

## What Was Wrong

**TitleScreenBeat wasn't passing locations to the renderer!**

In Session 13, we added the universal positioning system, but TitleScreenBeat was never updated to actually pass the locations array.

```typescript
// BUG (what it was doing):
await renderer.renderTitleScreen(this.title, this.author, this.buttonText);
// Missing 4th parameter!

// FIXED (what it does now):
const locations = Array.from(this.locations.values());
await renderer.renderTitleScreen(this.title, this.author, this.buttonText, locations);
// ✅ Now passes locations
```

## What I Fixed

1. ✅ **TitleScreenBeat.ts** - Now extracts and passes locations
2. ✅ **IntroTextBeat.ts** - Added debug logging (was already correct)
3. ✅ **ReactRenderer.tsx** - Added comprehensive debug logging

## What You Need to Do

### Step 1: Rebuild Packages
```bash
cd packages/core
npm run build
cd ../renderer  
npm run build
cd ../..
```

### Step 2: Test Preview
```bash
npm run dev
```

1. Open your story
2. Click "Start Preview"
3. **Open browser console** (F12)
4. Look for these log messages:

### Step 3: Check Console Output

You should see something like:

```
[TitleScreenBeat] Rendering with 3 locations: [...]
[ReactRenderer abc123] renderTitleScreen called
[ReactRenderer abc123] - locations: [{kind: "text", name: "Title", ...}, ...]
[ReactRenderer abc123] - locations length: 3
[ReactRenderer abc123] - has locations: true
[ReactRenderer abc123] - Using POSITIONED rendering
```

### What the Logs Mean

**Good ✅:**
```
[TitleScreenBeat] Rendering with 3 locations
[ReactRenderer] - Using POSITIONED rendering
```
→ Positioning should work! If it still looks wrong, there's a different issue.

**Problem ⚠️:**
```
[TitleScreenBeat] Rendering with 0 locations
[ReactRenderer] - Using CENTERED fallback rendering
```
→ Visual editor isn't saving locations. We need to fix the save process.

**Problem ⚠️:**
```
[TitleScreenBeat] Rendering with 3 locations
[ReactRenderer] - locations: undefined
```
→ Type mismatch. Run `./rebuild-and-check.sh` again.

## About the Background Image

The background image you see in the visual editor is **not** part of the beat's location data - it's just the canvas background in the editor.

**Options to fix this:**

1. **Add background to beat parameters** (simplest)
2. **Use node system** (IntroTextBeat already has this)
3. **Add background as a location** (most flexible)

We can implement whichever you prefer after we get positioning working.

## Next Steps

1. **Rebuild** packages (commands above)
2. **Test** preview
3. **Report** what you see in console
4. Based on console output, we'll know exactly what to fix next

## Files Changed

- `/packages/core/src/beats/TitleScreenBeat.ts` - Line 40-48
- `/packages/core/src/beats/IntroTextBeat.ts` - Line 59
- `/packages/renderer/src/renderers/ReactRenderer.tsx` - Lines 604-617

---

**The fix is code-complete. Just needs rebuild and testing!**

**Date:** October 10, 2025  
**Status:** Ready for user testing
