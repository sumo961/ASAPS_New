# CRITICAL ISSUES AND FIXES - ASPS Modern

## 🔴 CRITICAL ISSUES FOUND

### 1. **LOST CONNECTION SETTINGS** ⚠️
**Problem:** Connection dropdowns and button text inputs have disappeared from Inspector
**Impact:** Cannot connect beats, cannot set button labels, breaks entire story flow
**Location:** `packages/builder/src/components/Inspector.tsx`

### 2. **EMPTY EXPORT SECTIONS** ⚠️
**Problem:** Export produces empty `<settings>`, `<environment>`, and `<characters>` tags
**Impact:** All global settings, backgrounds, and character definitions are lost on export
**Location:** `packages/core/src/xml/ASMLGenerator.ts`

### 3. **VISUAL EDITOR NOT VISIBLE** ⚠️
**Problem:** Visual editor tab doesn't appear for visual beats
**Impact:** Cannot use the visual scene editor that was supposedly complete
**Location:** Visual editor integration in Inspector

### 4. **WRONG BEAT TYPES** ⚠️
**Problem:** 
- `endScreen` not included in visual beats (but it IS visual)
- Obsolete beats `conversationChoice` and `swfBeat` still listed
**Impact:** Cannot edit endScreen visually, confusion with deprecated beats

### 5. **ASSET SELECTION BROKEN** ⚠️
**Problem:** Asset selection modal shows empty even when assets are imported
**Impact:** Cannot select backgrounds, characters, props, or sounds
**Cause:** Assets not being passed correctly or type mismatch ('sound' vs 'audio')

## ✅ FIXES TO APPLY

### Fix 1: Restore Connection UI in Inspector

Add after beat parameters section in Inspector.tsx:

```typescript
{/* Connection Settings */}
{connectionType === 'single' && beat.type !== 'endScreen' && (
  <div>
    <label>Target Beat</label>
    <select value={localBeat.connections?.[0]?.targetId || ''} 
            onChange={(e) => /* update connections */}>
      <option value="">Select target...</option>
      {availableTargets.map(target => (
        <option key={target.id} value={target.id}>
          {target.name} ({target.type})
        </option>
      ))}
    </select>
  </div>
)}

{/* Button Text */}
{(beat.type === 'titleScreen' || beat.type === 'introText' || 
  beat.type === 'endScreen') && (
  <div>
    <label>Button Text</label>
    <input type="text" 
           value={localBeat.parameters?.buttonText || 'Continue'}
           onChange={(e) => handleParameterChange('buttonText', e.target.value)} />
  </div>
)}
```

### Fix 2: Ensure ASMLGenerator Exports All Sections

In ASMLGenerator.ts generate() method:

```typescript
generate(story: Story): string {
  const lines: string[] = [];
  
  // ... XML declaration and story opening ...
  
  // MUST CALL ALL OF THESE:
  this.generateSettings(story.getSettings(), lines);
  this.generateEnvironment(story.getEnvironment(), lines);
  this.generateCharacters(story.getCharacters(), lines);
  this.generatePlot(story, lines);
  
  lines.push('</story>');
  return lines.join('\n');
}
```

### Fix 3: Fix Visual Beat Types

Update in Inspector.tsx:

```typescript
const supportsVisualEditor = (beatType: string) => {
  const visualBeatTypes = [
    'titleScreen',
    'introText',
    'durScreen',
    'pickProp',
    'movementChoice',
    'dialogTree',
    'endScreen',  // ADD THIS
    'videoBeat'   // Remove: conversationChoice, swfBeat
  ];
  return visualBeatTypes.includes(beatType);
};
```

### Fix 4: Fix Asset Modal

Ensure assets are passed and types match:

```typescript
// When opening modal - map 'sound' to 'audio'
const handleAssetSelection = (type, callback) => {
  setAssetSelectionModal({
    isOpen: true,
    type: type === 'sound' ? 'audio' : type,  // FIX TYPE MISMATCH
    callback
  });
};

// Pass assets to modal
<AssetSelectionModal
  assets={assets}  // ENSURE THIS IS PASSED
  assetType={assetSelectionModal.type === 'sound' ? 'audio' : assetSelectionModal.type}
  // ... other props
/>
```

## 🔧 HOW TO APPLY FIXES

1. **Run the fix script:**
```bash
chmod +x fix-all-critical-issues.sh
./fix-all-critical-issues.sh
```

2. **Manual edits needed in Inspector.tsx:**
   - Add connection UI code (see Fix 1 above)
   - Update supportsVisualEditor function (see Fix 3)
   - Fix asset modal type mapping (see Fix 4)

3. **Verify ASMLGenerator.ts:**
   - Check that generate() calls all section generators
   - Ensure Story object has matching getter methods

4. **Test everything:**
   - Create beats and add connections
   - Set button text on titleScreen/introText/endScreen
   - Export story and check XML has settings/environment/characters
   - Open visual editor for endScreen
   - Import assets and select them in beats

## 📋 VERIFICATION CHECKLIST

- [ ] Can add connections between beats
- [ ] Button text field appears for applicable beats
- [ ] Exported XML contains settings with values
- [ ] Exported XML contains environment section
- [ ] Exported XML contains characters section  
- [ ] Visual editor tab appears for ALL visual beats including endScreen
- [ ] Asset selection modal shows imported assets
- [ ] Can select backgrounds, characters, props, sounds
- [ ] Visual editor shows full-size stage (1280x720+)

## 🚨 ROOT CAUSE ANALYSIS

These issues appear to be regression bugs where working features were lost, possibly due to:
1. Incomplete merging of changes
2. Partial file updates that broke existing functionality
3. Type mismatches between components ('sound' vs 'audio')
4. Missing UI sections that were accidentally removed

The fact that these features "used to work" suggests code was deleted or overwritten rather than never implemented.

## 📝 NOTES

- The Issues.md file incorrectly marks many items as "FIXED ✅" when they are actually broken
- The visual editor exists but isn't properly connected/visible
- Connection functionality is critical - without it, stories cannot function
- These are not enhancement requests but restoration of lost core functionality
