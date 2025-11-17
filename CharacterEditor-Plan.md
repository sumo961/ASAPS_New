# Character Editor Planning Document

## Overview
The Character Editor will be a comprehensive tool for defining and managing characters in ASPS stories, including their visual representation, states, counters, and inventory items.

## Architecture

### Core Components

#### 1. Character Manager
- **Location**: `/packages/builder/src/components/characters/CharacterManager.tsx`
- **Purpose**: Main container for all character-related functionality
- **Features**:
  - List view of all characters
  - Add/Remove/Edit characters
  - Import/Export character definitions
  - Search and filter capabilities

#### 2. Character Editor Panel
- **Location**: `/packages/builder/src/components/characters/CharacterEditor.tsx`
- **Purpose**: Detailed editing interface for individual characters
- **Sections**:
  - Basic Information
  - Visual Configuration
  - States & Animations
  - Counters & Variables
  - Inventory

#### 3. Character Visual Editor
- **Location**: `/packages/builder/src/components/characters/CharacterVisualEditor.tsx`
- **Purpose**: Visual representation and sprite management
- **Features**:
  - Static PNG upload/selection
  - Sprite sheet configuration
  - Animation preview
  - State visualization

## Data Model

```typescript
interface Character {
  id: string;
  name: string;
  displayName: string;
  role: 'player' | 'npc' | 'companion';
  
  // Visual Configuration
  visual: {
    type: 'static' | 'sprite';
    defaultImage?: string;  // For static characters
    spriteSheet?: {
      url: string;
      frameWidth: number;
      frameHeight: number;
      animations: SpriteAnimation[];
    };
  };
  
  // Character States
  states: CharacterState[];
  defaultState: string;
  
  // Game Variables
  counters: Counter[];
  inventory: InventoryItem[];
  
  // Metadata
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface CharacterState {
  id: string;
  name: string;
  displayName: string;
  visual: {
    image?: string;        // Static image for this state
    animation?: string;    // Sprite animation name
    effects?: VisualEffect[];
  };
  transitions: StateTransition[];
}

interface SpriteAnimation {
  name: string;
  frames: number[];     // Frame indices
  frameDuration: number; // ms per frame
  loop: boolean;
}

interface Counter {
  name: string;
  displayName: string;
  value: number;
  min?: number;
  max?: number;
  visible: boolean;
  icon?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  quantity: number;
  stackable: boolean;
  category: string;
}
```

## UI/UX Design

### Main Character Manager View
```
┌─────────────────────────────────────────────────────┐
│ Characters                              [+ Add] [⚙]  │
├─────────────────────────────────────────────────────┤
│ 🔍 Search...                    Filter: [All ▼]     │
├─────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ │   [Image]   │ │   [Image]   │ │   [Image]   │   │
│ │             │ │             │ │             │   │
│ │   Player    │ │  Old Wizard │ │   Merchant   │   │
│ │   👤 Main   │ │   🧙 NPC    │ │    💰 NPC    │   │
│ └─────────────┘ └─────────────┘ └─────────────┘   │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ │   [Image]   │ │   [Image]   │ │   [Image]   │   │
│ │             │ │             │ │   + Add      │   │
│ │    Guard    │ │  Innkeeper  │ │   Character  │   │
│ │   ⚔️ NPC    │ │   🏠 NPC    │ │              │   │
│ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Character Editor Panel
```
┌─────────────────────────────────────────────────────┐
│ Edit Character: Old Wizard                     [X]  │
├─────────────────────────────────────────────────────┤
│ [Basic] [Visual] [States] [Counters] [Inventory]    │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Visual Configuration:                               │
│ ┌──────────────┬────────────────────────────────┐  │
│ │              │ Type: [Static ▼]                │  │
│ │   [Preview]  │ Image: wizard.png [Browse]      │  │
│ │              │                                  │  │
│ │              │ States:                          │  │
│ │              │ ☑ Default                        │  │
│ │              │ ☑ Happy   wizard-happy.png       │  │
│ │              │ ☑ Angry   wizard-angry.png       │  │
│ │              │ ☐ Sad     [Select Image]         │  │
│ └──────────────┴────────────────────────────────┘  │
│                                                      │
│ [Save] [Cancel]                                     │
└─────────────────────────────────────────────────────┘
```

## Workflow Integration

### Character Selection in Beats
1. **Character Dropdown**: Replace text fields with character selector
2. **Visual Preview**: Show character thumbnail in selection
3. **State Selection**: If character has states, allow state selection
4. **Auto-complete**: Support for quick character selection

### Asset Management Integration
- Characters use assets from the Asset Manager
- Support for batch import of character sprites
- Automatic sprite sheet detection and configuration
- Asset validation and optimization

### Export/Import
- Characters exported as part of ASML `<characters>` section
- Support for character library export/import
- Character templates for quick setup

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create Character data model
- [ ] Implement CharacterManager component
- [ ] Basic CRUD operations
- [ ] Integration with existing Story structure

### Phase 2: Visual Editor (Week 2) - COMPLETE ✅
- [✅] Static image support - Enhanced with preview and transparency
- [✅] Character states management - States can have individual images
- [✅] Visual preview system - Real-time preview with checkered background
- [✅] Asset integration - Full asset picker integration

### Phase 3: Advanced Features (Week 3) - COMPLETE ✅
- [✅] Sprite sheet support - Full implementation with SpriteSheetEditor
- [✅] Animation configuration - Multiple animations with custom sequences
- [✅] State transitions - Visual state switching (animation support for transitions pending)
- [✅] Visual effects - Pixel-perfect rendering, zoom controls

### Phase 4: Game Variables (Week 4)
- [ ] Counter management UI
- [ ] Inventory system
- [ ] Variable templates
- [ ] Export/Import enhancements

### Phase 5: Beat Integration (Week 5)
- [ ] Replace text fields with character selectors
- [ ] Character state selection in beats
- [ ] Visual preview in beat editors
- [ ] Validation and error handling

## Technical Considerations

### Performance
- Lazy load character images
- Thumbnail generation for previews
- Efficient sprite sheet handling
- Caching strategies

### Storage
- Characters stored in Story object
- Separate character library support
- Asset references, not embedded data
- Version control friendly format

### Compatibility
- Backward compatibility with text-based character names
- Migration tools for existing stories
- Support for legacy ASML format
- Progressive enhancement approach

## User Benefits

1. **Visual Consistency**: Characters always appear the same across beats
2. **Efficiency**: Define once, use everywhere
3. **Rich Interactions**: Support for states and animations
4. **Better Organization**: Central character management
5. **Error Prevention**: No typos in character names
6. **Enhanced Preview**: See characters in context

## Next Steps

1. Review and approve this plan
2. Create detailed technical specifications
3. Design UI mockups
4. Begin Phase 1 implementation
5. Set up testing framework

---

*This document outlines the comprehensive Character Editor system for ASPS. The modular design allows for incremental implementation while maintaining backward compatibility.*
