# ASPS Modern - Test Results & Root Cause Analysis
## October 13, 2025 - Afternoon Session

## Test Results Summary

After testing the supposedly-fixed unified rendering system, we found:

| Test | Result | Status |
|------|--------|--------|
| Background image scaling | ❌ FAILED | Backgrounds don't scale properly |
| Element dragging | ✅ PASSED | Easy to click and drag |
| Visual Properties Panel | ✅ PASSED | All features present |
| Save visual changes | ❌ FAILED | Button stays blue, unclear if saved |
| Preview using unified rendering | ❌ FAILED | Appears to use own engine |

## ROOT CAUSE ANALYSIS

### Issue #1: Preview Not Using Unified Rendering (CRITICAL)

**Symptoms:**
- Preview shows different layout than Visual Editor
- No evidence that PositionedBeatView is being used

**Investigation reveals:**
The code structure is correct:
- ✅ `PositionedBeatView` component exists in renderer package
- ✅ `ReactRenderer.renderTitleScreen()` checks for locations and calls positioned rendering
- ✅ `TitleScreenBeat.performAction()` passes locations array

**Likely Root Cause:**
The beat.locations Map is EMPTY when Preview runs, so the renderer falls back to centered layout.

**Why locations are empty:**
Looking at VisualWorkspace.tsx:
- Line 299: `beat.locations.clear()` - clears all locations
- Lines 301-316: Populates beat.locations from visualElements
- This happens in `handleSave()` - which is called when user clicks "Save visual changes"

**THE PROBLEM:** If the user doesn't click "Save visual changes" before opening Preview, the locations Map is EMPTY!

**Evidence:**
1. Visual editor works (uses visualElements state, not beat.locations)
2. Preview doesn't work (uses beat.locations which may be empty)
3. The gap: visualElements → beat.locations only happens on manual save

### Issue #2: Background Scaling

**Symptoms:**
- Backgrounds tile or repeat instead of scaling to fit

**Investigation reveals:**
- PositionedBeatView.tsx line 47 has: `backgroundSize: '100% 100%'`
- This SHOULD work, but doesn't

**Likely Root Cause:**
Background URL is likely not being passed correctly. If `backgroundUrl` prop is null/undefined, the background CSS won't apply.

**Why background URL might be null:**
1. In Visual Editor: Uses `backgroundAssetId` from state, needs to resolve to URL
2. In Preview: Uses `renderer.backgroundImageUrl` from state
3. Asset resolution might be failing
4. OR background asset ID not being saved to beat parameters

### Issue #3: Save Button Stays Blue

**Symptoms:**
- Pressing "Save visual changes" doesn't clear the blue highlight
- Unclear if changes were actually saved

**Investigation reveals:**
Looking at VisualWorkspace.tsx `handleSave()`:
- Line 333: `setHasChanges(false)` - should turn off blue
- But button likely stays blue

**Likely Root Cause:**
The save notification (lines 336-345) works, but the button styling doesn't reflect the state change. Or something is immediately setting hasChanges back to true.

## FIXES NEEDED

### Fix #1: Auto-save locations before Preview (CRITICAL)

**Solution:** Automatically populate beat.locations whenever visualElements changes, not just on manual save.

**Implementation:**
Add this to VisualWorkspace.tsx, right after visualElements state initialization:

```typescript
// Auto-save locations to beat whenever visualElements change
useEffect(() => {
  if (!beat) return;
  
  // Update beat.locations Map automatically
  beat.locations.clear();
  
  visualElements.forEach(el => {
    let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' = el.type as any;
    // ... type mapping logic ...
    
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
  
  console.log(`[VisualWorkspace] Auto-synced ${beat.locations.size} locations to beat`);
}, [visualElements, beat]);
```

**This ensures Preview always has current locations without requiring manual save!**

### Fix #2: Resolve Background Asset URLs

**Solution:** Add asset URL resolution logic.

**Implementation in VisualBeatEditor.tsx:**

```typescript
// Get actual URL from asset ID
const getAssetUrl = (assetId: string): string | undefined => {
  if (!assetId || !assets) return undefined;
  const asset = assets.find(a => a.id === assetId);
  return asset?.path || asset?.url;
};

// Use resolved URL
const backgroundUrl = getAssetUrl(backgroundAssetId);
```

**Implementation in ReactRenderer:**
Before calling `renderPositionedBeat`, resolve the background:

```typescript
// In renderTitleScreen(), before checking locations:
const backgroundAssetId = this.getState('backgroundAssetId');
if (backgroundAssetId && this.context.assetManager) {
  const asset = this.context.assetManager.getAsset(backgroundAssetId);
  if (asset) {
    this.backgroundImageUrl = asset.path || asset.url;
  }
}
```

### Fix #3: Visual Feedback for Save Button

**Solution:** Add proper button styling based on hasChanges state.

**Implementation in VisualWorkspace.tsx:**

Add save button to the component:

```tsx
{/* Add this button somewhere visible in the UI */}
<button
  onClick={handleSave}
  disabled={!hasChanges}
  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
    hasChanges 
      ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg' 
      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
  }`}
>
  {hasChanges ? 'Save Visual Changes' : 'No Changes'}
</button>
```

### Fix #4: Add Debugging Logs

**Add to ReactRenderer.tsx - renderTitleScreen method:**

```typescript
async renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void> {
  console.log(`[ReactRenderer] renderTitleScreen called`);
  console.log(`[ReactRenderer]   - locations:`, locations?.length || 0);
  if (locations && locations.length > 0) {
    console.log(`[ReactRenderer]   - locations detail:`, locations);
  }
  
  this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
  console.log(`[ReactRenderer]   - backgroundImageUrl:`, this.backgroundImageUrl);
  
  if (locations && locations.length > 0) {
    console.log(`[ReactRenderer] ✅ Using POSITIONED rendering`);
    return this.renderPositionedBeat('titleScreen', { title, author, buttonText }, locations);
  }
  
  console.log(`[ReactRenderer] ⚠️ Using CENTERED fallback (no locations)`);
  // ... rest of method
}
```

**Add to PositionedBeatView.tsx - at start of component:**

```typescript
export const PositionedBeatView: React.FC<PositionedBeatViewProps> = ({
  stageWidth,
  stageHeight,
  backgroundUrl,
  backgroundColor = 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
  elements,
  onAction,
  interactive = true,
}) => {
  console.log('[PositionedBeatView] Rendering');
  console.log('[PositionedBeatView]   - elements:', elements.length);
  console.log('[PositionedBeatView]   - backgroundUrl:', backgroundUrl);
  console.log('[PositionedBeatView]   - stageSize:', { width: stageWidth, height: stageHeight });
  
  // ... rest of component
}
```

## IMPLEMENTATION PRIORITY

1. **Fix #1 (Auto-save locations)** - CRITICAL - Without this, Preview will never work
2. **Fix #4 (Add debugging)** - HIGH - Verify Fix #1 works
3. **Fix #2 (Background URLs)** - HIGH - Makes backgrounds actually show
4. **Fix #3 (Save button feedback)** - MEDIUM - UX improvement

## VERIFICATION STEPS

After implementing fixes:

1. Open Visual Editor for a TitleScreen beat
2. Position some elements
3. **DO NOT** click "Save visual changes"
4. Open Preview immediately
5. Check console logs:
   - Should see: "[ReactRenderer] ✅ Using POSITIONED rendering"
   - Should see: "[ReactRenderer]   - locations: 3" (or however many elements)
   - Should see: "[PositionedBeatView] Rendering"

If you see "⚠️ Using CENTERED fallback", Fix #1 didn't work.

6. Assign a background image
7. Check console for background URL being resolved
8. Verify background scales to fit (no tiling)

## CONCLUSION

The unified rendering architecture IS in place, but there's a critical data flow problem:
- Visual Editor works (uses local state)
- Preview doesn't work (uses beat.locations which isn't auto-synced)
- Fix: Auto-sync visualElements → beat.locations on every change

This explains why testing failed despite the code being "correct" - the two systems were using different data sources!

---

*Created: October 13, 2025*
*Status: Root causes identified, fixes specified*
*Next: Implement fixes in order of priority*
