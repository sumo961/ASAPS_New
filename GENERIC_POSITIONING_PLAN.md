# Generic Positioned Rendering System

## Overview

Instead of implementing positioning for each beat type individually, create a universal system that:
1. Reads locations from any beat
2. Renders elements at specified positions
3. Works for all beat types uniformly

## Architecture

### Core Components

**1. Generic Positioned Container**
```typescript
private renderWithPositions(
  content: Record<string, React.ReactNode>,
  locations: Location[],
  background: string
): React.ReactElement
```
- Takes content map (name → React element)
- Takes locations array from beat
- Renders each element at its position
- Works for ALL beat types

**2. Content Mapper**
```typescript
private getTextContent(
  loc: Location,
  content: Record<string, any>,
  beatType: string
): string
```
- Maps location names to content fields
- Handles beat-type-specific mappings
- Returns appropriate text for each element

**3. Element Renderer**
```typescript
private renderLocationElement(
  loc: Location,
  content: Record<string, any>,
  beatType: string
): React.ReactNode
```
- Renders element based on `loc.kind`
- Applies absolute positioning
- Handles text, buttons, dialogs, characters, props

## Implementation Plan

### Step 1: Add Generic Methods to ReactRenderer

```typescript
// In ReactRenderer class

/**
 * Generic positioned layout - works for ALL beat types
 */
private async renderPositioned(options: {
  beatType: string;
  background: string;
  content: Record<string, any>;
  locations: Location[];
}): Promise<void> {
  return new Promise(resolve => {
    this.resolveAction = () => resolve();
    
    const elements = options.locations.map((loc, idx) => 
      this.renderLocationElement(loc, idx, options.content, options.beatType)
    );
    
    this.renderComponent(
      <div className={`relative w-full h-screen ${options.background}`}>
        {elements}
      </div>
    );
  });
}

/**
 * Render individual element at its location
 */
private renderLocationElement(
  loc: Location,
  index: number,
  content: Record<string, any>,
  beatType: string
): React.ReactNode {
  const style = {
    left: `${loc.x}px`,
    top: `${loc.y}px`,
    width: `${loc.width}px`,
    height: `${loc.height}px`,
    zIndex: loc.zIndex || 0
  };

  switch (loc.kind) {
    case 'text':
      return <div key={index} className="absolute text-white font-bold text-5xl flex items-center justify-center" style={style}>
        {this.getTextContent(loc, content, beatType)}
      </div>;
      
    case 'button':
    case 'hotspot':
      return <button key={index} className="absolute bg-blue-500 hover:bg-blue-600 text-white rounded-lg" style={style}
        onClick={() => this.handleAction('continue')}>
        {this.getTextContent(loc, content, beatType)}
      </button>;
      
    case 'dialog':
      return <div key={index} className="absolute bg-white rounded-lg shadow-lg p-4" style={style}>
        {this.getTextContent(loc, content, beatType)}
      </div>;
      
    default:
      return null;
  }
}

/**
 * Get text content for element
 */
private getTextContent(
  loc: Location,
  content: Record<string, any>,
  beatType: string
): string {
  const name = loc.name.toLowerCase();
  
  // Map location names to content fields
  if (name.includes('title')) return content.title || '';
  if (name.includes('author')) return `by ${content.author}` || '';
  if (name.includes('start')) return content.buttonText || 'Start';
  if (name.includes('continue')) return content.buttonText || 'Continue';
  if (name.includes('message') || name.includes('end')) return content.message || 'The End';
  if (name.includes('text') || name.includes('main')) return content.text || '';
  if (name.includes('prompt')) return content.prompt || '';
  
  // Default
  return content.buttonText || loc.name || '';
}
```

### Step 2: Update Beat Renderers

**Update all beat types to check for locations:**

```typescript
async renderTitleScreen(title, author, buttonText, locations?) {
  if (locations && locations.length > 0) {
    return this.renderPositioned({
      beatType: 'titleScreen',
      background: 'bg-gradient-to-b from-blue-900 to-blue-700',
      content: { title, author, buttonText },
      locations
    });
  }
  // Fallback to centered layout
  return this.renderTitleScreenCentered(title, author, buttonText);
}

async renderText(text, buttonText, locations?) {
  if (locations && locations.length > 0) {
    return this.renderPositioned({
      beatType: 'introText',
      background: 'bg-gray-100',
      content: { text, buttonText },
      locations
    });
  }
  // Fallback to centered layout
  return this.renderTextCentered(text, buttonText);
}

async renderEndScreen(message, showRestart, showCredits, locations?) {
  if (locations && locations.length > 0) {
    return this.renderPositioned({
      beatType: 'endScreen',
      background: 'bg-gradient-to-br from-purple-600 to-pink-600',
      content: { message, buttonText: 'Play Again' },
      locations
    });
  }
  // Fallback to centered layout
  return this.renderEndScreenCentered(message, showRestart, showCredits);
}
```

### Step 3: Update All Beat Types

**Add locations parameter to all render methods:**

```typescript
// types.ts
interface IRenderer {
  renderTitleScreen(title, author, buttonText, locations?): Promise<void>;
  renderText(text, buttonText, locations?): Promise<void>;
  renderDialog(speaker, text, emotion?, locations?): Promise<void>;
  renderEndScreen(message, showRestart, showCredits, locations?): Promise<void>;
  renderDurScreen(text, duration, locations?): Promise<void>;
  renderInputText(prompt, placeholder?, buttonText?, options?, locations?): Promise<string>;
  // ... etc
}
```

**Update all beat classes to pass locations:**

```typescript
// TitleScreenBeat.ts (already done ✅)
const locations = Array.from(this.locations.values());
await renderer.renderTitleScreen(this.title, this.author, this.buttonText, locations);

// IntroTextBeat.ts
const locations = Array.from(this.locations.values());
await renderer.renderText(this.text, this.buttonText, locations);

// EndScreenBeat.ts  
const locations = Array.from(this.locations.values());
await renderer.renderEndScreen(this.message, this.showRestart, this.showCredits, locations);

// ... etc for all beat types
```

## Benefits

1. **DRY** - Single positioning system for all beats
2. **Maintainable** - Fix once, works everywhere
3. **Consistent** - Same positioning logic across all beats
4. **Extensible** - Easy to add new beat types
5. **Backwards Compatible** - Falls back to centered layout

## Testing Plan

1. Test titleScreen with positions - should work
2. Test introText with positions - should work
3. Test endScreen with positions - should work
4. Test all other beats - should work
5. Test without locations - should use centered fallback

## Files to Modify

1. ✅ `types.ts` - Add locations? to all render methods
2. ✅ `BaseRenderer.ts` - Update abstract signatures
3. ✅ `ReactRenderer.tsx` - Add generic positioning system
4. ⏳ `IntroTextBeat.ts` - Pass locations to renderer
5. ⏳ `EndScreenBeat.ts` - Pass locations to renderer
6. ⏳ `DurScreenBeat.ts` - Pass locations to renderer
7. ⏳ All other beat types...

## Status

- Architecture designed ✅
- Plan documented ✅
- Ready to implement ⏳
