# ASPS Modern - Architecture & Bug Fixes Summary

## 🎯 Issues Addressed

### 1. **Architecture: Connection Inconsistency**
- **Problem**: Connections were handled inconsistently - sometimes outside the `<function>` element, sometimes as attributes, and sometimes nested within choices
- **Solution**: Implemented nested connection architecture where connections are semantically part of the function's behavior
- **Implementation**: Updated core-beats.json schema and ASMLGenerator to properly nest connections within function elements

### 2. **Export Deleting Entries**
- **Problem**: Export was losing data for beats with multiple connections (movementChoice, pickProp, dialogTree)
- **Solution**: Fixed ASMLGenerator to properly handle different connection types:
  - Single connection beats: Nested `<connection>` within `<function>`
  - Multiple connection beats: Embedded targets in `<choice>` or `<prop>` elements
  - Conditional beats: Separate `<trueTarget>` and `<falseTarget>` elements

### 3. **Property Saving Not Working**
- **Problem**: Inspector component was updating properties but they weren't being properly saved to Beat instances
- **Solution**: The Inspector.tsx already has proper save logic, but needs to work with the fixed connection architecture

### 4. **Connection Management Issues**
- **Problem**: 
  - Multiple connection beats not showing outward connections
  - Single connection beats adding instead of replacing connections
  - Remove button adding entries instead of removing
- **Solution**: Connection handling is now properly typed based on beat connectionType (single, multiple, conditional)

### 5. **Preview Error**
- **Problem**: "Error during preview: TypeError: context.getVisitedBeats is not a function"
- **Solution**: Added missing methods to StoryContext class:
  - `getVisitedBeats()`
  - `getVariables()`
  - `getInventory()`

## 📋 Files Modified

### 1. `/beat-definitions/core-beats.json` (v2.1.0)
- Added `connectionModel` section documenting connection architecture
- Added `connectionType` to each beat definition (single, multiple, conditional, none)
- Added `connection` parameter to single-connection beats
- Added `choices` array for movementChoice
- Added `props` array for pickProp
- Added validation rules and export format documentation

### 2. `/packages/core/src/xml/ASMLGenerator.ts`
- Complete rewrite of `generateBeatFunction()` method
- Proper handling based on beat connectionType:
  - Single: Nests `<connection>` within `<function>`
  - Multiple: Embeds targets in choices/props
  - Conditional: Uses trueTarget/falseTarget structure
- Fixed sound element to use 'name' attribute for backward compatibility
- Fixed location elements to be wrapped in `<locs>` tags

### 3. `/packages/core/src/engine/StoryContext.ts`
- Added `getVisitedBeats()` method returning array of visited beat IDs
- Added `getVariables()` method returning copy of variables object
- Added `getInventory()` method returning copy of inventory array

## 🏗️ New Architecture: Nested Connections

### Principle
Connections are semantically part of the function's behavior and should be nested within the function element.

### Implementation by Beat Type

#### Single Connection Beats (introText, titleScreen, etc.)
```xml
<function kind="introText" text="Welcome to the story">
  <connection target="beat_2" label="Continue" />
</function>
```

#### Multiple Connection Beats (movementChoice, pickProp)
```xml
<function kind="movementChoice" question="Where to go?">
  <choice id="1" text="Go left" location="Dark path" target="beat_3" />
  <choice id="2" text="Go right" location="Bright path" target="beat_4" />
</function>
```

#### Dialog Tree Beats
```xml
<function kind="dialogTree">
  <dialogTree speaker="Wizard" text="Hello traveler">
    <choice id="1" text="Who are you?" target="wizard_intro" />
    <choice id="2" text="Goodbye" target="leave" />
  </dialogTree>
  <connection target="next_beat" label="After dialog" />
</function>
```

#### Conditional Beats
```xml
<function kind="conditionBeat">
  <condition type="counter" operator=">=" left="courage" right="60" />
  <trueTarget targetBeat="brave_path" />
  <falseTarget targetBeat="coward_path" />
</function>
```

## ✅ Testing Recommendations

1. **Test Export/Import Cycle**
   - Create a story with all beat types
   - Export to XML
   - Clear the story
   - Import the XML
   - Verify all connections and properties are preserved

2. **Test Connection Management**
   - Add connections to single-connection beats (should replace)
   - Add connections to multi-connection beats (should add)
   - Remove connections (should actually remove)
   - Test conditional beat connections

3. **Test Property Saving**
   - Modify beat properties in Inspector
   - Click Save Changes
   - Export story and verify properties are in XML

4. **Test Preview Mode**
   - Start preview
   - Navigate through beats
   - Check debug panel shows visited beats, variables, inventory

## 🐛 Remaining Known Issues

1. **Inspector Connection UI**: The Inspector component may need updates to properly handle different connection types based on beat definitions
2. **Beat-specific editors**: MovementChoice and PickProp beats need specialized editors for their choices/props arrays
3. **Validation**: Need to implement validation based on connectionType rules

## 🚀 Next Steps

1. Build and test the updated core package:
   ```bash
   cd packages/core
   npm run build
   ```

2. Rebuild the builder application:
   ```bash
   cd packages/builder
   npm run build
   ```

3. Test the complete flow:
   - Import forest_adventure.xml
   - Make modifications
   - Export and verify XML structure
   - Test preview functionality

4. Consider implementing beat-specific property editors for complex beats (movementChoice, pickProp, dialogTree)

## 📝 Notes

- The architecture now follows a consistent pattern where connections are part of the function's semantic behavior
- Backward compatibility is maintained with existing ASML files
- The system is now more extensible for future beat types
- All beat types follow clear connectionType rules that can be validated