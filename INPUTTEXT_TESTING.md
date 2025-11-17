# InputText Character Enhancement - Testing Guide

## ✅ Implementation Complete

The InputText beat can now save user input to either:
1. **Variable** (original) - Stores in a story variable
2. **Character Display Name** (new) - Updates character's display name

## 🧪 Quick Test

### Test the New Feature

**Step 1: Create a Character**
1. Click "Characters" button
2. Add character with:
   - Name: "Player"  
   - ID will be auto-generated (e.g., "char_player")
3. Close Character Manager

**Step 2: Create InputText Beat**
1. Drag "Input Text" (✏️) beat onto canvas
2. Open Inspector
3. You'll see a new "Save To" dropdown
4. Change it from "Variable" to "Character Display Name"
5. Select "Player" from Character dropdown
6. Set Prompt: "What's your name?"
7. Save

**Step 3: Verify Export**
1. Export story to ASML
2. Find the inputText beat
3. Check it has:
   ```xml
   <function kind="inputText" 
            prompt="What's your name?"
            saveToType="characterName"
            characterId="char_player">
   ```

### Expected Behavior

**Variable Mode (Default):**
```
Save To: [Variable]
Shows: Variable Name input field
ASML: saveToType="variable" variable="userInput"
```

**Character Mode (New):**
```
Save To: [Character Display Name]
Shows: Character dropdown (with defined characters)
Helper text: "Updates character's display name only (ID stays stable)"
ASML: saveToType="characterName" characterId="char_xxx"
```

## 🔑 Key Features

### Stable Character IDs
- Character ID never changes (e.g., "char_player")
- Only displayName is updated with user input
- Inventory checks, conditions still work correctly

### Smart UI
- Dropdown switches between modes
- Shows only relevant field (Variable OR Character)
- Clears the other field when switching
- Validation checks correct field based on mode

### Use Cases

**1. Name Your Character**
```
Prompt: "Enter your hero's name"
Save To: Character Display Name
Character: Player
→ Player's display name becomes user input
```

**2. Store Data (Original)**
```
Prompt: "Enter your email"
Save To: Variable
Variable: userEmail
→ Saved in variable for later use
```

**3. Dynamic Dialog**
```
Story: 
1. InputText → Character: Player
2. DialogTree: "${Player.displayName} walks in..."
→ Shows "Alice walks in..." if user entered "Alice"
```

## ⚠️ Known Limitations

### Preview/Runtime
The preview/runtime doesn't support the character rename yet:
- Beat will work for variable mode
- Character mode needs runtime implementation
- This is next on the TODO list

### Character Reference
Currently characters must be referenced by ID in conditions/inventory:
- Good: `if character_id == "char_player"`
- The displayName is for display only

## 📋 What to Report

Please test and report:

1. **UI Test:**
   - ✅/❌ Save To dropdown switches properly
   - ✅/❌ Character dropdown shows defined characters
   - ✅/❌ Validation works (requires variable OR character)

2. **Export Test:**
   - ✅/❌ Variable mode exports correctly
   - ✅/❌ Character mode exports with characterId
   - ✅/❌ Import preserves both modes

3. **Any Issues:**
   - Characters not showing in dropdown?
   - Validation errors?
   - Export problems?

## 📚 Documentation

Full details in: `INPUTTEXT_CHARACTER_ENHANCEMENT.md`

## 🚀 Next Steps

After you confirm it works:
1. Update preview/runtime to support character renaming
2. Add similar functionality to other beats if useful
3. Consider adding to HyperText beat too

---

This enhancement makes stories more dynamic and personal while keeping the underlying logic stable!
