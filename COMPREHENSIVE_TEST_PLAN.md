# Comprehensive Test Plan - January 2025

## Overview
This document outlines the comprehensive testing plan for ASAPS Modern following the major fixes completed on January 17, 2025. The system is reported at 95% complete and requires thorough verification.

---

## Test Categories

### 1. Layout & UI Tests ✅

#### 1.1 Flowchart Height Test
**What to Test:**
- Flowchart uses full window height
- No cut-off at bottom
- Beats visible at all Y positions
- Scrolling works correctly

**How to Test:**
1. Open application
2. Add multiple beats in flowchart
3. Position beats at various Y coordinates (0, 300, 600, 900, etc.)
4. Verify all beats are visible
5. Resize window and verify flowchart adapts

**Expected Result:** All beats visible, no cut-off, smooth scrolling

---

#### 1.2 Visual Editor Scroll Test
**What to Test:**
- Visual editor properly contained
- Toolbar fixed at top
- Canvas scrolls when stage is larger than viewport
- Zoom affects scroll area correctly

**How to Test:**
1. Select a beat with visual editor
2. Switch to Visual tab
3. Set zoom to 150%
4. Verify horizontal/vertical scrollbars appear
5. Scroll to all corners of stage
6. Verify toolbar stays at top

**Expected Result:** Proper scroll behavior, toolbar always visible, no overflow

---

#### 1.3 Inspector Layout Test
**What to Test:**
- Inspector shows/hides correctly
- Expand/collapse buttons work
- Width transitions smooth
- No layout breaks with different beat types

**How to Test:**
1. Select different beat types
2. Test collapse button (→)
3. Test expand button for dialogTree beats
4. Verify smooth transitions
5. Check all panels visible when expanded

**Expected Result:** Smooth transitions, all controls accessible, no overflow

---

### 2. Beat Type Tests

#### 2.1 IntroText Beat Test ✅
**What to Test:**
- Auto-generates Continue button
- Button positioned at x=412, y=668
- Button text editable
- Button exports to ASML correctly
- No redundant connection label

**How to Test:**
1. Create introText beat
2. Switch to Visual tab
3. Verify Continue button appears automatically
4. Check position (412, 668)
5. Export to ASML
6. Verify `<loc kind="button">` in locs section
7. Verify connection has no label attribute

**Expected Result:** 
```xml
<loc kind="button" name="Continue" x="412" y="668" z="2" width="200" height="40" text="Continue" />
<connection target="next_beat" />  <!-- No label -->
```

---

#### 2.2 DurScreen Beat Test ✅
**What to Test:**
- Same as IntroText (auto Continue button)
- Duration parameter works
- Timer connection exports correctly

**How to Test:**
1. Create durScreen beat
2. Set duration parameter
3. Switch to Visual tab
4. Verify Continue button
5. Export to ASML
6. Verify timer connection format

**Expected Result:** Button auto-generated, timer connection correct, no label

---

#### 2.3 EndScreen Beat Test
**What to Test:**
- No auto-button (different behavior)
- No connection labels
- Proper ASML export

**How to Test:**
1. Create endScreen beat
2. Check visual editor (no auto button)
3. Export to ASML
4. Verify no connection (terminal beat)

**Expected Result:** No auto-button, clean export

---

#### 2.4 ChoiceBeat Test
**What to Test:**
- Multiple connections
- Each connection has label
- Visual editor shows choices correctly
- ASML export includes all choices

**How to Test:**
1. Create choiceBeat
2. Add 3 choices with different labels
3. Connect to different beats
4. Export to ASML
5. Verify each connection has correct label

**Expected Result:** 
```xml
<connection target="beat_1" label="Choice 1" />
<connection target="beat_2" label="Choice 2" />
<connection target="beat_3" label="Choice 3" />
```

---

#### 2.5 ConditionBeat Test
**What to Test:**
- Condition editor works
- Variable selection
- Operator selection
- Value input
- Target beat selection
- Exports correct condition syntax

**How to Test:**
1. Create conditionBeat
2. Set condition: counter1 > 5
3. Set target beat
4. Export to ASML
5. Verify condition syntax

**Expected Result:**
```xml
<function kind="conditionBeat">
  <condition var="counter1" op=">" val="5" target="beat_success" />
  <connection target="beat_fail" />  <!-- else path -->
</function>
```

---

#### 2.6 DialogTree Beat Test
**What to Test:**
- Dialog tree editor opens
- NPC dialog creation
- Player responses
- Nested structure
- Auto-expand inspector
- Export/import roundtrip

**How to Test:**
1. Create dialogTree beat
2. Verify inspector auto-expands
3. Add NPC dialog "Hello!"
4. Add player response "Hi there"
5. Add nested NPC dialog
6. Export to ASML
7. Import and verify structure preserved

**Expected Result:** Full dialog tree structure, proper nesting, roundtrip works

---

#### 2.7 SetVariable Beat Test
**What to Test:**
- Variable name input
- Value input
- Operation selection (set, add, subtract, multiply, divide)
- No visual button (invisible beat)
- No connection label
- Exports correctly

**How to Test:**
1. Create setVariable beat
2. Set variable name: "score"
3. Set operation: add
4. Set value: 10
5. Export to ASML
6. Verify no label on connection

**Expected Result:**
```xml
<function kind="setVariable" var="score" op="add" val="10">
  <connection target="next_beat" />  <!-- No label -->
</function>
```

---

#### 2.8 SetTimer Beat Test
**What to Test:**
- Duration input
- Target beat selection
- No visual button (invisible)
- Timer connection exports correctly
- No label on timeout connection

**How to Test:**
1. Create setTimer beat
2. Set duration: 5000ms
3. Set target beat for timeout
4. Export to ASML
5. Verify timer connection format

**Expected Result:**
```xml
<function kind="setTimer" duration="5000">
  <connection target="timeout_beat" />
</function>
```

---

#### 2.9 RandomTarget Beat Test
**What to Test:**
- Multiple target selection
- Random distribution
- No visual elements
- All targets export

**How to Test:**
1. Create randomTarget beat
2. Add 3 target beats
3. Export to ASML
4. Verify all targets listed

**Expected Result:**
```xml
<function kind="randomTarget">
  <connection target="beat_1" />
  <connection target="beat_2" />
  <connection target="beat_3" />
</function>
```

---

### 3. Visual Editor Tests

#### 3.1 Asset Placement Test
**What to Test:**
- Character assets can be placed
- Background assets can be placed
- Prop assets can be placed
- Position/size editable
- Layer order works (z-index)
- Assets export to ASML

**How to Test:**
1. Select beat with visual editor
2. Add character asset
3. Add background asset
4. Position and resize both
5. Change z-index
6. Export to ASML
7. Verify all assets in locs section

**Expected Result:** All assets positioned correctly, z-order respected

---

#### 3.2 Text Element Test
**What to Test:**
- Text can be added
- Text editable in properties
- Font/size/color settings work
- Position/size adjustable
- Text exports correctly

**How to Test:**
1. Add text element
2. Edit content
3. Change font, size, color
4. Position element
5. Export and verify

**Expected Result:** Text exports with all properties

---

#### 3.3 Button Element Test
**What to Test:**
- Buttons can be added manually
- Button text editable
- Position/size adjustable
- Button exports correctly
- Multiple buttons possible

**How to Test:**
1. Add button element
2. Edit text
3. Position button
4. Add second button
5. Export and verify both buttons

**Expected Result:** All buttons export correctly

---

#### 3.4 Stage Size Test
**What to Test:**
- Stage adapts to project settings
- Width/height from settings work
- Zoom affects display correctly
- Scroll area updates with zoom

**How to Test:**
1. Open Settings
2. Change project size to 1280x720
3. Verify stage updates
4. Set zoom to 150%
5. Verify scroll area increases

**Expected Result:** Stage respects settings, zoom works correctly

---

### 4. Export/Import Tests (ASML)

#### 4.1 Complete Story Export Test
**What to Test:**
- All beats export
- All connections export
- Settings export
- Assets included in zip
- Visual elements export
- Structure valid XML

**How to Test:**
1. Create story with multiple beat types
2. Add visual elements
3. Configure settings
4. Export to zip
5. Extract and examine ASML
6. Validate XML structure

**Expected Result:** Valid ASML with all content

---

#### 4.2 Import Test
**What to Test:**
- ASML file imports correctly
- All beats recreated
- Connections preserved
- Settings applied
- Visual elements restored

**How to Test:**
1. Import previously exported ASML
2. Verify all beats present
3. Check connections
4. Verify settings
5. Check visual elements

**Expected Result:** Perfect reconstruction of story

---

#### 4.3 Roundtrip Test
**What to Test:**
- Export → Import → Export produces identical ASML
- No data loss
- No corruption

**How to Test:**
1. Export story (v1)
2. Import ASML
3. Export again (v2)
4. Compare v1 and v2 (should be identical)

**Expected Result:** Identical ASML files

---

### 5. Settings Tests

#### 5.1 Project Settings Test
**What to Test:**
- Width/height settings work
- Aspect ratio changes
- Scaling mode selection
- Settings persist in ASML

**How to Test:**
1. Open Settings
2. Change width to 1280
3. Change height to 720
4. Set aspect ratio to 16:9
5. Export and verify in ASML

**Expected Result:** All settings in ASML

---

#### 5.2 Color Settings Test
**What to Test:**
- All color pickers work
- Alpha/opacity controls
- Preview shows changes
- Colors export correctly

**How to Test:**
1. Change all colors in settings
2. Verify preview updates
3. Export and check ASML

**Expected Result:** All colors in settings section

---

#### 5.3 Font Settings Test
**What to Test:**
- Font selection works
- Font sizes editable
- Preview shows fonts
- Fonts export

**How to Test:**
1. Change all fonts
2. Change font sizes
3. Verify preview
4. Export and verify

**Expected Result:** Font settings in ASML

---

### 6. Asset Management Tests

#### 6.1 Asset Upload Test
**What to Test:**
- Images can be uploaded
- Audio files can be uploaded
- Assets categorized correctly
- Thumbnails generated

**How to Test:**
1. Open Asset Manager
2. Upload image
3. Upload audio
4. Verify categories
5. Check thumbnails

**Expected Result:** All assets uploaded and categorized

---

#### 6.2 Asset Export Test
**What to Test:**
- Assets included in zip
- Folder structure correct
- Asset references in ASML correct

**How to Test:**
1. Upload multiple assets
2. Use assets in beats
3. Export to zip
4. Extract and verify:
   - /media/images/ folder
   - /media/audio/ folder
   - Asset IDs in ASML match files

**Expected Result:** All assets in zip with correct structure

---

### 7. Preview/Runtime Tests

#### 7.1 Basic Preview Test
**What to Test:**
- Preview opens
- First beat displays
- Settings applied
- Navigation works

**How to Test:**
1. Create simple story (3 beats)
2. Click Preview
3. Verify first beat shows
4. Navigate through story
5. Verify settings applied (colors, fonts)

**Expected Result:** Story plays correctly with settings

---

#### 7.2 Choice Navigation Test
**What to Test:**
- Choices display correctly
- Clicking choice navigates
- Multiple choices work

**How to Test:**
1. Create choiceBeat with 3 choices
2. Preview story
3. Test each choice
4. Verify correct beat reached

**Expected Result:** All choices work

---

#### 7.3 Condition Test
**What to Test:**
- Conditions evaluate correctly
- True path taken when condition met
- False path taken when condition not met

**How to Test:**
1. Create setVariable beat (set counter = 10)
2. Create conditionBeat (counter > 5)
3. Preview and verify true path taken
4. Change condition to counter > 15
5. Verify false path taken

**Expected Result:** Conditions work correctly

---

### 8. Performance Tests

#### 8.1 Large Story Test
**What to Test:**
- Performance with 50+ beats
- Flowchart rendering
- Visual editor performance
- Export/import speed

**How to Test:**
1. Create story with 50 beats
2. Add connections between all
3. Test flowchart zoom/pan
4. Test visual editor on multiple beats
5. Time export and import

**Expected Result:** Acceptable performance, no lag

---

#### 8.2 Large Asset Test
**What to Test:**
- Handling 20+ assets
- Asset Manager performance
- Export with many assets

**How to Test:**
1. Upload 20 image assets
2. Upload 5 audio assets
3. Use in multiple beats
4. Test Asset Manager scrolling
5. Export and verify zip size/contents

**Expected Result:** Smooth operation, successful export

---

## Test Execution Checklist

### Phase 1: Core Functionality (Priority)
- [ ] 1.1 Flowchart Height Test
- [ ] 1.2 Visual Editor Scroll Test
- [ ] 1.3 Inspector Layout Test
- [ ] 2.1 IntroText Beat Test
- [ ] 2.2 DurScreen Beat Test
- [ ] 2.4 ChoiceBeat Test
- [ ] 4.1 Complete Story Export Test
- [ ] 4.2 Import Test

### Phase 2: Advanced Features
- [ ] 2.3 EndScreen Beat Test
- [ ] 2.5 ConditionBeat Test
- [ ] 2.6 DialogTree Beat Test
- [ ] 2.7 SetVariable Beat Test
- [ ] 2.8 SetTimer Beat Test
- [ ] 2.9 RandomTarget Beat Test
- [ ] 3.1 Asset Placement Test
- [ ] 3.2 Text Element Test
- [ ] 3.3 Button Element Test

### Phase 3: Integration
- [ ] 4.3 Roundtrip Test
- [ ] 5.1 Project Settings Test
- [ ] 5.2 Color Settings Test
- [ ] 5.3 Font Settings Test
- [ ] 6.1 Asset Upload Test
- [ ] 6.2 Asset Export Test

### Phase 4: Quality Assurance
- [ ] 7.1 Basic Preview Test
- [ ] 7.2 Choice Navigation Test
- [ ] 7.3 Condition Test
- [ ] 8.1 Large Story Test
- [ ] 8.2 Large Asset Test

---

## Bug Tracking

### Found Issues
*Document any issues found during testing here*

1. **Issue:** [Description]
   - **Severity:** High/Medium/Low
   - **Steps to Reproduce:** 
   - **Expected:** 
   - **Actual:**
   - **Fix:**

---

## Test Results Summary

*To be filled in after testing*

**Total Tests:** 38
**Passed:** 
**Failed:** 
**Blocked:** 
**Skipped:** 

**Overall Status:** 

---

*Test Plan Created: January 2025*
*Last Updated: [Date]*
*Tester: Senior Software Engineer*
