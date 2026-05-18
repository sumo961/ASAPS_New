/**
 * Enhanced Story Generation Prompts
 *
 * Comprehensive templates with deep beat type understanding and advanced branching patterns
 */

import type { StoryGenerationRequest } from '../../types/ai';
import { buildAffectPromptSection, type AffectDepth } from '@asaps/core';

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
  - title: Keep SHORT — 2-5 words, ≤40 characters. Single line in a
    hero-sized box; long titles ("The Quiet Weight of Her Many Voices in
    a Time of Silence", 56 chars) wrap to two lines and crowd the
    subtitle below. "The Weight of Her Voice", "How to Hold Someone",
    "The Silent Archive" — punchy, evocative, short.
  - author: A short subtitle or byline, also ≤40 characters. Same
    one-line constraint.
- Connections: Single → first story beat (usually infoText)
- ⚠️⚠️⚠️ CRITICAL: beat_0 MUST ALWAYS be type "titleScreen"!
- ❌ WRONG: Starting with infoText, dialogTree, or any other beat type
- ✓ CORRECT: beat_0 is titleScreen → beat_1 is infoText or other content
- Example: titleScreen "The Mystery Begins" → infoText "You arrive..."

**infoText** - Display text with continue button (SINGLE CONNECTION ONLY!)
- Use: Narration, scene setting, exposition
- Parameters: text, buttonText, backgroundAssetId
- Optional: textVariations (array of alternative texts) - one is randomly selected at runtime
  Example: { "text": "Hello!", "textVariations": ["Hi there!", "Greetings!"] }
  At runtime, randomly selects from: ["Hello!", "Hi there!", "Greetings!"]
- Connections: Single → next beat (ONLY ONE connection allowed!)
- ⚠️ CRITICAL: infoText can ONLY connect to ONE beat!
- ❌ WRONG: infoText with 2+ connections (use dialogTree for branching!)
- ✓ CORRECT: infoText → one target beat
- For branching choices, use dialogTree (DEFAULT — shows visible buttons). Only use movementChoice if the choices are spatial hotspots on a background image.
- Example: "You arrive at the mansion..." → dialogTree (shallow, empty speaker, text as scene, top-level choices as options)

**durScreen** - Timed auto-advance text
- Use: Quick transitions, atmosphere, montages
- Parameters: text, duration (in SECONDS, fractional allowed) - NO connection inside parameters!
- ⚠️ CRITICAL: duration MUST be proportional to the text length, not a flat value. The screen auto-advances with NO continue button, so the reader must be able to finish reading. Compute it: duration ≈ ceil(wordCount / 200 * 60 * 1.5), with a minimum of 3. A flat small value (e.g. always 3 or 6) makes longer paragraphs flash past unread — this is a real, repeated generation bug. Examples by length: ~10 words → 5s; ~25 words → 12s; ~40 words → 18s; ~55 words → 25s; ~80 words → 36s.
- Optional: textVariations (array of alternative texts) - one is randomly selected at runtime
  Example (12 words → ~6s): { "text": "Months pass. The correspondence resumes, but the rhythm between them has changed.", "duration": 6 }
- ⚠️ NOTE: durScreen does NOT support backgroundAssetId - use infoText if you need a background
- ⚠️ CRITICAL: Connection goes in "connections" array at beat level, NOT inside parameters!
- ❌ WRONG: "parameters": { "text": "...", "duration": 3, "connection": { "target": "beat_5" } }
- ✓ CORRECT: "parameters": { "text": "...", "duration": 3 }, "connections": [{ "targetId": "beat_5" }]
- Connections: Single → auto-advances after duration
- Example: "Three days later..." (3s) → dialogTree

**dialogTree** - Branching choices (DEFAULT for presenting multiple options to the player!)
- 🚨 PREFERRED CHOICE BEAT: Use dialogTree for ANY situation where you want to present 2+ options to the player — conversations, decisions, actions, reactions, story branches.
- Why: dialogTree shows choices directly as visible buttons. movementChoice uses invisible hotspots by default and is confusing for most content.
- Use: Character interactions, interrogations, negotiations, AND general "what do you do?" branching
- Pattern for simple multi-choice (no NPC): set speaker to "" (empty), text to the scene description / question, and put the 2-4 options as top-level choices. This is a "shallow dialogTree" and is the DEFAULT way to present choices.
- Example (shallow, for general branching):
  { "dialogTree": { "id": "root", "speaker": "", "text": "You stand at a crossroads. Three paths lie before you.", "choices": [
    { "id": "c1", "text": "Take the forest path", "target": "beat_forest" },
    { "id": "c2", "text": "Follow the river", "target": "beat_river" },
    { "id": "c3", "text": "Climb the mountain", "target": "beat_mountain" }
  ] } }
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
- Optional parameters:
  - choiceDelay: seconds before choices fade in (creates suspense)
  - presentationMode: "positioned" (default) | "chat-scroll" (scrollable chat) | "chat-bubble" (single bubble)
  - markVisited: true to block and dim choices leading to previously visited beats
- 🚨 DO NOT enable markVisited on hub beats the player must return to (investigation hubs, shops, menus, decision loops). It makes each option one-shot and can leave the story unsolvable. Only enable markVisited on beats representing a truly one-way decision.
- ⚠️ WRONG: { "dialogTree": { "root": { ... } } } - NO extra "root" wrapper!
- choice: { id, text, target? | dialogNode? } - What player clicks (text IS the player's line)
- target (string): Beat ID to exit dialog
- dialogNode (nested): NPC responds, conversation continues
- Connections: Multiple → based on dialog choices leading to beat targets
- COUNTER EFFECTS: Choices can modify counters
  { "id": "c1", "text": "I'll help you!", "target": "beat_5", "counter": "trust", "counterOperation": "change", "counterValue": 5 }
- SOUND EFFECTS: Choices can play a sound when selected
  { "id": "c1", "text": "I accept your offer.", "target": "beat_5", "soundEffect": "handshake.mp3" }
- IMPORTANT: Choice text IS what the player says. Never use "[Continue]" - use actual dialogue.
- NPC AUTO-EXIT: A dialog node can have a "target" field to auto-advance WITHOUT showing choices:
  - The NPC delivers the text, then the story auto-advances to the target beat
  - Useful for: NPC dismissals, forced exits, NPC-initiated endings
  - When "target" is set on a node, any choices on that node are ignored
  - Example: { "id": "n1", "speaker": "Guard", "text": "Go away!", "target": "beat_kicked_out", "choices": [] }
  - Use target: "__self__" on a node to loop back to the root of the same dialogTree beat
- RECURSIVE DIALOGS: A choice can use target: "__self__" to loop back to the SAME dialogTree beat:
  - Useful for: interrogation, browsing a shop, asking multiple questions before leaving
  - The dialog re-displays with the same speaker/text and choices
  - Combine with per-choice visited tracking (markVisited: true) to gray out already-asked questions
  - Example: { "id": "c_ask_name", "text": "What's your name?", "target": "__self__" }
  - At least one choice should have a real target to exit the loop
- Example: NPC asks question → [Player response A | Player response B] → NPC responds

**movementChoice** - Spatial navigation via on-scene hotspots (SPECIALIZED — not the default!)
- 🚨 DO NOT use movementChoice as a generic "multiple choices" beat. Use dialogTree instead for that.
- movementChoice renders choices as INVISIBLE HOTSPOTS placed on a background scene. Players have to hover or click on regions of the image to reveal them. This is confusing when there's no meaningful spatial layout.
- Only use movementChoice when: the scene has a background image AND each choice maps to a spatial location in that image (e.g., clicking on the library door, the staircase, the garden gate). If the choices are abstract (actions, answers, decisions), use dialogTree.
- Use: Exploration on a visual map/scene where clicking parts of the image is the point
- When in doubt: use dialogTree.
- Parameters: question, choices (array of {id, text, location, target})
  - id: Unique identifier for the choice (e.g., "choice_library", "c1")
  - text: What the player sees (e.g., "Go to the Library")
  - location: Hover/tooltip text - ALWAYS set this to same value as text!
  - target: Beat ID to navigate to
- ⚠️ IMPORTANT: Always include "location" field - copy the "text" value to it!
  Example: { "id": "c1", "text": "Go to the Library", "location": "Go to the Library", "target": "beat_3" }
- Optional parameters:
  - choiceDelay: seconds before choices fade in (creates suspense)
  - markVisited: true to block and dim choices leading to previously visited beats
  - 🚨 DO NOT enable markVisited on a movementChoice hub the player must return to (rooms in an investigation, floors in a building). It silently makes the story unsolvable. Only enable on truly one-way spatial moves.
  - showTextOnHover: true to only show choice text when hovering over the hotspot
- Connections: Multiple → one per choice
- COUNTER EFFECTS: Choices can modify counters (same as dialogTree)
  { "id": "c1", "text": "Take the dangerous path", "target": "beat_danger", "counter": "courage", "counterOperation": "change", "counterValue": 5 }
- SOUND EFFECTS: Choices can play a sound when selected
  { "id": "c1", "text": "Enter the cave", "target": "beat_cave", "soundEffect": "cave_echo.mp3" }
- Example: "Where to go?" → [Library | Kitchen | Garden] → 3 different beats

**pickProp** - Object/item selection (NOT for action choices!)
- Use: Selecting physical ITEMS/OBJECTS, NOT for navigation or actions
- 🚨 **AUTO-INVENTORY**: pickProp AUTOMATICALLY adds the selected prop's "name" to player inventory!
  - DO NOT follow pickProp with addRemoveInventory - this creates DUPLICATE inventory items!
  - The player will see both "Silver Key" (from pickProp) and "silver_key" (from addRemoveInventory)
  - ✓ CORRECT: pickProp → infoText describing what you found
  - ✗ WRONG: pickProp → addRemoveInventory (creates duplicates!)
- Parameters: question (REQUIRED!), props (array of {id, name, displayName, description, target})
  - question: Text prompt asking what to pick (REQUIRED - e.g., "What do you examine?")
  - name: Internal identifier for the item (used in inventory conditions) - noun phrase only, no verbs!
  - displayName: Player-visible label for the item (used for translation). If omitted, "name" is shown.
  - description: RECOMMENDED - Brief description of the item (shown to player when selecting)
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
- Optional parameters:
  - choiceDelay: seconds before props fade in (creates suspense)
  - markVisited: true to show visual indication for props leading to already-visited beats
- COUNTER EFFECTS: Props can modify counters when selected
  { "id": "sword", "name": "Rusty Sword", "description": "A weathered blade with strange markings", "target": "beat_armed", "counter": "confidence", "counterOperation": "change", "counterValue": 3 }
- SOUND EFFECTS: Props can play a sound when selected
  { "id": "coins", "name": "Gold Coins", "description": "A heavy pouch of gold coins", "target": "beat_rich", "soundEffect": "coin_pickup.mp3" }
- ⚠️ For action choices (verbs), use movementChoice instead!
- ⚠️ For leaving/continuing without picking anything, use a separate connection or movementChoice
- Example: "What do you pick up?" → [Silver Key | Old Book | Lantern] → each leads to different beat

🚨🚨🚨 **MANDATORY: DESCRIBE ITEMS AFTER PICKUP!** 🚨🚨🚨
Every pickProp choice MUST lead to an infoText that describes what the player learns from the item!
Players need narrative payoff - don't just silently add items to inventory!

❌ WRONG (item picked but never described):
  pickProp "Old Photograph" → movementChoice "Where next?"
  Problem: Player has no idea what the photograph shows!

✓ CORRECT (item described after pickup):
  pickProp "Old Photograph" → infoText "The photograph shows a young girl standing in front of a farmhouse. In the distance, snow-capped mountains loom. On the back, someone has written 'Blackwood Estate, 1923' in faded ink." → movementChoice

### Item Description Pattern (REQUIRED for every pickProp choice):
\`\`\`
pickProp beat:
  - "Old Photograph" → beat_photo_desc
  - "Dusty Letter" → beat_letter_desc
  - "Strange Key" → beat_key_desc

beat_photo_desc (infoText):
  text: "The photograph shows a family portrait - but one face has been scratched out violently. The date on the back reads 1952."
  → continues to next beat

beat_letter_desc (infoText):
  text: "The letter is addressed to 'My Dearest E.' and speaks of a secret meeting at midnight. The handwriting is elegant but hurried."
  → continues to next beat

beat_key_desc (infoText):
  text: "The key is ornate, with a strange symbol etched into the handle - the same symbol you saw above the basement door."
  → continues to next beat
\`\`\`

Good item descriptions should:
- Reveal story details (names, dates, places, relationships)
- Hint at mysteries or connections to other elements
- Give the player information they can use later
- Create atmosphere and immersion

### 🚨 Investigation Loop Pattern (PREFERRED for "examine a room with multiple clues")

When the player is searching a single location for clues, DO NOT force them back to a higher hub after each pickup — that violates real-life equivalency (nobody leaves a room after finding only one clue). Instead, loop the pickProp back to itself via the item-description infoText:

\`\`\`
pickProp beat_examine_study:
  question: "What do you examine in the study?"
  props:
    - "Bloodstained Letter" → beat_letter_desc
    - "Desk Drawer" → beat_drawer_desc
    - "Portrait on the Wall" → beat_portrait_desc
    - "Leave the study" → beat_hallway   ← one explicit exit

beat_letter_desc (infoText):
  text: "The letter is addressed to..."
  → target: beat_examine_study   ← LOOP BACK to the same pickProp
\`\`\`

The player keeps picking until they've seen everything, then chooses the explicit "Leave" option. Combine this with markVisited: true ONLY on the pickProp itself so already-examined items are dimmed but not blocked — OR leave markVisited off and let the player re-read.

### 🚨 Recoverable Gates (MANDATORY)

Every beat that gates progress on a flag, item, or counter MUST be recoverable. If a conditionBeat or choice requires \`hasCryptKey\`, at least one path reachable from the player's current location must lead to a beat that sets \`hasCryptKey\`. Never author a gate whose requirement is only available on a branch the player may already have skipped.

Concrete rules:
- If a choice is "enter the crypt (needs the key)," also offer "go back and find the key" from the same beat.
- If an ending requires a counter value the player may have under-accumulated, include a late-game beat that can raise the counter, or make the fallback ending still meaningful.
- Never build dead-end branches where the player must restart the whole story to try again.

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
- 🚨 FOR CODE/PASSWORD PUZZLES: inputText MUST connect TO a conditionBeat!
  - inputText stores player input → connection points to conditionBeat
  - conditionBeat checks if input matches correct answer
  - See Pattern 8: Code/Password Puzzle for complete example
  - ⚠️ For numeric codes, prefer keypad over inputText — visual keypad is more immersive!

🚨 GENERIC BEAT ANNOTATION: "requires" (use on any beat that gates progress)

Any beat can declare state prerequisites via "requires" on its parameters. These are
analyzer-facing annotations: the path analyzer uses them to flag soft-locks and
unreachable gates. Use this whenever a beat should only be meaningfully entered after
narrative setup. Typical pairing:
  - code-revealing pickProp/infoText: effects = [{ type:"setVariable", target:"knowsCode", value:true }]
  - keypad that consumes that code: requires = [{ condition: { type:"variable", variableName:"knowsCode", operator:"==", value:true }, explanation:"..." }]
Combine with a conditionBeat that actually routes the player if the requirement is unmet.

Example requires entry:
  "requires": [
    { "condition": { "type": "variable", "variableName": "knowsCode", "operator": "==", "value": true },
      "explanation": "Player must have read the code from the note." }
  ]

The condition field accepts the same types as conditionBeat
(variable, counter, inventory, visitedBeat, counterCompare, fictionalTime).
Severity: "error" (default) means the gate is broken without this; "warn" means soft.

**keypad** - Numeric keypad input (safe locks, PIN entry, phone dialers)
- Use: Entering codes, unlocking safes, dialing phones, PIN verification
- Parameters:
  - prompt: Text asking the player for input (REQUIRED)
  - layout: "numeric" (0-9 grid) | "phone" (phone-style with * #) | "pin" (PIN pad)
  - maxDigits: Maximum digits allowed (default: 4)
  - minDigits: Minimum digits required (default: 1)
  - correctCode: If set, auto-validates input. Wrong code → failTarget
  - failTarget: Beat ID to go to on wrong code
  - maxAttempts: Max wrong attempts before forced to failTarget (0 = unlimited)
  - maskInput: boolean (default true) — show dots instead of digits
  - saveToType: "variable" (default) or "counter"
  - variable: Variable name to store input (default: "keypadInput")
  - buttonText: Submit button text (default: "Enter")
  - clearButtonText: Clear button text (default: "Clear")
- Connections: Single → after correct code or submit
- ⚠️ For code puzzles, prefer keypad over inputText — visual keypad is more immersive!

🚨 CRITICAL KEYPAD RULES (required to avoid soft-locks):

1) failTarget MUST lead to an ESCAPE, never loop back to the keypad with no state change.
   ❌ WRONG: keypad.failTarget = "beat_wrong_code" → infoText "Try again" → back to keypad.
      (This is an infinite loop for players who don't know the code.)
   ✓ RIGHT: failTarget leads to either (a) an endScreen explaining the failure,
      (b) a beat that sends the player back to find the code,
      or (c) a counter-degrading chain where another condition eventually triggers recovery.

2) If the code is narrative-earned (player must have read/been told it), declare a "requires":
     "requires": [{
       "condition": { "type": "variable", "variableName": "knowsCode", "operator": "==", "value": true },
       "explanation": "Player must have read the combination from the safe deposit note."
     }]
   AND set that flag in the code-revealing beat's effects:
     { "type": "setVariable", "target": "knowsCode", "value": true }
   AND put a conditionBeat in front of the keypad checking the flag.
   If the flag is false, the conditionBeat should send the player somewhere helpful (not into the keypad).

3) maxAttempts: 0 (unlimited tries) is only valid if the failure chain mutates state
   that some other condition reads (e.g. "+1 dread", then elsewhere a check on dread ≥ N
   triggers an alternate branch). Otherwise use maxAttempts 3+ with a real failTarget.

- Example: Safe combination puzzle (well-formed):
  {
    "type": "keypad",
    "parameters": {
      "prompt": "Enter the safe code:",
      "layout": "numeric",
      "maxDigits": 4,
      "correctCode": "1847",
      "failTarget": "beat_out_of_attempts",
      "maxAttempts": 3,
      "maskInput": true,
      "requires": [{
        "condition": { "type": "variable", "variableName": "knowsCode", "operator": "==", "value": true },
        "explanation": "Player must have seen the code on the note."
      }]
    }
  }

**endScreen** - Story conclusion (ACTUAL BEATS in the beats array!)
- Use: Ending (victory, defeat, various endings)
- Parameters:
  - message: "Ending text"  ← NOT "endMessage" or "text"!
  - showRestart: boolean (ALWAYS set to true so player can replay!)
  - reset: boolean (ALWAYS set to true — see below)
  - showCredits: boolean — show a credits button
  - creditsPageTitle: Title for the credits page (default: "Credits")
  - creditsPageBody: Body text of the credits page (supports line breaks)
  - creditsCloseText: Close button text on credits page (default: "Close")
  - creditsText: Label for the credits button (default: "Credits")
- ⚠️ CRITICAL: Use "message", NOT "endMessage"!
- ⚠️ CRITICAL: ALWAYS set "showRestart": true - player must be able to replay!
- 🚨 CRITICAL: ALWAYS set "reset": true — otherwise counters and variables LEAK between replays, which can make counter-gated endings "ghost-reachable" on a second playthrough (player replays, counter adds on top of previous run, crosses threshold, surprise ending). reset:true wipes counters, variables, inventory, and visited tracking on restart, which is nearly always what you want.
- 🚨 CRITICAL: When showRestart is true, you MUST add a connection back to the titleScreen (beat_0) so the restart button works and shows up as a graph edge. Example: "connections": [{ "targetId": "beat_0" }]
- Pattern: Multiple endScreens for different endings
- 🚨🚨🚨 CRITICAL: endScreen must be in the main "beats" array! 🚨🚨🚨
- ❌ WRONG: Creating a separate "endings" array (this is NOT recognized!)
- ❌ WRONG: Referencing "beat_end_good" without creating it in the "beats" array
- ✓ CORRECT: Put ALL endScreen beats in the main "beats" array:
  { "id": "beat_end_good", "type": "endScreen", "parameters": { "message": "...", "showRestart": true } }
- 🚨 NEVER create an "endings" array - it will be IGNORED! All endings go in "beats"!
- Example: { "id": "beat_ending_good", "type": "endScreen", "parameters": { "message": "Victory!", "showRestart": true, "showCredits": true, "creditsPageTitle": "Credits", "creditsPageBody": "Written by...\\nDesigned by..." }, "connections": [{ "targetId": "beat_0" }] }

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
- **Fictional Time** (type: "fictionalTime"): Set or advance in-story date/time
  - Operations: "set" (initialize), "advance" (move forward), "subtract" (time travel/flashback)
  - For "set": specify timeYear, timeMonth (1-12), timeDay (1-31), timeHour (0-23), timeMinute (0-59)
  - For "advance"/"subtract": specify value (amount) and timeUnit ("minutes"|"hours"|"days"|"weeks"|"months"|"years")
  - No variableName needed for fictionalTime
  - Examples:
    - Set: { "type": "fictionalTime", "operation": "set", "timeYear": 1929, "timeMonth": 1, "timeDay": 15, "timeHour": 9, "timeMinute": 0 }
    - Advance 3 hours: { "type": "fictionalTime", "operation": "advance", "value": 3, "timeUnit": "hours" }
    - Time travel -2 days: { "type": "fictionalTime", "operation": "subtract", "value": 2, "timeUnit": "days" }
  - Fictional time is displayed automatically in the Timer HUD when enabled in global settings

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
  - **inventory (has/lacks)**: { type: "inventory", item: "itemName", character: "player", checkType: "has"|"notHas" }
  - **inventory (quantity)**: { type: "inventory", item: "itemName", character: "player", checkType: "quantity", quantityOperator: ">=", quantityValue: 3 }
    Note: Use quantityValue with a number OR a variable name prefixed with $ (e.g., "$requiredAmount")
  - **timer**: { type: "timer", timer: "timerName", operator: ">", value: 0 }
  - **visitedBeat**: { type: "visitedBeat", beatId: "beat_id" } - Check if player has visited a specific beat
  - **counterCompare**: { type: "counterCompare", counter1: "strength", counter2: "threshold", operator: ">=" }
    Compare two counters against each other. Useful for: skill checks, relationship comparisons, dynamic difficulty
  - **fictionalTime**: { type: "fictionalTime", operator: ">", compareTime: { year: 1969, month: 1, day: 1, hour: 0, minute: 0 } }
    Operators: ">" (after), "<" (before), "==" (exactly), "!=" (not), ">=", "<="
    Use for: time-gated content, checking story progression by date/time
- Connections: Two → one if true, one if false
- Pattern: Reconvergence - multiple paths lead here, then branch based on accumulated state

Counter condition example (CORRECT format):
  {
    "condition": { "type": "counter", "variable": "cluesFound", "operator": ">=", "value": 3 },
    "trueConnection": { "target": "beat_success", "label": "Enough clues" },
    "falseConnection": { "target": "beat_hub", "label": "Need more clues" }
  }

Inventory condition example - has/lacks (CORRECT format):
  {
    "condition": { "type": "inventory", "item": "lantern", "character": "player", "checkType": "has" },
    "trueConnection": { "target": "beat_has_light", "label": "Has lantern" },
    "falseConnection": { "target": "beat_dark", "label": "No lantern" }
  }

Inventory condition example - quantity check (CORRECT format):
  {
    "condition": { "type": "inventory", "item": "gold_coin", "character": "player", "checkType": "quantity", "quantityOperator": ">=", "quantityValue": 10 },
    "trueConnection": { "target": "beat_can_afford", "label": "Enough gold" },
    "falseConnection": { "target": "beat_too_poor", "label": "Not enough gold" }
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
Fictional time condition example (CORRECT format):
  {
    "condition": { "type": "fictionalTime", "operator": ">", "compareTime": { "year": 1969, "month": 1, "day": 1, "hour": 0, "minute": 0 } },
    "trueConnection": { "target": "beat_future", "label": "After 1969" },
    "falseConnection": { "target": "beat_past", "label": "Before 1969" }
  }

- ⚠️ WRONG for inventory: { "variableName": "lantern" } - use "item" inside condition!

**addRemoveInventory** - Inventory manipulation
- Use: REMOVE items, transfer between characters, or add items from NON-pickProp sources
- 🚨 **DO NOT USE AFTER pickProp** - pickProp already adds items to inventory automatically!
  - Using addRemoveInventory after pickProp creates DUPLICATE inventory entries
- Parameters (ALL are REQUIRED):
  - item: Item name/identifier (REQUIRED - use "item" NOT "propId"!)
  - action: "add" | "remove" | "transfer" (REQUIRED)
  - character: Character whose inventory is modified (REQUIRED - use "player" for player character)
  - quantity: Number of items (optional, default: 1). Can be a number or variable name (e.g., "$goldAmount")
  - fromChar/toChar: For transfer action only
- ⚠️ CRITICAL: Use "item" parameter, NOT "propId"!
- ⚠️ CRITICAL: Always include "character" parameter (usually "player")!
- Connections: Single → next beat
- Valid patterns:
  - Remove item after use: action="remove" (player uses a key, loses it)
  - Give/receive from NPC: action="add" or "transfer" during dialogue
  - Lose item in story event: action="remove" (item stolen, broken, etc.)
- ✗ WRONG pattern: pickProp → addRemoveInventory with action="add" (DUPLICATES!)
- Examples:
  - Remove from player: { "item": "key", "action": "remove", "character": "player" }
  - Add from NPC gift: { "item": "reward_coin", "action": "add", "character": "player" }
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

### AI RUNTIME BEATS (Require AI service at playback time)

**aiInfoText** - AI-generated contextual text with Continue button
- Use: Personalized narrative text that adapts to player state
- Parameters:
  - prompt: Context/instruction for AI (e.g., "A merchant's reply when player can't afford the item")
  - fallbackText: Text shown if AI is unavailable (REQUIRED)
  - buttonText: Continue button label (default: "Continue")
  - includeVariables: Include player variables in AI context (default: true)
  - includeInventory: Include player inventory in AI context (default: false)
  - includeHistory: Include visited beats in AI context (default: false)
  - maxSentences: Maximum sentences to generate (default: 2)
  - contextVariables: Specific variable names to include (optional array)
- Connections: Single → next beat
- Example: Generate personalized greetings using playerName, or context-aware descriptions
- ⚠️ Requires AI API key and internet at runtime - always provide good fallbackText!

**aiDurScreen** - AI-generated text with auto-advance based on reading speed
- Use: Dynamic transitions and atmospheric text that adapts to player state
- Parameters:
  - prompt: Context/instruction for AI
  - fallbackText: Text shown if AI is unavailable (REQUIRED)
  - includeVariables, includeInventory, includeHistory: Same as aiInfoText
  - maxSentences: Maximum sentences to generate (default: 2)
  - contextVariables: Specific variable names to include (optional)
  - wordsPerMinute: Reading speed for duration calculation (default: 200)
  - minDuration: Minimum display time in SECONDS (default: 3)
  - maxDuration: Maximum display time in SECONDS (default: 45)
- Connections: Single → auto-advances after calculated duration
- Duration is auto-calculated at runtime in SECONDS: ceil(wordCount / wordsPerMinute × 60 × 1.5), clamped to [minDuration, maxDuration]. You do not set duration directly for aiDurScreen — only the bounds.
- Example: "Three days pass..." that adapts based on what the player accomplished

**aiDialogTree** - AI-generated branching dialogue at runtime
- Use: Dynamic conversations that adapt to context and player history
- Creates personalized NPC responses based on player state
- Parameters:
  - scenario: Scene description for context
  - npcName: NPC the player talks to
  - npcPersonality: Character traits (optional)
  - maxTurns: Maximum conversation depth (default: 3)
  - exitTargets: Array of exit destinations, each with:
    - id: Target beat ID
    - description: When to route here (AI uses this to decide)
    - npcExitMessage: Optional prompt for AI to generate a farewell message when exiting via this target
  - includeVariables, includeInventory, includeVisitedBeats, includeChoiceHistory: Context toggles
  - systemInstructions: Additional instructions for the AI
  - presentationMode: "positioned" | "chat-scroll" | "chat-bubble"
- Connections: Multiple → one per exit target

**aiConversation** - Real-time AI conversation with steering rules
- Use: Open-ended NPC conversations where the AI generates each response live
- Unlike aiDialogTree (pre-generated tree), each NPC turn is generated fresh
- Parameters:
  - scenario: Scene description
  - npcName: NPC the player talks to
  - npcPersonality: Character traits (optional)
  - maxTurns: Maximum conversation turns before fallback exit
  - directions: Array of steering rules that guide the AI, each with:
    - trigger: When this direction activates (topic-mention, sentiment, turn-count, variable, custom)
    - action: What happens (steer the conversation, exit to a beat, set a variable, or combinations)
    - npcExitMessage: Optional prompt for farewell when exiting via this direction
  - fallbackExitTarget: Beat to go to when maxTurns reached
  - openingLine: Fixed opening NPC line (if empty, AI generates one)
  - systemInstructions: Additional instructions for the AI
- Connections: Multiple → one per exit direction + fallback
- Requires text input from the player (free-form typing, not pre-authored choices)

**aiSummary** - AI-generated narrative summary (CAN REPLACE endScreen as story ending!)
- Use: Personalized recap of the player's journey — ideal for endings, epilogues, or checkpoints
- The AI generates a summary based on the player's actual choices, variables, and inventory
- Has ALL the same ending capabilities as endScreen: showRestart, showCredits, resetOnRestart
- Parameters: prompt, title, summaryStyle ("narrative"|"bullet-points"|"reflection"), maxLength ("short"|"medium"|"long" — NOT a number), includeVariables, includeInventory, includeCounters, includeVisitedBeats, includeChoiceHistory
- Supports showRestart, showCredits, resetOnRestart with granular reset sub-options (resetVariables, resetCounters, resetInventory, resetTimers, resetFictionalTime, resetVisitedTracking, resetHistory)
- Credits page: creditsPageTitle, creditsPageBody, creditsCloseText
- When used as an ending: set showRestart: true AND add a connection back to the titleScreen (beat_0) so the restart button works and shows up as a graph edge. Example: "connections": [{ "targetId": "beat_0" }]
- 🚨 CRITICAL: Same rule as endScreen — showRestart:true REQUIRES an explicit connection to beat_0.
- 🚨 CRITICAL: ALWAYS set "resetOnRestart": true so counters, variables, and inventory don't leak between replays. Without it, counter-gated endings can become "ghost-reachable" on a second playthrough (counter adds on top of previous run, crosses threshold).
- Advantage over endScreen: the player sees a personalized recap of what they did, not just a static message

**aiCondition** - AI-driven branching that analyzes player state
- Use: Complex branching based on accumulated player behavior/personality
- Parameters:
  - prompt: What the AI should evaluate (e.g., "Is the player playing aggressively or cautiously?")
  - categories: Array of possible outcomes, each with:
    - name: Category identifier (e.g., "aggressive", "cautious")
    - description: When this category applies (e.g., "Player has made combative choices")
    - targetId: Beat to navigate to for this category
  - evaluateVariables: Include player variables (default: true)
  - evaluateInventory: Include player inventory (default: true)
  - evaluateHistory: Include visited beats (default: true)
  - evaluateCounters: Include counter values (default: true)
  - evaluateChoiceHistory: Include what choices player made (default: true)
  - fallbackTarget: Beat to go to if AI can't decide
  - timeout: Max response time in ms (default: 30000)
- Connections: Multiple → one per category (AI picks the best match)
- Example: AI determines if player is "hero" or "villain" based on past choices
- ⚠️ Requires AI API at runtime - always provide fallbackTarget!

**onlineContent** - Fetch and display real-time data
- Use: Dynamic content from web APIs or AI-powered search
- Parameters:
  - sourceType: "api" (direct API call) or "ai-query" (AI search)
  - For API mode:
    - apiUrl: URL to fetch (supports \${variable} interpolation)
    - apiParams: Query parameters object
    - jsonPath: JSONPath to extract data (e.g., "$.current.temp_c")
  - For AI query mode:
    - query: What to search/answer (supports \${variable} interpolation)
  - title: Title above content (auto-derived from query if not set).
    Keep titles SHORT — 2-5 words, ≤35 characters. The title renders on a
    single line in a header box; long titles like "Transport options in
    Bergen, Norway's Coastal Hub" (49 chars) wrap to two lines and break
    the layout. Prefer punchy framings: "Bergen Transport", "Getting
    Around Bergen", "Bergen Commuter Mix" — NOT subtitle-style sentences.
  - maxWords: Maximum words in response
  - fallbackText: Text if fetch fails (REQUIRED)
  - buttonText: Continue button label
- Connections: Single → next beat
- Examples: Real-time weather, current news, AI-generated fun facts
- ⚠️ Requires internet at runtime - always provide fallbackText!

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

## Fictional Time System

Stories can track in-story date/time progression (separate from real-time timers):
- **Set up**: Use setVariable with type "fictionalTime" and operation "set" to initialize
- **Advance**: Use setVariable with operation "advance" to move time forward
- **Subtract**: Use operation "subtract" for time travel or flashbacks (negative advancement)
- **Check**: Use conditionBeat with type "fictionalTime" to branch based on date/time
- **Display**: Fictional time automatically shows in the Timer HUD when enabled in global settings
- Supports units: minutes, hours, days, weeks, months, years
- Internal representation: { year, month, day, hour, minute } - uses JS Date for arithmetic (handles month lengths, leap years)
- Display formats: time-12h ("9:00 AM"), time-24h ("21:00"), date ("4 April 1968"), datetime-12h/24h, day-number ("Day 3"), year ("1968")

### Fictional Time Pattern:
1. First setVariable → Set initial time (e.g., "4 April 1968, 9:00 AM")
2. Story beats with narrative progression
3. setVariable → Advance time (e.g., advance 3 hours)
4. conditionBeat → Check if past deadline (e.g., after midnight?)
5. Different paths based on time of day/date

### Per-Beat Time Display Control:
Each beat can override the Timer HUD content via timeDisplayMode:
- "fictionalTime" (default): Show formatted fictional time
- "manual": Show custom text from timeDisplayText field (e.g., "Meanwhile...")
- "none": Hide the Timer HUD on this beat entirely

## Character & Speaker System

Characters define the cast of your story. Each character has a role, displayName, and optional counters/inventory.

### Character Roles
- **player**: The protagonist/interactor. There should be exactly one player character.
- **npc**: Non-player characters the player interacts with (merchants, enemies, quest givers).
- **companion**: Allies who may travel with the player.

### Character JSON Format
Include characters in the "characters" array of your output:
\`\`\`json
{
  "characters": [
    {
      "id": "char_player",
      "name": "Red",
      "displayName": "Red",
      "role": "player",
      "description": "A brave young girl on an errand",
      "counters": [
        { "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 }
      ]
    },
    {
      "id": "char_wolf",
      "name": "Big Bad Wolf",
      "displayName": "Wolf",
      "role": "npc",
      "description": "A cunning wolf lurking in the forest",
      "counters": [
        { "name": "suspicion", "displayName": "Suspicion", "value": 0, "min": 0, "max": 100 }
      ]
    }
  ]
}
\`\`\`

### Speaker System on Beats
Visible beats (titleScreen, infoText, durScreen, dialogTree, movementChoice, pickProp, endScreen, videoBeat, inputText, hyperText) have a **speaker** property that controls who is "speaking" the beat's text.

- The **speaker** value is a character's **displayName** (e.g., "Red", "Mom", "Woodsman")
- **"Narrator"** is the built-in default speaker (used when speaker is empty or "Narrator")
- The player character's displayName should be used as the speaker value when the player is speaking
- **showSpeaker** controls visibility: true = always show speaker label, false = always hide, omit = use global setting
- When a speaker is set, the speaker name appears as a label above the text box

### Speaker on Beat Examples
\`\`\`json
{
  "id": "beat_1",
  "type": "infoText",
  "parameters": {
    "text": "Welcome to my shop! What can I do for you?",
    "speaker": "Merchant",
    "buttonText": "Continue"
  }
}
\`\`\`

### Speaker in DialogTree
In dialogTree beats, each dialog node has its own **speaker** field. This allows back-and-forth conversation:
\`\`\`json
{
  "dialogTree": {
    "id": "root",
    "speaker": "Merchant",
    "text": "Welcome! What brings you here?",
    "choices": [
      {
        "id": "c1",
        "text": "I need a sword.",
        "dialogNode": {
          "id": "n1",
          "speaker": "Merchant",
          "text": "I have just the thing!",
          "choices": [{ "id": "c2", "text": "How much?", "target": "beat_next" }]
        }
      }
    ]
  }
}
\`\`\`

### Character Translations
Characters support translated display names per language:
\`\`\`json
{
  "id": "char_player",
  "name": "Red",
  "displayName": "Red",
  "role": "player",
  "translations": { "de": { "displayName": "Rotkäppchen" }, "fr": { "displayName": "Rouge" } }
}
\`\`\`

## Character Counters (Centralized System)

Counters should be defined on characters, then referenced consistently in choices:
- Define counters in the characters array with meaningful names and limits
- These counters become available in ALL choice-type beats (dialogTree, movementChoice, pickProp)
- Counter properties on choices:
  - "counter": name of the counter to modify
  - "counterOperation": "change" (add/subtract) or "set" (replace)
  - "counterValue": numeric value
- Sound effect property on choices:
  - "soundEffect": filename of sound to play when choice is selected (e.g., "click.mp3", "success.wav")
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

### Pattern 8: Code/Password Puzzle (keypad or inputText → conditionBeat)
\`\`\`
🚨 CRITICAL: inputText MUST connect TO conditionBeat!
Prefer keypad for numeric codes (visual keypad, auto-validation with correctCode/failTarget)
Use inputText for text-based passwords

Flow: infoText("Enter the code") → keypad or inputText → conditionBeat → success/failure

Step 1: Clue beat reveals the code (e.g., "The combination is 8192")
Step 2: Puzzle beat asks for input:
  inputText: {
    prompt: "Enter the vault combination:",
    variable: "enteredCode",        // Stores player's input
    connection: { target: "beat_check_code" }  // ← MUST connect to conditionBeat!
  }
Step 3: Verification beat checks the input:
  conditionBeat (id: "beat_check_code"): {
    condition: { type: "variable", variable: "enteredCode", operator: "==", value: "8192" },
    trueConnection: { target: "beat_vault_opens" },
    falseConnection: { target: "beat_wrong_code" }
  }
Step 4a: Success path (correct code)
Step 4b: Failure path (wrong code) → can loop back to inputText for retry

🚨 Common mistake: Creating conditionBeat but forgetting to connect inputText TO it!
The inputText's connection.target MUST point to the conditionBeat's ID!
\`\`\`

### Pattern 9: Reputation/Relationship System
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
  "type": "infoText",
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
- Start simple: titleScreen → infoText → first choice
- Build complexity: Introduce one mechanic at a time
- Mid-game: Combine multiple beat types (dialog + inventory + conditions)
- Climax: State checks, accumulated variables determine outcome
- Resolution: Multiple endScreens based on player journey

### Common Anti-Patterns to Avoid
❌ Too many consecutive infoText beats (boring, no interaction)
✓ Mix dialog, choices, and exploration

❌ Branching with no reconvergence (exponential content explosion)
✓ Branch → unique content → reconverge → branch again

❌ Meaningless choices that don't affect story
✓ Every choice sets variables or leads to different content

❌ Invisible beats without visible context
✓ Invisible beats support visible beats (setVariable after choice)

❌ Using endScreen before story develops
✓ Build narrative arc: setup → complications → climax → resolution

❌ **Hub beats with state-dependent text (NARRATIVE LOGIC ERROR!)**
Hub beats (reachable from multiple paths) should NOT have text that assumes player state!
✗ WRONG: Hub beat text says "You have enough clues to solve the mystery" without checking cluesFound
✗ WRONG: Hub beat says "With the evidence you gathered..." when player may have gathered nothing
✗ WRONG: Convergence point assumes player has items/knowledge they may not have
✓ CORRECT: Use generic text at hub beats: "What would you like to do next?"
✓ CORRECT: Add conditionBeat BEFORE the hub to show different text based on state
✓ CORRECT: If text must reference state, gate it with a conditionBeat first

### Pattern: State-Aware Hub Beats
\`\`\`
WRONG (narrative assumes state):
  multiple paths → Hub with text "You've gathered the clues needed..."
  Problem: Player may have taken a path with no clues!

CORRECT (generic hub + conditional branching):
  multiple paths → Hub with generic text "What's next?" → conditionBeat checks state → different outcomes
  OR
  multiple paths → conditionBeat first → state-specific hub beat texts

CORRECT (conditional text before hub):
  path A → conditionBeat (clues >= 3?) → "You have enough evidence" (infoText) → Hub
  path B → conditionBeat (clues >= 3?) → "You need more clues" (infoText) → Hub
  Hub has generic text: "Where would you like to go?"
\`\`\`

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
✓ CORRECT: Use infoText to DISPLAY text to the player
✓ CORRECT: Use inputText only when you need the player to TYPE something

❌ **Chains of single-item pickProps with identical content**
pickProp with one item is fine for picking up a single object (adds to inventory).
But NEVER chain multiple single-item pickProps with the same item!
✗ WRONG: pickProp "Shovel" → pickProp "Shovel" → pickProp "Shovel" (pointless repetition!)
✓ CORRECT: Single pickProp to pick up an item, then move on to different content
✓ BETTER: pickProp with 2-4 items when player has a choice of what to examine/take

❌ **pickProp followed by addRemoveInventory (DUPLICATE ITEMS!)**
pickProp AUTOMATICALLY adds the selected item's "name" to player inventory.
DO NOT follow pickProp with addRemoveInventory action="add" - this creates DUPLICATE entries!
✗ WRONG: pickProp "Golden Key" → addRemoveInventory item="golden_key" action="add"
  Result: Player sees BOTH "Golden Key" AND "golden_key" in inventory!
✓ CORRECT: pickProp "Golden Key" → infoText "You pick up the golden key and examine it closely..."
✓ CORRECT: Use addRemoveInventory ONLY to REMOVE items or add items from non-pickProp sources (NPC gifts, story events)

❌ **pickProp props without descriptions**
Always include descriptions for pickProp items to help players make informed choices.
✗ WRONG: { "id": "letter", "name": "Mysterious Letter", "target": "beat_4" }
✓ CORRECT: { "id": "letter", "name": "Mysterious Letter", "description": "A sealed envelope with a wax seal", "target": "beat_4" }

❌ **pickProp items that are never described after pickup**
When player picks up an item, they MUST learn something about it in the very next beat!
✗ WRONG: pickProp "Old Photo" → movementChoice (photo never explained!)
✗ WRONG: pickProp "Secret Letter" → dialogTree with NPC (letter content never revealed!)
✓ CORRECT: pickProp "Old Photo" → infoText describing what the photo shows → next beat
✓ CORRECT: pickProp "Secret Letter" → infoText revealing letter contents → dialogTree

❌ **Hidden scene jumps via invisible beats**
When an invisible beat (setVariable, conditionBeat, addRemoveInventory) connects two dialog scenes with different speakers or locations, the player jumps abruptly with no narrative breath. From the player's POV the new character materializes out of nowhere.
✗ WRONG: dialogTree "Joseph at home" → setVariable confidedInFamily=true → dialogTree "Isabelle Borg: Mark left his laptop with me..."
   Joseph was in a living room. Where did Isabelle come from? When did this happen?
✓ CORRECT: dialogTree "Joseph at home" → setVariable → infoText (1-2 sentences) "Later that evening, you meet Mark's editor at a quiet café in Sliema. She slides a battered laptop across the table." → dialogTree "Isabelle Borg"
✓ Always insert a transitional infoText (Narrator, 1-2 sentences) when:
   - The next beat changes location
   - The next beat introduces a speaker not established as already present in the current scene
   - In-world time passes (later, the next morning, days later)
✓ The transition answers three questions: when did this happen, where are we now, how did the player get here. Keep it brief — this is connective tissue, not a new scene.

❌ **Restating information the player already learned**
Each beat should ADD to what the player knows, not repeat earlier information using different words.
✗ WRONG: beat A (Dr. Xuereb): "If they know you have this, the Church and the Ministry will bury you."
        beat B (Minister): "Close this case. The Church, the families, the historical files — leave them."
   Both convey "powerful institutions are pressuring you" with overlapping institutions named. The player learns nothing new in beat B.
✓ CORRECT: Each later beat ESCALATES or COMPLICATES prior information, not echoes it.
   - If beat A is an abstract warning, beat B is the pressure ARRIVING — with specifics not previously known (a name, a deadline, a personal cost).
   - If beat A names the threats, beat B reveals who's behind them, what they're willing to do, or what the player must give up.
✓ Before drafting each beat, scan all prior reachable beats: what does the player already know? What does THIS beat add that they don't?

❌ **Choice text declares intent the next beat ignores**
Choice text declares the player's intent ("Let it go", "Drop the case", "Walk away", "Some things should stay buried"). When the very next beat has the player still actively pursuing the same line of inquiry, the choice was meaningless — worse, it actively misled the player about the outcome.
✗ WRONG: dialogTree (Joseph): choices = [
    "I have proof — great-grandfather was involved." → setVariable confidedInFamily=true → beat_12_editor (meeting Mark's editor about publishing),
    "You're right. Some things should stay buried." → setVariable confidedInFamily=false → beat_12_editor (meeting Mark's editor about publishing)
  ]
  The "stay buried" choice flips a flag but the player IMMEDIATELY meets the journalist's editor — they're still pushing the case forward. The player's stated decision was overruled by the next beat with no narrative justification.
✓ CORRECT: A "stop / drop it / walk away" choice must produce a narratively distinct path. Two acceptable shapes:
   1. Honour the choice: the next beat reflects the player having stopped (e.g., infoText "You drive home in silence. The case stays closed.") leading to an early ending or a quieter path.
   2. External forces override the choice — and the next beat shows that explicitly: e.g., infoText "Two days later, Isabelle Borg's number flashes on your screen. You almost don't pick up. Then you do." This makes clear the player isn't seeking the next scene; it's coming to them.
✓ Rewrite the choice text if it doesn't actually match what happens next. "Some things should stay buried" must NOT lead to a beat where the player chooses what to do with buried evidence.

❌ **Character variants with displayName identical to the base character's name**
A character variant is the alternate version a character can transition into via setCharacterVariant (e.g. "Sam (after disclosure)", "Elena, freed"). The variant's displayName is what the author sees in the editor's variant dropdown and what the speaker label reads as during play. If the displayName is identical to the base character's name, the UI cannot visually distinguish base from variant — the variant dropdown shows the same string twice and the speaker label can't communicate that a transition happened.
✗ WRONG:
  Character "Sam" with variants: [ { "id": "sam_post_disclosure", "displayName": "Sam", ... } ]
  Editor's variant dropdown reads: "Sam" / "Sam"  — useless. Player sees no change in speaker label after the variant switch.
✓ CORRECT: every variant's displayName MUST be visibly distinct from the base character's name AND from every other variant of the same character. Use a parenthetical or a qualifier:
  Character "Sam" with variants: [ { "id": "sam_post_disclosure", "displayName": "Sam (after disclosure)" }, { "id": "sam_in_recovery", "displayName": "Sam, in recovery" } ]
✓ The id stays machine-readable (snake_case, scoped); the displayName carries the narrative signal of the transition.

❌ **Rich-affect stories with no traits on the major characters** (rich tier only)
At affectDepth='rich' the prompt has already declared "personality / emotion-driven story / character growth at the foreground." Without populated traits[], every character's emotion deltas at runtime are uniform — high-Neuroticism characters react the same as low-Neuroticism ones, and the rich tier collapses into "decorated standard". The runtime trait-modulation only fires when traits are populated.
✗ WRONG: rich-tier interactive drama generated with traits set to [] on every character. The schema is "rich" but the runtime is "standard".
✓ CORRECT: at rich, every character who appears in more than one beat MUST have a traits[] array with at least 3 Big Five dimensions populated. Use an archetype preset when one fits (anxious-introvert, conscientious-leader, free-spirit, recluse, hothead, peacekeeper, stoic, trickster, narcissist, balanced) — or hand-tune. Map character description to traits explicitly: "disciplined, settled life" → high conscientiousness, low neuroticism; "depressive silences, mid-career stall" → high neuroticism, low conscientiousness; "funny, brilliant, restless" → high openness, moderate extraversion.

❌ **Bookmarking a character's transition without authoring the variant**
If you emit a bookmarkAffectState Effect whose name describes a character's state change (e.g. "after_disclosure", "after_depressive_episode", "post_betrayal", "after_recovery"), you are signalling that the character is meaningfully different in the second half of the story. That difference belongs in a variant on the character, not just in the affect snapshot. The bookmark captures the runtime affect state for later comparison; the variant captures the authorial shift the player should see (different displayName / mood seed / sentiment seeds / portrait).
✗ WRONG: story emits bookmarkAffectState with bookmarkName "after_depressive" related to character Theo, but theo.variants is []. Post-bookmark scenes read the same name "Theo" with the same baseline mood — the player never sees that he changed.
✓ CORRECT: alongside the bookmark beat, define a variant on the character with a visibly distinct displayName, a shifted initialMood and at least one shifted initialSentiment that reflects the bookmark moment. Use a setCharacterVariant Effect at the appropriate transition point so the runtime swaps to the variant when the player crosses that threshold.
  Example: Theo's "after_depressive" bookmark pairs with:
    variants: [ { "id": "theo_after_disclosure", "displayName": "Theo (after the silence)", "initialMood": { "valence": -0.3, "arousal": -0.1 }, "initialSentiments": [ { "target": "frances", "emotion": "gratitude", "strength": 0.4 } ] } ]
    A setCharacterVariant Effect (target "theo", variantId "theo_after_disclosure") on the choice that elicits the disclosure.

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
export function buildEnhancedStoryGenerationSystemPrompt(
  schema: any,
  affectDepth: AffectDepth = 'auto',
): string {
  const beatTypesList = Object.keys(schema.beatTypes || {});
  const beatTypes = beatTypesList.join(', ');
  const condensedSchema = buildCondensedSchema(schema);
  const affectSection = buildAffectPromptSection(affectDepth);

  return `You are an expert interactive narrative designer and game writer. You create sophisticated, branching stories using the ASAPS beat system with deep understanding of how different beat types work together.

${affectSection}

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
   - Quantity checks: { checkType: "quantity", quantityOperator: ">=", quantityValue: 5 }

4. **Visited Beats** - Track narrative progression
   - Use conditionBeat with "type": "visitedBeat", "beatId": "beat_id" to check if player has visited a beat
   - Useful for unlocking content after player has explored specific areas

5. **Fictional Time** - Track in-story date/time progression (historical fiction, day counters, time travel)
   - Use setVariable with type "fictionalTime" to set/advance/subtract time
   - Use conditionBeat with "type": "fictionalTime" to branch based on date/time
   - Displayed automatically in the Timer HUD when enabled
   - Useful for: historical fiction with dates, day counters, time-of-day mechanics, time travel stories

6. **Conditional Endings** - Endings should depend on ACCUMULATED state, not just the final choice
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

**pickProp with counter (auto-adds to inventory!):**
\`\`\`json
{
  "question": "What do you examine?",
  "props": [
    {
      "id": "clue1",
      "name": "Suspicious Letter",
      "description": "A crumpled letter with hasty handwriting",
      "target": "beat_5",
      "counter": "cluesFound",
      "counterOperation": "add",
      "counterValue": 1
    }
  ]
}
\`\`\`
Note: pickProp automatically adds "Suspicious Letter" to inventory - do NOT follow with addRemoveInventory!

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
      "parameters": { "message": "Victory!", "showRestart": true, "showCredits": true, "creditsPageTitle": "Credits", "creditsPageBody": "Written by..." },
      "connections": [{ "targetId": "beat_0" }]
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
      "displayName": "Hero",
      "role": "player",
      "description": "The protagonist",
      "counters": [
        { "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 },
        { "name": "health", "displayName": "Health", "value": 100, "min": 0, "max": 100 }
      ]
    },
    {
      "id": "char_npc",
      "name": "Merchant",
      "displayName": "Merchant",
      "role": "npc",
      "description": "A traveling merchant",
      "counters": [
        { "name": "trust", "displayName": "Trust", "value": 0, "min": -100, "max": 100 }
      ]
    }
  ],
  "translations": [
    {
      "languageCode": "de",
      "languageName": "German",
      "strings": { "project.story.metadata.title": "Translated title", "beat:beat_0.parameters.title": "..." }
    }
  ],
  "reasoning": "Explain story structure, branching strategy, and how beat types work together"
}
\`\`\`

Note: The "translations" array is OPTIONAL - only include it when the user requests multiple languages.

## Critical Requirements
🚨 **MANDATORY: beat_0 MUST be type "titleScreen"** - NEVER start with infoText!
🚨 **MANDATORY: If you use counters, you MUST have a conditionBeat to check them!**
✓ End with one or more endScreen beats (always with showRestart: true)

## Story Length & Complexity Guidelines
- **Short** (8-15 beats): Fragment or proof-of-concept
- **Medium** (15-30 beats): Complete short story with meaningful branching
- **Long** (30+ beats): No upper limit! Rich stories can span 50, 80, or hundreds of beats
- Complexity comes from branching structure, not just ending count
- A story with many paths to one ending can be complex, but multiple endings add replayability
- **Multiple endings** make choices feel meaningful and reward different playstyles - consider 2-4+ endings for richer stories
- Don't artificially truncate - let the story develop naturally based on the user's length preference
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

## Multi-Language / Translation Support

ASAPS supports **multi-language Interactive Digital Narratives (IDNs)**. When the user requests a story in multiple languages:

1. **Write the story in the primary language** (first language in the list, or the user's language)
2. **Include a "translations" array** in the output with translations for each additional language
3. **Use displayName/displayText fields** for translatable labels on choice-based beats:
   - **pickProp**: Use "displayName" on props (the "name" field is an internal ID used for inventory matching)
   - **movementChoice**: Use "displayText" on choices (the "text" field is used as a location key)
   - These display fields are what gets translated; the internal keys stay in the source language

### Translation Output Format

When languages are requested, add a "translations" array to the output:
\`\`\`json
{
  "translations": [
    {
      "languageCode": "de",
      "languageName": "German",
      "strings": {
        "project.story.metadata.title": "Mord im Blackwood Manor",
        "beat:beat_0.parameters.title": "Mord im Blackwood Manor",
        "beat:beat_1.parameters.text": "Sie kommen als Detektiv...",
        "beat:beat_2.parameters.props.0.displayName": "Goldener Schlüssel",
        "beat:beat_2.parameters.props.0.description": "Ein glänzender goldener Schlüssel"
      }
    }
  ]
}
\`\`\`

### Translation Key Format
- Story metadata: \`project.story.metadata.title\`
- Beat text fields: \`beat:{beatId}.parameters.{field}\`
- Character names: \`project.story.characters.{index}.name\`
- Choices: \`beat:{beatId}.parameters.choices.{index}.displayText\` or \`beat:{beatId}.parameters.props.{index}.displayName\`
- DialogTree: \`beat:{beatId}.parameters.dialogTree.text\`, \`...choices.{index}.text\`
- Counters: Counter display names on characters

### Important Translation Rules
- Translate ALL player-visible text: beat text, button labels, choice text, item names/descriptions, character names
- Do NOT translate: beat IDs, variable names, counter internal names, connection targets, conditions
- Keep translations natural - adapt idioms, don't translate literally
- Maintain the same emotional tone and narrative voice in each language

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
- titleScreen, infoText, durScreen, setVariable, addRemoveInventory, videoBeat, keypad
These are single-path beats that need "connections" to specify the next beat.
- ⚠️ Use "targetId" in connections: { "targetId": "beat_X" } NOT { "target": "beat_X" }

**NEVER add "connections" array to these beat types (targets are IN the choices/props):**
- movementChoice → targets are in choices[].target (NO connections array!)
- dialogTree → targets are in dialogTree.choices[].target (NO connections array!)
- pickProp → targets are in props[].target (NO connections array!)
- hyperText → targets are in hyperlinks[].targetBeatId (NO connections array!)
- conditionBeat → targets are in trueConnection/falseConnection (NO connections array!)
- endScreen / aiSummary → ending beats, connect to beat_0 for restart

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
✓ hyperText has NO "connections" array - targets are in hyperlinks[].targetBeatId!

## Keypad Example (Numeric Code Entry)

\`\`\`json
{
  "id": "beat_safe",
  "name": "Safe Lock",
  "type": "keypad",
  "position": { "x": 1300, "y": 300 },
  "parameters": {
    "prompt": "Enter the combination:",
    "layout": "numeric",
    "maxDigits": 4,
    "correctCode": "1847",
    "failTarget": "beat_wrong_code",
    "maxAttempts": 3,
    "maskInput": true
  },
  "connections": [{ "targetId": "beat_safe_open" }]
}
\`\`\`
✓ keypad uses "connections" array (single-connection beat). If correctCode is set, auto-validates and routes to failTarget on wrong entry.

## Code/Password Puzzle - Complete JSON Example

🚨 **For numeric codes, prefer keypad (auto-validates with correctCode/failTarget). Use inputText → conditionBeat for text passwords.**

\`\`\`json
{
  "id": "beat_10",
  "name": "Enter Vault Code",
  "type": "inputText",
  "position": { "x": 1300, "y": 300 },
  "parameters": {
    "prompt": "The vault requires a 4-digit code. What do you enter?",
    "variable": "vaultCode",
    "saveToType": "variable",
    "submitButtonText": "Enter Code",
    "connection": { "target": "beat_11_check" }
  }
}
\`\`\`
✓ inputText uses connection INSIDE parameters pointing to conditionBeat!

\`\`\`json
{
  "id": "beat_11_check",
  "name": "Check Vault Code",
  "type": "conditionBeat",
  "position": { "x": 1600, "y": 300 },
  "parameters": {
    "condition": {
      "type": "variable",
      "variable": "vaultCode",
      "operator": "==",
      "value": "8192"
    },
    "trueConnection": { "target": "beat_12_success", "label": "Correct!" },
    "falseConnection": { "target": "beat_13_wrong", "label": "Wrong code" }
  }
}
\`\`\`
✓ conditionBeat checks the variable set by inputText!
✓ trueConnection/falseConnection provide paths for correct/incorrect answers!`;
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

  // Genre-specific craft rules. Mystery / detective / thriller stories
  // suffer a recurring failure mode where "evidence" beats announce the
  // full conclusion as a single line of prose, so the player is told the
  // answer at the same moment they are asked the question. Inject the
  // distribution rule when the genre warrants it.
  const mysteryGenres = ['mystery', 'detective', 'thriller', 'crime', 'noir', 'whodunit', 'investigation'];
  const isMystery =
    !!request.genre &&
    mysteryGenres.some((g) => request.genre!.toLowerCase().includes(g));
  if (isMystery) {
    parts.push(`🔍 MYSTERY / INVESTIGATION CRAFT RULES

In this genre, evidence beats must DISTRIBUTE the answer across multiple
discoveries, not announce it. The player should connect fragments — the
prose should never connect them first.

❌ WRONG (single beat states the secret, the date, the question):
   infoText "The laptop emails: 'Warehouse 7, 1942 — the real origin of
   the fortune.' Galea Trading was founded in 1946. What happened in
   those four years?"
   The player learns the answer at the same moment they are asked.

✓ CORRECT (each beat is one fragment; meaning emerges from combination):
   Beat A (laptop, path 1): a draft email never sent — "If this comes
     out, every name on the founder's medal burns."
   Beat B (notebook, path 2): a page reading "Antonio G., Sept 1942,
     6 crates" beside pages dated 1944, 1945, 1946.
   Beat C (archive, optional): the company seal is dated 1942 — four
     years before the company legally existed.
   The player connects A + B + C and infers the founding wealth came
   from somewhere pre-1946. The prose never says it.

✓ Each evidence beat answers AT MOST one question and raises AT LEAST
   one new question. If a single beat would resolve multiple, split it
   across discoveries on different paths.

✓ Reserve the full reveal beat for AFTER the player has visited at
   least two evidence beats and made at least one path commitment. The
   reveal synthesizes what THE PLAYER has gathered — it does not
   reveal what the prose has been quietly announcing all along.

✓ Suspects, ministers, witnesses should NOT confess the central
   secret on first meeting. Their early appearances reveal motive,
   pressure, deflection — they confirm the secret only after the
   player has accumulated enough fragments to confront them with it.`);
  }

  const lengthGuide = {
    short: '8-15 beats. A story fragment or proof-of-concept. Good for testing ideas or simple linear narratives.',
    medium: '15-30 beats. A complete short story with meaningful branching, state tracking, and satisfying conclusions.',
    long: '30+ beats with no upper limit. Let the story develop fully - rich worlds can span 50, 80, or even hundreds of beats. Don\'t artificially cut the story short.'
  };
  if (request.length) {
    parts.push(`📏 Story Length: ${request.length.toUpperCase()}\n${lengthGuide[request.length]}`);
  }

  const complexityGuide = {
    linear: 'Mostly sequential narrative with 2-3 choice points. Choices add flavor but paths generally reconverge. 1-2 endings. Good for narrative-focused stories.',
    moderate: 'Multiple meaningful branching points (4-6 decisions that matter). State tracking with variables/counters. 2-3 endings to reward different approaches.',
    complex: 'Rich branching network with many decision points. Hub-and-spoke exploration, state-dependent paths, conditional unlocks. Multiple endings (3-5+) that reflect the player\'s journey. The journey matters as much as the destination.'
  };
  if (request.complexity) {
    parts.push(`🌳 Branching Complexity: ${request.complexity.toUpperCase()}\n${complexityGuide[request.complexity]}`);
  }

  if (request.context) {
    parts.push(`Additional requirements: ${request.context}`);
  }

  // Multi-language section
  if (request.languages && request.languages.length > 0) {
    const primary = request.languages[0];
    const additional = request.languages.slice(1);
    if (additional.length > 0) {
      parts.push(`🌐 MULTI-LANGUAGE STORY
Write the story content in ${primary}.
Include a "translations" array with complete translations for: ${additional.join(', ')}.
Use "displayName" on pickProp props and "displayText" on movementChoice choices for translation-safe labels.
Translate ALL player-visible text including beat text, button labels, choice text, item names/descriptions, and character names.`);
    } else {
      parts.push(`🌐 LANGUAGE: Write all story content in ${primary}.`);
    }
  }

  // AI-powered beats section
  if (request.includeAIBeats) {
    parts.push(`🤖 AI-POWERED BEATS ENABLED
You may use these advanced beat types that leverage AI at runtime:
- **onlineContent**: Fetch and display real-time data from web APIs or AI queries
- **aiCondition**: AI-driven branching that analyzes player state to determine path
- **aiDialogTree**: Generate personalized dialog trees at runtime using AI
- **aiSummary**: AI-generated personalized summary — can REPLACE endScreen as story ending!
  Parameters: prompt, title, summaryStyle, maxLength ("short"|"medium"|"long" — NEVER a number), includeVariables, includeInventory, includeCounters, includeVisitedBeats, includeChoiceHistory, showRestart, showCredits, resetOnRestart (with granular sub-options), creditsPageTitle, creditsPageBody, creditsCloseText, restartText, creditsText
  Use instead of endScreen when you want the player to see a recap of their choices and consequences
- **aiInfoText**: Generate contextual 1-2 sentence text using AI based on player state (like infoText but dynamic)
  Parameters: prompt (context for AI), fallbackText (if AI unavailable), buttonText, includeVariables, includeInventory, includeHistory, maxSentences
- **aiDurScreen**: Generate contextual text with automatic duration based on reading speed (like durScreen but dynamic)
  Parameters: prompt, fallbackText, includeVariables, includeInventory, includeHistory, maxSentences, wordsPerMinute, minDuration, maxDuration
- **aiConversation**: Real-time AI conversation with author-defined steering rules
  Parameters: scenario, npcName, npcPersonality, maxTurns, directions (steering rules with triggers and actions), fallbackExitTarget, openingLine, systemInstructions

Use these sparingly for dynamic, personalized experiences. They require an AI API key and internet at runtime.`);
  } else {
    parts.push(`🚫 AI-POWERED BEATS DISABLED
Do NOT use these beat types: onlineContent, aiCondition, aiDialogTree, aiSummary, aiInfoText, aiDurScreen, aiConversation
Use only standard beat types that work offline.`);
  }

  parts.push(`
Remember to:
- Use invisible beats (setVariable, conditionBeat) for logic
- Create reconvergent paths (branches that merge back)
- Track important decisions in variables
- Use appropriate beat types: dialogTree is the DEFAULT for ANY multi-option choice (conversations, decisions, actions, branches). Only use movementChoice when choices are spatial hotspots on a background image.
- Design multiple endings based on accumulated state
- For puzzles/codes: inputText → conditionBeat (inputText stores answer, conditionBeat checks it!)

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

🔍 VERIFICATION CHECKLIST (check each before outputting):
1. beat_0 is titleScreen
2. Story ends with endScreen or aiSummary beats, each with showRestart: true
3. EVERY target ID (in choices[].target, connections[].targetId, trueConnection.target, falseConnection.target) references an actual beat ID in the beats array — no dangling references
4. EVERY beat (except beat_0) is reachable — at least one other beat has it as a target
5. dialogTree beats have: dialogTree.id, dialogTree.speaker, dialogTree.text, dialogTree.choices (array)
6. Single-connection beats (infoText, durScreen, setVariable, etc.) use connections array with ONE entry
7. Multi-connection beats (dialogTree, movementChoice, pickProp) have targets INSIDE parameters — NO connections array
8. Does the story length feel right for the requested size (short/medium/long)?
9. Does the branching complexity match what was requested?

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
          type: "infoText",
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
              { id: "letter", name: "Mysterious Letter", description: "A folded letter hidden between two books", target: "beat_4" },
              { id: "nothing", name: "Nothing useful", description: "The shelves seem ordinary", target: "beat_5" }
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
          type: "infoText",
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
              { id: "weapon", name: "The Murder Weapon", description: "A bloodstained letter opener on the desk", target: "beat_7" },
              { id: "nothing", name: "Nothing stands out", description: "Just scattered papers and books", target: "beat_8" }
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
          type: "infoText",
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
          type: "infoText",
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
          type: "infoText",
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
          connections: [{ targetId: "beat_0" }]
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
          connections: [{ targetId: "beat_0" }]
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
          connections: [{ targetId: "beat_0" }]
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
          connections: [{ targetId: "beat_0" }]
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
- infoText: Narration between major beats
- endScreen: Multiple endings based on player performance

This creates meaningful choices where thoroughness is rewarded with better endings.`
    }, null, 2)
  };
}
