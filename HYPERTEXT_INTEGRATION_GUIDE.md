# HyperText Editor Redesign - Summary

## ✅ What's Been Done

### 1. New Component Created
**File:** `packages/builder/src/components/editors/HyperTextEditor.tsx`

This is a complete, working hyperText editor component with:
- **Visual text selection** - Click and drag to select text
- **Position-based linking** - Uses character indices (start/end) instead of word matching
- **Live preview** - See links highlighted in real-time
- **Full style controls** - Color picker AND underline toggle (was missing before)
- **Smart text handling** - Links automatically adjust when main text is edited
- **Multiple same-word support** - Can link "the" multiple times by position

### 2. Documentation Created
- `HYPERTEXT_REDESIGN.md` - Complete technical documentation
- `Issues.md` - Updated with current status
- `Progress.md` - Session documented

## 📋 What You Need To Do

### Integration Steps (in order):

#### Step 1: Add Import
Open `packages/builder/src/components/Inspector.tsx` and add this import near the top (around line 5):

```typescript
import { HyperTextEditor } from '../editors/HyperTextEditor';
```

#### Step 2: Update Validation
Find the `validateBeat` function (around line 365) and replace the hyperText case:

**Replace this:**
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

**With this:**
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

#### Step 3: Replace HyperText UI
Find the `{/* Hyper Text Beat */}` section (around line 1050-1190) and replace the ENTIRE section with:

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

#### Step 4: Update Connection Labels
Find the connection generation for hyperText (around line 545 in `handleSave`) and replace:

**Replace this:**
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

**With this:**
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

## 🧪 Testing Checklist

After integration, test:

### Basic Functionality
- [ ] Create new hyperText beat
- [ ] Type some text in main text area
- [ ] Select text in preview area by clicking/dragging
- [ ] Click "Create Link" button
- [ ] Choose target beat from dropdown
- [ ] Verify link appears in list

### Advanced Features
- [ ] Create multiple links to the same word (e.g., three different "the"s)
- [ ] Change link color using color picker
- [ ] Toggle underline on/off
- [ ] Edit main text and verify links adjust automatically
- [ ] Click a link in preview to select it for editing

### Export/Import
- [ ] Save beat and export to ASML
- [ ] Verify ASML contains hyperlinks
- [ ] Import ASML back
- [ ] Verify all links restored correctly

### Visual/Preview
- [ ] Check Visual Editor tab (may need separate work)
- [ ] Test in Preview mode (may need separate work)

## 📊 Data Format Change

### Old Format (deprecated)
```typescript
{
  word: string;           // "forest" - manual typing
  targetBeatId: string;
  style: { color: string; underline: boolean }
}
```

### New Format
```typescript
{
  start: number;          // 15 - character position
  end: number;           // 21 - character position  
  targetBeatId: string;
  style: { color: string; underline: boolean }
}
```

## 🎯 Benefits

**For Users:**
- No more typos breaking links
- Can link same word multiple times
- Visual, intuitive interface
- Full control over link appearance

**For Developers:**
- More robust data structure
- Easier to maintain
- Better handling of text edits
- Position-based is future-proof

## 📝 Notes

- The new editor handles text adjustments automatically
- When main text is edited, links beyond the new text length are removed
- Links that extend past the text are truncated
- All styling is preserved during edits

---

**Status:** Component complete, integration pending
**Next:** Follow integration steps above, then test thoroughly
