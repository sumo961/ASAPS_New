## New Issues

- add a complete set of settings to the default story
- [x] **CharacterEditor Save Race Condition** - FIXED ✅ (January 16, 2025)
  - ✅ Fixed issue where saved changes weren't being reflected in the editor
  - ✅ Added justSaved state to track when a save operation was initiated
  - ✅ Modified useEffect to properly sync state after parent updates
  - ✅ Editor now correctly reflects saved data without losing in-progress edits
  
- [x] **Character ASML Export/Import** - FIXED ✅ (January 16, 2025)
  - ✅ ASMLGenerator now exports ALL character properties:
    - Basic: id, name, displayName, role, color, defaultState, createdAt, updatedAt
    - Description and tags
    - Visual configuration (type, defaultImage, spriteSheet settings)
    - States with all properties (id, name, displayName, visual settings)
    - Enhanced counters (displayName, visible, icon, color)
    - Complete inventory items (all properties including descriptions)
  - ✅ ASMLParser now imports ALL character properties:
    - Full backward compatibility with old character format
    - Proper handling of nested elements (states, counters, inventory)
    - Default values for missing properties
    
- [x] **Character Editor Phase 1** - COMPLETE ✅ (September 23, 2025)
  - ✅ Created CharacterManager, CharacterEditor, and CharacterCard components
  - ✅ Implemented comprehensive character data model with states, counters, inventory
  - ✅ Multi-tab editor interface (Basic, Visual, States, Counters, Inventory)
  - ✅ Character templates for quick setup (Player, Merchant, Wizard)
  - ✅ Import/Export functionality for character libraries
  - ✅ Search, filter, and view modes (grid/list)
  
  **Phase 2 - Integration (IN PROGRESS 🚀):**
  - [✅] Integrate CharacterManager into main App.tsx
  - [✅] Add Characters button to Header with modal
  - [✅] Pass assets to Character Editor
  - [✅] Include characters in story export with ALL properties
  - [✅] Implement complete ASML export for all character properties
  - [✅] Implement complete ASML import for all character properties
  - [ ] Replace text fields in beats with character selectors
  - [ ] Add character state selection in beat editors  
  - [ ] Add sprite sheet support for animated characters
  - [ ] Test end-to-end character workflow

- reconsider the visual editor, as the sliding mechanism seems cumbersome. Maybe it should be a tab which alternates with the flowchart view?
- start tackling the asset loading issues. Assets still do not save to the export asml.
