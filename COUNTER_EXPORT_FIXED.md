# Counter Export Fixed - Attributes Instead of Nested Elements ✅

## Problem
Counter effects were being exported as nested elements instead of attributes on the choice element.

### Before (Incorrect):
```xml
<choice id="1" text="Tell me about the artifact">
  <counter name="courage" change="5" />
</choice>
```

### After (Correct):
```xml
<choice id="1" text="Tell me about the artifact" counter="courage" change="5">
```

## Fixed Files
1. **ASMLGenerator.ts** - Updated to export counter effects as attributes for:
   - Dialog tree choices
   - Movement choices

## Also Fixed
- Removed emotion attributes from all dialog elements (not preserved in ASML)

## Test Examples

### Dialog Tree with Counter Effects
```xml
<function kind="dialogTree" speaker="Old Wizard" text="Choose your path...">
  <choice id="1" text="Be brave" counter="courage" change="10" target="7" />
  <choice id="2" text="Be cautious" counter="courage" change="-5">
    <target>
      <dialogTree id="node_123" speaker="Old Wizard" text="A wise choice...">
        <choice id="3" text="Continue" counter="wisdom" change="5" target="8" />
      </dialogTree>
    </target>
  </choice>
</function>
```

### Movement Choice with Counter Effects
```xml
<function kind="movementChoice" question="Where do you go?">
  <choice id="1" text="Dark path" location="Forest" counter="courage" change="5" target="4" />
  <choice id="2" text="Safe road" location="Village" counter="health" change="10" target="5" />
</function>
```

### Condition Beat (Fixed)
```xml
<function kind="conditionBeat">
  <condition type="counter" operator=">=" counter="courage" val="60" />
  <trueTarget targetBeat="7" />
  <falseTarget targetBeat="8" />
</function>
```

## Status
✅ All counter effects now export as attributes
✅ Emotion removed from all dialog elements
✅ Condition beat uses "counter=" instead of "left="