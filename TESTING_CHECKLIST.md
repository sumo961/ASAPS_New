# Layout Fixes Testing Checklist

## Date: January 17, 2025
## Fixes Applied: Flowchart Height & Visual Editor Width

---

## Testing Environment
- [ ] Browser: _________________
- [ ] Screen Resolution: _________________
- [ ] Window Size: _________________

---

## 1. Flowchart Editor Height Tests

### Basic Functionality
- [ ] **Open application and select Flowchart tab**
- [ ] **Verify flowchart extends to bottom of window**
  - Should see no cut-off at bottom
  - ReactFlow controls visible at bottom-left
  - MiniMap fully visible at bottom-right
  
### Resizing Tests
- [ ] **Resize window vertically**
  - Flowchart should expand/contract smoothly
  - No gaps or overflow
  - Always fills available space
  
- [ ] **Resize window horizontally**  
  - Width should adjust properly
  - Sidebar and Inspector don't cause issues
  - Canvas remains centered

### Multi-Beat Tests
- [ ] **Add 10+ beats to flowchart**
- [ ] **Arrange beats vertically**
  - Beats at bottom should be fully visible
  - Can scroll to see all beats
  - No beats cut off by container

### Panel Collapse Tests
- [ ] **Collapse/expand Sidebar**
  - Flowchart adjusts width correctly
  - Height remains consistent
  
- [ ] **Collapse/expand Beat Palette**
  - Flowchart adjusts width correctly  
  - Height remains consistent

- [ ] **Collapse/expand Inspector**
  - Flowchart adjusts width correctly
  - Height remains consistent

---

## 2. Visual Editor Width Tests

### Basic Functionality
- [ ] **Select a visual beat (titleScreen, introText, etc.)**
- [ ] **Switch to Visual Editor tab**
- [ ] **Verify toolbar is fixed at top**
  - Toolbar shows: Select, Hotspot, Text, Grid, Zoom controls
  - Stage size indicator on the right
  - No absolute positioning overlaps

### Scroll Tests
- [ ] **At 100% zoom**
  - Stage visible and centered
  - No horizontal scroll needed (stage fits)
  - No vertical overflow

- [ ] **Zoom to 150%**
  - Stage enlarges properly
  - Horizontal scroll appears when needed
  - Vertical scroll appears when needed
  - Can scroll to see all of stage

- [ ] **Zoom to 200%+**
  - Stage continues to enlarge
  - Scroll bars work correctly
  - Can access all parts of stage
  - Toolbar remains fixed at top

- [ ] **Zoom to 50%**
  - Stage shrinks properly
  - Scroll bars disappear if not needed
  - Stage remains centered

### Properties Panel Tests
- [ ] **Toggle properties panel (left side)**
  - Visual editor adjusts width
  - Stage remains properly contained
  - No overflow issues

- [ ] **With properties panel open**
  - Add background image
  - Add character
  - Add prop
  - Add text element
  - All operations work without layout issues

### Element Interaction Tests
- [ ] **Select elements**
  - Click works correctly
  - Selection highlights visible
  - Properties update in panel

- [ ] **Drag elements**
  - Dragging works at different zoom levels
  - Elements stay within stage bounds
  - No jumping or erratic behavior

- [ ] **Add elements with toolbar**
  - Hotspot tool works
  - Text tool works
  - Elements appear at correct position

### Large Stage Tests
- [ ] **Zoom to 300%**
  - Stage becomes very large
  - Scroll container handles size
  - Can scroll to all corners
  - No layout breaking

- [ ] **Pan around large stage**
  - Smooth scrolling
  - No performance issues
  - Toolbar remains accessible

---

## 3. Tab Switching Tests

- [ ] **Switch from Flowchart to Visual Editor**
  - Transition smooth
  - Visual editor renders correctly
  - Properties panel state preserved

- [ ] **Switch from Visual Editor to Flowchart**
  - Transition smooth
  - Flowchart renders correctly
  - Beat selection preserved

- [ ] **Rapid tab switching**
  - No layout glitches
  - No errors in console
  - State preserved correctly

---

## 4. Screen Size Tests

### Small Screen (1280x720)
- [ ] Flowchart usable
- [ ] Visual editor usable
- [ ] All panels accessible

### Medium Screen (1920x1080)
- [ ] Optimal layout
- [ ] No wasted space
- [ ] Everything accessible

### Large Screen (2560x1440+)
- [ ] Layout scales properly
- [ ] No excessive empty space
- [ ] Panels proportional

---

## 5. Integration Tests

### Complete Workflow
- [ ] **Create new story**
- [ ] **Add titleScreen beat**
- [ ] **Switch to Visual Editor**
- [ ] **Add background**
- [ ] **Add Start button (auto-added)**
- [ ] **Edit button properties**
- [ ] **Zoom in/out**
- [ ] **Save visual changes**
- [ ] **Switch back to Flowchart**
- [ ] **Add more beats**
- [ ] **Connect beats**
- [ ] **Select another visual beat**
- [ ] **Switch to Visual Editor**
- [ ] **Edit visual elements**
- [ ] **No layout issues throughout**

---

## 6. Edge Cases

- [ ] **Minimum window size**
  - Test at 800x600
  - Layout should degrade gracefully
  
- [ ] **Maximum zoom (300%)**
  - Stage very large
  - Scroll works
  - No performance issues

- [ ] **Minimum zoom (25%)**
  - Stage very small
  - Still usable
  - Centered properly

- [ ] **Many visual elements**
  - Add 20+ elements
  - Performance acceptable
  - Layer list scrollable

- [ ] **Large background image**
  - Test with 4K image
  - Loads correctly
  - Doesn't break layout

---

## 7. Console Check

- [ ] **No errors in browser console**
- [ ] **No warnings about layout**
- [ ] **No React warnings**
- [ ] **Performance metrics acceptable**

---

## Issues Found

### Issue 1:
**Description:** 
**Steps to Reproduce:**
**Expected Behavior:**
**Actual Behavior:**
**Severity:** Critical / High / Medium / Low

### Issue 2:
**Description:**
**Steps to Reproduce:**
**Expected Behavior:**
**Actual Behavior:**
**Severity:** Critical / High / Medium / Low

---

## Test Results Summary

**Date Tested:** _________________  
**Tester:** _________________

**Flowchart Height:** ✅ Pass / ❌ Fail  
**Visual Editor Width:** ✅ Pass / ❌ Fail  
**Tab Switching:** ✅ Pass / ❌ Fail  
**Screen Sizes:** ✅ Pass / ❌ Fail  
**Integration:** ✅ Pass / ❌ Fail  
**Edge Cases:** ✅ Pass / ❌ Fail

**Overall Status:** ✅ All Tests Pass / ⚠️ Minor Issues / ❌ Major Issues

**Notes:**



**Sign-off:** _________________
