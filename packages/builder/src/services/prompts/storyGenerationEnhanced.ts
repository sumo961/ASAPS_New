/**
 * Enhanced Story Generation Prompts
 *
 * Comprehensive templates with deep beat type understanding and advanced branching patterns
 */

import type { StoryGenerationRequest } from '../../types/ai';

/**
 * Theme presets guide for AI - describes available visual themes
 */
const THEME_GUIDE = `
## Theme Presets

ASAPS includes built-in theme presets that control the visual presentation of stories. When generating a story, you should recommend the most appropriate theme based on the genre and style.

**NOTE:** All themes have text effects DISABLED by default (no typewriter, no fade). This speeds up debugging. Authors can enable effects later if desired.

### Available Themes

**1. builtin-visual-novel** - Visual Novel Theme
Best for: Romance, drama, character-driven stories, anime-style narratives
Characteristics:
- Semi-transparent text box at bottom of screen
- Character name highlights in golden color
- Dark overlay for backgrounds
- Serif fonts for elegance
- Inspired by Ren'Py and Japanese visual novels
Use when: Story focuses on character dialog, relationships, emotional moments

**2. builtin-twine** - Text Adventure Theme
Best for: Interactive fiction, literary narratives, choice-based games, mystery stories
Characteristics:
- Minimal UI with no visible text box frame
- Blue hyperlink-style choices (like web links)
- Serif typography (Georgia) for literary feel
- Dark background with light text
- Centered text, lots of reading
- Invisible hotspots (text-based interaction)
- Inspired by Twine/SugarCube and classic interactive fiction
Use when: Story is text-heavy, literary, or where UI should not distract from narrative

**3. builtin-point-and-click** - Point & Click Adventure Theme
Best for: Adventure games, puzzle stories, exploration, mystery with locations
Characteristics:
- Golden text on dark blue surfaces (high contrast!)
- Prominent hotspot indicators (always visible)
- Sharp corners, pixelated aesthetic
- Dissolve scene transitions
- Inventory/exploration focus
- Inspired by LucasArts (Monkey Island) and Sierra classics
Use when: Story involves exploration, picking up items, location-based puzzles

### ⚠️ Color Contrast Guidelines (IMPORTANT!)

When describing visual elements or suggesting styling in notes, ALWAYS ensure high color contrast:

❌ BAD COLOR COMBINATIONS (hard to read):
- Yellow text on white background
- Light gray text on white background
- Dark blue text on black background
- Red text on green background (colorblind unfriendly)

✓ GOOD COLOR COMBINATIONS (high contrast):
- White/light text on dark backgrounds
- Dark text on light backgrounds
- Golden/yellow text on dark blue (point-and-click style)
- Blue links on dark/light neutral backgrounds

Rule: Text and background should have a contrast ratio of at least 4.5:1 for readability.

### Theme Recommendation Guidelines

| Genre | Recommended Theme | Reason |
|-------|-------------------|--------|
| Romance | builtin-visual-novel | Character focus, emotional beats |
| Drama | builtin-visual-novel | Dialog-heavy, character-driven |
| Mystery (text-based) | builtin-twine | Literary style, lots of reading |
| Mystery (exploration) | builtin-point-and-click | Location investigation, item collection |
| Horror | builtin-twine or builtin-visual-novel | Atmospheric, immersive |
| Fantasy (epic) | builtin-visual-novel | Character interactions, world-building |
| Fantasy (adventure) | builtin-point-and-click | Exploration, item puzzles |
| Sci-Fi | builtin-twine or builtin-visual-novel | Depends on narrative style |
| Comedy | builtin-visual-novel | Character expressions, timing |
| Adventure/Exploration | builtin-point-and-click | Locations, inventory, hotspots |
| Literary/Experimental | builtin-twine | Minimal UI, focus on text |
`;

/**
 * Beat type usage guide
 */
const BEAT_TYPE_GUIDE = `
## Beat Types Deep Dive

### VISIBLE BEATS (Player Sees and Interacts)

🚨🚨🚨 **titleScreen** - Story opening (MANDATORY FIRST BEAT!) 🚨🚨🚨
- Use: Start of EVERY story - this MUST be the first beat (beat_0)
- Parameters: title, author, startButtonText
- Connections: Single → first story beat (usually introText)
- ⚠️⚠️⚠️ CRITICAL: beat_0 MUST ALWAYS be type "titleScreen"!
- ❌ WRONG: Starting with introText, dialogTree, or any other beat type
- ✓ CORRECT: beat_0 is titleScreen → beat_1 is introText or other content
- Example: titleScreen "The Mystery Begins" → introText "You arrive..."

**introText** - Display text with continue button (SINGLE CONNECTION ONLY!)
- Use: Narration, scene setting, exposition
- Parameters: text, buttonText, backgroundAssetId
- Connections: Single → next beat (ONLY ONE connection allowed!)
- ⚠️ CRITICAL: introText can ONLY connect to ONE beat!
- ❌ WRONG: introText with 2+ connections (use movementChoice for branching!)
- ✓ CORRECT: introText → one target beat
- For branching choices, use movementChoice or dialogTree instead!
- Example: "You arrive at the mansion..." → movementChoice (for choices)

**durScreen** - Timed auto-advance text
- Use: Quick transitions, atmosphere, montages
- Parameters: text, duration (seconds) - NO connection inside parameters!
- ⚠️ NOTE: durScreen does NOT support backgroundAssetId - use introText if you need a background
- ⚠️ CRITICAL: Connection goes in "connections" array at beat level, NOT inside parameters!
- ❌ WRONG: "parameters": { "text": "...", "duration": 3, "connection": { "target": "beat_5" } }
- ✓ CORRECT: "parameters": { "text": "...", "duration": 3 }, "connections": [{ "targetId": "beat_5" }]
- Connections: Single → auto-advances after duration
- Example: "Three days later..." (3s) → dialogTree

**dialogTree** - Branching conversations
- Use: Character interactions, interrogations, negotiations
- Parameters: dialogTree with this EXACT structure (NO "root" wrapper!):
  {
    "dialogTree": {
      "id": "root",
      "speaker": "Character Name",
      "text": "What the NPC says",
      "choices": [
        { "id": "c1", "text": "Player's response", "target": "beat_id" }
      ]
    }
  }
- ⚠️ WRONG: { "dialogTree": { "root": { ... } } } - NO extra "root" wrapper!
- choice: { id, text, target? | dialogNode? } - What player clicks (text IS the player's line)
- target (string): Beat ID to exit dialog
- dialogNode (nested): NPC responds, conversation continues
- Connections: Multiple → based on dialog choices leading to beat targets
- IMPORTANT: Choice text IS what the player says. Never use "[Continue]" - use actual dialogue.
- Example: NPC asks question → [Player response A | Player response B] → NPC responds

**movementChoice** - Location/direction selection
- Use: Exploration, navigation, choosing paths
- Parameters: question, choices (array of {id, text, location, target})
  - id: Unique identifier for the choice (e.g., "choice_library", "c1")
  - text: What the player sees (e.g., "Go to the Library")
  - location: Hover/tooltip text - ALWAYS set this to same value as text!
  - target: Beat ID to navigate to
- ⚠️ IMPORTANT: Always include "location" field - copy the "text" value to it!
  Example: { "id": "c1", "text": "Go to the Library", "location": "Go to the Library", "target": "beat_3" }
- Connections: Multiple → one per choice
- COUNTER EFFECTS: Choices can modify counters (same as dialogTree)
  { "id": "c1", "text": "Take the dangerous path", "target": "beat_danger", "counter": "courage", "counterOperation": "change", "counterValue": 5 }
- Example: "Where to go?" → [Library | Kitchen | Garden] → 3 different beats

**pickProp** - Object/item selection (NOT for action choices!)
- Use: Selecting physical ITEMS/OBJECTS, NOT for navigation or actions
- Parameters: question (REQUIRED!), props (array of {id, name, target})
  - question: Text prompt asking what to pick (REQUIRED - e.g., "What do you examine?")
  - name: The ITEM NAME ONLY - just the object name, no verbs!
  - ⚠️ WRONG names that start with verbs:
    - "Take the key" ❌
    - "Pick up the sword" ❌
    - "Leave the room" ❌
    - "Continue searching" ❌
    - "Examine the desk" ❌
  - ✓ CORRECT names (noun phrases only):
    - "Silver Key" ✓
    - "Rusty Sword" ✓
    - "Old Book" ✓
    - "Mysterious Letter" ✓
- Connections: Multiple → one per prop
- Combine with: addRemoveInventory (invisible beat after)
- COUNTER EFFECTS: Props can modify counters when selected
  { "id": "sword", "name": "Rusty Sword", "target": "beat_armed", "counter": "confidence", "counterOperation": "change", "counterValue": 3 }
- ⚠️ For action choices (verbs), use movementChoice instead!
- ⚠️ For leaving/continuing without picking anything, use a separate connection or movementChoice
- Example: "What do you pick up?" → [Silver Key | Old Book | Lantern] → each leads to different beat

**hyperText** - Clickable word/phrase branching
- Use: Subtle choices, memory/knowledge checks, exploring details in text
- Parameters:
  - text: The main text content (plain text, no brackets)
  - hyperlinks: Array of { word: "clickable phrase", targetBeatId: "beat_id" }
- ⚠️ CRITICAL: The "word" MUST appear EXACTLY as written in the text!
  - Write the text FIRST
  - Then copy exact phrases from the text into hyperlinks
  - If text says "silver key on the desk", use "silver key" NOT "the key"
- Connections: Multiple → based on which hyperlink is clicked
- IMPORTANT: Do NOT put brackets around words in the text. The hyperlinks array defines what's clickable.
- Example JSON:
  {
    "text": "You see a silver key on the desk and an old photograph on the wall.",
    "hyperlinks": [
      { "word": "silver key", "targetBeatId": "beat_key_path" },
      { "word": "old photograph", "targetBeatId": "beat_photo_path" }
    ]
  }
- ⚠️ WRONG: { "word": "the key" } when text says "silver key" - EXACT MATCH REQUIRED!

**videoBeat** - Video playback
- Use: Cutscenes, instructions, dramatic moments
- Parameters:
  - videoFile: Path/identifier of the video file (REQUIRED - use "videoFile" NOT "videoAssetId")
  - autoplay: boolean (default: true)
  - controls: boolean (default: true)
  - skipButton: boolean (default: true)
- ⚠️ CRITICAL: Use "videoFile" parameter, NOT "videoAssetId"!
- Connections: Single → after video ends or skip
- videoBeat uses "connections" array at beat level (NOT inside parameters!)
- Example:
  {
    "type": "videoBeat",
    "parameters": { "videoFile": "intro_cutscene.mp4", "skipButton": true },
    "connections": [{ "targetId": "beat_next" }]
  }

**inputText** - Text input from player
- Use: Name entry, password/code input, creative input
- Parameters:
  - prompt: Text asking the player for input (REQUIRED)
  - variable: Variable name to store the input (REQUIRED - use "variable" NOT "variableName"!)
  - saveToType: "variable" (REQUIRED - always set to "variable")
  - submitButtonText: Text for submit button (optional, default: "Submit")
  - connection: { target: "beat_id" } (REQUIRED - inside parameters!)
- ⚠️ CRITICAL: Use "variable" parameter, NOT "variableName"!
- Connections: Single → stores input in variable, then proceeds
- inputText uses "connection" inside parameters (NOT "connections" array!)
- Example:
  {
    "type": "inputText",
    "parameters": { "prompt": "Enter the password:", "variable": "userPassword", "saveToType": "variable", "connection": { "target": "beat_next" } }
  }
- Combine with: conditionBeat to check input

**endScreen** - Story conclusion (ACTUAL BEATS in the beats array!)
- Use: Ending (victory, defeat, various endings)
- Parameters:
  - message: "Ending text"  ← NOT "endMessage" or "text"!
  - showRestart: boolean (ALWAYS set to true so player can replay!)
  - showCredits: boolean
- ⚠️ CRITICAL: Use "message", NOT "endMessage"!
- ⚠️ CRITICAL: ALWAYS set "showRestart": true - player must be able to replay!
- Connections: None (terminal beat)
- Pattern: Multiple endScreens for different endings
- 🚨🚨🚨 CRITICAL: endScreen must be in the main "beats" array! 🚨🚨🚨
- ❌ WRONG: Creating a separate "endings" array (this is NOT recognized!)
- ❌ WRONG: Referencing "beat_end_good" without creating it in the "beats" array
- ✓ CORRECT: Put ALL endScreen beats in the main "beats" array:
  { "id": "beat_end_good", "type": "endScreen", "parameters": { "message": "...", "showRestart": true } }
- 🚨 NEVER create an "endings" array - it will be IGNORED! All endings go in "beats"!
- Example: { "id": "beat_ending_good", "type": "endScreen", "parameters": { "message": "Victory!", "showRestart": true, "showCredits": true } }

### INVISIBLE BEATS (Logic/Background Operations)

**setVariable** - Set/modify story state
- Use: Track player choices, update counters, set flags
- ⚠️ IMPORTANT: Two different "name" fields exist - don't confuse them!
  - beat.name: The beat's display name (e.g., "Increase Sanity Counter")
  - beat.parameters.name: The VARIABLE name being set (e.g., "sanityMeter")
- Parameters (inside "parameters") - NO connection inside parameters!:
  - type: "variable" (for text/boolean/simple set) or "counter" (for numeric operations)
  - name: The VARIABLE/COUNTER name to modify (e.g., "hasKey", "sanityScore") - NOT the beat name!
  - value: The value to set or modify by
  - operation: Exactly one of these values:
    - "set" - Replace the current value entirely
    - "add" - Add value to current (increment)
    - "subtract" - Subtract value from current (decrement)
    - "multiply" - Multiply current by value
    - "divide" - Divide current by value
- ⚠️ CRITICAL: If using a math operation (add/subtract/multiply/divide), you MUST use type="counter"
- ⚠️ DO NOT use "change" - be explicit: use "add" to increment, "subtract" to decrement
- ⚠️ CRITICAL: Connection goes in "connections" array at beat level, NOT inside parameters!
- Connections: Single → immediately to next beat
- Pattern: Chain after visible beats to track state
- Full beat example (note the two different "name" fields):
  {
    "id": "beat_set_sanity",
    "name": "Increase Sanity Counter",    // ← Beat display name (shown in editor)
    "type": "setVariable",
    "parameters": {
      "type": "counter",
      "name": "sanityMeter",              // ← Variable name being modified
      "value": 1,
      "operation": "add"
    },
    "connections": [{ "targetId": "beat_next" }]  // ← Connection at beat level!
  }
- More examples (parameters only - connection at beat level):
  - Flag: { "type": "variable", "name": "hasKey", "value": true }
  - Increment by 1: { "type": "counter", "name": "cluesFound", "value": 1, "operation": "add" }
  - Decrement by 5: { "type": "counter", "name": "sanity", "value": 5, "operation": "subtract" }
  - Set to specific: { "type": "counter", "name": "score", "value": 100, "operation": "set" }

**conditionBeat** - State-based branching
- Use: Check variables, counters, inventory, create conditional paths
- ⚠️ CRITICAL: Use ONLY these 3 parameters - NO extras!
  - condition: { type, variable/item/timer, operator, value, ... }
  - trueConnection: { target: "beat_id", label: "optional" }
  - falseConnection: { target: "beat_id", label: "optional" }
- ❌ NEVER use these flat parameters (they will be rejected):
  - conditionType ❌
  - variableName ❌
  - operator (at top level) ❌
  - value (at top level) ❌
  - trueTarget ❌
  - falseTarget ❌
- Condition types inside the "condition" object:
  - **counter**: { type: "counter", variable: "counterName", operator: ">=", value: 3 }
  - **variable**: { type: "variable", variable: "varName", operator: "==", value: true }
  - **inventory**: { type: "inventory", item: "itemName", character: "player", checkType: "has"|"lacks" }
  - **timer**: { type: "timer", timer: "timerName", operator: ">", value: 0 }
- Connections: Two → one if true, one if false
- Pattern: Reconvergence - multiple paths lead here, then branch based on accumulated state

Counter condition example (CORRECT format):
  {
    "condition": { "type": "counter", "variable": "cluesFound", "operator": ">=", "value": 3 },
    "trueConnection": { "target": "beat_success", "label": "Enough clues" },
    "falseConnection": { "target": "beat_hub", "label": "Need more clues" }
  }

Inventory condition example (CORRECT format):
  {
    "condition": { "type": "inventory", "item": "lantern", "character": "player", "checkType": "has" },
    "trueConnection": { "target": "beat_has_light", "label": "Has lantern" },
    "falseConnection": { "target": "beat_dark", "label": "No lantern" }
  }

❌ WRONG inventory condition (duplicates fields at top level - NEVER DO THIS!):
  {
    "condition": { "type": "inventory", "item": "key", "character": "player", "checkType": "has" },
    "trueConnection": { "target": "beat_5" },
    "falseConnection": { "target": "beat_6" },
    "item": "key",           // ❌ DELETE - already in condition!
    "character": "player",   // ❌ DELETE - already in condition!
    "checkType": "has"       // ❌ DELETE - already in condition!
  }
- ⚠️ WRONG for inventory: { "variableName": "lantern" } - use "item" inside condition!

**addRemoveInventory** - Inventory manipulation
- Use: Pick up items, lose items, transfer between characters
- Parameters (ALL are REQUIRED):
  - item: Item name/identifier (REQUIRED - use "item" NOT "propId"!)
  - action: "add" | "remove" | "transfer" (REQUIRED)
  - character: Character whose inventory is modified (REQUIRED - use "player" for player character)
  - fromChar/toChar: For transfer action only
- ⚠️ CRITICAL: Use "item" parameter, NOT "propId"!
- ⚠️ CRITICAL: Always include "character" parameter (usually "player")!
- Connections: Single → next beat
- Pattern: After pickProp or as consequence of actions
- Examples:
  - Add to player: { "item": "key", "action": "add", "character": "player" }
  - Add to NPC: { "item": "key", "action": "add", "character": "merchant" }
  - Transfer: { "item": "sword", "action": "transfer", "fromChar": "player", "toChar": "companion", "character": "player" }

**randomTarget** - Random path selection
- Use: Randomness, procedural elements, replayability
- Parameters: targets (array of {targetId, weight})
- Connections: Multiple → randomly picks one
- Pattern: Add variety, random encounters
- Example: "You wander the forest" → randomTarget → [encounter wolf | find camp | get lost]

**setTimer** - Background countdown
- Use: Time pressure, timed events, deadlines
- Parameters (ALL are REQUIRED):
  - name: Timer identifier (REQUIRED - use "name" NOT "timerName"!)
  - value: Duration in seconds (REQUIRED - use "value" NOT "duration"!)
  - timerTarget: Beat ID to jump to when timer expires (REQUIRED)
- ⚠️ CRITICAL parameter names:
  - Use "name" NOT "timerName"
  - Use "value" NOT "duration"
  - "timerTarget" is REQUIRED - the beat to jump to when time runs out!
- Connections: Single → continues immediately, timer runs in background
- Combine with: conditionBeat checking timer expired
- Example: { "name": "bombTimer", "value": 300, "timerTarget": "beat_explosion" }

## Beat Notes (Author Annotations) - USE LIBERALLY!

All beats can include a "notes" field for author documentation:
- Notes are NOT shown to players - purely for author reference
- **AI should actively use notes to help the human author**, including:
  - Suggested visual assets: "ASSET: Dark forest background, ominous lighting"
  - Character art suggestions: "CHARACTER: Show detective looking suspicious"
  - Sound/music suggestions: "AUDIO: Tense investigation music"
  - Areas needing human review: "REVIEW: Verify this clue doesn't give away the answer too early"
  - Narrative intent: "INTENT: This builds tension before the reveal"
  - Design alternatives: "ALTERNATIVE: Could branch to romance path here instead"
  - TODOs for enhancement: "TODO: Add animation of door opening"
- Example beat with notes:
  {
    "id": "beat_climax",
    "name": "Final Confrontation",
    "type": "dialogTree",
    "notes": "ASSET: Dramatic throne room background. CHARACTER: Villain should look menacing. REVIEW: Ensure player has enough clues to make informed choice.",
    "parameters": { ... }
  }

## Timer Visualization (showTimer)

When using defaultTarget with defaultTargetDelay, you can add visual feedback:
- "showTimer": true displays a countdown bar at the top of the stage
- The bar changes color as time runs out (green → yellow → red)
- Creates visible urgency for time-pressure scenarios
- Example:
  {
    "id": "beat_bomb",
    "name": "Defuse the Bomb",
    "type": "movementChoice",
    "parameters": {
      "question": "The bomb is ticking! What do you do?",
      "choices": [...]
    },
    "defaultTarget": "beat_explosion",
    "defaultTargetDelay": 30,
    "showTimer": true
  }
- Useful for: escape sequences, timed puzzles, urgent decisions
- Note: defaultTargetDelay is in SECONDS

## Character Counters (Centralized System)

Counters should be defined on characters, then referenced consistently in choices:
- Define counters in the characters array with meaningful names and limits
- These counters become available in ALL choice-type beats (dialogTree, movementChoice, pickProp)
- Counter properties on choices:
  - "counter": name of the counter to modify
  - "counterOperation": "change" (add/subtract) or "set" (replace)
  - "counterValue": numeric value
- Example character with counters:
  {
    "id": "char_player",
    "name": "Hero",
    "counters": [
      { "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 },
      { "name": "health", "displayName": "Health", "value": 100, "min": 0, "max": 100 }
    ]
  }
- Example choice with counter effect:
  { "id": "c1", "text": "Stand your ground", "target": "beat_fight", "counter": "courage", "counterOperation": "change", "counterValue": 10 }
- Best practice: Define all counters you plan to use on relevant characters first, then reference them in choices

## Advanced Branching Patterns

### Pattern 1: Hub-and-Spoke (Exploration)
\`\`\`
Central Hub (movementChoice) → [Location A | Location B | Location C]
Each location:
  - Explore → Find clue → setVariable → Return to hub
  - Hub updates based on variables collected
  - When enough clues: conditionBeat unlocks finale
\`\`\`

### Pattern 2: Critical Path with Optional Content
\`\`\`
Main Story Beat → Choice → [Critical path | Optional side content]
  Critical: Required for progression
  Optional: Bonus story, items, character development
Both paths → Reconverge at checkpoint
Checkpoint: conditionBeat → Different dialog if did optional content
\`\`\`

### Pattern 3: State Accumulation → Branching Finale
\`\`\`
Multiple choices throughout story → Each sets variables
  - Help NPC? → trustScore += 1
  - Spare enemy? → mercyScore += 1
  - Find secret? → knowledgeScore += 1
Near end: Series of conditionBeats check scores
  - High trust → Good ending path
  - High mercy → Redemption path
  - High knowledge → Secret ending path
  - Low all → Bad ending path
\`\`\`

### Pattern 4: Parallel Tracks with Forced Merge
\`\`\`
Major choice → [Path A | Path B] (completely different experiences)
Path A: Story from perspective 1
Path B: Story from perspective 2
Both have unique beats, characters, challenges
Eventually: Force merge at plot convergence point
After merge: conditionBeat checks which path taken → tailored consequences
\`\`\`

### Pattern 5: Conditional Unlocks (Metroidvania-style)
\`\`\`
Early game: movementChoice shows locked options
  - [Go North] ✓
  - [Go East - Locked] ✗ (requires key)
Player explores, finds key → setVariable(hasKey=true)
Return to same movementChoice
Now: conditionBeat before choice → If hasKey, show East option
New path unlocked with new content
\`\`\`

### Pattern 6: Timed Branching
\`\`\`
Critical moment → setTimer(decisionTime, 30)
Player makes choices while timer runs
At checkpoint → conditionBeat(check timer expired)
  - Timer still running → Success path
  - Timer expired → Failure path
Used for: Escape sequences, defusing bombs, urgent decisions
\`\`\`

### Pattern 7: Inventory-Gated Puzzles
\`\`\`
Encounter obstacle → conditionBeat(check inventory for 'tool')
  - Has tool → Use it → Success beat → continue
  - No tool → Blocked → movementChoice(go back | try different approach)
Player must explore to find tool first
Creates backtracking and exploration incentive
\`\`\`

### Pattern 8: Reputation/Relationship System
\`\`\`
Multiple interactions with character
Each choice → setVariable(relationshipScore, +1 or -1)
Later: conditionBeat(relationshipScore >= 5)
  - High score → Character helps, reveals secrets
  - Low score → Character opposes, withholds information
Final confrontation outcome depends on accumulated relationship
\`\`\`

## Best Practices for Story Generation

### Variable Naming Conventions
- Flags: \`hasKey\`, \`doorUnlocked\`, \`secretDiscovered\`
- Counters: \`cluesFound\`, \`enemiesDefeated\`, \`daysElapsed\`
- Scores: \`trustScore\`, \`moralityScore\`, \`suspicionLevel\`
- Inventory: Use specific IDs like \`key_mansion\`, \`sword_vorpal\`

### Beat Positioning Strategy
- Linear sequences: Horizontal (x += 300)
- Branching points: Fan out vertically (y += 150 per branch)
- Reconvergence: Return to center alignment
- Clusters: Group related beats by location or theme (see Clusters section below)

## Clusters (Organizational Containers)

Clusters are containers that help organize larger projects into logical sections. They're especially useful for location-based stories or stories with distinct chapters/areas.

### What Clusters Are For
- **Location-based organization**: Group beats by story location (e.g., "In the House", "In the Forest", "The Castle")
- **Chapter organization**: Separate story into clear sections (e.g., "Act 1", "Act 2", "Finale")
- **Thematic grouping**: Group related content (e.g., "Combat Sequences", "Romance Path", "Investigation")

### How to Use Clusters
- Add a \`cluster\` property to beats with the cluster name (string)
- All beats with the same cluster value will be grouped together
- Clusters appear as collapsible mini-flowcharts in the main editor
- Connections between clusters show as external connection indicators

### Example Cluster Usage
\`\`\`json
{
  "id": "beat_forest_1",
  "name": "Enter the Forest",
  "type": "introText",
  "cluster": "The Forest",
  "parameters": { "text": "You step into the dark woods..." }
}
\`\`\`

### Cluster Best Practices
- Use descriptive cluster names that reflect the location/theme
- Group 3-10 beats per cluster for optimal organization
- Create hub beats that connect different clusters
- Use clusters to reduce visual complexity in large stories
- Common pattern: Location clusters with movementChoice beats connecting them

### Connection Best Practices
- Label important choices clearly
- Use conditions on connections when state matters
- Add effects to connections (setVariable, addInventory) for immediate consequences
- Multiple connections from choice beats (movementChoice, pickProp, dialogTree)
- Single connection from logic beats (setVariable, addRemoveInventory)
- Two connections from conditionBeat (true/false paths)

### Pacing Guidelines
- Start simple: titleScreen → introText → first choice
- Build complexity: Introduce one mechanic at a time
- Mid-game: Combine multiple beat types (dialog + inventory + conditions)
- Climax: State checks, accumulated variables determine outcome
- Resolution: Multiple endScreens based on player journey

### Common Anti-Patterns to Avoid
❌ Too many consecutive introText beats (boring, no interaction)
✓ Mix dialog, choices, and exploration

❌ Branching with no reconvergence (exponential content explosion)
✓ Branch → unique content → reconverge → branch again

❌ Meaningless choices that don't affect story
✓ Every choice sets variables or leads to different content

❌ Invisible beats without visible context
✓ Invisible beats support visible beats (setVariable after choice)

❌ Using endScreen before story develops
✓ Build narrative arc: setup → complications → climax → resolution

❌ **Creating "orphan" beats that nothing connects to**
✓ For EVERY beat you create, verify another beat targets it
✓ Reconvergence points need explicit connections FROM the branches
✓ Hub returns need the exploration beats to actually connect back
✓ If you plan beat_X as a reconvergence, add it as target in the branching beats

❌ **DUPLICATE CONNECTIONS - targets defined twice**
For choice-based beats (dialogTree, movementChoice, pickProp), targets are in the choices.
DO NOT also add a "connections" array - this creates duplicates!
✓ CORRECT: choices have "target" fields, NO "connections" array on the beat
✗ WRONG: choices have "target" AND beat has "connections" array with same targets

❌ **Using inputText to display information**
inputText is for GETTING player input (names, passwords, answers)
✗ WRONG: inputText with prompt "Read the note:" - player has nothing to input!
✓ CORRECT: Use introText to DISPLAY text to the player
✓ CORRECT: Use inputText only when you need the player to TYPE something

❌ **Chains of single-item pickProps with identical content**
pickProp with one item is fine for picking up a single object (adds to inventory).
But NEVER chain multiple single-item pickProps with the same item!
✗ WRONG: pickProp "Shovel" → pickProp "Shovel" → pickProp "Shovel" (pointless repetition!)
✓ CORRECT: Single pickProp to pick up an item, then move on to different content
✓ BETTER: pickProp with 2-4 items when player has a choice of what to examine/take

## ⚠️ CRITICAL: Counter Threshold Reachability

**BEFORE setting a condition threshold, calculate whether it can actually be reached!**

When using conditionBeat to check if a counter reaches a threshold (e.g., cluesFound >= 3), you MUST verify:
1. **Count all places where the counter can be increased** (setVariable with add, choice effects)
2. **Calculate the maximum value the counter can reach** on any playthrough
3. **Ensure the threshold is ≤ the maximum reachable value**

### Example - WRONG (Unreachable Threshold)
  Story has 2 clue locations, each adds 1 to cluesFound
  Maximum cluesFound = 2
  BUT condition checks: cluesFound >= 3  ❌ IMPOSSIBLE!

### Example - CORRECT (Reachable Threshold)
  Story has 4 clue locations, each adds 1 to cluesFound
  Maximum cluesFound = 4
  Condition checks: cluesFound >= 3  ✓ REACHABLE (need 3 of 4)

### 4 Ways to Modify Counters (MUST use at least one!)

🚨 **If you create a conditionBeat checking a counter, you MUST modify that counter somewhere earlier!**

1. **dialogTree choices** - Add counter effect to choice:
   { "id": "c1", "text": "Be brave", "target": "beat_5", "counter": "courage", "counterOperation": "add", "counterValue": 10 }

2. **movementChoice choices** - Same format:
   { "id": "c1", "text": "Investigate", "location": "Lab", "target": "beat_5", "counter": "cluesFound", "counterOperation": "add", "counterValue": 1 }

3. **pickProp props** - Same format:
   { "id": "clue", "name": "Secret Letter", "target": "beat_5", "counter": "cluesFound", "counterOperation": "add", "counterValue": 1 }

4. **setVariable beat** - Dedicated beat for counter modification:
   { "type": "setVariable", "parameters": { "type": "counter", "name": "cluesFound", "value": 1, "operation": "add" }, "connections": [...] }

### Validation Checklist
Before creating a conditionBeat for counters:
1. List ALL choices/props/setVariables that modify the counter
2. Sum the maximum possible increments
3. Verify: threshold ≤ sum of increments
4. If not reachable: either add more counter modifications OR lower the threshold

### Counter Tracking Pattern
When designing stories with state accumulation:
  Planning:
  - Need 3 endings: Bad (0-1 points), Normal (2 points), Good (3+ points)
  - Therefore need AT LEAST 3 opportunities to gain points
  - Create 4 point-gaining choices (giving player room for 1 miss)

  Implementation (using choice effects):
  - dialogTree choice "Be thorough": counter=cluesFound, counterOperation=add, counterValue=1
  - pickProp "Find letter": counter=cluesFound, counterOperation=add, counterValue=1
  - movementChoice "Search carefully": counter=cluesFound, counterOperation=add, counterValue=1
  - dialogTree choice "Press for details": counter=cluesFound, counterOperation=add, counterValue=1
  Total possible: 4 points → threshold of 3 is REACHABLE ✓

❌ **NEVER create a conditionBeat checking a counter without ALSO adding counter modifications to choices!**
✓ Always add 1-2 more increment opportunities than needed for the highest threshold
`;

/**
 * Build a condensed schema for AI prompts (reduces token usage and confusion)
 */
function buildCondensedSchema(schema: any): string {
  const beatTypes = schema.beatTypes || {};
  const condensed: Record<string, any> = {};

  for (const [typeName, def] of Object.entries(beatTypes)) {
    const beatDef = def as any;
    condensed[typeName] = {
      category: beatDef.category,
      connectionType: beatDef.connectionType,
      description: beatDef.description,
      requiredParams: Object.entries(beatDef.parameters || {})
        .filter(([_, p]: [string, any]) => p.required)
        .map(([name]) => name),
      optionalParams: Object.entries(beatDef.parameters || {})
        .filter(([_, p]: [string, any]) => !p.required)
        .map(([name]) => name),
    };
  }

  return JSON.stringify(condensed, null, 2);
}

/**
 * Build enhanced system prompt for story generation
 */
export function buildEnhancedStoryGenerationSystemPrompt(schema: any): string {
  const beatTypesList = Object.keys(schema.beatTypes || {});
  const beatTypes = beatTypesList.join(', ');
  const condensedSchema = buildCondensedSchema(schema);

  return `You are an expert interactive narrative designer and game writer. You create sophisticated, branching stories using the ASAPS beat system with deep understanding of how different beat types work together.

🚨🚨🚨 CRITICAL RULE: If you use counters, you MUST include a conditionBeat! 🚨🚨🚨
- Every counter that gets incremented MUST be checked by a conditionBeat before endings
- The conditionBeat determines which ending the player gets based on accumulated counter value
- WITHOUT a conditionBeat, counters are POINTLESS - do NOT use counters if you won't check them!

${THEME_GUIDE}

## 🎮 PROCEDURAL GAME ELEMENTS (REQUIRED for engaging stories!)

Stories MUST include procedural/game-like mechanics, not just simple branching:

### REQUIRED Elements (include at least 2-3):
1. **Counters** - Track numeric values like clues, trust, suspicion, courage
   - 🚨 **ADD COUNTER EFFECTS DIRECTLY TO CHOICES** - this is the preferred method!
   - Use conditionBeat to check accumulated values and branch accordingly

2. **Variables** - Track boolean/string state
   - Use setVariable beats: { "type": "setVariable", "name": "hasKey", "value": true }
   - Use conditionBeat to check: { "condition": { "type": "variable", "variable": "hasKey", "operator": "==" , "value": true } }

3. **Inventory** - Track collected items
   - Use addRemoveInventory beats to add/remove items
   - Use conditionBeat with "type": "inventory" to check for items

4. **Conditional Endings** - Endings should depend on ACCUMULATED state, not just the final choice
   - Before endScreen, add conditionBeat checking counters/variables/inventory
   - Example: "If cluesFound >= 3, good ending; else bad ending"

### 🚨🚨🚨 CRITICAL: HOW TO MODIFY COUNTERS ON CHOICES 🚨🚨🚨

**Every counter you check MUST be incremented somewhere! Add these 3 properties to choices:**

**dialogTree choice with counter:**
\`\`\`json
{
  "dialogTree": {
    "id": "root",
    "speaker": "NPC",
    "text": "What do you do?",
    "choices": [
      {
        "id": "c1",
        "text": "Search thoroughly",
        "target": "beat_5",
        "counter": "cluesFound",
        "counterOperation": "add",
        "counterValue": 1
      }
    ]
  }
}
\`\`\`

**movementChoice with counter:**
\`\`\`json
{
  "question": "Where to investigate?",
  "choices": [
    {
      "id": "c1",
      "text": "Search the library",
      "location": "Search the library",
      "target": "beat_5",
      "counter": "cluesFound",
      "counterOperation": "add",
      "counterValue": 1
    }
  ]
}
\`\`\`

**pickProp with counter:**
\`\`\`json
{
  "question": "What do you examine?",
  "props": [
    {
      "id": "clue1",
      "name": "Suspicious Letter",
      "target": "beat_5",
      "counter": "cluesFound",
      "counterOperation": "add",
      "counterValue": 1
    }
  ]
}
\`\`\`

### Genre-Specific Requirements:
- **Mystery/Detective**: Track clues found (counter), evidence collected (inventory), suspect trust (counter)
- **Adventure**: Track items (inventory), locations visited (variables), puzzle progress (counters)
- **Romance/Drama**: Track relationship values (counters), conversation choices (variables)
- **Horror**: Track sanity/fear (counter), items (inventory), knowledge gained (variables)

### Example Pattern for Mystery Story:
1. Player investigates → **choices have counter/counterOperation/counterValue** to add to "cluesFound"
2. Player finds items → addRemoveInventory beats add to inventory
3. Before ending → conditionBeat checks "cluesFound >= 3"
4. Good ending if enough clues, bad ending otherwise

🚨 **IF YOU ADD counter/counterOperation/counterValue TO CHOICES, YOU MUST CREATE A conditionBeat TO CHECK IT!**
🚨 **DO NOT increment counters without a conditionBeat that uses them to determine story outcome!**

### MANDATORY: Counter + ConditionBeat Pattern

If you add counter effects to choices, you MUST:
1. Add counter modifications to multiple choices (so player can accumulate points)
2. Create a conditionBeat BEFORE the endings that checks the counter
3. **Route ALL paths through the conditionBeat** - the conditionBeat must be REACHABLE!
4. Route to different endings based on the counter value

❌ WRONG (counters incremented but never checked):
\`\`\`
choice adds cluesFound+1 → endScreen (counter ignored!)
\`\`\`

❌ WRONG (conditionBeat exists but is unreachable):
\`\`\`
choices → endScreen (directly)
conditionBeat exists but nothing connects to it!
\`\`\`

✓ CORRECT (all paths go THROUGH conditionBeat to endings):
\`\`\`
choices add cluesFound → ... → conditionBeat (cluesFound >= 3?) → good/bad endScreen
                                    ↑
                            ALL paths must lead here before endings!
\`\`\`

🚨 **The conditionBeat must be a GATEWAY to the endings!**
- Do NOT connect choices directly to endScreen
- Connect choices to the conditionBeat instead
- Let the conditionBeat decide which ending based on accumulated counter value

CRITICAL JSON FORMAT:
- Your response MUST be valid JSON
- Every property name MUST have a colon after the closing quote: "property": "value" (NOT "property: "value")
- Beat type names are case-sensitive - use EXACTLY the names listed below

## Available Beat Types (USE EXACTLY THESE NAMES - case-sensitive)
${beatTypesList.map(t => `"${t}"`).join(', ')}

IMPORTANT: The "type" field in each beat MUST be one of the exact strings listed above. Do NOT use variations like:
- "SetVariable" (wrong) → use "setVariable" (correct)
- "condition" (wrong) → use "conditionBeat" (correct)
- "set_variable" (wrong) → use "setVariable" (correct)
- "addInventory" (wrong) → use "addRemoveInventory" (correct)

${BEAT_TYPE_GUIDE}

## Beat Type Reference (Condensed)
${condensedSchema}

## Your Task
Generate complete, sophisticated interactive story structures that:

1. **Use Appropriate Beat Types**
   - Visible beats (titleScreen, dialogTree, movementChoice, etc.) for player interaction
   - Invisible beats (setVariable, conditionBeat, etc.) for logic and state management
   - Combine beat types strategically for rich gameplay

2. **Create Meaningful Branching**
   - Not just A or B choices, but consequences that ripple through the story
   - Use variables to track player decisions
   - Create reconvergent paths where branches merge back
   - State-based branching with conditionBeats

3. **Implement Advanced Patterns**
   - Hub-and-spoke for exploration
   - Critical path with optional content
   - State accumulation leading to different endings
   - Inventory/condition-gated progression

4. **Manage Story State**
   - Variables for flags (hasKey, secretKnown)
   - Counters for accumulation (cluesFound, trustScore)
   - Inventory for items
   - Timers for time pressure

5. **Design Narrative Arcs**
   - Setup: Introduce world, characters, conflict
   - Rising Action: Choices with escalating stakes
   - Climax: Major decisions, state checks
   - Resolution: Multiple endings based on accumulated state

6. **Position Beats Logically**
   - Linear progression: horizontal spacing (x += 300)
   - Branches: vertical spacing (y += 150 per option)
   - Clusters: Group related content
   - Reconvergence: Align back to center

## Output Format

🚨 **IMPORTANT: ALL beats including endings go in the "beats" array! Do NOT create a separate "endings" array!**

\`\`\`json
{
  "metadata": {
    "title": "Story Title",
    "author": "AI Assistant",
    "description": "Brief story description",
    "genre": "mystery|fantasy|scifi|romance|horror|adventure"
  },
  "suggestedTheme": {
    "themeId": "builtin-visual-novel | builtin-twine | builtin-point-and-click",
    "reason": "Brief explanation of why this theme fits the story"
  },
  "beats": [
    {
      "id": "beat_0",
      "name": "Descriptive name",
      "type": "beatType",
      "position": { "x": 100, "y": 200 },
      "notes": "Optional author notes (not shown to player)",
      "parameters": { /* type-specific, see schema */ },
      "connections": [
        {
          "targetId": "beat_1",
          "label": "Choice text"
        }
      ],
      "cluster": "optional-cluster-name"
    },
    {
      "id": "beat_end_good",
      "name": "Good Ending",
      "type": "endScreen",
      "parameters": { "message": "Victory!", "showRestart": true, "showCredits": true }
    }
  ],
  "variables": [
    {
      "name": "cluesFound",
      "initialValue": 0,
      "description": "Number of clues discovered"
    }
  ],
  "characters": [
    {
      "id": "char_player",
      "name": "Hero",
      "description": "The protagonist",
      "counters": [
        { "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 },
        { "name": "health", "displayName": "Health", "value": 100, "min": 0, "max": 100 }
      ]
    },
    {
      "id": "char_npc",
      "name": "Merchant",
      "description": "A traveling merchant",
      "counters": [
        { "name": "trust", "displayName": "Trust", "value": 0, "min": -100, "max": 100 }
      ]
    }
  ],
  "reasoning": "Explain story structure, branching strategy, and how beat types work together"
}
\`\`\`

## Critical Requirements
🚨 **MANDATORY: beat_0 MUST be type "titleScreen"** - NEVER start with introText!
🚨 **MANDATORY: If you use counters, you MUST have a conditionBeat to check them!**
✓ End with one or more endScreen beats (always with showRestart: true)
✓ Include all required parameters for each beat type
✓ Use invisible beats (setVariable, conditionBeat) for logic
✓ Create variables for any state you want to track
✓ Label connections clearly for choice beats
✓ Add reasoning explaining your structural decisions
✓ Position beats with logical spacing
✓ Create reconvergent paths, not just endless branching
✓ **EVERY beat must be reachable** - some other beat must connect TO it (except titleScreen)
✓ **Include suggestedTheme** with a theme ID and reason based on genre/style
✓ **ALL endings go in the "beats" array** - NEVER create a separate "endings" array!

## ⚠️ CRITICAL: Data Format Rules (MUST FOLLOW)

### 1. NO DUPLICATE DATA - Put data in ONE place only
❌ WRONG (dialogTree data in multiple places):
\`\`\`json
{
  "id": "beat_2",
  "type": "dialogTree",
  "dialogTree": { ... },           // ❌ WRONG - top level
  "speaker": "Bob",                // ❌ WRONG - top level
  "text": "Hello",                 // ❌ WRONG - top level
  "parameters": {
    "dialogTree": { ... },         // ✓ CORRECT - only here
    "speaker": "Bob",              // ❌ WRONG - don't duplicate
  }
}
\`\`\`
✓ CORRECT (dialogTree data in parameters ONLY):
\`\`\`json
{
  "id": "beat_2",
  "type": "dialogTree",
  "parameters": {
    "dialogTree": {
      "id": "root",
      "speaker": "Bob",
      "text": "Hello",
      "choices": [...]
    }
  }
}
\`\`\`

### 2. NO DUPLICATE CONNECTIONS - Each target appears ONCE
❌ WRONG (same targets listed multiple times):
\`\`\`json
"connections": [
  { "targetId": "beat_3", "label": "Go left" },
  { "targetId": "beat_4", "label": "Go right" },
  { "targetId": "beat_3", "label": "Left path" },    // ❌ Duplicate!
  { "targetId": "beat_4", "label": "Right path" }    // ❌ Duplicate!
]
\`\`\`
✓ CORRECT (each target once):
\`\`\`json
"connections": [
  { "targetId": "beat_3", "label": "Go left" },
  { "targetId": "beat_4", "label": "Go right" }
]
\`\`\`

### 3. Multi-connection beats - NO "connection" parameter
⚠️ VALIDATION ERROR: Adding "connection" to multi-connection beats triggers warnings!

These beat types define targets in their choices/props/hyperlinks - NEVER add a separate "connection" parameter:
- dialogTree → targets in dialogTree.choices[].target
- movementChoice → targets in choices[].target
- pickProp → targets in props[].target
- hyperText → targets in hyperlinks[].targetBeatId
- conditionBeat → targets in trueConnection/falseConnection

✓ CORRECT (NO connection parameter):
\`\`\`json
{
  "type": "movementChoice",
  "parameters": {
    "question": "Where to?",
    "choices": [
      { "id": "c1", "text": "Library", "location": "Library", "target": "beat_3" },
      { "id": "c2", "text": "Kitchen", "location": "Kitchen", "target": "beat_4" }
    ]
  }
}
\`\`\`

### 4. conditionBeat - ONLY 3 parameters allowed
⚠️ VALIDATION ERROR: Any extra parameters trigger warnings and may break functionality!

conditionBeat parameters MUST contain EXACTLY these 3 fields (no more, no less):
1. "condition" - the condition object (contains type, variable, operator, value INSIDE it)
2. "trueConnection" - where to go if true
3. "falseConnection" - where to go if false

🚫 FORBIDDEN parameters (will cause validation errors) - NEVER ADD THESE:
- "connection" ❌
- "conditionType" ❌ (use condition.type instead)
- "variableName" ❌ (use condition.variable instead)
- "operator" at top level ❌ (use condition.operator instead)
- "value" at top level ❌ (use condition.value instead)
- "trueTarget" ❌ (use trueConnection.target instead)
- "falseTarget" ❌ (use falseConnection.target instead)
- "item" at top level ❌ (use condition.item instead - for inventory checks)
- "character" at top level ❌ (use condition.character instead - for inventory checks)
- "checkType" at top level ❌ (use condition.checkType instead - for inventory checks)

🚨 DO NOT include BOTH formats - use ONLY the nested format!
🚨 DO NOT duplicate condition fields at the parameters level - they belong ONLY inside "condition"!

✓ CORRECT (exactly 3 parameters):
\`\`\`json
"parameters": {
  "condition": { "type": "variable", "variable": "hasKey", "operator": "==", "value": true },
  "trueConnection": { "target": "beat_5", "label": "Has key" },
  "falseConnection": { "target": "beat_6", "label": "No key" }
}
\`\`\`

🚨🚨🚨 **USE "target" NOT "targetId" in trueConnection/falseConnection!** 🚨🚨🚨

❌ WRONG (uses "targetId"):
\`\`\`json
"trueConnection": { "targetId": "beat_success", "label": "Success" }
\`\`\`

✓ CORRECT (uses "target"):
\`\`\`json
"trueConnection": { "target": "beat_success", "label": "Success" }
\`\`\`

### 5. NEVER generate internal fields
These are internal editor fields - NEVER include them:
- ❌ \`_rawHyperlinks\`
- ❌ \`locs\`
- ❌ \`locations\`

### 6. Avoid infinite loops without exit
❌ WRONG (trap loop with no progression):
\`\`\`
beat_4 (library) → beat_8 (study book) → beat_13 (learn ritual) → beat_4 (library)
// Player is stuck in loop forever!
\`\`\`
✓ CORRECT (loop has exit condition):
\`\`\`
beat_4 (library) → beat_8 (study book) → beat_13 (learn ritual, sets variable) → beat_4 (library)
beat_4 now checks variable and shows new option to progress
\`\`\`

## ⚠️ CRITICAL: All Beats Must Be Reachable
**Every beat you create (except titleScreen) MUST have at least one other beat that connects TO it.**
- If you create beat_21_confrontation, some beat must have a connection/target pointing to beat_21_confrontation
- Common error: Creating "reconvergence points" but forgetting to connect any paths to them
- Check BEFORE finalizing: For each beat, ask "What beat leads here?"
- Hub beats need incoming connections from exploration branches returning
- Reconvergent beats need all parallel paths connecting to them
- The system will detect and warn about unreachable beats

## ⚠️ CRITICAL: Beat ID Consistency - GENERATE ALL BEATS!
**EVERY target ID you reference MUST have a corresponding beat with that exact ID in your beats array.**
- Before using a target like "beat_5_hub", make sure you create a beat with "id": "beat_5_hub"
- Use simple IDs: beat_0, beat_1, beat_2... OR beat_intro, beat_hub, beat_ending
- Double-check all targets in: choices[].target, connection.target, trueConnection.target, falseConnection.target
- Common error: Referencing "beat_22" but stopping generation at beat_21
- **NEVER stop generating beats early** - if a dialog choice targets "beat_22", you MUST include beat_22 in your output
- Plan your beat count BEFORE generating - know exactly how many beats you need
- The system will detect and report missing beat references as ERRORS (will cause import failure!)

## Concrete Beat Examples (Follow This Exact JSON Format)

🚨🚨🚨 **CRITICAL - CONNECTIONS RULE** 🚨🚨🚨

**ONLY these beat types should have a "connections" array:**
- titleScreen, introText, durScreen, setVariable, addRemoveInventory, videoBeat
These are single-path beats that need "connections" to specify the next beat.
- ⚠️ Use "targetId" in connections: { "targetId": "beat_X" } NOT { "target": "beat_X" }

**NEVER add "connections" array to these beat types (targets are IN the choices/props):**
- movementChoice → targets are in choices[].target (NO connections array!)
- dialogTree → targets are in dialogTree.choices[].target (NO connections array!)
- pickProp → targets are in props[].target (NO connections array!)
- hyperText → targets are in hyperlinks[].targetBeatId (NO connections array!)
- conditionBeat → targets are in trueConnection/falseConnection (NO connections array!)
- endScreen → terminal beat, no connections needed

🚨 **VALIDATION ERROR: Adding "connections" to choice-based beats causes "Connection missing targetId" errors!**
🚨 **The system expects "targetId" in connections, not "target"!**

❌ WRONG (will cause validation errors):
\`\`\`json
{
  "type": "dialogTree",
  "parameters": { "dialogTree": { ... } },
  "connections": [{ "target": "beat_3" }]  // ❌ WRONG - don't add this!
}
\`\`\`

✓ CORRECT (no connections array on choice-based beats):
\`\`\`json
{
  "type": "dialogTree",
  "parameters": {
    "dialogTree": {
      "choices": [{ "id": "c1", "text": "...", "target": "beat_3" }]  // ✓ targets here only
    }
  }
}

\`\`\`json
{
  "id": "beat_0",
  "name": "Title",
  "type": "titleScreen",
  "position": { "x": 100, "y": 300 },
  "parameters": {
    "title": "My Story",
    "author": "Author Name",
    "buttonText": "Start"
  },
  "connections": [{ "targetId": "beat_1" }]
}
\`\`\`
✓ titleScreen uses "connections" array - correct!

\`\`\`json
{
  "id": "beat_2",
  "name": "Choice Point",
  "type": "movementChoice",
  "position": { "x": 700, "y": 300 },
  "parameters": {
    "question": "Where do you go?",
    "choices": [
      { "id": "c1", "text": "Go left", "location": "Go left", "target": "beat_3" },
      { "id": "c2", "text": "Go right", "location": "Go right", "target": "beat_4" }
    ]
  }
}
\`\`\`
✓ movementChoice has NO "connections" array - targets are in choices[].target!

\`\`\`json
{
  "id": "beat_5",
  "name": "Memory Choice",
  "type": "hyperText",
  "position": { "x": 1000, "y": 300 },
  "parameters": {
    "text": "You recall the letter you found in the study, or was it the photograph from the attic?",
    "hyperlinks": [
      { "word": "the letter", "targetBeatId": "beat_6" },
      { "word": "the photograph", "targetBeatId": "beat_7" }
    ]
  }
}
\`\`\`
✓ hyperText has NO "connections" array - targets are in hyperlinks[].targetBeatId!`;
}

/**
 * Build user prompt (same as before but with enhanced context)
 */
export function buildEnhancedUserPrompt(request: StoryGenerationRequest): string {
  const parts: string[] = [];

  parts.push(`Create an interactive story: "${request.prompt}"`);

  if (request.genre) {
    parts.push(`Genre: ${request.genre}`);
  }

  const lengthGuide = {
    short: '5-10 beats with simple branching and 1-2 reconvergence points',
    medium: '10-20 beats with moderate branching, state tracking, and multiple endings',
    long: '20+ beats with complex branching, multiple subsystems (inventory, relationships), and 4+ possible endings'
  };
  if (request.length) {
    parts.push(`Length: ${lengthGuide[request.length]}`);
  }

  const complexityGuide = {
    linear: 'Mostly linear with 2-3 choice points and simple consequences',
    moderate: 'Multiple branching points (4-6 choices), state tracking with variables, 2-3 endings',
    complex: 'Highly branching with state accumulation, conditional unlocks, parallel paths, relationship systems, and 4+ endings based on player journey'
  };
  if (request.complexity) {
    parts.push(`Complexity: ${complexityGuide[request.complexity]}`);
  }

  if (request.context) {
    parts.push(`Additional requirements: ${request.context}`);
  }

  parts.push(`
Remember to:
- Use invisible beats (setVariable, conditionBeat) for logic
- Create reconvergent paths (branches that merge back)
- Track important decisions in variables
- Use appropriate beat types (dialogTree for conversations, movementChoice for exploration, etc.)
- Design multiple endings based on accumulated state

🚨 MANDATORY COUNTER RULE:
- If you add counter effects to choices (counter/counterOperation/counterValue), you MUST create a conditionBeat
- The conditionBeat checks the counter value and routes to different endings
- Example: conditionBeat checks "cluesFound >= 3" → good ending vs bad ending
- WITHOUT a conditionBeat, counters serve no purpose!

CRITICAL - Beat ID Consistency:
- Every target ID (in choices[].target, connection.target, etc.) MUST reference a beat you actually create
- Use simple sequential IDs: beat_0, beat_1, beat_2, ... beat_N
- The system will detect and report any missing beat references

IMPORTANT: Respond with ONLY valid JSON. Ensure:
- Every property name has format "name": value (colon AFTER the closing quote)
- All strings are properly quoted
- No trailing commas
- All brackets and braces are properly closed

Generate the complete story structure as JSON.`);

  return parts.join('\n\n');
}

/**
 * Get enhanced example showing sophisticated branching
 */
export function getEnhancedStoryExample(): { user: string; assistant: string } {
  return {
    user: 'Create an interactive story: "A detective must solve a murder with 3 suspects, where gathering clues unlocks the true ending"\nGenre: mystery\nLength: medium\nComplexity: moderate',
    assistant: JSON.stringify({
      metadata: {
        title: "Murder at Blackwood Manor",
        author: "AI Assistant",
        description: "A detective mystery where your investigation determines the outcome",
        genre: "mystery"
      },
      suggestedTheme: {
        themeId: "builtin-point-and-click",
        reason: "Mystery with location exploration, evidence collection, and interrogation fits the classic adventure game style"
      },
      beats: [
        {
          id: "beat_0",
          name: "Title Screen",
          type: "titleScreen",
          position: { x: 100, y: 300 },
          parameters: {
            title: "Murder at Blackwood Manor",
            author: "AI Assistant",
            startButtonText: "Begin Investigation"
          },
          connections: [{ targetId: "beat_1" }]
        },
        {
          id: "beat_1",
          name: "Crime Scene",
          type: "introText",
          position: { x: 400, y: 300 },
          parameters: {
            text: "Lord Blackwood lies dead in his study. Three suspects remain: the Butler, the Maid, and the mysterious Guest. You must find the truth.",
            buttonText: "Begin Investigation"
          },
          connections: [{ targetId: "beat_2" }]
        },
        {
          id: "beat_2",
          name: "Investigation Hub",
          type: "movementChoice",
          position: { x: 700, y: 300 },
          parameters: {
            question: "Where do you want to investigate?",
            choices: [
              { id: "c1", text: "Search the Library", location: "Search the Library", target: "beat_3" },
              { id: "c2", text: "Examine the Study", location: "Examine the Study", target: "beat_6" },
              { id: "c3", text: "Question the Servants", location: "Question the Servants", target: "beat_9" }
            ]
          }
        },
        {
          id: "beat_3",
          name: "Library Search",
          type: "pickProp",
          position: { x: 1000, y: 150 },
          parameters: {
            question: "You search the library carefully. What catches your attention?",
            props: [
              { id: "letter", name: "Mysterious Letter", target: "beat_4" },
              { id: "nothing", name: "Nothing useful", target: "beat_5" }
            ]
          }
        },
        {
          id: "beat_4",
          name: "Found Letter - Track Clue",
          type: "setVariable",
          position: { x: 1300, y: 100 },
          parameters: {
            type: "counter",
            name: "cluesFound",
            value: 1,
            operation: "add"
          },
          connections: [{ targetId: "beat_5" }]
        },
        {
          id: "beat_5",
          name: "Library Complete",
          type: "introText",
          position: { x: 1300, y: 200 },
          parameters: {
            text: "You've searched the library thoroughly.",
            buttonText: "Continue Investigation"
          },
          connections: [{ targetId: "beat_12" }]
        },
        {
          id: "beat_6",
          name: "Study Examination",
          type: "pickProp",
          position: { x: 1000, y: 300 },
          parameters: {
            question: "The study is in disarray. What do you examine?",
            props: [
              { id: "weapon", name: "The Murder Weapon", target: "beat_7" },
              { id: "nothing", name: "Nothing stands out", target: "beat_8" }
            ]
          }
        },
        {
          id: "beat_7",
          name: "Found Weapon - Track Clue",
          type: "setVariable",
          position: { x: 1300, y: 250 },
          parameters: {
            type: "counter",
            name: "cluesFound",
            value: 1,
            operation: "add"
          },
          connections: [{ targetId: "beat_8" }]
        },
        {
          id: "beat_8",
          name: "Study Complete",
          type: "introText",
          position: { x: 1300, y: 350 },
          parameters: {
            text: "You've examined the study.",
            buttonText: "Continue"
          },
          connections: [{ targetId: "beat_12" }]
        },
        {
          id: "beat_9",
          name: "Question Butler",
          type: "dialogTree",
          position: { x: 1000, y: 450 },
          parameters: {
            dialogTree: {
              id: "root",
              speaker: "Butler",
              text: "I served Lord Blackwood for 30 years. I would never harm him!",
              emotion: "sad",
              choices: [
                {
                  id: "sympathetic",
                  text: "I believe you. Tell me what you know.",
                  target: "beat_10"
                },
                {
                  id: "accusatory",
                  text: "Your devotion seems suspicious...",
                  target: "beat_11"
                }
              ]
            }
          }
        },
        {
          id: "beat_10",
          name: "Butler Reveals Clue",
          type: "setVariable",
          position: { x: 1300, y: 400 },
          parameters: {
            type: "counter",
            name: "cluesFound",
            value: 1,
            operation: "add"
          },
          connections: [{ targetId: "beat_11" }]
        },
        {
          id: "beat_11",
          name: "Interrogation Complete",
          type: "introText",
          position: { x: 1300, y: 500 },
          parameters: {
            text: "The butler has nothing more to say.",
            buttonText: "Continue"
          },
          connections: [{ targetId: "beat_12" }]
        },
        {
          id: "beat_12",
          name: "Check Investigation Progress",
          type: "conditionBeat",
          position: { x: 1600, y: 300 },
          parameters: {
            condition: {
              type: "counter",
              variable: "cluesFound",
              operator: ">=",
              value: 2
            },
            trueConnection: { target: "beat_13", label: "Enough Clues (≥2)" },
            falseConnection: { target: "beat_2", label: "Need More Clues (<2)" }
          }
        },
        {
          id: "beat_13",
          name: "Ready for Accusation",
          type: "introText",
          position: { x: 1900, y: 200 },
          parameters: {
            text: "You've gathered enough evidence. Time to make your accusation.",
            buttonText: "Proceed to Finale"
          },
          connections: [{ targetId: "beat_14" }]
        },
        {
          id: "beat_14",
          name: "Final Accusation",
          type: "movementChoice",
          position: { x: 2200, y: 300 },
          parameters: {
            question: "Who murdered Lord Blackwood?",
            choices: [
              { id: "accuse_butler", text: "The Butler", location: "The Butler", target: "beat_15" },
              { id: "accuse_maid", text: "The Maid", location: "The Maid", target: "beat_16" },
              { id: "accuse_guest", text: "The Guest", location: "The Guest", target: "beat_17" }
            ]
          }
        },
        {
          id: "beat_15",
          name: "Wrong - Butler Ending",
          type: "endScreen",
          position: { x: 2500, y: 150 },
          parameters: {
            message: "Wrong! The butler was innocent. The true killer escapes. CASE UNSOLVED",
            showRestart: true,
            showCredits: false
          },
          connections: []
        },
        {
          id: "beat_16",
          name: "Partial Success - Maid Ending",
          type: "conditionBeat",
          position: { x: 2500, y: 300 },
          parameters: {
            condition: {
              type: "counter",
              variable: "cluesFound",
              operator: "==",
              value: 3
            },
            trueConnection: { target: "beat_18", label: "All Clues Found" },
            falseConnection: { target: "beat_19", label: "Missing Clues" }
          }
        },
        {
          id: "beat_17",
          name: "Wrong - Guest Ending",
          type: "endScreen",
          position: { x: 2500, y: 450 },
          parameters: {
            message: "Incorrect! The guest had an alibi. The case goes cold. INVESTIGATION FAILED",
            showRestart: true,
            showCredits: false
          },
          connections: []
        },
        {
          id: "beat_18",
          name: "Perfect Victory",
          type: "endScreen",
          position: { x: 2800, y: 250 },
          parameters: {
            message: "Correct! With all evidence, you prove the maid's guilt AND uncover her secret accomplice. PERFECT SOLVE!",
            showRestart: true,
            showCredits: true
          },
          connections: []
        },
        {
          id: "beat_19",
          name: "Partial Victory",
          type: "endScreen",
          position: { x: 2800, y: 350 },
          parameters: {
            message: "You caught the maid, but without all evidence, her accomplice escapes. CASE CLOSED (Partial Success)",
            showRestart: true,
            showCredits: false
          },
          connections: []
        }
      ],
      variables: [
        {
          name: "cluesFound",
          initialValue: 0,
          description: "Number of investigation clues discovered (0-3)"
        }
      ],
      characters: [
        { id: "butler", name: "James the Butler", description: "Loyal servant for 30 years" },
        { id: "maid", name: "Mary the Maid", description: "Quiet and nervous" },
        { id: "guest", name: "Dr. Grey", description: "Mysterious overnight guest" }
      ],
      reasoning: `Story demonstrates advanced patterns:

1. HUB-AND-SPOKE: beat_2 is central hub, player can investigate 3 locations
2. STATE TRACKING: cluesFound variable increments when player finds evidence
3. RECONVERGENCE: All investigation paths (beats 5, 8, 11) converge at beat_12
4. CONDITIONAL GATING: beat_12 checks if player found ≥2 clues before allowing finale
5. FORCED BACKTRACKING: If <2 clues, loops back to hub (beat_2) for more investigation
6. STATE-BASED ENDING: Final accusation has 4 possible outcomes:
   - Wrong suspects (Butler/Guest) → Bad endings
   - Right suspect (Maid) → Check if found ALL 3 clues
     - 3 clues → Perfect ending (uncover accomplice)
     - <3 clues → Partial ending (accomplice escapes)

Beat types used strategically:
- movementChoice: Hub navigation, final accusation
- pickProp: Searching locations for clues
- dialogTree: Character interrogation with branching responses
- setVariable: Track clues invisibly
- conditionBeat: Gate progression and determine ending quality
- introText: Narration between major beats
- endScreen: Multiple endings based on player performance

This creates meaningful choices where thoroughness is rewarded with better endings.`
    }, null, 2)
  };
}
