# Character Editor - Design Document

## Overview
The Character Editor will be a comprehensive tool for managing story characters, their visual representations, states, counters, and inventory items. This editor will centralize character management, allowing authors to define characters once and reference them throughout the story.

## Key Design Principles

1. **Centralized Character Management**: Characters are defined once in the editor, not in individual beats
2. **Separation of Definition and Use**: Character graphics/sprites selected in editor, characters placed in beats
3. **State-Based System**: Support for multiple character states (happy, sad, angry, neutral, etc.)
4. **Data-Driven**: Characters can have counters and inventory items
5. **Visual First**: Emphasis on visual representation with drag-and-drop functionality

## Component Architecture

### 1. Character Manager (Main Panel)
```typescript
interface Character {
  id: string;
  name: string;
  role: 'player' | 'npc' | 'companion';
  description: string;
  
  // Visual representation
  graphics: {
    type: 'static' | 'sprite';
    defaultState: string;
    states: Map<string, CharacterState>;
  };
  
  // Data
  counters: Counter[];
  inventory: InventoryItem[];
  
  // Metadata
  tags: string[];
  voiceProfile?: string;
  color?: string; // For dialog text
}

interface CharacterState {
  name: string; // e.g., "happy", "sad", "angry"
  image?: string; // Asset ID or URL
  sprite?: SpriteConfig; // For animated sprites
  position?: { x: number; y: number }; // Default position
  scale?: number;
  flipX?: boolean;
}

interface SpriteConfig {
  sheet: string; // Asset ID
  frameWidth: number;
  frameHeight: number;
  animations: Map<string, Animation>;
}

interface Counter {
  name: string;
  value: number;
  min?: number;
  max?: number;
  visible: boolean;
  displayAs?: 'number' | 'bar' | 'hearts' | 'stars';
}

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  icon?: string; // Asset ID
  stackable: boolean;
  quantity: number;
}
```

### 2. UI Components

#### Character List Panel (Left Side)
- List of all characters with thumbnails
- Add/Delete/Duplicate buttons
- Search/Filter functionality
- Drag to reorder
- Character roles indicated by icons/colors

#### Character Editor Panel (Center)
- **Basic Info Tab**
  - Name, role, description
  - Voice profile selection
  - Dialog text color picker
  
- **Visual Tab**
  - State management (add/edit/delete states)
  - For each state:
    - Image/sprite selector
    - Preview window
    - Animation controls (for sprites)
  - Default state selector
  - Import from sprite sheet tool
  
- **Data Tab**
  - Counter management
    - Add/edit/delete counters
    - Set initial values and ranges
    - Display options
  - Inventory management
    - Add/edit/delete items
    - Set initial quantities
    - Item icons

#### Preview Panel (Right Side)
- Live preview of selected character state
- Animation preview for sprites
- State switcher
- Counter/inventory display preview

### 3. Integration Points

#### With Beat Editor
- Character selector dropdown in dialog beats
- Shows character thumbnail and name
- State selector for visual beats
- Quick access to character properties

#### With Visual Editor
- Drag characters from library to stage
- State-based placement
- Character-specific hotspots
- Animation triggers

#### With Export/Import
- Characters exported as part of story
- Sprite sheets packaged with assets
- Character data preserved in ASML

## Implementation Phases

### Phase 1: Basic Character Management
1. Create CharacterEditor component
2. Implement character CRUD operations
3. Basic info editing (name, role, description)
4. Integration with existing dialog beats

### Phase 2: Visual System
1. Static image support for states
2. State management UI
3. Asset selector integration
4. Preview functionality

### Phase 3: Sprite Support
1. Sprite sheet importer
2. Animation editor
3. Frame-by-frame preview
4. Export sprite data

### Phase 4: Data Management
1. Counter system
2. Inventory system
3. Display options
4. Initial values

### Phase 5: Advanced Features
1. Character templates
2. Batch operations
3. Character inheritance
4. AI-powered character generation

## File Structure
```
/packages/builder/src/components/characters/
├── CharacterEditor.tsx         // Main editor component
├── CharacterList.tsx           // Character list panel
├── CharacterDetails.tsx        // Detail editing panel
├── CharacterPreview.tsx        // Preview panel
├── StateEditor.tsx             // State management
├── SpriteEditor.tsx            // Sprite animation editor
├── CounterEditor.tsx           // Counter management
├── InventoryEditor.tsx         // Inventory management
└── CharacterSelector.tsx       // Dropdown for beat editor
```

## Data Flow

```
CharacterEditor
    ↓
useCharacterManager (hook)
    ↓
Story.characters (data store)
    ↓
ASMLGenerator (export)
```

## ASML Export Format
```xml
<characters>
  <character id="wizard" name="Old Wizard" role="npc">
    <description>A wise old wizard with a long beard</description>
    <graphics type="sprite" defaultState="neutral">
      <state name="neutral" image="wizard_neutral.png" />
      <state name="happy" image="wizard_happy.png" />
      <state name="angry" sprite="wizard_sprite.json" />
    </graphics>
    <counters>
      <counter name="wisdom" value="100" min="0" max="100" visible="true" />
      <counter name="magic" value="50" min="0" max="100" displayAs="bar" />
    </counters>
    <inventory>
      <item id="staff" name="Magic Staff" quantity="1" />
      <item id="potion" name="Health Potion" quantity="3" stackable="true" />
    </inventory>
  </character>
</characters>
```

## Benefits

1. **Consistency**: Characters defined once, used everywhere
2. **Efficiency**: No need to redefine characters in each beat
3. **Flexibility**: Easy to update character graphics/data globally
4. **Scalability**: Supports complex character systems
5. **Reusability**: Characters can be exported/imported between projects

## Next Steps

1. Review and refine the design
2. Create mockups for UI components
3. Implement Phase 1 (Basic Character Management)
4. Test integration with existing beats
5. Iterate based on user feedback
