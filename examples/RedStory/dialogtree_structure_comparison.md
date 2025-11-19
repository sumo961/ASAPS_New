# DialogTree Structure Comparison

## Side-by-Side Visual Comparison

### ✅ Working Format (Created from Scratch)

```xml
<function kind="dialogTree" speaker="Character" text="Hello!">

  <!-- Choices are DIRECT children of function -->
  <choice id="choice_1763479747495" text="Hallo you?" counter="courage" operation="change" val="2">

    <!-- Target wraps nested dialogTree -->
    <target>
      <dialogTree id="node_1763479773271" speaker="Old Wizard" text="How can I help?">

        <!-- Choices are DIRECT children of dialogTree -->
        <choice id="choice_1763479954188" text="Get me Out of here" counter="courage" operation="set" val="1">
          <target>
            <dialogTree id="node_1763479983820" speaker="Old Wizard" text="Be my guest">
              <choice id="choice_1763480005373" text="OK, out here" target="beat_83" />
            </dialogTree>
          </target>
        </choice>

      </dialogTree>
    </target>

  </choice>

  <choice id="choice_1763479787788" text="It's cold" counter="experience" operation="change" val="3">
    <!-- Another nested dialogTree in target -->
  </choice>

</function>
```

**Key Features:**
- ✅ Attributes (`speaker`, `text`) are on `<function>` tag
- ✅ Choices are **direct children** of `<function>`
- ✅ Nested `<dialogTree>` elements appear **only inside `<target>`** elements
- ✅ No redundant nesting

---

### ❌ Broken Format (Current Conversion)

```xml
<function kind="dialogTree">

  <!-- WRONG: Redundant nesting level -->
  <dialogTree id="node_3" speaker="Mom" text="Red, darling, you've made enough...">

    <!-- Choices are children of dialogTree (not function) -->
    <choice id="1" text="Mother, before I go..." counter="friendly" operation="change" val="2">
      <effect type="playsound" name="ElectronicClick" />
      <target>beat_4</target>
    </choice>

  </dialogTree>

</function>
```

**Problems:**
- ❌ Attributes (`speaker`, `text`) are on **nested `<dialogTree>`** instead of `<function>`
- ❌ Choices are **children of `<dialogTree>`**, not direct children of `<function>`
- ❌ Extra unnecessary nesting level

---

### The Parser's Expectation (ASMLParser.ts:944-950)

```typescript
private parseDialogTree(dialogTreeEl: Element): any {
  const dialogNode: any = {
    id: dialogTreeEl.getAttribute('id'),        // ← Expects on function element
    speaker: dialogTreeEl.getAttribute('speaker'), // ← Expects on function element
    text: dialogTreeEl.getAttribute('text'),    // ← Expects on function element
    emotion: dialogTreeEl.getAttribute('emotion'),
    choices: []
  };

  // Parse choices that are DIRECT children
  const choiceElements = dialogTreeEl.querySelectorAll(':scope > choice');
  //                                           ↑ Only looks at direct children
  //                                           ↑ Won't find choices inside nested dialogTree
}
```

**Who calls parseDialogTree:**
```typescript
case 'dialogTree':
  // Parse dialog tree - the function element IS the dialog tree
  parameters.dialogTree = this.parseDialogTree(functionElement);
  //                                                   ↑ Function element itself!
  break;
```

---

### How FixDialogTreeBeat.ts processes this

**File: packages/core/src/beats/DialogTreeBeat.ts**

```typescript
export interface IDialogTreeBeatConfig extends IBeatConfig {
  speaker?: string;
  text?: string;
  emotion?: string;
  choices?: IDialogTreeChoiceConfig[];
  // ...
}

// When beat is created:
getParameters(): { [key: string]: any } {
  return {
    speaker: config.speaker,  // Comes from function element attribute
    text: config.text,        // Comes from function element attribute
    choices: config.choices,  // Comes from direct children choices
    // ...
  };
}
```

The internal data structure stores `speaker`, `text`, and `choices` - all from the function element level.

---

### Why Re-Export Loses 95% of Data

1. **Import Phase**:
   ```xml
   <function kind="dialogTree">  ← functionElement has NO speaker/text attributes
     <dialogTree speaker="Mom" text="..."> ← attributes are here, not on function
   ```
   Parser calls `parseDialogTree(functionElement)` but gets no data.

2. **Internal Storage**:
   - `beat.parameters.dialogTree` = {} (empty or mostly empty)
   - `beat.parameters.dialogTree.choices` = [] (no choices found)

3. **Serialization (to JSON)**:
   - Empty dialogTree structure gets serialized as-is
   - No error, just empty data

4. **Export Phase**:
   ```typescript
   case 'dialogTree':
     if (params.dialogTree) {  // This check passes
       this.generateDialogTree(params.dialogTree, ...);  // But params.dialogTree is empty!
     }
   ```

5. **Fallback Behavior**:
   When ASMLGenerator finds no choices in dialogTree, it may fall back to conversationChoice export logic, producing:
   ```xml
   <function kind="conversationChoice">  ← WRONG TYPE!
     <questioner>WOLF</questioner>
     <question>...</question>
     <choice .../>  ← Without counter attributes
   ```

---

## The Fix

### What has attributes where

| Element | Working Format | Converted Format |
|---------|----------------|------------------|
| `<function>` | `kind`, `speaker`, `text` | Only `kind` |
| `<dialogTree>` | Doesn't exist (function IS dialogTree) | `id`, `speaker`, `text` (WRONG!) |
| `<choice>` | `id`, `text`, `counter`, `operation`, `val`, `target` | Same (CORRECT) |
| `<choice>/<target>` | `<dialogTree id="...">` | `<target>beat_4</target>` (flattened) |

### Solution: Modify conversion script

**Current (broken):**
```python
func = ET.SubElement(new_beat, 'function')
func.set('kind', 'dialogTree')

# Build nested dialog tree
nested_tree = self.build_nested_dialog_tree(beat_id, [])
if nested_tree:
    func.append(nested_tree)
```

**Should be:**
```python
# Parse conversation data
conv = self.parse_conversation_choice(beat)
if conv:
    # Create function element WITH dialogTree attributes
    func = ET.SubElement(new_beat, 'function')
    func.set('kind', 'dialogTree')
    func.set('speaker', self.get_character_name(conv['questioner']))
    func.set('text', conv['question'])
    if conv['node']:
        func.set('node', conv['node'])

    # Choices are direct children of function
    for choice in conv['choices']:
        choice_elem = ET.SubElement(func, 'choice')
        choice_elem.set('id', choice['id'])
        choice_elem.set('text', choice['content'])

        # Handle target
        target_id = choice.get('targetBeat')
        if target_id and target_id in self.conversation_chains:
            # Nested dialogTree inside target
            target_elem = ET.SubElement(choice_elem, 'target')
            nested_tree = self.build_nested_dialog_tree(target_id, [])
            if nested_tree:
                target_elem.append(nested_tree)
        elif target_id:
            # Simple target reference
            choice_elem.set('target', target_id)
```

This will create the correct structure that matches the working format.
