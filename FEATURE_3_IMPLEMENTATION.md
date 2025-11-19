# Feature 3: Choice Delay with Fade-in

## Overview
This feature adds a delay before showing choices in choice-based beats (movementChoice, pickProp, dialogTree), with a CSS fade-in transition for a more natural flow. This allows the story to present text/context first, then show the choices after a delay.

## Status
**NOT YET IMPLEMENTED** - This document provides implementation guidance for another Claude to continue.

## Requirements

### Old ASML Format Example
```xml
<function kind="movementChoice">
  <delay val="2.0" />
  <choice text="Go left" location="left" target="leftBeat" />
  <choice text="Go right" location="right" target="rightBeat" />
</function>
```

The `<delay>` element specifies seconds to wait before showing choices, with fade-in visual effect.

## Implementation Plan

### 1. Add choiceDelay Parameter to Beat Types

**Files to modify:**
- `packages/core/src/beats/MovementChoiceBeat.ts`
- `packages/core/src/beats/PickPropBeat.ts`
- `packages/core/src/beats/DialogTreeBeat.ts`

Add field:
```typescript
public choiceDelay?: number; // Delay in seconds before showing choices
```

Initialize in constructor from `config.choiceDelay` or `config.parameters?.choiceDelay`.

### 2. Implement Delay Logic in Beat Execution

Modify `performAction()` in each beat type to:
1. Render the beat content (text, background, etc.) WITHOUT choices
2. If `choiceDelay` is set and > 0:
   - Wait for the delay duration
   - Then render/show the choices with fade-in
3. Otherwise, show choices immediately as before

**Example pseudocode:**
```typescript
protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
  // Render content first
  await renderer.renderMovementChoice(text, locations, []); // Empty choices initially

  // Apply delay if configured
  if (this.choiceDelay && this.choiceDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, this.choiceDelay * 1000));
  }

  // Now show choices with fade-in
  await renderer.showChoices(choices, { fadeIn: true });

  // Wait for user selection...
}
```

### 3. Add Renderer Support

**Files to modify:**
- `packages/renderer/src/ReactRenderer.tsx`
- `packages/renderer/src/CanvasRenderer.ts` (if still used)

Add method:
```typescript
async showChoices(choices: Choice[], options?: { fadeIn?: boolean }): Promise<void>
```

Implement CSS fade-in transition:
```css
.choices-container {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 4. ASML Export (ASMLGenerator.ts)

**Location:** `packages/core/src/xml/ASMLGenerator.ts`

Add delay export in beat function generation (before choices):
```typescript
// In generateBeatFunction(), for choice-based beats:
if (beat.choiceDelay && beat.choiceDelay > 0) {
  lines.push(`${indent}${this.indent}<delay val="${beat.choiceDelay}" />`);
}
```

Add this check for beat types: `movementChoice`, `pickProp`, `dialogTree`

### 5. ASML Import (ASMLParser.ts)

**Location:** `packages/core/src/xml/ASMLParser.ts`

In `parseBeatFunction()`, add for choice-based beat types:
```typescript
// Parse delay element
const delayEl = functionElement.querySelector('delay');
if (delayEl) {
  const val = delayEl.getAttribute('val');
  if (val) {
    const delay = parseFloat(val);
    if (!isNaN(delay) && delay > 0) {
      parameters.choiceDelay = delay;
    }
  }
}
```

### 6. Update beat-definitions.json

**Location:** `beat-definitions/core-beats.json`

Add to movementChoice, pickProp, and dialogTree definitions:
```json
{
  "parameters": {
    "choiceDelay": {
      "type": "number",
      "optional": true,
      "description": "Delay in seconds before showing choices with fade-in",
      "ui": {
        "control": "number",
        "min": 0,
        "max": 30,
        "step": 0.5,
        "label": "Choice Delay (seconds)"
      }
    }
  }
}
```

## Testing Checklist

1. Create a movementChoice beat with choiceDelay=2
2. Verify delay works in preview
3. Verify choices fade in after delay
4. Export to ASML and verify `<delay>` element exists
5. Import ASML back and verify choiceDelay is preserved
6. Test with pickProp and dialogTree beats
7. Test edge cases (delay=0, no delay)

## Key Considerations

- The delay should NOT block the story engine - use async/await properly
- Ensure existing beats without delay continue to work normally
- Consider user experience - provide visual feedback during delay
- The fade-in should be smooth and not jarring
- Consider accessibility - ensure screen readers handle delayed choices appropriately

## Related Files for Reference

- `packages/core/src/beats/Beat.ts` - Base beat implementation with onEnter() example
- `packages/core/src/engine/StoryEngine.ts` - Story execution flow
- `packages/builder/src/components/preview/StoryPreview.tsx` - Preview component
- Feature 2 implementation (defaultTargetDelay) can serve as a reference for timer-based delays
