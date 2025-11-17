# ASPS ASMLGenerator - Remaining Issues to Fix

## Current Status
✅ **WORKING:**
- Beat structure and IDs preserved
- Function kinds and most attributes preserved  
- Text content now included
- Choices and dialog trees exported
- Sections (settings/environment/characters) created

## 🔴 Critical Issues Still to Fix

### 1. Duration Values Multiplied by 1000
**Problem:** All transition durations are being multiplied by 1000 during export
- Original: `duration="1000"`
- Exported: `duration="1000000"` 

**Fix needed in ASMLGenerator.ts:**
```typescript
// Find where duration is being set and remove the multiplication
// Look for something like:
duration: transition.duration * 1000  // WRONG
// Should be:
duration: transition.duration  // CORRECT
```

### 2. Characters Section Empty
**Problem:** Characters are not being exported even though they exist in the data
- Original has 2 characters with counters
- Export has empty `<characters>` section

**Fix needed:** Ensure the characters array is being properly passed to the generator

### 3. Settings/Environment Sections Empty  
**Problem:** Settings and environment data not being written even though sections exist
- Settings should have debug, colors, fonts, textbox
- Environment should have props and nodes

**Fix needed:** Check that the data is being properly extracted and passed to these sections

### 4. Connection Count Discrepancy
**Note:** The exported file has MORE connections (14 vs 10), which might actually be correct if multi-choice beats are now properly generating individual connections for each choice.

## Testing Commands

### Run the improved validation:
```bash
node validate-roundtrip-fixed.js examples/forest_adventure_v2.xml examples/The_Forest_Adventure_6.xml
```

### Quick check for duration issue:
```bash
grep -o 'duration="[0-9]*"' examples/forest_adventure_v2.xml
grep -o 'duration="[0-9]*"' examples/The_Forest_Adventure_6.xml
```

## Code Locations to Check

1. **Duration multiplication:** Look in ASMLGenerator.ts for where transition duration is set
2. **Characters export:** Check the `generateCharacters()` method
3. **Settings export:** Check the `generateSettings()` method  
4. **Environment export:** Check the `generateEnvironment()` method

## Important Notes
- DO NOT rename the ASMLGenerator class (keep it as `ASMLGenerator` not `ASMLGeneratorFixed`)
- The connection count difference might be intentional/correct
- Test parameters are now mostly preserved, focus on the data sections
