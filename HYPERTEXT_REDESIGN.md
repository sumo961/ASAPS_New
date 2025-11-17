# HyperText Editor Redesign - October 5, 2025

## Overview
Redesigned the hyperText beat editor to use character position-based selection instead of manual word typing. This solves three critical UX issues with the previous implementation.

## Problems Solved

### 1. **Duplicate Words** ❌ → ✅
**Old:** Manual typing means you can't distinguish between multiple instances of the same word
**New:** Character positions (start/end) uniquely identify each link, allowing multiple links to the same word

### 2. **Manual Typing Errors** ❌ → ✅  
**Old:** Users had to type exact words, leading to typos and broken links
**New:** Click-to-select interface - users select text visually, no typing required

### 3. **Missing Underline Control** ❌ → ✅
**Old:** Underline setting existed in data but had no UI control
**New:** Full style controls including color picker and underline toggle

## New Implementation

### Component Created
**File:** `packages/builder/src/components/editors/HyperTextEditor.tsx`

**Key Features:**
- Visual text preview with selectable text
- Click-and-drag selection to create links
- Character position tracking (start/end indices)
- Live preview of hyperlinks with styled text
- Individual style controls per link (color + underline)
- Automatic text adjustment when editing main text
- Clear visual feedback for selected/editing links

### Data Structure Change

**Old Format (word-based):**
```typescript
{
  word: string;           // Manual typing - error prone
  targetBeatId: string;
  style: { color: string; underline: boolean }
}
```

**New Format (position-based):**
```typescript
{
  start: number;          // Character position start
  end: number;           // Character position end  
  targetBeatId: string;
  style: { color: string; underline: boolean }
}
```

## Inspector Integration

### Changes Required in `Inspector.tsx`

#### 1. Add Import
```typescript
import { HyperTextEditor } from '../editors/HyperTextEditor';
```

#### 2. Update Validation (line ~365)
Replace:
```typescript
case 'hyperText':
  if (!localBeat.parameters?.text?.trim()) errors.push('Main text is required');
  if (!localBeat.parameters?.hyperlinks || localBeat.parameters.hyperlinks.length === 0) {
    errors.push('At least one hyperlink is required');
  } else {
    localBeat.parameters.hyperlinks.forEach((link: any, i: number) => {
      if (!link.word?.trim()) errors.push(`Link ${i + 1}: Word/phrase is required`);
      if (!link.targetBeatId) errors.push(`Link ${i + 1}: Target beat is required`);
    });
  }
  break;
```

With:
```typescript
case 'hyperText':
  if (!localBeat.parameters?.text?.trim()) errors.push('Main text is required');
  if (!localBeat.parameters?.hyperlinks || localBeat.parameters.hyperlinks.length === 0) {
    errors.push('At least one hyperlink is required');
  } else {
    localBeat.parameters.hyperlinks.forEach((link: any, i: number) => {
      if (link.start === undefined || link.end === undefined) errors.push(`Link ${i + 1}: Invalid position`);
      if (link.start >= link.end) errors.push(`Link ${i + 1}: Invalid text range`);
      if (!link.targetBeatId) errors.push(`Link ${i + 1}: Target beat is required`);
    });
  }
  break;
```

#### 3. Replace HyperText UI (line ~1050-1190)
Replace the entire hyperText section with:
```typescript
{/* Hyper Text Beat - New Position-Based Editor */}
{beat.type === 'hyperText' && (
  <HyperTextEditor
    text={localBeat.parameters?.text || 'Click on any word to explore.'}
    hyperlinks={localBeat.parameters?.hyperlinks || []}
    onChange={(text, hyperlinks) => {
      setLocalBeat((prev: any) => ({
        ...prev,
        parameters: {
          ...prev.parameters,
          text,
          hyperlinks
        }
      }));
      setHasChanges(true);
    }}
    availableBeats={availableTargets}
  />
)}
```

#### 4. Update Connection Label Generation (line ~545)
Replace:
```typescript
} else if (beat.type === 'hyperText' && localBeat.parameters?.hyperlinks) {
  localBeat.parameters.hyperlinks.forEach((link: any) => {
    if (link.targetBeatId) {
      beat.addConnection({
        targetId: link.targetBeatId,
        label: link.word
      });
    }
  });
}
```

With:
```typescript
} else if (beat.type === 'hyperText' && localBeat.parameters?.hyperlinks) {
  localBeat.parameters.hyperlinks.forEach((link: any) => {
    if (link.targetBeatId) {
      // Get the text for this link to use as label
      const text = localBeat.parameters?.text || '';
      const linkText = text.substring(link.start, link.end);
      beat.addConnection({
        targetId: link.targetBeatId,
        label: linkText
      });
    }
  });
}
```

## User Experience Flow

### Creating Hyperlinks:
1. User types/pastes main text in the textarea
2. Text appears in preview area below
3. User selects text by clicking and dragging in preview
4. Selection info shows with "Create Link" button
5. Click button to create link (auto-opens target selector)
6. Link appears in list with extracted text showing
7. Set target beat from dropdown
8. Customize color and underline if desired

### Editing Hyperlinks:
- Click any link in preview to select it
- Selected link highlights in list
- Modify target or styles
- Visual feedback updates immediately

### Multiple Same Words:
- Can create multiple links to "the" at positions 0-3, 15-18, 47-50
- Each tracked independently by position
- Edit one without affecting others

## Migration Notes

### Backward Compatibility
The new system uses a different data structure. Existing hyperText beats with `word` property will need migration:
- On load, detect old format
- Convert to position-based by finding `word` in `text`
- Handle duplicates by creating separate links

### Export/Import
- ASML export already handles arbitrary hyperlink structure
- Import will work with both old and new formats
- Position-based format is more robust

## Testing Checklist

- [ ] Create hyperText beat with new editor
- [ ] Select text and create link
- [ ] Create multiple links to same word
- [ ] Edit link styles (color, underline)
- [ ] Change target beat
- [ ] Edit main text (links adjust automatically)
- [ ] Export to ASML
- [ ] Import back from ASML
- [ ] Test in Visual Editor
- [ ] Test in Preview/Runtime

## Benefits

**User Benefits:**
- ✅ No typing errors
- ✅ Can link same word multiple times
- ✅ Visual selection is intuitive  
- ✅ Full style control per link
- ✅ Clear preview of final result

**Technical Benefits:**
- ✅ Position-based is more robust
- ✅ Handles text edits gracefully
- ✅ Easier to maintain/debug
- ✅ Better data structure for runtime

## Next Steps

1. ✅ Create HyperTextEditor component
2. ⏳ Integrate into Inspector
3. ⏳ Test all functionality
4. ⏳ Update ASML import to handle old format
5. ⏳ Update Visual Editor rendering
6. ⏳ Update Preview/Runtime rendering
7. ⏳ Document for users

---

*Redesign completed: October 5, 2025*
*Status: Component created, integration pending*
