# Dialog Tree Export Fix Guide

## Problem
When exporting dialog trees, nested dialogs appear as `[object Object]` in the XML:
```xml
<choice id="1" text="Tell me more" target="[object Object]" />
```

## Solution
The ASMLGenerator needs to handle nested dialog objects properly. Here's the fix:

## File to Edit
`packages/core/src/xml/ASMLGenerator.ts`

## Find Method: `generateDialogChoice`
Around line 400-450, find the method that generates dialog choices.

## Current Code (Broken)
```typescript
private generateDialogChoice(choice: any, lines: string[], indent: string): void {
  const attrs: string[] = [];
  if (choice.id) attrs.push(`id="${choice.id}"`);
  if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);
  if (choice.target) attrs.push(`target="${choice.target}"`); // BUG: This converts objects to [object Object]
  // ...
}
```

## Fixed Code
Replace the method with:

```typescript
private generateDialogChoice(choice: any, lines: string[], indent: string): void {
  const attrs: string[] = [];
  if (choice.id) attrs.push(`id="${choice.id}"`);
  if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);
  
  // Check if target is a string (beat ID) or object (nested dialog)
  const hasNestedDialog = typeof choice.target === 'object' && choice.target;
  const hasStringTarget = typeof choice.target === 'string' && choice.target;
  
  // Only add target attribute if it's a string (beat ID)
  if (hasStringTarget) {
    attrs.push(`target="${choice.target}"`);
  }
  
  const hasChildren = hasNestedDialog || choice.conditions || choice.effects;
  
  if (hasChildren) {
    lines.push(`${indent}<choice ${attrs.join(' ')}>`);
    
    // Conditions
    if (choice.conditions) {
      for (const condition of choice.conditions) {
        this.generateCondition(condition, lines, indent + this.indent);
      }
    }
    
    // Nested dialog as target element
    if (hasNestedDialog) {
      lines.push(`${indent}${this.indent}<target>`);
      this.generateNestedDialogTree(choice.target, lines, indent + this.indent + this.indent);
      lines.push(`${indent}${this.indent}</target>`);
    }
    
    // Effects
    if (choice.effects) {
      for (const effect of choice.effects) {
        this.generateEffect(effect, lines, indent + this.indent);
      }
    }
    
    lines.push(`${indent}</choice>`);
  } else {
    lines.push(`${indent}<choice ${attrs.join(' ')} />`);
  }
}
```

## Add Helper Method: `generateNestedDialogTree`
Add this new method after `generateDialogChoice`:

```typescript
private generateNestedDialogTree(node: any, lines: string[], indent: string): void {
  const attrs: string[] = [];
  if (node.id) attrs.push(`id="${node.id}"`);
  if (node.speaker) attrs.push(`speaker="${this.escapeXml(node.speaker)}"`);
  if (node.text) attrs.push(`text="${this.escapeXml(node.text)}"`);
  if (node.emotion) attrs.push(`emotion="${node.emotion}"`);
  
  const hasChildren = node.choices || node.next || node.conditions || node.effects;
  
  if (hasChildren) {
    lines.push(`${indent}<dialogTree ${attrs.join(' ')}>`);
    
    // Conditions
    if (node.conditions) {
      for (const condition of node.conditions) {
        this.generateCondition(condition, lines, indent + this.indent);
      }
    }
    
    // Choices - recursive handling
    if (node.choices) {
      for (const choice of node.choices) {
        this.generateDialogChoice(choice, lines, indent + this.indent);
      }
    }
    
    // Next node
    if (node.next) {
      if (typeof node.next === 'string') {
        lines.push(`${indent}${this.indent}<next target="${node.next}" />`);
      } else {
        lines.push(`${indent}${this.indent}<next>`);
        this.generateNestedDialogTree(node.next, lines, indent + this.indent + this.indent);
        lines.push(`${indent}${this.indent}</next>`);
      }
    }
    
    // Effects
    if (node.effects) {
      for (const effect of node.effects) {
        this.generateEffect(effect, lines, indent + this.indent);
      }
    }
    
    lines.push(`${indent}</dialogTree>`);
  } else {
    lines.push(`${indent}<dialogTree ${attrs.join(' ')} />`);
  }
}
```

## Expected Output After Fix
```xml
<choice id="1" text="Tell me more">
  <target>
    <dialogTree id="node_123" speaker="Old Wizard" text="The artifact is ancient..." emotion="serious">
      <choice id="2" text="How old?" target="beat_history" />
      <choice id="3" text="What powers?" target="beat_powers" />
    </dialogTree>
  </target>
</choice>
```

## How to Apply

1. Open `packages/core/src/xml/ASMLGenerator.ts`
2. Find the `generateDialogChoice` method
3. Replace it with the fixed version above
4. Add the `generateNestedDialogTree` helper method
5. Save the file
6. Run `npm run build`
7. Test by creating a dialog tree and exporting

## Verification

After applying the fix:
1. Create a dialogTree beat
2. Add player choices
3. Add NPC responses to those choices
4. Export the story
5. Check the XML - nested dialogs should be properly formatted, not `[object Object]`
