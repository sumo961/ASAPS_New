# ASPS Modern - Critical Issues Report

## Executive Summary

The ASPS Modern builder has **5 CRITICAL REGRESSIONS** where previously working features have been lost. These are not enhancements but broken core functionality that must be restored.

## Critical Issues

### 🔴 Issue #1: Connection UI Missing
**Severity:** CRITICAL - Blocks all story creation
**Status:** BROKEN
**Description:** The UI for connecting beats has completely disappeared from the Inspector
**Impact:** 
- Cannot connect beats together
- Cannot set button text
- Stories cannot function without connections
**Evidence:** "all connection settings in the editor have disappeared and they are also lost in the export"

### 🔴 Issue #2: Empty Export Sections  
**Severity:** CRITICAL - Data loss on export
**Status:** BROKEN
**Description:** Export produces empty XML sections that previously contained data
```xml
<settings></settings>
<environment></environment>
<characters></characters>
```
**Impact:** All global settings, backgrounds, and characters are lost
**Evidence:** "export has empty settings, environment and characters, this already used to work"

### 🔴 Issue #3: Visual Editor Not Showing
**Severity:** HIGH - Feature claimed as complete but not accessible
**Status:** NOT CONNECTED
**Description:** The "full-size stage" visual editor doesn't appear
**Impact:** Cannot use visual scene composition
**Evidence:** "I do not see a full-size stage visual editor - maybe it's not connected?"

### 🔴 Issue #4: Wrong Beat Types
**Severity:** MEDIUM - Incorrect beat categorization
**Status:** MISCONFIGURED
**Issues:**
- `endScreen` is visual but not in visual beats list
- Obsolete `conversationChoice` and `swfBeat` still listed
**Evidence:** "EndScreen is a visible Beat and needs to be connected to the visual editor"

### 🔴 Issue #5: Asset Selection Empty
**Severity:** HIGH - Blocks asset usage
**Status:** BROKEN
**Description:** Asset selection modal shows empty even with imported assets
**Impact:** Cannot select backgrounds, characters, props, or sounds
**Evidence:** "While there is a selection box now for assets, it remains empty"

## Files Requiring Fixes

1. **packages/builder/src/components/Inspector.tsx**
   - Add connection UI section
   - Add button text inputs
   - Fix supportsVisualEditor function
   - Ensure assets passed to modal

2. **packages/core/src/xml/ASMLGenerator.ts**
   - Verify generateSettings() is called
   - Verify generateEnvironment() is called
   - Verify generateCharacters() is called

3. **packages/builder/src/components/assets/AssetSelectionModal.tsx**
   - Fix type mapping ('sound' → 'audio')
   - Ensure assets are filtered correctly

## Quick Fix Checklist

- [ ] Restore connection dropdown UI
- [ ] Add button text input fields
- [ ] Call all generate methods in ASMLGenerator
- [ ] Add endScreen to visual beats
- [ ] Remove obsolete beat types
- [ ] Fix asset type mapping
- [ ] Pass assets to selection modal

## How to Apply Fixes

```bash
# 1. Make script executable
chmod +x apply-critical-fixes.sh

# 2. Run the fix script
./apply-critical-fixes.sh

# 3. Follow the manual instructions shown

# 4. Build and test
cd packages/builder && npm run build
```

## Verification Tests

### Test 1: Connections
1. Create a titleScreen beat
2. ✅ Should see "Target Beat" dropdown
3. ✅ Should see "Button Text" input
4. Connect to another beat
5. Save and verify connection persists

### Test 2: Export
1. Add global settings
2. Add environment items
3. Add characters
4. Export to XML
5. ✅ Settings section has content
6. ✅ Environment section has content
7. ✅ Characters section has content

### Test 3: Visual Editor
1. Create an endScreen beat
2. ✅ Should see "Visual Editor" tab
3. Click Visual Editor tab
4. ✅ Should see full-size stage

### Test 4: Assets
1. Import assets via Asset Manager
2. Open a visual beat
3. Try to select background
4. ✅ Should see imported assets in modal
5. Select an asset
6. ✅ Asset should be applied

## Root Cause

These appear to be **regression bugs** where working code was deleted or overwritten. The Issues.md file incorrectly marks these as "FIXED ✅" when they are actually broken.

## Priority

**IMMEDIATE** - These are core features required for basic functionality. The application cannot be used effectively without these fixes.

---

**Report Date:** December 2024
**Reported By:** Code Review
**Severity:** CRITICAL - Application Unusable
