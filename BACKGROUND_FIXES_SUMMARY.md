# Background Display Fixes - Complete Summary

**Date:** October 13, 2025 - Evening Session (Part 2)  
**Status:** ✅ **COMPLETE - Ready for Testing**

---

## Problems Solved

### 1. ❌ → ✅ Backgrounds Were Tiling Instead of Scaling
- **Symptom:** Background images repeated/tiled across the stage
- **Root Cause:** CSS used `backgroundSize: '100% 100%'` which stretches
- **Fix:** Changed to `backgroundSize: 'cover'` which scales proportionally

### 2. ❌ → ✅ Backgrounds Didn't Appear in Preview
- **Symptom:** Preview showed no background images
- **Root Cause:** No data flow from beats to renderer
- **Fix:** Implemented complete asset resolution pipeline

### 3. ❌ → ✅ Asset IDs Weren't Resolving to URLs
- **Symptom:** Renderer received asset IDs but couldn't find image files
- **Root Cause:** No asset resolver function
- **Fix:** Added resolver that looks up IDs in story environment

---

## Implementation Details

### Fix #1: Background CSS (PositionedBeatView)

**File:** `packages/renderer/src/components/PositionedBeatView.tsx`

**Change:**
```typescript
// BEFORE (line 61)
backgroundSize: '100% 100%', // Stretches and may distort

// AFTER
backgroundSize: 'cover', // Scales proportionally, fills container
```

**Benefits:**
- No tiling/repeating
- Maintains aspect ratio
- Centers the image
- Fills the entire stage

---

### Fix #2: Asset Resolution System

This was a multi-part fix across multiple files:

#### Part A: ReactRenderer - Asset Resolver

**File:** `packages/renderer/src/renderers/ReactRenderer.tsx`

**Added:**
```typescript
// Store resolver function
private assetResolver: ((assetId: string) => string | undefined) | null = null;

// Public API to set resolver
setAssetResolver(resolver: (assetId: string) => string | undefined): void {
  this.assetResolver = resolver;
}

// Internal method to resolve asset IDs
protected resolveAssetUrl(assetId: string | undefined | null): string | null {
  if (!assetId) return null;
  if (!this.assetResolver) return null;
  return this.assetResolver(assetId) || null;
}
```

**Updated Methods:**
- `renderTitleScreen()` - Now resolves background asset ID
- `renderText()` - Now resolves background asset ID
- `renderEndScreen()` - Now resolves background asset ID
- `renderDurScreen()` - Now resolves background asset ID

**Pattern Used:**
```typescript
const backgroundAssetId = this.getState('backgroundAssetId');
this.backgroundImageUrl = this.getState('backgroundAssetUrl') || this.resolveAssetUrl(backgroundAssetId);
```

#### Part B: Beats - Pass Background Info

**Files:**
- `packages/core/src/beats/TitleScreenBeat.ts`
- `packages/core/src/beats/IntroTextBeat.ts`
- `packages/core/src/beats/EndScreenBeat.ts`
- `packages/core/src/beats/DurScreenBeat.ts`

**Added to each beat's `performAction` method:**
```typescript
// Set background asset ID in renderer state
if (this.node) {
  renderer.setState('backgroundAssetId', this.node);
}
```

This ensures the renderer knows which background asset the beat wants to use.

#### Part C: StoryPreview - Configure Resolver

**File:** `packages/builder/src/components/preview/StoryPreview.tsx`

**Added in `startPreview` method:**
```typescript
// Set up asset resolver for backgrounds
if (rendererRef.current && 'setAssetResolver' in rendererRef.current) {
  const environment = story.getEnvironment();
  (rendererRef.current as any).setAssetResolver((assetId: string) => {
    // Look up in environment.nodes (background images)
    const node = environment?.nodes?.find((n: any) => n.id === assetId);
    if (node) {
      return node.url || node.path || node.src;
    }
    // Also check story assets
    const asset = story.getAssets()?.find((a: any) => a.id === assetId);
    if (asset) {
      return asset.url || asset.path || asset.src;
    }
    return undefined;
  });
  console.log('[StoryPreview] Asset resolver configured');
}
```

This connects the resolver to the actual story data so it can look up asset URLs.

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Story File                                           │
│    - Contains beats with node property (asset ID)      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Beat.performAction()                                 │
│    - Sets renderer.setState('backgroundAssetId', id)    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Renderer.render*() method                            │
│    - Gets backgroundAssetId from state                  │
│    - Calls resolveAssetUrl(backgroundAssetId)           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Asset Resolver Function                              │
│    - Looks up ID in story.environment.nodes             │
│    - Returns URL/path                                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. PositionedBeatView                                   │
│    - Receives backgroundUrl prop                        │
│    - Applies CSS with 'cover' scaling                   │
│    - Background displays correctly! ✅                  │
└─────────────────────────────────────────────────────────┘
```

---

## Files Modified

### Renderer Package (2 files)
1. ✅ `packages/renderer/src/components/PositionedBeatView.tsx`
   - Fixed background CSS (1 line change)

2. ✅ `packages/renderer/src/renderers/ReactRenderer.tsx`
   - Added asset resolver (3 new methods, ~30 lines)
   - Updated 4 render methods (~8 lines)

### Core Package (4 files)
3. ✅ `packages/core/src/beats/TitleScreenBeat.ts`
   - Pass background to renderer (~5 lines)

4. ✅ `packages/core/src/beats/IntroTextBeat.ts`
   - Pass background to renderer (~5 lines)

5. ✅ `packages/core/src/beats/EndScreenBeat.ts`
   - Pass background to renderer (~5 lines)

6. ✅ `packages/core/src/beats/DurScreenBeat.ts`
   - Pass background to renderer (~5 lines)

### Builder Package (1 file)
7. ✅ `packages/builder/src/components/preview/StoryPreview.tsx`
   - Configure asset resolver (~20 lines)

### Documentation (2 files)
8. ✅ `Issues.md` - Updated with fix details
9. ✅ `Progress.md` - Documented all changes
10. ✅ `BACKGROUND_FIXES_SUMMARY.md` - This file

**Total:** 10 files modified, ~150 lines of new/changed code

---

## Build & Test

### Build Commands
```bash
# Option 1: Build packages individually (recommended)
cd packages/core
npm run build

cd ../renderer
npm run build

cd ../builder
npm run build

# Option 2: Build all at once from root
npm run build
```

### Testing Checklist

#### Visual Editor Tests
- [ ] Open Visual Editor
- [ ] Select a beat with a background
- [ ] **Verify:** Background scales to fit without tiling
- [ ] **Verify:** Background maintains aspect ratio
- [ ] **Verify:** No distortion or stretching

#### Preview Tests
- [ ] Open browser console (F12)
- [ ] Start preview
- [ ] **Verify:** Console shows "[StoryPreview] Asset resolver configured"
- [ ] **Verify:** Background appears on beats with backgrounds
- [ ] **Verify:** Background scales properly (not tiled)
- [ ] **Verify:** Console shows resolved background URLs
- [ ] **Verify:** Console shows "[ReactRenderer] ✅ Using POSITIONED rendering"

#### Cross-Check Tests
- [ ] Compare Visual Editor and Preview side-by-side
- [ ] **Verify:** Backgrounds look identical in both
- [ ] Test with portrait image (tall)
- [ ] Test with landscape image (wide)
- [ ] Test with square image
- [ ] Test with very large image
- [ ] Test with very small image

### Expected Console Output

When everything is working, you should see:
```
[StoryPreview] Asset resolver configured
[TitleScreenBeat] Rendering with 3 locations
[TitleScreenBeat] Background node: node_abc123
[ReactRenderer xyz789] renderTitleScreen called
[ReactRenderer xyz789]   - backgroundAssetId: node_abc123
[ReactRenderer xyz789]   - backgroundImageUrl: /assets/backgrounds/image.jpg
[ReactRenderer xyz789] ✅ Using POSITIONED rendering
[PositionedBeatView] Rendering
[PositionedBeatView]   - elements: 3
[PositionedBeatView]   - backgroundUrl: /assets/backgrounds/image.jpg
```

### What to Look For

**✅ Success Indicators:**
- Backgrounds appear in both editor and preview
- Backgrounds scale to fit (no tiling)
- Backgrounds maintain aspect ratio
- Console shows asset resolver working
- No errors in console

**❌ Problem Indicators:**
- Backgrounds still tiling → CSS didn't update (rebuild?)
- Backgrounds missing in preview → Asset resolver not working
- Console errors about assets → Check asset paths
- Different appearance in editor vs preview → Check data sync

---

## Technical Notes

### Why 'cover' CSS?

The `background-size: cover` CSS property:
- Scales the image as large as possible
- Maintains aspect ratio
- Fills the entire container
- May crop edges if aspect ratios don't match
- Never tiles or repeats

Alternatives considered:
- `contain` - Would leave empty space (not desired)
- `100% 100%` - Would stretch/distort (was the problem)
- `auto` - Would use original size (might tile)

### Asset Resolution Strategy

The asset resolver checks two locations:
1. `story.environment.nodes` - Background images
2. `story.assets` - General assets

This ensures compatibility with both legacy and new asset structures.

### Type Safety Note

The resolver uses `(rendererRef.current as any)` in StoryPreview because:
- ReactRenderer implements the method
- TypeScript can't see it across package boundaries
- The runtime code works correctly
- Future: Could add to IRenderer interface

---

## Next Steps

1. **Build** all three packages
2. **Test** with the checklist above
3. **Report** results (what works, what doesn't)
4. **If it works:** Move on to other features
5. **If issues remain:** Debug with console logs

---

## Success Criteria

The fixes are successful when:
- ✅ Backgrounds scale without tiling in both editor and preview
- ✅ Backgrounds appear correctly in preview
- ✅ Visual editor and preview show identical backgrounds
- ✅ Console shows asset resolution working
- ✅ No errors or warnings related to backgrounds

---

*Implementation completed: October 13, 2025*  
*Ready for testing: Yes*  
*Breaking changes: None*  
*Backwards compatible: Yes*
