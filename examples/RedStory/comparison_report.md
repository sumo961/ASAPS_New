# RedStory Import/Export Comparison Report

## Executive Summary

Comparing `Story_converted_proper.xml` (original converted) with `Red's_Path_through_the_woods.xml` (imported and re-exported) reveals significant data loss during the import/export cycle, particularly with dialogTree beats and counter attributes.

## Key Findings

### 1. Beat Count Discrepancy
- **Original**: 81 total beats (25 dialogTree + 56 others)
- **Re-export**: 77 total beats (seems to have all 81 but with data loss)
- **Primary Issue**: No beats missing by ID, but major structural/data loss

### 2. Devastating Counter Attribute Loss

**CRITICAL**: Nearly all counter attributes on choice elements are lost during re-export.

- **Original**: 82 choices with counter attributes (counter + operation + val)
- **Re-export**: Only 4 choices with counter attributes
- **Loss Rate**: **95% of counter effects are missing**

**Example from Beat 11:**

**Original (correct dialogTree format):**
```xml
<function kind="dialogTree">
  <dialogTree id="node_11" speaker="Mom" text="Hello there. What a pretty red hat you have." node="forestDetail">
    <choice id="1" text="Thank you. My name is Red..." counter="friendly" operation="change" val="2">
    </choice>
  </dialogTree>
</function>
```

**Re-export (wrong format):**
```xml
<function kind="conversationChoice">
  <questioner>WOLF</questioner>
  <question>Hello there. What a pretty red hat you have.</question>
  <choice id="1" content="Thank you. My name is Red..." counter="friendly,02" targetBeat="12">
  </choice>
</function>
```

**Problems identified:**
1. **Beat type changed**: `dialogTree` → `conversationChoice` (downgrade to legacy format)
2. **Attribute format changed**: `counter="friendly" operation="change" val="2"` → `counter="friendly,02"` (old comma-separated format)
3. **Element names changed**: `text` → `content`, `target` → `targetBeat`
4. **Speaker location moved**: From dialogTree attribute → separate questioner element

### 3. Beat Type Preservation Issues

While beat IDs are preserved, beat types show some concerning patterns:

- **movementChoice**: 5 (preserved correctly)
- **conditionCheck**: 16 (preserved correctly)
- **setVariable**: 0 original, 2 in re-export (inconsistency)
- **dialogTree**: 25 (present in both files, but structure degraded)

## Root Causes

### Issue #1: DialogTree Export Regression

The `ASMLGenerator.ts` at line 447-473 has logic to export `dialogTree` beats:

```typescript
case 'dialogTree':
  // Generate direct dialog tree content - the function element IS the dialog tree
  if (params.dialogTree) {
    this.generateDialogTree(params.dialogTree, lines, indent + this.indent);
  }
  break;
```

However, this code path is not being triggered. Instead, dialogTree beats are falling back to the legacy `conversationChoice` export path. This suggests:

1. **The dialogTree beats are not being recognized as type 'dialogTree' in the Story object**
2. Or there's a bug in the beat serialization logic that defaults to conversationChoice

### Issue #2: Counter Attribute Decision Logic

**Parser**: Correctly parses counter attributes from XML into structured data (ASMLParser.ts:959-963):
```typescript
counter: choiceEl.getAttribute('counter'),
counterOperation: choiceEl.getAttribute('operation'),
counterValue: choiceEl.getAttribute('val')
```

**Generator**: Correctly exports counter attributes (ASMLGenerator.ts:742-750):
```typescript
if (choice.counter) attrs.push(`counter="${this.escapeXml(choice.counter)}"`);
if (choice.counterOperation) attrs.push(`operation="${choice.counterOperation}"`);
if (choice.counterValue !== undefined) attrs.push(`val="${choice.counterValue}"`);
```

**But**: The dialogTree beat structure is being lost before reaching the generator, so choices with counters never make it to this code path.

### Issue #3: Nested DialogTree Structure Loss

The ASMLParser correctly parses nested dialogTree structures recursively (ASMLParser.ts:971-972):

```typescript
const nestedDialogEl = targetEl.querySelector(':scope > dialogTree');
if (nestedDialogEl) {
  // RECURSIVE PARSE - this is the critical fix
  choice.target = this.parseDialogTree(nestedDialogEl);
}
```

However, most of this nested structure disappears in the re-exported file, suggesting the Beat object is not storing or serializing the nested dialogTree properly.

## What Gets Lost

1. **Counter Effects**: 95% missing (78 of 82 choices affected)
2. **DialogTree Structure**: Degraded to flat conversationChoice format
3. **Nested Dialog Trees**: Nested target dialogs lost (flattened)
4. **Choice Effects**: Sound effects, conditions, and other choice effects likely lost (not fully verified)
5. **Node References**: Some references to node ID in dialogTree attributes may be lost

## What's Preserved

1. Beat IDs and order
2. Basic dialog text and speaker information
3. Simple target references (not nested targets)
4. Character definitions
5. Environment/prop definitions
6. Location data (x, y coordinates)
7. Basic beat structure (transitions, sounds, etc.)

## Recommended Fixes

### Priority 1: Fix DialogTree Beat Type Recognition
- Investigate why dialogTree beats are being treated as conversationChoice during export
- Verify beat.type is correctly stored as 'dialogTree' in the Story object
- Check if dialogTree parameters are properly serialized in beat.parameters

### Priority 2: Instrument and Debug Import/Export
- Add debug logging to ASMLParser to verify dialogTree beats are parsed correctly
- Add debug logging to ASMLGenerator to verify beat types being processed
- Create a minimal test case with one dialogTree beat to isolate the issue

### Priority 3: Validate Nested Structure Preservation
- Test if nested dialogTree elements survive import/export cycle
- Verify recursive parsing/generation logic for dialog trees
- Create tests for edge cases (deep nesting, circular references, etc.)

## Test Files

**Original**: `Story_converted_proper.xml` (72KB, 81 beats, 82 choice counters)
**Re-export**: `Red's_Path_through_the_woods.xml` (48KB, 77 beats apparent structure, 4 choice counters)
**No-DialogTree**: `Story_no_dialogtree.xml` (37KB, 56 beats, created for testing)

## Next Steps

1. Investigate the dialogTree beat type handling in the Story object
2. Check if beat.parameters.dialogTree is correctly populated
3. Verify the ASMLGenerator's beat type routing logic
4. Test isolated dialogTree beat for root cause analysis
5. Consider adding round-trip tests for dialogTree beats
