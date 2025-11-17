# Manual Testing Guide - January 2025 Fixes

## Overview
This guide provides step-by-step instructions for manually testing all fixes implemented on January 17, 2025. Use the provided `test-story.xml` file to verify each fix.

---

## Prerequisites

1. **Start the Application**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

2. **Test Story File**
   - Location: `test-story.xml` in project root
   - Contains 16 beats testing all major features
   - Pre-configured to test all recent fixes

---

## Test 1: Continue Button Auto-Generation ✅

### Objective
Verify that introText and durScreen beats automatically generate a Continue button at the correct position.

### Steps

#### 1.1 Import Test Story
1. Click **Import** button in header
2. Select `test-story.xml`
3. Wait for story to load
4. Verify 16 beats appear in flowchart

#### 1.2 Test IntroText Beat
1. Click on beat "Introduction (IntroText Test)" in flowchart
2. Click **Visual Editor** tab
3. **VERIFY:**
   - ✅ Continue button appears automatically
   - ✅ Button positioned at bottom-center (x≈412, y≈668)
   - ✅ Button text says "Continue"
   - ✅ Button is selectable and editable

4. Select the Continue button
5. In properties panel, verify:
   - ✅ X position: 412
   - ✅ Y position: 668
   - ✅ Z-index: 2
   - ✅ Width: 200
   - ✅ Height: 40

6. Change button text to "Next"
7. Click **Save Visual Changes**
8. **VERIFY:** Button text updates in visual editor

#### 1.3 Test DurScreen Beat
1. Click on beat "Timed Screen (DurScreen Test)"
2. Click **Visual Editor** tab
3. **VERIFY:**
   - ✅ Continue button appears automatically
   - ✅ Same position as introText (412, 668)
   - ✅ Button editable

**PASS CRITERIA:**
- Continue button auto-generates for both beat types ✅
- Correct position (412, 668) ✅
- Button fully editable ✅

---

## Test 2: ASML Label Removal ✅

### Objective
Verify that connections for beats with buttons do NOT have redundant label attributes in ASML export.

### Steps

#### 2.1 Export Story
1. Click **Export** button
2. Save as `test-export.zip`
3. Extract the ZIP file
4. Open `story.xml` in text editor

#### 2.2 Verify IntroText Connection
1. Find beat with `id="beat_intro"`
2. Locate the `<function kind="introText">` element
3. Find the `<connection>` element inside
4. **VERIFY:**
   - ✅ Connection has `target` attribute
   - ✅ Connection does NOT have `label` attribute
   - ✅ Button IS present in `<locs>` section

**Expected:**
```xml
<function kind="introText" text="...">
  <connection target="beat_durscreen" />  <!-- NO label attribute -->
</function>
```

#### 2.3 Verify DurScreen Connection
1. Find beat with `id="beat_durscreen"`
2. **VERIFY:**
   - ✅ Connection has no `label` attribute
   - ✅ Button in `<locs>` section

#### 2.4 Verify EndScreen
1. Find beat with `id="beat_endscreen"`
2. **VERIFY:**
   - ✅ No connection (terminal beat) OR connection has no label

#### 2.5 Verify Invisible Beats
1. Find beat with `kind="setVariable"` (beat_variable)
2. **VERIFY:** ✅ Connection has no `label` attribute

3. Find beat with `kind="setTimer"` (beat_timer_setup)
4. **VERIFY:** ✅ Connection has no `label` attribute

5. Find beat with `kind="addRemoveInventory"` (beat_inventory)
6. **VERIFY:** ✅ Connection has no `label` attribute

7. Find beat with `kind="randomTarget"` (beat_random)
8. **VERIFY:** ✅ Connections have no `label` attributes

#### 2.6 Verify Choice Beats KEEP Labels
1. Find beat with `kind="choiceBeat"` (beat_choice)
2. **VERIFY:**
   - ✅ Each `<choice>` HAS a `label` or `text` attribute
   - ✅ Choices need labels to distinguish them

**Expected:**
```xml
<function kind="choiceBeat">
  <choice id="choice_1" text="Test Conditions" target="beat_condition" />
  <choice id="choice_2" text="Test Variables" target="beat_variable" />
  <choice id="choice_3" text="Test Dialog Tree" target="beat_dialog" />
</function>
```

**PASS CRITERIA:**
- IntroText/DurScreen/EndScreen: NO labels ✅
- Invisible beats: NO labels ✅
- Choice beats: Labels PRESENT ✅
- Button text in visual locs, not in connection ✅

---

## Test 3: FlexBox Height Fix ✅

### Objective
Verify that the flowchart uses full window height and is not cut off at the bottom.

### Steps

#### 3.1 Test Flowchart Height
1. Load test story (if not already loaded)
2. Switch to **Flowchart** tab
3. Use mouse wheel or zoom controls to zoom out
4. **VERIFY:**
   - ✅ All 16 beats visible
   - ✅ Can scroll to bottom beats
   - ✅ No cut-off at bottom of screen

#### 3.2 Test with Window Resize
1. Resize browser window to different heights:
   - Small (600px)
   - Medium (800px)
   - Large (1200px)
2. For each size, **VERIFY:**
   - ✅ Flowchart adapts to height
   - ✅ No overflow issues
   - ✅ Scrolling works correctly

#### 3.3 Test Beat Placement
1. Drag a beat to the bottom of the canvas
2. Drag another beat below it
3. **VERIFY:**
   - ✅ Can place beats at any Y position
   - ✅ Can scroll to see bottom beats
   - ✅ No cut-off or hidden beats

**PASS CRITERIA:**
- Flowchart uses full window height ✅
- No cut-off at bottom ✅
- Adapts to window resize ✅
- All beats accessible ✅

---

## Test 4: Visual Editor Scroll Fix ✅

### Objective
Verify that the visual editor scrolls correctly when stage is larger than viewport, with toolbar staying fixed.

### Steps

#### 4.1 Test Default View
1. Select any beat with visual editor
2. Click **Visual Editor** tab
3. **VERIFY:**
   - ✅ Toolbar visible at top
   - ✅ Stage visible below toolbar
   - ✅ No overflow beyond screen

#### 4.2 Test Zoom and Scroll
1. Set zoom to **150%**
2. **VERIFY:**
   - ✅ Horizontal scrollbar appears
   - ✅ Vertical scrollbar appears
   - ✅ Can scroll to all areas of stage

3. Scroll to top-left corner
4. **VERIFY:** ✅ Can see corner

5. Scroll to bottom-right corner
6. **VERIFY:** ✅ Can see corner

7. While scrolling, **VERIFY:**
   - ✅ Toolbar stays fixed at top
   - ✅ Toolbar never scrolls away
   - ✅ Stage size indicator visible in toolbar

#### 4.3 Test Different Zoom Levels
1. Test zoom: 50%, 100%, 150%, 200%
2. For each level, **VERIFY:**
   - ✅ Scroll area updates correctly
   - ✅ Stage fully accessible
   - ✅ Toolbar remains fixed

#### 4.4 Test Stage Size Settings
1. Click **Settings** button
2. Change project size to 1280×720
3. Click Save
4. Go back to visual editor
5. **VERIFY:**
   - ✅ Stage updates to new size
   - ✅ Scroll area adjusts
   - ✅ Toolbar shows new dimensions

**PASS CRITERIA:**
- Visual editor scrolls when needed ✅
- Toolbar stays fixed at top ✅
- All zoom levels work correctly ✅
- Stage size changes respected ✅

---

## Test 5: Import/Export Roundtrip ✅

### Objective
Verify that exporting and re-importing a story preserves all data including visual elements and buttons.

### Steps

#### 5.1 Prepare Story
1. Import `test-story.xml`
2. Modify "Introduction" beat:
   - Change Continue button text to "Let's Go!"
   - Move button to x=300, y=600
   - Save visual changes

#### 5.2 Export Modified Story
1. Click **Export**
2. Save as `test-roundtrip.zip`
3. Note the modifications made

#### 5.3 Clear and Re-Import
1. Refresh browser or restart app
2. Click **Import**
3. Select the exported `test-roundtrip.zip` (or extract and import story.xml)

#### 5.4 Verify Preservation
1. Navigate to "Introduction" beat
2. Click **Visual Editor** tab
3. **VERIFY:**
   - ✅ Continue button present
   - ✅ Button text is "Let's Go!"
   - ✅ Button position is x=300, y=600
   - ✅ All other visual elements preserved

4. Check other beats
5. **VERIFY:**
   - ✅ All 16 beats present
   - ✅ All connections preserved
   - ✅ All parameters correct
   - ✅ Visual elements intact

**PASS CRITERIA:**
- Export includes all data ✅
- Import restores everything ✅
- Visual elements preserved ✅
- Modified button properties maintained ✅

---

## Test 6: All Beat Types ✅

### Objective
Verify that all beat types work correctly in the inspector.

### Steps

#### 6.1 Test Each Beat Type
For each beat in the test story, verify in Inspector:

1. **IntroText** (beat_intro)
   - ✅ Text parameter editable
   - ✅ Connection visible
   - ✅ Visual editor works

2. **DurScreen** (beat_durscreen)
   - ✅ Text parameter editable
   - ✅ Duration parameter editable
   - ✅ Connection visible

3. **ChoiceBeat** (beat_choice)
   - ✅ Can add/edit/remove choices
   - ✅ Each choice has target
   - ✅ Multiple connections shown

4. **SetVariable** (beat_variable)
   - ✅ Variable name editable
   - ✅ Operation selectable (set/add/subtract/etc.)
   - ✅ Value editable
   - ✅ Single connection

5. **ConditionBeat** (beat_condition)
   - ✅ Condition type selectable
   - ✅ Operator selectable
   - ✅ Left/right values editable
   - ✅ True/False targets shown

6. **SetTimer** (beat_timer_setup)
   - ✅ Timer name editable
   - ✅ Duration editable
   - ✅ Target beat selectable
   - ✅ Connection shown

7. **DialogTree** (beat_dialog)
   - ✅ Speaker editable
   - ✅ Dialog text editable
   - ✅ Can add player choices
   - ✅ Nested dialog support
   - ✅ Inspector auto-expands

8. **RandomTarget** (beat_random)
   - ✅ Can add multiple targets
   - ✅ Each target is a beat ID
   - ✅ Multiple connections shown

9. **AddRemoveInventory** (beat_inventory)
   - ✅ Action selectable (add/remove/transfer)
   - ✅ Item name editable
   - ✅ Character selectable
   - ✅ Connection shown

10. **EndScreen** (beat_endscreen)
    - ✅ Message editable
    - ✅ Show restart option
    - ✅ Show credits option
    - ✅ Reset option
    - ✅ No connections (terminal)

**PASS CRITERIA:**
- All beat types have functional editors ✅
- All parameters editable ✅
- Connections display correctly ✅
- No errors in console ✅

---

## Test 7: Settings Integration ✅

### Objective
Verify that project settings work correctly and are saved in export.

### Steps

#### 7.1 Test Settings UI
1. Click **Settings** button
2. **VERIFY:**
   - ✅ Settings modal opens
   - ✅ All tabs accessible:
     - Project
     - Colors
     - Fonts
     - Text Box
     - Text Effects
     - Hotspots
     - Sound
     - Copyright
     - Debug

#### 7.2 Modify Settings
1. **Project Tab:**
   - Change width to 1280
   - Change height to 720
   - Change aspect ratio to 16:9
   - **VERIFY:** Preview updates

2. **Colors Tab:**
   - Change primary color to #FF5733
   - **VERIFY:** Color picker works

3. **Fonts Tab:**
   - Change title font to "Arial"
   - Change title size to 36
   - **VERIFY:** Changes apply

#### 7.3 Verify Settings in Export
1. Click **Save** in settings
2. Click **Export**
3. Extract and open `story.xml`
4. Find `<settings>` section
5. **VERIFY:**
   - ✅ Width is 1280
   - ✅ Height is 720
   - ✅ Aspect ratio is 16:9
   - ✅ Primary color is #FF5733
   - ✅ Title font is "Arial"
   - ✅ Title size is 36

**PASS CRITERIA:**
- Settings UI fully functional ✅
- All settings editable ✅
- Settings saved in export ✅
- Settings preserved on import ✅

---

## Test 8: Preview Functionality ✅

### Objective
Verify that story preview works and respects settings.

### Steps

#### 8.1 Basic Preview
1. Import test story
2. Click **Preview** button
3. **VERIFY:**
   - ✅ Preview window opens
   - ✅ First beat displays (Introduction)
   - ✅ Settings applied (colors, fonts, etc.)

#### 8.2 Navigation Test
1. Click "Continue" button in preview
2. **VERIFY:**
   - ✅ Advances to next beat (Timed Screen)
   - ✅ Timer countdown visible (if implemented)

3. Continue through story:
   - Click buttons/make choices
   - **VERIFY:**
     - ✅ Each beat displays correctly
     - ✅ Choices work
     - ✅ Navigation flows correctly

#### 8.3 Settings Application
1. Before preview, set background color to #1a1a1a
2. Start preview
3. **VERIFY:**
   - ✅ Background color is dark (#1a1a1a)

4. Close preview
5. Change background color to #ffffff
6. Start preview
7. **VERIFY:**
   - ✅ Background color is white

**PASS CRITERIA:**
- Preview opens correctly ✅
- Navigation works ✅
- Settings applied ✅
- Buttons functional ✅

---

## Test 9: Visual Element Editing ✅

### Objective
Verify that visual elements can be added, edited, and manipulated correctly.

### Steps

#### 9.1 Add Text Element
1. Select "Introduction" beat
2. Click **Visual Editor** tab
3. Click **Add Elements > Text**
4. **VERIFY:**
   - ✅ Text element appears on stage
   - ✅ Element selected automatically
   - ✅ Properties panel shows text properties

#### 9.2 Edit Text Element
1. In properties panel:
   - Change text to "Hello World"
   - Change X to 100
   - Change Y to 200
   - Change width to 300
2. **VERIFY:**
   - ✅ Text updates on stage
   - ✅ Position updates
   - ✅ Size updates

#### 9.3 Layer Management
1. Add another text element
2. In layers panel, **VERIFY:**
   - ✅ Both elements listed
   - ✅ Z-order visible
   - ✅ Can reorder layers

3. Move second element up/down in layers
4. **VERIFY:**
   - ✅ Visual order changes on stage

#### 9.4 Element Actions
1. Select first text element
2. Click **Duplicate**
3. **VERIFY:**
   - ✅ Copy created
   - ✅ Positioned offset from original

4. Select duplicate
5. Click **Delete**
6. **VERIFY:**
   - ✅ Element removed
   - ✅ Layers panel updates

#### 9.5 Save and Verify
1. Click **Save Visual Changes**
2. Export story
3. Re-import story
4. Check visual editor
5. **VERIFY:**
   - ✅ All added elements preserved
   - ✅ Properties maintained
   - ✅ Layer order correct

**PASS CRITERIA:**
- Can add all element types ✅
- Elements fully editable ✅
- Layer management works ✅
- Changes persist in export ✅

---

## Common Issues and Solutions

### Issue 1: Continue Button Not Appearing
**Symptoms:** No button in visual editor for introText/durScreen
**Checks:**
1. Verify beat type is exactly "introText" or "durScreen"
2. Check if button already exists (only adds if none present)
3. Check browser console for errors

**Solution:** Check VisualWorkspace.tsx lines 124-138

### Issue 2: Labels Still Present in ASML
**Symptoms:** Connections have label attributes when they shouldn't
**Checks:**
1. Verify beat type is in noLabelBeats array
2. Check ASMLGenerator.ts line 669
3. Ensure using latest code version

**Solution:** Verify noLabelBeats includes the beat type

### Issue 3: Flowchart Cut Off
**Symptoms:** Can't see bottom beats
**Checks:**
1. Check WorkspaceView.tsx for minHeight: 0
2. Verify overflow-hidden on parent
3. Check browser console for CSS errors

**Solution:** Ensure flexbox height cascade is correct

### Issue 4: Visual Editor Not Scrolling
**Symptoms:** Can't scroll when stage larger than viewport
**Checks:**
1. Verify VisualBeatEditor uses flex-col layout
2. Check for overflow-auto on canvas container
3. Verify zoom calculation

**Solution:** Check VisualBeatEditor.tsx flexbox structure

---

## Test Completion Checklist

### Phase 1: Core Fixes ✅
- [ ] Continue button auto-generates for introText
- [ ] Continue button auto-generates for durScreen
- [ ] Continue button positioned correctly (412, 668)
- [ ] ASML has no labels for introText connections
- [ ] ASML has no labels for durScreen connections
- [ ] ASML has no labels for endScreen connections
- [ ] ASML has no labels for invisible beats
- [ ] Choice beats retain labels
- [ ] Flowchart uses full window height
- [ ] Visual editor scrolls correctly
- [ ] Toolbar stays fixed when scrolling

### Phase 2: Integration ✅
- [ ] All 11 beat types work in inspector
- [ ] Settings save and load correctly
- [ ] Export/import roundtrip preserves all data
- [ ] Visual elements export and import correctly
- [ ] Preview respects settings

### Phase 3: Quality ✅
- [ ] No console errors during testing
- [ ] No visual glitches
- [ ] Performance acceptable with 16+ beats
- [ ] UI responsive and smooth

---

## Reporting Results

### For Each Test:
1. Mark as **PASS** ✅ or **FAIL** ❌
2. Note any issues or unexpected behavior
3. Take screenshots of failures
4. Record steps to reproduce any bugs

### Create Test Report:
```markdown
## Test Results - [Date]

### Test 1: Continue Button Auto-Generation
**Status:** PASS ✅
**Notes:** Button appears correctly at position 412, 668

### Test 2: ASML Label Removal  
**Status:** PASS ✅
**Notes:** No labels on connections as expected

[Continue for all tests...]

### Issues Found:
1. [Description of issue]
   - Severity: High/Medium/Low
   - Steps to reproduce
   - Expected vs Actual

### Overall Assessment:
- Tests Passed: X/11
- Tests Failed: X/11
- Critical Issues: X
- System Ready: Yes/No
```

---

## Next Steps After Testing

### If All Tests Pass ✅
1. Update Issues.md with "All tests passed"
2. Move to Phase 2: Feature Completion
3. Implement timer runtime
4. Add iterative save system

### If Tests Fail ❌
1. Document all failures
2. Prioritize by severity
3. Fix critical issues first
4. Re-run tests after fixes

---

*Manual Testing Guide by: Senior Software Engineer*  
*Created: January 2025*  
*Version: 1.0*
