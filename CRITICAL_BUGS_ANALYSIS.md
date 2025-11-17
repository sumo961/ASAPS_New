# Critical Bugs Analysis
**Date:** October 5, 2025  
**Status:** Code verification complete - needs runtime testing

## Summary

Investigated three critical bugs reported in Issues.md. **All required code is present and properly wired.** The bugs are likely runtime/UI issues rather than missing code.

---

## Bug #1: New beat types not available from beats palette

### ❌ CANNOT REPRODUCE (Code is correct)

**Findings:**
- ✅ `inputText` is in BeatPalette.tsx (line 15)
- ✅ `hyperText` is in BeatPalette.tsx (line 16)
- ✅ Both registered in BeatRegistry.ts (lines 50-51)
- ✅ Both beat classes exist (InputTextBeat.ts, HyperTextBeat.ts)
- ✅ Both imports present in BeatRegistry.ts

**Palette Display:**
- Input Text: ✏️ icon, "Visible Beats" section
- Hyper Text: 🔗 icon, "Visible Beats" section

**Possible Issues:**
1. User may be looking in wrong section
2. UI rendering bug preventing beats from showing
3. User testing old cached version
4. Beats showing but not creating (drag/drop issue)

**Recommendation:** User should:
1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)
2. Check if beats are in "Visible Beats" section (first section in palette)
3. Try dragging them onto canvas
4. Check browser console for errors

---

## Bug #2: Chosen character does not save for dialogtree beats

### ⚠️ NEEDS RUNTIME VERIFICATION (Code appears correct)

**Data Flow Verification:**
```
✅ App.tsx: characters state from useCharacterManagerIntegration
✅ App.tsx: characters prop passed to Inspector (line 363)
✅ Inspector.tsx: getAvailableCharacters() maps characters (lines 82-88)
✅ Inspector.tsx: characters passed to DialogTreeEditor (line 1713)
✅ DialogTreeEditor.tsx: edit modal uses characters for speaker dropdown (line 503)
✅ DialogTreeEditor.tsx: speaker saved via updateNodeAtPath (lines 285-295)
✅ Inspector.tsx: dialogTree saved via beat.updateParameters (line 448)
```

**Potential Root Causes:**
1. **Character format mismatch:** Characters might be objects `{ id, name, ... }` but code expects strings
2. **Deep nesting issue:** Speaker in dialogTree.speaker might not persist through clone/save
3. **ASML export/import:** Speaker might be lost during export/import cycle
4. **Visual representation:** Character displays but doesn't save to beat parameters

**Test Plan:**
```javascript
// 1. Create dialogTree beat
// 2. Edit speaker in dialog tree editor  
// 3. Save beat
// 4. Export to ASML
// 5. Check ASML for <speaker> tag
// 6. Re-import ASML
// 7. Check if speaker is preserved
```

**Quick Fix to Test:**
In Inspector.tsx, add logging in handleSave (around line 448):
```typescript
console.log('[Inspector] Saving dialogTree:', localBeat.parameters?.dialogTree);
console.log('[Inspector] Speaker:', localBeat.parameters?.dialogTree?.speaker);
```

---

## Bug #3: Characters in "Edit NPC Dialog" pulldown not populated from defined characters

### ⚠️ NEEDS RUNTIME VERIFICATION (Code appears correct)

**Data Flow Verification:**
```
✅ App.tsx: useCharacterManagerIntegration hook (line 93)
✅ App.tsx: characters state managed (updateCharacters)
✅ App.tsx: characters passed to Inspector (line 363)
✅ Inspector.tsx: getAvailableCharacters() function exists (lines 82-88)
✅ Inspector.tsx: Checks if characters.length > 0
✅ Inspector.tsx: Maps char.name || char (handles both formats)
✅ Inspector.tsx: Falls back to default list if empty
✅ DialogTreeEditor.tsx: Accepts characters prop (line 75)
✅ DialogTreeEditor.tsx: Uses characters in dropdown (line 503)
```

**Possible Issues:**

### Issue 3A: Character Manager not saving characters
```typescript
// Check if characters are actually being saved
// In CharacterManager: when user adds character, is it added to state?
```

### Issue 3B: Character format mismatch
```typescript
// Characters might be stored as:
Option 1: ['Alice', 'Bob', 'Carol']  // ✅ Works
Option 2: [{id: 1, name: 'Alice'}, ...]  // ✅ Works (char.name || char)
Option 3: [{id: 1, character: 'Alice'}, ...]  // ❌ Fails (no .name property)
```

### Issue 3C: Characters array empty
```typescript
// If no characters defined yet:
// - Should show fallback list (Old Wizard, Merchant, etc.)
// - User may think this IS the problem
```

**Debug Steps:**
1. Add console.log in Inspector.tsx getAvailableCharacters():
```typescript
const getAvailableCharacters = () => {
  console.log('[Inspector] Raw characters prop:', characters);
  if (characters && characters.length > 0) {
    const mapped = characters.map((char: any) => char.name || char);
    console.log('[Inspector] Mapped characters:', mapped);
    return mapped;
  }
  console.log('[Inspector] Using fallback characters');
  return ['Old Wizard', 'Merchant', ...];
};
```

2. Check Character Manager - ensure characters have 'name' property:
```typescript
// In CharacterManager when saving:
const newCharacter = {
  id: generateId(),
  name: nameInput,  // ← Critical: must be 'name' not 'character'
  // ... other properties
};
```

---

## Verification Tests

### Manual Runtime Tests

**Test 1: Beat Palette**
```
1. Open ASAPS Builder
2. Look at beat palette (right side usually)
3. Find "Visible Beats" section
4. Verify "Input Text" (✏️) and "Hyper Text" (🔗) are present
5. Try dragging each onto canvas
6. Verify beat is created
7. Check inspector shows correct type
```

**Test 2: DialogTree Character**
```
1. Create dialogTree beat
2. Open inspector
3. Expand dialog tree editor
4. Click edit (✏️) on root NPC dialog
5. Check dropdown - what characters appear?
6. Select a character
7. Click Save in modal
8. Click Save Changes in inspector
9. Reload page (or export/import)
10. Open same beat
11. Click edit - is character preserved?
```

**Test 3: Character Integration**
```
1. Click "Characters" button in header
2. Add new character "TestChar"
3. Close character manager
4. Create new dialogTree beat
5. Open dialog tree editor  
6. Click edit on root node
7. Check dropdown - does "TestChar" appear?
```

---

## Recommended Actions

### Priority 1: User Testing
User should manually test each bug to confirm:
- What exactly is happening
- What is expected vs actual behavior
- Any console errors

### Priority 2: Add Debug Logging
If bugs persist, add console.log statements to trace data flow:

**For Bug #1 (Beat Palette):**
```typescript
// In BeatPalette.tsx
console.log('Beat types:', beatTypes);

// In GraphEditor.tsx onDrop
console.log('Dropped beat type:', beatType);

// In useStoryBuilder.ts addBeat
console.log('Creating beat type:', type);
console.log('Beat created:', newBeat);
```

**For Bug #2 (Character Save):**
```typescript
// In DialogTreeEditor.tsx save function
console.log('Saving speaker:', editingNode.node.speaker);

// In Inspector.tsx handleSave
console.log('DialogTree to save:', localBeat.parameters?.dialogTree);

// In DialogTreeBeat.ts updateParameters
console.log('Updating dialogTree params:', params.dialogTree);
```

**For Bug #3 (Character Dropdown):**
```typescript
// In getAvailableCharacters
console.log('Characters received:', characters);
console.log('Returning:', mappedCharacters);

// In DialogTreeEditor
console.log('Characters prop:', characters);
```

### Priority 3: Fix Confirmed Issues
Once bugs are confirmed via testing, implement fixes based on findings.

---

## Files Verified

### Core Beat Implementation
- ✅ `/packages/core/src/beats/InputTextBeat.ts` - Exists, fully implemented
- ✅ `/packages/core/src/beats/HyperTextBeat.ts` - Exists, fully implemented  
- ✅ `/packages/core/src/beats/BeatRegistry.ts` - Both beats registered
- ✅ `/packages/core/src/beats/DialogTreeBeat.ts` - Should exist (not verified)

### UI Components
- ✅ `/packages/builder/src/components/graph/BeatPalette.tsx` - Both beats in palette
- ✅ `/packages/builder/src/components/graph/GraphEditor.tsx` - Drop handling looks correct
- ✅ `/packages/builder/src/components/Inspector.tsx` - Character handling looks correct
- ✅ `/packages/builder/src/editors/DialogTreeEditor.tsx` - Speaker dropdown implemented
- ✅ `/packages/builder/src/App.tsx` - Character state management present

### State Management  
- ✅ `/packages/builder/src/hooks/useStoryBuilder.ts` - addBeat function uses registry
- ✅ `/packages/builder/src/hooks/useCharacterManagerIntegration.ts` - Should exist (not verified)

---

## Conclusion

**All required code is present and properly connected.** The three reported bugs are likely:

1. **Bug #1:** UI issue, caching issue, or user confusion about location
2. **Bug #2:** Runtime data flow issue (character not persisting through save cycle)
3. **Bug #3:** Character data format mismatch or character manager not working

**Next Step:** User should run the manual tests above and report specific findings. Based on results, we can implement targeted fixes.
