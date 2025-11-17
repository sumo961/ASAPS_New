# General Positioning System Design

## Problem
Creating individual `renderXPositioned()` methods for each beat type is:
- **Wasteful** - Duplicates code across all beat types
- **Hard to maintain** - Changes must be replicated everywhere
- **Violates DRY** - Same logic repeated multiple times
- **Error-prone** - Easy to have inconsistencies

## Better Solution: Universal Positioning System

### Architecture

**One System for All Beats:**
```
Beat.performAction()
  ↓
Extract locations from this.locations
  ↓
Pass locations to renderer
  ↓  
Renderer.renderPositioned(beatType, content, locations)
  ↓
Generic element positioning logic
  ↓
Render all elements at exact coordinates
```

### Implementation Plan

1. **All beats pass locations** - Update performAction() in all beat classes
2. **Renderer accepts locations** - All render methods take optional locations parameter
3. **Generic positioning method** - One method handles ALL beat types
4. **Smart element mapping** - Maps location kinds to React components
5. **Content resolution** - Intelligently finds content for each element

### Code Structure

```typescript
// Beat classes (all beats)
protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
  const locations = Array.from(this.locations.values());
  await renderer.renderXYZ(...params, locations);
  return this.getNextBeat(context);
}

// Renderer interface
renderTitleScreen(title, author, buttonText, locations?: Location[]): Promise<void>;
renderText(text, buttonText, locations?: Location[]): Promise<void>;
renderEndScreen(message, showRestart, showCredits, locations?: Location[]): Promise<void>;
// etc.

// ReactRenderer implementation
async renderTitleScreen(title, author, buttonText, locations?: Location[]): Promise<void> {
  if (locations?.length > 0) {
    return this.renderPositioned('titleScreen', { title, author, buttonText }, locations);
  }
  // Fallback to centered layout
  return this.renderCentered(<TitleScreen ... />);
}

// Generic positioned rendering
private async renderPositioned(
  beatType: string,
  content: Record<string, any>,
  locations: Location[]
): Promise<void> {
  // Render all elements based on locations
  // Works for ANY beat type
}
```

### Benefits

✅ **DRY** - One implementation for all beats
✅ **Maintainable** - Fix once, works everywhere  
✅ **Extensible** - New beat types automatically supported
✅ **Consistent** - Same behavior across all beats
✅ **Less code** - ~100 lines vs ~500+ lines

### Element Type Mapping

```typescript
Location.kind → React Component

'text'      → <div> styled for text
'button'    → <button> with onClick
'hotspot'   → <button> with onClick
'dialog'    → <div> with dialog styling
'character' → <img> or asset component
'prop'      → <img> or asset component
```

### Content Resolution Logic

```typescript
// Smart content lookup based on location name
if (loc.name.includes('title')) return content.title;
if (loc.name.includes('author')) return content.author;
if (loc.name.includes('button')) return content.buttonText;
if (loc.name.includes('text')) return content.text;
if (loc.name.includes('message')) return content.message;
// etc.
```

### Background Styling

```typescript
// Different backgrounds for different beat types
const backgrounds = {
  titleScreen: 'bg-gradient-to-b from-blue-900 to-blue-700',
  introText: 'bg-gray-100',
  endScreen: 'bg-gradient-to-br from-purple-600 to-pink-600',
  // etc.
};
```

## Implementation Steps

1. ✅ Create `renderPositioned()` generic method
2. ⏳ Update all beat classes to pass locations
3. ⏳ Update all renderer methods to accept locations
4. ⏳ Test with all beat types
5. ⏳ Remove old positioned-specific methods
6. ⏳ Document the system

## Next Actions

1. Implement `renderPositioned()` in ReactRenderer
2. Update IntroTextBeat to pass locations
3. Update EndScreenBeat to pass locations  
4. Test each beat type
5. Apply to remaining beats

---

*Design document by: Senior Software Engineer*  
*Date: October 9, 2025*
