# DialogTree Structure Mismatch - Root Cause Found

## The Problem

The converted XML has a **structural mismatch** with what the ASMLParser expects.

### Working Format (from scratch):
```xml
<function kind="dialogTree" speaker="Character" text="Hello!">
  <choice id="..." text="..." counter="..." operation="..." val="...">
    <target>
      <dialogTree id="..." speaker="..." text="...">
        <choice ...>
        </choice>
      </dialogTree>
    </target>
  </choice>
</function>
```

### Converted Format (currently broken):
```xml
<function kind="dialogTree">
  <dialogTree id="node_11" speaker="Mom" text="...">
    <choice id="..." text="..." counter="..." operation="..." val="...">
      <target>
        <dialogTree id="..." speaker="..." text="...">
        </dialogTree>
      </target>
    </choice>
  </dialogTree>
</function>
```

## Root Cause

**File: packages/core/src/xml/ASMLParser.ts:789-791**

```typescript
case 'dialogTree':
  // Parse dialog tree - the function element IS the dialog tree
  parameters.dialogTree = this.parseDialogTree(functionElement);
```

The parser calls `parseDialogTree(functionElement)`, meaning it expects:
- The **function element itself** to be the dialog tree
- Attributes (`speaker`, `text`, `id`, `emotion`) on the `<function>` tag
- Choices to be **direct children** of `<function>`

But the converter creates:
- A **nested** `<dialogTree>` element inside the function
- Attributes on the nested element instead of the function

**File: packages/core/src/xml/ASMLParser.ts:944-950**

```typescript
private parseDialogTree(dialogTreeEl: Element): any {
  const dialogNode: any = {
    id: dialogTreeEl.getAttribute('id'),        // From function element!
    speaker: dialogTreeEl.getAttribute('speaker'), // From function element!
    text: dialogTreeEl.getAttribute('text'),    // From function element!
    emotion: dialogTreeEl.getAttribute('emotion'),
    choices: []
  };

  // Parse choices that are DIRECT children
  const choiceElements = dialogTreeEl.querySelectorAll(':scope > choice');
  choiceElements.forEach(choiceEl => {
    // ...
  });
```

Since the parser looks for attributes on the function element and expects choices as direct children, it finds nothing when the XML has a nested dialogTree structure.

## Why Re-Export Doesn't Work

1. Parser sees `<function kind="dialogTree">` and calls `parseDialogTree(functionElement)`
2. `functionElement` has no `speaker`, `text`, or `id` attributes
3. `functionElement.querySelectorAll(':scope > choice')` finds no choices (they're inside the nested dialogTree)
4. Parser creates an empty dialogTree with no speaker, text, or choices
5. Internal beat parameters have empty dialogTree
6. ASMLGenerator exports this empty/malformed dialogTree using fallback logic
7. Result: dialogTree beats degrade to conversationChoice format with missing data

## Why the Loss is So Severe

The 95% counter attribute loss is because:

1. **First Level**: Parser doesn't read the top-level dialogTree (attributes on wrong element)
2. **Choices**: Parser doesn't find choices (they're not direct children of function)
3. **Nested Dialogs**: Even if it did find choices, the nested target->dialogTree structure is different from what getParameters()/updateParameters() expect
4. **Serialization**: When the story is serialized to JSON for storage, the malformed dialogTree data is lost
5. **Re-export**: ASMLGenerator receives empty or malformed dialogTree parameters and exports minimal data

## Fix Required

The converter must create dialogTree beats in the format the parser expects:

**What to change in convert_to_dialogtree_proper.py:**

Instead of:
```python
func = ET.SubElement(new_beat, 'function')
func.set('kind', 'dialogTree')

# Build nested dialog tree
nested_tree = self.build_nested_dialog_tree(beat_id, [])
if nested_tree:
    func.append(nested_tree)
```

Should be:
```python
# Get the dialog tree data first
conv = self.parse_conversation_choice(beat)
if conv:
    # Create function with dialogTree attributes directly
    func = ET.SubElement(new_beat, 'function')
    func.set('kind', 'dialogTree')

    # Set dialogTree attributes on the function element!
    func.set('speaker', self.get_character_name(conv['questioner']))
    func.set('text', conv['question'])
    if conv['node']:
        func.set('node', conv['node'])

    # Build choices as direct children
    for choice in conv['choices']:
        choice_elem = ET.SubElement(func, 'choice')
        # Add choice attributes...

        # Handle nested target
        target_id = choice.get('targetBeat')
        if target_id and target_id in self.conversation_chains:
            target_elem = ET.SubElement(choice_elem, 'target')
            nested_tree = self.build_nested_dialog_tree(target_id, [])
            if nested_tree:
                target_elem.append(nested_tree)
```

## Impact

**Current State**: Import/export loses 95% of counter data and degrades dialogTree structure
**Fixed State**: Will preserve all counter data and maintain proper nested dialogTree structure

## Verification

After fixing, the structure should match the working example:

```xml
<function kind="dialogTree" speaker="Mom" text="Hello there. What a pretty red hat you have.">
  <effect type="counter" name="friendly" operation="change" value="2" />
  <effect type="counter" name="adult" operation="change" value="2" />
  <effect type="counter" name="aggressive" operation="change" value="2" />
  <choice id="1" text="Thank you. My name is Red." counter="friendly" operation="change" val="2">
    <effect type="playsound" name="ElectronicClick" />
    <target>
      <dialogTree id="node_12" speaker="Mom" text="Seymour. Seymour Whiskers." node="forestDetail">
        <effect type="counter" name="aggressive" operation="change" value="3" />
        <choice id="1" text="That's a strange name" counter="aggressive" operation="change" val="3" target="13" />
      </dialogTree>
    </target>
  </choice>
</function>
```

Note: `speaker` and `text` on `<function>`, choices as direct children, and nested `<dialogTree>` inside `<target>` elements.
