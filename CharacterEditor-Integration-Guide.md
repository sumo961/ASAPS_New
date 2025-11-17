# Character Editor Integration Guide

## Next Steps for Character System Integration

### 1. Create Character Management Hook
Create `/packages/builder/src/hooks/useCharacterManagerIntegration.ts`:
```typescript
import { useState, useCallback } from 'react';
import { Character } from '../types/character';

export function useCharacterManagerIntegration() {
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);

  const toggleCharacterManager = useCallback(() => {
    setShowCharacterManager(prev => !prev);
  }, []);

  const closeCharacterManager = useCallback(() => {
    setShowCharacterManager(false);
  }, []);

  const updateCharacters = useCallback((newCharacters: Character[]) => {
    setCharacters(newCharacters);
  }, []);

  return {
    characters,
    showCharacterManager,
    toggleCharacterManager,
    closeCharacterManager,
    updateCharacters
  };
}
```

### 2. Update App.tsx

Add the following imports:
```typescript
import { CharacterManager } from './components/characters/CharacterManager';
import { useCharacterManagerIntegration } from './hooks/useCharacterManagerIntegration';
```

Add character state in the App component:
```typescript
// Character Management
const {
  characters,
  showCharacterManager,
  toggleCharacterManager,
  closeCharacterManager,
  updateCharacters,
} = useCharacterManagerIntegration();
```

### 3. Add Characters Button to Header

Update the Header component to include a Characters button:
```typescript
<button
  onClick={onCharacters}
  className="px-3 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-2"
>
  <Users className="w-4 h-4" />
  Characters
</button>
```

Pass `onCharacters={toggleCharacterManager}` to the Header component.

### 4. Add Character Manager Modal

Add this modal in App.tsx after the AssetManager modal:
```typescript
{/* Character Manager Modal */}
{showCharacterManager && (
  <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
    <div className="bg-white rounded-lg shadow-xl w-[900px] h-[700px] flex flex-col">
      <CharacterManager
        characters={characters}
        onCharactersChange={updateCharacters}
      />
      <button
        onClick={closeCharacterManager}
        className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg text-2xl z-10"
      >
        ×
      </button>
    </div>
  </div>
)}
```

### 5. Update Story Export

Modify the story export to include characters:
```typescript
const handleExport = useCallback(async () => {
  try {
    // Pass both assets and characters to the export function
    const asml = actions.exportStory(assets, characters);
    // ... rest of export logic
  } catch (error) {
    // ... error handling
  }
}, [actions, state.title, assets, characters]);
```

### 6. Update Beat Editors

For beats that reference characters (e.g., dialogTree, conversationChoice), replace text inputs with character selectors:

Create a CharacterSelector component:
```typescript
// /packages/builder/src/components/characters/CharacterSelector.tsx
interface CharacterSelectorProps {
  value: string;
  onChange: (characterId: string) => void;
  characters: Character[];
  placeholder?: string;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  value,
  onChange,
  characters,
  placeholder = "Select character..."
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">{placeholder}</option>
      {characters.map(char => (
        <option key={char.id} value={char.name}>
          {char.displayName} ({char.role})
        </option>
      ))}
    </select>
  );
};
```

### 7. Update Inspector Component

In the Inspector component, pass characters to beat editors that need them:
```typescript
// When rendering dialogTree or other character-dependent beats
{beat.type === 'dialogTree' && (
  <DialogTreeEditor
    beat={beat}
    characters={characters}
    // ... other props
  />
)}
```

### 8. Update ASML Export

Modify ASMLGenerator.ts to include characters section:
```typescript
private generateCharacters(): string {
  if (!this.characters || this.characters.length === 0) return '';
  
  const lines: string[] = [];
  lines.push(`${this.indent}<characters>`);
  
  for (const character of this.characters) {
    lines.push(`${this.indent}${this.indent}<character>`);
    lines.push(`${this.indent}${this.indent}${this.indent}<id name="${character.name}" displayName="${character.displayName}" role="${character.role}" />`);
    
    // Visual configuration
    if (character.visual.defaultImage) {
      lines.push(`${this.indent}${this.indent}${this.indent}<visual type="${character.visual.type}" defaultImage="${character.visual.defaultImage}" />`);
    }
    
    // States
    if (character.states.length > 0) {
      lines.push(`${this.indent}${this.indent}${this.indent}<states default="${character.defaultState}">`);
      for (const state of character.states) {
        lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<state name="${state.name}" displayName="${state.displayName}" image="${state.visual.image || ''}" />`);
      }
      lines.push(`${this.indent}${this.indent}${this.indent}</states>`);
    }
    
    // Counters
    if (character.counters.length > 0) {
      lines.push(`${this.indent}${this.indent}${this.indent}<counters>`);
      for (const counter of character.counters) {
        const attrs = [`name="${counter.name}"`, `val="${counter.value}"`];
        if (counter.min !== undefined) attrs.push(`min="${counter.min}"`);
        if (counter.max !== undefined) attrs.push(`max="${counter.max}"`);
        lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<counter ${attrs.join(' ')} />`);
      }
      lines.push(`${this.indent}${this.indent}${this.indent}</counters>`);
    }
    
    // Inventory
    if (character.inventory.length > 0) {
      lines.push(`${this.indent}${this.indent}${this.indent}<inventory>`);
      for (const item of character.inventory) {
        lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<item name="${item.name}" displayName="${item.displayName}" quantity="${item.quantity}" category="${item.category}" />`);
      }
      lines.push(`${this.indent}${this.indent}${this.indent}</inventory>`);
    }
    
    lines.push(`${this.indent}${this.indent}</character>`);
  }
  
  lines.push(`${this.indent}</characters>`);
  return lines.join('\n');
}
```

### 9. Update ASML Parser

Add character parsing to ASMLParser.ts:
```typescript
private parseCharacters(element: Element): Character[] {
  const characters: Character[] = [];
  const characterElements = element.getElementsByTagName('character');
  
  for (let i = 0; i < characterElements.length; i++) {
    const charEl = characterElements[i];
    const idEl = charEl.getElementsByTagName('id')[0];
    
    const character: Character = {
      id: `char_${Date.now()}_${i}`,
      name: idEl.getAttribute('name') || '',
      displayName: idEl.getAttribute('displayName') || '',
      role: (idEl.getAttribute('role') as Character['role']) || 'npc',
      // ... parse other character properties
    };
    
    characters.push(character);
  }
  
  return characters;
}
```

## Testing Plan

1. **Character Creation**
   - Create new characters with all properties
   - Use templates
   - Edit existing characters
   - Delete characters

2. **Visual Configuration**
   - Add images to characters
   - Set up character states with different images
   - Test image picker integration with assets

3. **Counters and Inventory**
   - Add/edit/remove counters
   - Configure inventory items
   - Test min/max values and visibility

4. **Beat Integration**
   - Replace character text fields with selectors
   - Test character selection in dialog beats
   - Verify character names in export

5. **Import/Export**
   - Export story with characters
   - Import story and verify characters load
   - Test character library export/import

## Benefits

- **Consistency**: Characters defined once, used everywhere
- **Visual Preview**: See character images in beats
- **Error Prevention**: No typos in character names
- **Rich Features**: States, counters, inventory per character
- **Reusability**: Character libraries across projects

## Future Enhancements

1. **Sprite Animation Support**
   - Sprite sheet configuration
   - Animation preview
   - Frame-by-frame editing

2. **Advanced States**
   - State transition conditions
   - Visual effects per state
   - Animation sequences

3. **Character Relationships**
   - Define relationships between characters
   - Faction systems
   - Relationship counters

4. **Voice Configuration**
   - Text-to-speech settings per character
   - Voice sample attachments
   - Dialogue audio management

---

This integration guide provides a complete roadmap for adding the Character Editor system to the main application. The modular design ensures clean integration without disrupting existing functionality.
