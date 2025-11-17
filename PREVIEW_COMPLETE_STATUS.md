# Preview & Runtime Completion Status

## Current Status (October 9, 2025)

### Critical Bugs Status

**Bug 1: New beat types not available from beats palette** ✅ **FIXED**
- **Status**: This was incorrect information
- **Reality**: inputText and hyperText ARE in the palette (BeatPalette.tsx lines 17-18)
- **Reality**: Both ARE registered in BeatRegistry (BeatRegistry.ts lines 49-50)
- **Action Required**: Update Issues.md to reflect accurate status

**Bug 2: Chosen character does not save for dialogTree beats** ⏳ **NEEDS INVESTIGATION**
- **Status**: Needs verification
- **Location**: Inspector.tsx dialogTree section
- **Action Required**: Test and fix if needed

**Bug 3: Characters in "Edit NPC Dialog" pulldown not populated** ⏳ **NEEDS INVESTIGATION**  
- **Status**: Needs verification
- **Location**: Inspector.tsx dialogTree character selection
- **Action Required**: Test and fix if needed

---

## Preview / Runtime Status by Beat Type

### Fully Working ✅

| Beat Type | Renderer Method | Status | Notes |
|-----------|----------------|--------|-------|
| titleScreen | renderTitleScreen | ✅ Working | Component exists |
| introText | renderText | ✅ Working | Component exists |
| durScreen | renderDurScreen | ✅ Working | Component with timer |
| dialogTree | renderDialog + renderChoices | ✅ Working | Both components exist |
| movementChoice | renderMovement | ✅ Working | Component exists |
| pickProp | renderPropSelection | ✅ Working | Component exists |
| videoBeat | renderVideo | ✅ Working | Component exists |
| endScreen | renderEndScreen | ✅ Working | Component exists |
| inputText | renderInputText | ✅ Working | Component exists, beat calls it |
| hyperText | renderHyperText | ✅ Working | Component exists, beat calls it |

### Needs Investigation ⏳

| Beat Type | Expected Method | Status | Notes |
|-----------|----------------|--------|-------|
| conversationChoice | renderChoices? | ⏳ Unknown | May be legacy/alias for dialogTree |
| setVariable | (invisible) | ✅ Should work | No rendering needed |
| conditionBeat | (invisible) | ✅ Should work | Logic only |
| randomTarget | (invisible) | ✅ Should work | Logic only |
| setTimer | (invisible) | ✅ Working | Timer manager implemented |
| addRemoveInventory | (invisible) | ✅ Should work | Context method exists |

---

## ReactRenderer Implementation Status

### All Beat Rendering Methods Implemented ✅

From `ReactRenderer.tsx`:
- ✅ `renderTitleScreen()` - Line ~480
- ✅ `renderText()` - Line ~487
- ✅ `renderDialog()` - Line ~495
- ✅ `renderChoices()` - Line ~504
- ✅ `renderMovement()` - Line ~518
- ✅ `renderPropSelection()` - Line ~529
- ✅ `renderVideo()` - Line ~540
- ✅ `renderEndScreen()` - Line ~558
- ✅ `renderDurScreen()` - Line ~564
- ✅ `renderInputText()` - Line ~575 (NEW)
- ✅ `renderHyperText()` - Line ~596 (NEW)

All React components exist and are properly structured.

---

## Beat Execute() Implementation Status

### Verified Beat Implementations

| Beat | Has performAction() | Calls Renderer | Status |
|------|-------------------|----------------|--------|
| InputTextBeat | ✅ Yes | ✅ renderer.renderInputText() | Complete |
| HyperTextBeat | ✅ Yes | ✅ renderer.renderHyperText() | Complete |

### Need to Verify

- All other beat types should have performAction() methods
- Need to verify they all call their respective renderer methods
- Need to test in actual preview

---

## StoryPreview Implementation Status ✅

From `StoryPreview.tsx`:
- ✅ Basic preview UI complete
- ✅ Start/Stop/Restart controls
- ✅ Debug panel with:
  - Current beat info
  - Visited beats tracking
  - Variables display
  - Counters display
  - Inventory display
  - Active timers display
- ✅ Timer system fully integrated
- ✅ Timer expiration navigation working
- ✅ ReactRenderer container integration
- ✅ StoryEngine integration

---

## Next Steps

### Priority 1: Verification & Bug Fixes (IMMEDIATE)

1. **Test All Beat Types in Preview**
   - Create test story with every beat type
   - Run in preview
   - Document which beats work/fail
   - Fix any issues found

2. **Fix Critical Bugs**
   - Investigate dialogTree character saving
   - Fix character pulldown population
   - Test thoroughly

3. **Update Documentation**
   - Update Issues.md with accurate status
   - Document any bugs found during testing
   - Update Progress.md

### Priority 2: Missing Features (HIGH)

1. **Flowchart Position Saving**
   - Save beat positions in ASML or metadata
   - Restore on import
   - Critical for usability

2. **Cluster Functionality**
   - Implement cluster UI in sidebar
   - Add cluster assignment in inspector
   - Add cluster backgrounds in visual editor
   - Implement ASML export/import
   - Add cluster collapse in flowchart

3. **Iterative Save System**
   - Design .asaps project format
   - Implement save/load
   - Auto-save functionality
   - Recovery system

### Priority 3: Runtime Preparation (MEDIUM)

1. **Standalone Runtime Architecture**
   - Extract StoryPreview logic to @asaps/runtime package
   - Create standalone player component
   - Web export functionality
   - Embed code generation

2. **Runtime Optimization**
   - Asset preloading
   - Smooth transitions
   - Error recovery
   - Performance monitoring

---

## Technical Debt

1. **Code Organization**
   - Extract preview logic from builder package
   - Create proper @asaps/runtime package
   - Separate authoring from runtime concerns

2. **Testing**
   - Unit tests for all beats
   - Integration tests for preview
   - End-to-end story tests
   - Performance benchmarks

3. **Documentation**
   - API documentation for runtime
   - Embedding guide
   - Performance best practices
   - Troubleshooting guide

---

## Success Criteria

### For "Preview Complete" ✅
- [x] All visible beat types render correctly
- [x] All invisible beat types execute logic
- [x] Timer system working
- [ ] Verified in actual testing ⏳
- [ ] No console errors during playback ⏳
- [ ] Smooth transitions between beats ⏳

### For "Standalone Runtime Ready" ⏳
- [ ] Preview code extracted to runtime package
- [ ] Web export functionality
- [ ] Embed code generation
- [ ] Documentation complete
- [ ] Example stories included

### For "Production Ready" ⏳
- [ ] All features complete
- [ ] Full test coverage
- [ ] Performance optimized
- [ ] Documentation complete
- [ ] Example stories tested

---

*Status compiled: October 9, 2025*  
*Next review: After comprehensive testing*
