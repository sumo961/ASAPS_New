# Dialog Tree Editor - Nested NPC Edit Button Fixed ✅

## Problem
When adding an NPC response to a player choice, the nested NPC dialog didn't have an edit button because it was being incorrectly identified as a player node.

## Root Cause
The depth calculation was incrementing by 1 when rendering nested dialogs, but the pattern should be:
- Depth 0: NPC (root)
- Depth 2: NPC (response to player choice)
- Depth 4: NPC (next level response)
- etc.

Player choices aren't nodes themselves - they're part of the NPC node's choices array.

## Solution
Changed the depth increment from `depth + 1` to `depth + 2` when rendering nested dialogs from choices.

```typescript
// Before (incorrect):
{renderDialogNode(choice.target as DialogNode, [...path, `choice_${index}`], depth + 1)}

// After (correct):
{renderDialogNode(choice.target as DialogNode, [...path, `choice_${index}`], depth + 2)}
```

## Testing

Run the test script:
```bash
chmod +x test-nested-npc-fix.sh
./test-nested-npc-fix.sh
```

Or manually:
1. Create a dialogTree beat
2. Add a player response
3. Select "➕ Add NPC response..." from dropdown
4. **✓ The nested NPC should now have an edit button**
5. **✓ The nested NPC should show "Add Player Response" button**

## Depth Pattern

```
NPC (depth 0) ✏️ [has edit button]
└─ Player: "Hello"
   └─ NPC (depth 2) ✏️ [has edit button]
      └─ Player: "Tell me more"
         └─ NPC (depth 4) ✏️ [has edit button]
            └─ Player: "Interesting"
               └─ NPC (depth 6) ✏️ [has edit button]
```

All even-depth nodes are NPCs with:
- Blue background
- NPC icon (👥)
- Edit button (✏️)
- Emotion emoji
- "Add Player Response" button

## Status
✅ Fixed - Nested NPCs at all levels now have edit buttons and proper NPC styling