# Schema Migration Testing Guide

This document provides comprehensive testing procedures for the schema-based architecture migration (Phases 1 & 2).

## Overview

The schema migration replaces hardcoded beat-specific logic with schema-driven systems:
- **Phase 1**: Inspector parameter generation from schema
- **Phase 2**: Location initialization from schema

## Prerequisites

```bash
# Ensure all packages are built
npm run build

# Start the development server
npm run dev
```

The application should start on `http://localhost:5173`

---

## Phase 1 Testing: Inspector Parameter Generation

### Goal
Verify that Inspector correctly generates form fields from `beat-definitions/core-beats.json` for all beat types.

### Beat Types Using Schema Forms
The following beat types use `SchemaFormGenerator`:
1. titleScreen
2. introText
3. durScreen
4. endScreen
5. setVariable
6. setTimer
7. addRemoveInventory
8. inputText

### Test Procedure

#### Test 1: TitleScreen Beat
1. Create a new story
2. Add a TitleScreen beat
3. Click on the beat to open Inspector
4. **Verify**:
   - ✅ "Title" text field appears
   - ✅ "Author" text field appears
   - ✅ "Button Text" field appears
   - ✅ Default values are shown ("Untitled Story", "Anonymous", "Start")
   - ✅ Changes to fields update the beat parameters

#### Test 2: IntroText Beat
1. Add an IntroText beat
2. Open Inspector
3. **Verify**:
   - ✅ "Text" textarea appears (multi-line)
   - ✅ "Button Text" field appears
   - ✅ Default "Continue" appears for button
   - ✅ Text area allows multiple lines of input

#### Test 3: EndScreen Beat
1. Add an EndScreen beat
2. Open Inspector
3. **Verify**:
   - ✅ "Message" field appears
   - ✅ "Show Restart" checkbox appears
   - ✅ "Show Credits" checkbox appears
   - ✅ "Reset" checkbox appears
   - ✅ All boolean fields toggle correctly

#### Test 4: InputText Beat
1. Add an InputText beat
2. Open Inspector
3. **Verify**:
   - ✅ "Prompt" textarea appears
   - ✅ "Save To Type" dropdown appears (variable/characterName)
   - ✅ "Variable" field appears when saveToType = "variable"
   - ✅ "Placeholder" field appears
   - ✅ "Required" checkbox appears
   - ✅ "Button Text" field appears

#### Test 5: SetVariable Beat
1. Add a SetVariable beat
2. Open Inspector
3. **Verify**:
   - ✅ "Type" dropdown appears (variable/counter)
   - ✅ "Name" field appears
   - ✅ "Value" field appears
   - ✅ "Operation" field appears for counter type

#### Test 6: Field Validation
For any schema-generated form:
1. Try to submit with required fields empty
2. **Verify**: Form validation prevents invalid data
3. Fill required fields
4. **Verify**: Changes are saved to beat parameters

### Expected Console Output
```
[SchemaFormGenerator] Rendering form for: titleScreen
[SchemaFormGenerator] Parameters: {title: "...", author: "...", ...}
```

---

## Phase 2 Testing: Location Initialization

### Goal
Verify that beat locations are automatically initialized from schema when beats are created.

### Beat Types with Visual Elements
All visible beat types should auto-initialize locations:
1. titleScreen
2. introText
3. durScreen
4. endScreen
5. inputText
6. dialogTree
7. movementChoice
8. pickProp
9. hyperText
10. videoBeat

### Test Procedure

#### Test 1: TitleScreen Location Initialization
1. Create a new story
2. Add a TitleScreen beat
3. Open Visual Editor for the beat
4. **Verify**:
   - ✅ "Title" text element is present
   - ✅ "Author" text element is present
   - ✅ "Start" button element is present
   - ✅ Elements are positioned correctly (title at top, button at bottom)
   - ✅ Text is centered
   - ✅ Font properties are set (Arial, appropriate sizes)

**Expected Console Output:**
```
[SchemaLocationInitializer] Initializing locations for 1 beats
[SchemaLocationInitializer] Initializing 3 locations for titleScreen
[SchemaLocationInitializer] Created 3 elements
[SchemaLocationInitializer] Initialized titleScreen (beat_123) with 3 locations
```

#### Test 2: IntroText Location Initialization
1. Add an IntroText beat
2. Open Visual Editor
3. **Verify**:
   - ✅ Text dialog element is present
   - ✅ "Continue" button is present
   - ✅ Elements are centered horizontally
   - ✅ Button is near bottom of canvas

#### Test 3: EndScreen Location Initialization
1. Add an EndScreen beat
2. Open Visual Editor
3. **Verify**:
   - ✅ Message text element is present
   - ✅ "Restart" button is present (if showRestart = true)
   - ✅ "Credits" button is present (if showCredits = true)
   - ✅ Buttons are stacked vertically if both present

#### Test 4: InputText Location Initialization
1. Add an InputText beat
2. Set prompt to "Enter your name:"
3. Open Visual Editor
4. **Verify**:
   - ✅ Prompt text element shows "Enter your name:"
   - ✅ Input field hotspot is present
   - ✅ Submit button is present
   - ✅ Elements are stacked vertically

#### Test 5: DialogTree Location Initialization
1. Add a DialogTree beat
2. Add dialog text and 3 choices
3. Open Visual Editor
4. **Verify**:
   - ✅ Dialog text element is present
   - ✅ All 3 choice buttons are present
   - ✅ Choices are stacked vertically
   - ✅ Button widths accommodate text

#### Test 6: MovementChoice Location Initialization
1. Add a MovementChoice beat
2. Add 4 location choices
3. Open Visual Editor
4. **Verify**:
   - ✅ Question text element is present
   - ✅ All 4 location buttons are present
   - ✅ Buttons are stacked vertically
   - ✅ Button text matches location names

#### Test 7: PickProp Location Initialization
1. Add a PickProp beat
2. Add 6 props
3. Open Visual Editor
4. **Verify**:
   - ✅ Question text element is present
   - ✅ All 6 prop buttons are present
   - ✅ Props arranged in 3-column grid
   - ✅ Button text shows prop names

#### Test 8: Variable Interpolation in Locations
1. Add an InputText beat (saves to variable "userName")
2. Add an IntroText beat with text "Hello ${userName}!"
3. Open Visual Editor for IntroText
4. **Verify**:
   - ✅ Text element is present
   - ✅ In preview, variable is interpolated correctly

### Expected Behavior: Skip Already Initialized
1. Create a TitleScreen beat
2. Open Visual Editor
3. Manually add a custom element
4. Save
5. Close and reopen Visual Editor
6. **Verify**:
   - ✅ Custom element is still present
   - ✅ Schema doesn't re-initialize (preserves manual changes)

**Expected Console Output:**
```
[SchemaLocationInitializer] Skipping titleScreen (beat_123) - already has 4 locations
```

---

## Integration Testing

### Test 1: Create Complete Story
Create a story with the following sequence:
1. TitleScreen
2. IntroText (with variable interpolation)
3. InputText (save to "userName")
4. DialogTree (use ${userName} in dialog)
5. MovementChoice (3 locations)
6. PickProp (4 props)
7. EndScreen

**Verify Each Beat:**
- ✅ Inspector shows correct fields
- ✅ Visual Editor shows correct elements
- ✅ Preview renders correctly
- ✅ Variable interpolation works
- ✅ All elements are positioned correctly

### Test 2: Import Legacy ASML File
1. Import an existing ASML story file
2. **Verify**:
   - ✅ All beats load correctly
   - ✅ Existing visual elements are preserved
   - ✅ New beats use schema initialization
   - ✅ No errors in console

### Test 3: Schema-Driven Extensibility
**Hypothetical**: Add a new beat type to schema only

1. Add new beat definition to `beat-definitions/core-beats.json`
2. Restart application
3. **Expected Behavior**:
   - Inspector automatically generates form fields
   - Visual editor automatically initializes locations
   - Zero code changes required

---

## Performance Testing

### Test 1: Initialization Performance
1. Create a story with 50+ beats of various types
2. Open application
3. **Verify**:
   - ✅ App loads in reasonable time (< 3 seconds)
   - ✅ No console errors
   - ✅ All beats initialize correctly

**Expected Console Output:**
```
[SchemaLocationInitializer] Initializing locations for 50 beats
[SchemaLocationInitializer] Initialized 50 beats (took ~XXXms)
```

### Test 2: Schema Parsing
1. Check that schema is only loaded once
2. **Verify**:
   - ✅ No repeated schema parsing
   - ✅ Schema data is cached/reused
   - ✅ No performance degradation

---

## Regression Testing

### Test 1: Existing Functionality Still Works
**Inspector:**
- ✅ Beat type selector works
- ✅ Beat deletion works
- ✅ Parameter updates persist
- ✅ Beat connections still work

**Visual Editor:**
- ✅ Drag and drop elements
- ✅ Resize elements
- ✅ Element properties panel
- ✅ Background selection
- ✅ Save visual changes

**Preview:**
- ✅ Story plays correctly
- ✅ User input works
- ✅ Choices work
- ✅ Variable interpolation works
- ✅ Backgrounds display

### Test 2: Build & Type Checking
```bash
# Run type check
npm run type-check

# Build all packages
npm run build

# Verify no TypeScript errors
# Verify all packages build successfully
```

**Expected Result:** ✅ All builds succeed, zero errors

---

## Error Testing

### Test 1: Invalid Beat Type
1. Manually create a beat with invalid type
2. **Expected**:
   - ✅ Console warning logged
   - ✅ App doesn't crash
   - ✅ Beat is skipped gracefully

### Test 2: Missing Schema Definition
1. Create a beat type not in schema
2. **Expected**:
   - ✅ Console warning logged
   - ✅ Fallback to basic parameters
   - ✅ No locations initialized

### Test 3: Malformed Parameters
1. Set invalid parameter values
2. **Expected**:
   - ✅ Validation prevents saving
   - ✅ User sees error message
   - ✅ App remains stable

---

## Browser Console Checks

### Success Indicators
Look for these console messages:

```
✅ [SchemaFormGenerator] Rendering form for: titleScreen
✅ [SchemaLocationInitializer] Initializing 3 locations for titleScreen
✅ [SchemaLocationInitializer] Created 3 elements
✅ [SchemaLocationInitializer] Initialized titleScreen (beat_XXX) with 3 locations
```

### Error Indicators
Watch for these potential issues:

```
❌ [SchemaFormGenerator] No schema definition found for beat type: XXX
❌ [SchemaLocationInitializer] Skipping XXX (not a visual beat)
❌ TypeError: Cannot read property 'locations' of undefined
❌ Schema parsing error
```

---

## Rollback Procedure

If critical issues are found:

1. **Restore old implementation:**
   ```bash
   cp backup/beatLocationInitializer.ts.backup packages/builder/src/utils/beatLocationInitializer.ts
   ```

2. **Revert App.tsx import:**
   ```typescript
   // Change back to:
   import { initializeBeatLocations } from './utils/beatLocationInitializer';
   ```

3. **Rebuild:**
   ```bash
   npm run build:builder
   ```

4. **Report issues** with:
   - Console error messages
   - Steps to reproduce
   - Expected vs actual behavior

---

## Success Criteria

Phase 1 & 2 are considered successful if:

✅ All 10+ beat types display correct Inspector fields
✅ All 10+ visible beat types initialize locations correctly
✅ Variable interpolation works in all text fields
✅ No regression in existing functionality
✅ Build completes without errors
✅ Performance is acceptable (< 3s load for 50 beats)
✅ Console shows no unexpected errors
✅ Manual testing shows WYSIWYG between editor and preview

---

## Test Report Template

After completing tests, document results:

```markdown
## Test Results - [Date]

### Phase 1: Inspector (SchemaFormGenerator)
- [ ] TitleScreen: PASS / FAIL
- [ ] IntroText: PASS / FAIL
- [ ] EndScreen: PASS / FAIL
- [ ] InputText: PASS / FAIL
- [ ] SetVariable: PASS / FAIL

### Phase 2: Locations (SchemaLocationInitializer)
- [ ] TitleScreen: PASS / FAIL
- [ ] IntroText: PASS / FAIL
- [ ] EndScreen: PASS / FAIL
- [ ] InputText: PASS / FAIL
- [ ] DialogTree: PASS / FAIL
- [ ] MovementChoice: PASS / FAIL
- [ ] PickProp: PASS / FAIL

### Integration
- [ ] Complete story creation: PASS / FAIL
- [ ] ASML import: PASS / FAIL
- [ ] Variable interpolation: PASS / FAIL

### Performance
- [ ] Load time acceptable: PASS / FAIL
- [ ] No console errors: PASS / FAIL

### Regressions
- [ ] Existing features work: PASS / FAIL
- [ ] Build succeeds: PASS / FAIL

### Issues Found
1. [Description]
2. [Description]

### Overall Status
- [ ] READY FOR PRODUCTION
- [ ] NEEDS FIXES
- [ ] ROLLBACK REQUIRED
```

---

## Additional Notes

- The old `beatLocationInitializer.ts` has been moved to `backup/` folder
- It can be permanently deleted after 2 weeks of successful production use
- All schema changes should update `beat-definitions/core-beats.json`
- Future beat types only need schema updates - no code changes!

---

*Last Updated: November 4, 2025*
*Schema Migration: Phase 1 & 2 Complete*
