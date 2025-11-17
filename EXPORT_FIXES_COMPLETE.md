# ASPS Export Issues - Complete Fix Summary

## ✅ Issues Fixed

### 1. Connection Replacement Bug ✅
**Problem:** Old connections weren't removed when changed in Inspector
**Solution:** 
- Added proper connection management methods to Beat class
- Fixed Inspector to use type assertions for compatibility
- Connections now properly replace instead of accumulating

### 2. Duration ×1000 Bug 🔧
**Problem:** All transition durations multiplied by 1000 (1000 → 1000000)
**Root Cause:** ASMLParser multiplies by 1000 on import (line ~695)
**Solution:**
```typescript
// OLD (wrong):
duration: parseFloat(transitionElement.getAttribute('duration') || '0.5') * 1000

// NEW (correct):
duration: parseFloat(transitionElement.getAttribute('duration') || '500')
```

### 3. Missing Characters/Settings/Environment 🔧
**Problem:** These sections were empty in exported XML
**Root Cause:** useStoryBuilder's `exportStory()` wasn't transferring this data
**Solution:** Modified exportStory to preserve all data:
```typescript
// Transfer ALL data from imported story
if (state.story) {
  story.setSettings(state.story.getSettings());
  story.setEnvironment(state.story.getEnvironment());
  story.setCharacters(state.story.getCharacters());
  story.setClusters(state.story.getClusters());
}
```

## 📁 Files Modified

1. **packages/core/src/beats/Beat.ts**
   - Added: clearConnections(), removeConnection(), replaceConnections(), hasConnection()

2. **packages/builder/src/components/Inspector.tsx**
   - Fixed: Connection clearing with type assertions

3. **packages/core/src/xml/ASMLParser.ts**
   - Fixed: Removed duration * 1000 multiplication

4. **packages/builder/src/hooks/useStoryBuilder.ts**
   - Fixed: Export now preserves settings/environment/characters

## 🚀 How to Apply All Fixes

```bash
# Make the script executable
chmod +x fix-all-export-issues.sh

# Run it
./fix-all-export-issues.sh
```

## ✅ Testing Checklist

1. **Test Connection Replacement:**
   - Select a beat in Inspector
   - Change its connection target
   - Save → old connection should be gone
   - Only new connection visible in Flowchart

2. **Test Duration Values:**
   - Import forest_adventure_v2.xml
   - Export it
   - Check XML: durations should be correct (e.g., 1000, not 1000000)

3. **Test Data Preservation:**
   - Import forest_adventure_v2.xml (has 2 characters, settings, environment)
   - Export it
   - Check exported XML has:
     - `<characters>` with 2 character entries
     - `<settings>` with debug/colors/fonts/textbox
     - `<environment>` with props and nodes

4. **Run Full Validation:**
   ```bash
   node validate-roundtrip-fixed.js examples/forest_adventure_v2.xml exported.xml
   ```

## 📊 Expected Validation Results

After all fixes:
```
✅ Beats: Count matches (17)
✅ Duration values correct (no ×1000)
✅ Characters: Count matches (2)
✅ Settings preserved
✅ Environment preserved
⚠️ Connections: Minor difference OK (multi-choice beats generate extra)
```

## 🔍 Debugging Tips

If issues persist:

1. **Check imported data exists:**
   ```javascript
   // In browser console after import
   const story = window.__story; // or find it in React DevTools
   console.log({
     settings: story.getSettings(),
     environment: story.getEnvironment(),
     characters: story.getCharacters()
   });
   ```

2. **Verify export function is fixed:**
   - Check that useStoryBuilder.ts has the data transfer code
   - Look for "FIXED: Transfer all data sections" comment

3. **Check for build issues:**
   - Ensure packages built in order: core → renderer → builder
   - Clear node_modules and rebuild if needed

## 🎉 Success Criteria

The export is fully working when:
- ✅ Connections replace properly (no duplicates)
- ✅ Duration values are correct (not multiplied)
- ✅ Characters section has data
- ✅ Settings section has data  
- ✅ Environment section has props/nodes
- ✅ Validation script shows minimal errors

## 📞 Remaining Work

If validation still shows issues after these fixes:
1. Check if beat parameters are missing
2. Verify choice/prop connections are generated
3. Ensure conditional beats have both true/false connections

The major data loss issues should now be resolved!
