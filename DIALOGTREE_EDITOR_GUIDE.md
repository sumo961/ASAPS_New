# Dialog Tree Editor - Complete Implementation

## 🎭 Overview

The **Dialog Tree** beat type replaces the legacy `conversationChoice` beat with a powerful, visual dialog tree editor that allows creating complex branching conversations within a single beat.

## ✨ Features

### Visual Tree Editor
- **Hierarchical View**: See your entire conversation structure at a glance
- **Collapsible Nodes**: Expand/collapse branches to focus on specific parts
- **Inline Editing**: Click any node to edit text, speaker, and emotion
- **Drag & Drop**: (Future) Rearrange nodes by dragging

### Dialog Components

#### 1. **Dialog Nodes**
Each node contains:
- **Speaker**: Who is talking (Player, NPC, Narrator, etc.)
- **Text**: What they're saying
- **Emotion**: How they feel (happy, sad, angry, etc.) with emoji visualization
- **Conditions**: When this dialog shows (based on variables/counters)
- **Effects**: What happens when this dialog is shown

#### 2. **Choices**
- Multiple choice options for player responses
- Each choice can lead to:
  - Another dialog node (nested conversation)
  - A different beat (scene transition)
  - End of conversation

#### 3. **Conditions & Effects**
- **Conditions**: Control when dialogs/choices appear
  - Variable checks
  - Counter comparisons
  - Inventory checks
  - Beat visit history
- **Effects**: Modify game state
  - Set variables
  - Modify counters
  - Add/remove inventory items

## 📝 How to Use

### Creating a Dialog Tree Beat

1. **Add Beat**: Click "Dialog Tree" in the sidebar
2. **Select Beat**: Click the new beat to open Inspector
3. **Edit Root Node**: The conversation starts here
   - Set the initial speaker
   - Write the opening dialog
   - Choose emotion

### Building Conversations

#### Simple Linear Dialog
```
NPC: "Welcome to our village!" 
  ↓
Player: "Thank you!"
  ↓
NPC: "Enjoy your stay."
```

#### Branching Dialog
```
NPC: "What brings you here?"
  ├─ Choice: "I'm looking for work"
  │    └─ NPC: "Check the tavern board"
  └─ Choice: "Just passing through"
       └─ NPC: "Safe travels then"
```

#### Complex Nested Tree
```
Merchant: "Browse my wares!"
  ├─ Choice: "Show me weapons"
  │    └─ Merchant: "Swords or bows?"
  │         ├─ Choice: "Swords"
  │         │    └─ [Show sword inventory]
  │         └─ Choice: "Bows"
  │              └─ [Show bow inventory]
  └─ Choice: "Not interested"
       └─ Merchant: "Your loss!"
```

## 🎮 Editor Interface

### Main Controls
- **➕ Add Choice**: Creates a new player response option
- **⚠️ Conditions**: Toggle condition panel for selected node
- **⚡ Effects**: Toggle effects panel for selected node
- **📝 Edit Node**: Click any node to edit its content

### Node States
- **Blue Border**: Currently selected node
- **Yellow Badge**: Has conditions attached
- **Purple Badge**: Has effects attached
- **Orange Box**: Player choice

### Emotions Available
- 😐 Neutral
- 😊 Happy
- 😢 Sad
- 😠 Angry
- 😮 Surprised
- 😨 Fearful
- 🤢 Disgusted
- 😎 Confident
- 😕 Confused
- 🤩 Excited

## 🔧 Advanced Features

### Conditional Dialogs
Show different dialogs based on game state:
```javascript
// Only show if player has item
Condition: inventory contains "key"
Dialog: "I see you have the key!"

// Show based on counter
Condition: reputation > 50
Dialog: "Welcome back, hero!"
```

### Dialog Effects
Modify game state during conversation:
```javascript
// Give item after dialog
Effect: add "map" to inventory

// Increase relationship
Effect: friendship += 10

// Set story flag
Effect: talkedToMerchant = true
```

### Connecting to Other Beats
After dialog ends, you can:
- Continue to another beat
- Loop back to a previous beat
- End the story

## 💾 Data Structure

The dialog tree is stored as a nested JSON structure:

```json
{
  "id": "root",
  "speaker": "NPC",
  "text": "Welcome, traveler!",
  "emotion": "happy",
  "choices": [
    {
      "id": "choice_1",
      "text": "Hello there!",
      "target": {
        "id": "node_2",
        "speaker": "NPC",
        "text": "How can I help?",
        "emotion": "neutral"
      }
    }
  ],
  "conditions": [...],
  "effects": [...]
}
```

## 🎯 Best Practices

1. **Keep It Focused**: Each dialog tree should handle one conversation/scene
2. **Use Clear Labels**: Name speakers consistently
3. **Test Branches**: Make sure all choices lead somewhere
4. **Add Emotions**: Makes conversations more engaging
5. **Use Conditions Wisely**: Don't overcomplicate with too many conditions

## 🐛 Troubleshooting

### Dialog Not Showing
- Check conditions are met
- Verify speaker names are consistent
- Ensure beat connections are set

### Choices Not Working
- Each choice needs a target (node or beat)
- Check for circular references
- Verify condition logic

### Effects Not Applying
- Check effect syntax
- Verify variable/counter names
- Test in preview mode

## 🚀 Examples

### Shop Conversation
```yaml
Merchant: "Welcome to my shop!" [happy]
  ├─ "Show me your best items"
  │   └─ Merchant: "These are rare indeed!" [excited]
  │       └─ [Show premium items]
  ├─ "Just browsing"
  │   └─ Merchant: "Take your time." [neutral]
  └─ "I'm selling"
      └─ Merchant: "Let's see what you have." [interested]
          └─ [Open sell interface]
```

### Quest Dialog
```yaml
Guard: "Halt! State your business." [stern]
  ├─ "I have a delivery" 
  │   └─ Condition: has quest_item
  │       └─ Guard: "Ah yes, proceed." [friendly]
  ├─ "I'm a merchant"
  │   └─ Guard: "Papers please." [suspicious]
  └─ "Just visiting"
      └─ Guard: "Move along then." [dismissive]
```

## 📚 Related Features

- **Condition System**: Controls when dialogs appear
- **Effects System**: Modifies game state
- **Counter System**: Track relationship scores
- **Inventory System**: Item-based dialog options

## 🎉 Summary

The Dialog Tree Editor transforms conversation creation from tedious XML editing to intuitive visual design. Create rich, branching narratives with emotional depth and game state integration - all within a single beat!
