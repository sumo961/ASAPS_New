# Unified Rendering - Testing Guide

## Quick Start Testing

### Test 1: Basic Visual Editor (5 minutes)

1. **Open the app**
   ```bash
   npm start
   ```

2. **Create or load a story**
   - Use existing story or create new one

3. **Select a TitleScreen beat**
   - Click on TitleScreen in flowchart

4. **Switch to Visual tab**
   - Look for "Visual Editor" tab at top
   - Click it

5. **Verify rendering**
   - ✅ Should see title text
   - ✅ Should see author text  
   - ✅ Should see Start button
   - ✅ Should see background (blue gradient if no image)
   - ✅ Elements should be positioned correctly

**Expected Result:** Visual editor shows the beat with proper positioning and styling.

**If it fails:** Check browser console for errors and report.

---

### Test 2: Preview Comparison (10 minutes) 🎯 **MOST IMPORTANT**

1. **In Visual Editor**
   - Note the positions of all elements
   - Note the styling (colors, sizes)
   - Take a screenshot if possible

2. **Open Preview**
   - Click "Preview" button in header
   - Click "Start Preview" in modal

3. **Compare**
   - ✅ Title should be in SAME position
   - ✅ Author should be in SAME position
   - ✅ Button should be in SAME position
   - ✅ Background should match
   - ✅ Styling should be IDENTICAL

**Expected Result:** Visual Editor and Preview look EXACTLY the same.

**This is the key test!** If they don't match, something is wrong with the unified rendering.

---

### Test 3: Drag and Drop (5 minutes)

*Note: Drag functionality needs to be tested once EditableReactRenderer overlay is working*

1. **In Visual Editor**
   - Try to select an element (title, author, button)
   - Try to drag it to a new position
   - Try to resize it

**Expected Result:** 
- Elements should be selectable
- Should show blue border when selected
- Should be draggable
- Should be resizable

**If not working:** This is expected if EditableWrapper isn't rendering yet. Check console for errors.

---

### Test 4: Multiple Beat Types (10 minutes)

Test with different beat types:

1. **TitleScreen** ✅
   - Already tested above

2. **IntroText**
   - Select IntroText beat
   - Switch to Visual tab
   - Verify text displays
   - Verify Continue button displays

3. **EndScreen**
   - Select EndScreen beat
   - Switch to Visual tab
   - Verify message displays
   - Verify restart button displays

4. **Compare each with Preview**
   - For each beat type
   - Open preview and navigate to that beat
   - Verify rendering matches Visual Editor

**Expected Result:** All beat types render identically in both editor and preview.

---

## Detailed Testing

### Test 5: Background Images (if assets available)

1. **Add a background asset**
   - Click "Assets" in header
   - Upload a background image

2. **Assign to beat**
   - Select beat in flowchart
   - In Inspector, set background/node
   - Save changes

3. **Check Visual Editor**
   - Switch to Visual tab
   - Background should display

4. **Check Preview**
   - Open preview
   - Background should display IDENTICALLY

**Expected Result:** Background shows in both editor and preview, looks the same.

---

### Test 6: Persistence (10 minutes)

1. **Make changes in Visual Editor**
   - Drag elements (if working)
   - Or just note current positions

2. **Save the story**
   - Use Export button
   - Save as ASML file

3. **Create new story**
   - Clear current story
   - Or restart app

4. **Import the saved story**
   - Use Import button
   - Select the ASML file

5. **Check Visual Editor**
   - Open same beat
   - Switch to Visual tab
   - Verify elements are in same positions

**Expected Result:** Positions are preserved through export/import roundtrip.

---

## Common Issues and Solutions

### Issue: Visual tab doesn't appear

**Cause:** Beat type doesn't support visual editing

**Solution:** Select a beat type that supports visual editor:
- TitleScreen
- IntroText
- EndScreen
- DurScreen
- InputText
- HyperText

---

### Issue: Visual Editor is blank

**Possible Causes:**
1. Beat has no locations defined
2. Story object not created correctly
3. EditableReactRenderer failed to initialize

**Check:**
- Browser console for errors
- Beat object has locations (beat.locations.size > 0)
- Story object exists

---

### Issue: Preview and Visual Editor look different

**This is a BUG!** They should look identical.

**Report:**
1. Which beat type?
2. What's different? (position, style, missing elements)
3. Screenshot of both
4. Console errors

---

### Issue: Can't drag elements

**Expected behavior:** Dragging needs EditableWrapper to be working

**Check:**
1. Do elements show blue border when clicked?
2. Any console errors about EditableWrapper?
3. Is EditableReactRenderer in edit mode?

---

### Issue: Compilation errors

**Run:**
```bash
npm run build
# or
tsc --noEmit
```

**Check:**
- All imports correct?
- EditableReactRenderer exported from renderer package?
- UnifiedVisualEditor imported correctly in VisualWorkspace?

---

## Success Criteria Checklist

### Critical (Must Pass)
- [ ] Visual Editor renders beats
- [ ] Preview renders beats
- [ ] **Visual Editor and Preview look IDENTICAL**
- [ ] No compilation errors
- [ ] No runtime errors in console

### Important (Should Pass)
- [ ] Multiple beat types work
- [ ] Background images display
- [ ] Positions persist through export/import
- [ ] UI is responsive and smooth

### Nice to Have (Can Fix Later)
- [ ] Drag and drop works
- [ ] Resize works
- [ ] Selection indicators work
- [ ] All beat types supported

---

## Reporting Results

### If Everything Works ✅

**Report:**
```
✅ Unified rendering tested successfully!

Tested:
- TitleScreen, IntroText, EndScreen
- Visual Editor and Preview match perfectly
- No console errors
- Positions persist

Ready to proceed with asset management and remaining beat types.
```

### If Issues Found ❌

**Report:**
```
❌ Issue found in unified rendering

Beat Type: TitleScreen
Issue: Visual Editor shows blue background, Preview shows gradient
Console Errors: [paste errors]
Screenshots: [attach if possible]

Other notes: [any additional info]
```

---

## Next Steps After Testing

### If Tests Pass ✅

1. **Delete VisualBeatEditor**
   - No longer needed
   - Saves maintenance burden

2. **Add remaining beat types**
   - ConversationChoice, MovementChoice, etc.
   - Follow EditableReactRenderer pattern

3. **Implement asset management**
   - Critical blocker for backgrounds
   - Enable full feature testing

4. **Polish visual editor**
   - Grid snapping
   - Alignment guides
   - Multi-select

### If Tests Fail ❌

1. **Debug the specific issue**
   - Use console errors to identify problem
   - Check EditableReactRenderer render methods
   - Verify beat.execute() is being called

2. **Fix and re-test**
   - Make targeted fix
   - Run tests again
   - Iterate until working

3. **Document any quirks**
   - Note any workarounds needed
   - Update architecture docs

---

## Debug Commands

### Check if EditableReactRenderer is in edit mode
```typescript
// In browser console (after selecting element in editor)
console.log(window.rendererRef?.current?.editMode)
// Should log: true
```

### Check beat locations
```typescript
// In browser console
console.log(selectedBeat?.locations)
// Should show Map of locations
```

### Check Story object
```typescript
// In browser console
console.log(window.story)
// Should show Story object with beats
```

---

*Created: October 11, 2025*  
*Use this guide to verify unified rendering works correctly*  
*Focus on Preview vs Visual Editor comparison - they MUST match!*
