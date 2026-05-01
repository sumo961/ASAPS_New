# ASAPS Modern User Guide

**Your Complete Guide to Building Interactive Narrative Systems**

*Last revised against build 0.9.43.94*

---

## Welcome, Narrative System Builder!

You're about to embark on a fundamentally different kind of creative practice. If you're coming from traditional storytelling—writing novels, scripts, or even static games—prepare to shift your perspective. You're not here to tell a story. You're here to **build a system** that creates opportunities for others to experience narratives.

This distinction matters. Traditional authors communicate a fixed vision through a finished artifact. You, as a narrative system builder, create **incomplete works**—rich possibility spaces that your audience (we call them **interactors**) will explore and complete through their participation. Your job isn't to control every moment of the experience; it's to design a dynamic system where interesting things can happen.

As the creators of Tale of Tales put it:

> *"We are not story-tellers in the traditional sense of the word. In the sense that we know a story and we want to share it with you. Our work is more about exploring the narrative potential of a situation. We create only the situation. And the actual story emerges from playing, partially in the game, partially in the player's mind."*

Think of this guide as your companion in learning to think like a system builder. We'll start with the basics and work our way up to advanced techniques. No prior experience required—just bring your imagination and a willingness to think differently about narrative.

**What's Inside:**
- [Part 1: Getting Started](#part-1-getting-started) - The paradigm shift and first steps
- [Part 2: The Interface](#part-2-the-interface) - Your creative workspace explained
- [Part 3: Understanding Beats](#part-3-understanding-beats) - The building blocks of your system
- [Part 4: Characters & Assets](#part-4-characters--assets) - Bringing your world to life
- [Part 5: Visual Design](#part-5-visual-design) - Making it look gorgeous
- [Part 6: AI Features](#part-6-ai-features) - AI-assisted system building (including AI Conversation)
- [Part 7: Testing & Publishing](#part-7-testing--publishing) - Sharing your creation
- [Part 8: Advanced Techniques](#part-8-advanced-techniques) - Level up your skills
- [Part 9: Version Control & Collaboration](#part-9-version-control--collaboration) - Git integration and team workflows
- [Part 10: Search, Translation & Productivity](#part-10-search-translation--productivity) - Power-user tools
- [Appendix A: Beat Reference](#appendix-a-beat-reference) - Every beat type explained
- [Appendix B: Keyboard Shortcuts](#appendix-b-keyboard-shortcuts) - Work faster
- [Appendix C: Glossary](#appendix-c-glossary) - Definitions
- [Appendix D: FAQ](#appendix-d-faq) - Common questions answered

---

# Part 1: Getting Started

## What is ASAPS Modern?

ASAPS Modern (Advanced Story Authoring and Presentation System) is a web-based tool for creating **interactive digital narratives** (IDN)—dynamic systems where participants make choices that shape the experience. But let's be clear about what that means.

This is **not** "traditional storytelling with choices added on top." That's like saying film is "theater plus cameras." Interactive digital narrative is a specific form of expression with its own characteristics, opportunities, and design principles.

### The Paradigm Shift

In traditional narrative, you create a fixed artifact—a novel, a film, a script. The audience receives it.

In interactive digital narrative, you create a **dynamic system**. Your audience becomes **interactors** who don't just receive—they participate, plan, execute, and shape what happens. The narrative emerges from their engagement with your system.

This means:
- You're no longer an author—you're a **system builder**
- Your audience aren't passive viewers—they're **interactors**
- You don't create finished stories—you create **protostories** (systems containing potential narratives)
- The experience isn't consumed—it's **instantiated** through participation

### What ASAPS Modern Provides

- **A visual system-building interface** where you design without coding
- **Multimodal capabilities**: images, sounds, video, animations
- **Character systems** with states, meters, and inventories
- **Variables and conditions** to create responsive, dynamic experiences
- **AI assistance** to help generate content and suggestions

![Main Interface](images/01-main-interface.png)
*The ASAPS Modern interface: your system-building workspace*

## Your First 5 Minutes

Let's get you building right away. When you launch ASAPS Modern, you'll see a template system with three connected beats:

```
[Title Screen] → [Introduction] → [The End]
```

This is the skeleton of a simple linear experience. Your job? Transform it into something with possibilities.

### Quick Exercise: Your First Edit

1. **Click the "Introduction" beat** in the flowchart (the center area)
2. **Look right** - the Inspector panel shows the beat's properties
3. **Find the "Text" field** and replace the placeholder with:
   ```
   You wake up in a room you don't recognize.
   The walls are covered in old photographs.
   None of the faces are familiar.

   What do you do?
   ```
4. **Click "Preview"** (top right) to see your change

You just edited your first beat. That's the core workflow: select something, change its properties, preview the result. But notice—right now this is still a linear experience. The real magic happens when you add **choices** and **branches**.

## The Big Picture: Systems, Not Scripts

Before we dive deeper, let's establish the mental models that will serve you well.

### You're Building Possibility Spaces

Traditional narratives are like rivers—they flow from beginning to end along a predetermined path. Interactive digital narratives are more like deltas, forests, or even ecosystems—they contain many possible paths, and the interactor determines which one gets traversed.

```
         [Choice A] → [Outcome A]
        /                        \
[Start] → [Choice B] → [Outcome B] → [Ending]
        \                        /
         [Choice C] → [Outcome C]
```

In ASAPS Modern, you see this structure in the **Flowchart view**. Each box is a "beat" (a potential moment in the experience), and the lines between them are "connections" (possible transitions).

Key insight: **You're not scripting what happens. You're defining what CAN happen.** The interactor's choices determine what actually occurs in any given session.

### Beats: The Building Blocks of Your System

Every potential moment in your experience is a **beat**. Beats come in two flavors:

**Visible Beats** - What the interactor encounters:
- Text screens, dialog choices, videos, title cards, etc.
- These are the "surface" of your system

**Logic Beats** - The machinery beneath:
- Setting variables, checking conditions, randomizing outcomes, etc.
- These create the dynamic, responsive behavior

The interactor never sees logic beats directly, but they're what make your system intelligent. They let you track whether the interactor found the key before trying the locked door, or whether their relationship with a character has deteriorated.

### State: Your System's Memory

Your system has memory, called **state**. This includes:

- **Variables** - True/false flags (hasKey, metWizard, doorUnlocked)
- **Counters** - Numbers (gold, health, reputation)
- **Inventory** - Items characters carry
- **History** - Which beats have been visited

Logic beats read and write state. Visible beats can respond to state, customizing what they show. This is how a character might say "Good to see you again!" if you've met before, or "Who are you?" if you haven't.

**This is the heart of system building**: creating responsive structures where actions have consequences and the experience adapts to what the interactor does.

---

# Part 2: The Interface

Let's take a tour of your system-building workspace. Don't worry about memorizing everything—you'll learn by doing. This is just a map so you don't get lost.

## The Header Bar

The header spans the top of the screen in three rows:

**Row 1 -- Branding and Title:**
The ASAPS logo, version number (displayed as `v{version}.{buildNumber}`, e.g., v0.9.43.94), and a large text field where you can type or edit your project's title directly.

**Row 2 -- Main Controls:**

| Left Side | What it Does |
|-----------|--------------|
| **Project Selector** | Dropdown to switch projects, create new, or open the project library |
| **Undo/Redo** | Fix mistakes (Ctrl/Cmd+Z works too!) |
| **Save** | Save your project (green button) |
| **Import** | Dropdown: import ASML, ZIP, or Twine files |
| **Export** | Dropdown: export as ASML, ZIP, or standalone HTML |
| **Tools** | Dropdown: Transformations, Merge DialogTrees |

| Right Side | What it Does |
|------------|--------------|
| **Characters** | Create and manage your cast (blue button) |
| **Assets** | Manage images, sounds, videos, fonts (orange button) |
| **Settings** | Global configuration (purple button) |
| **Debug** | Testing and troubleshooting tools (gray button) |
| **Preview** | Test your system (green button) |

**Row 3 -- AI, TTS/STT, and Language:**

| Button | What it Does |
|--------|--------------|
| **AI** | Dropdown: Generate Story, Create Beat from Description, Configure AI |
| **VCS Status** | Git status (only visible for directory projects under version control) |
| **TTS** | Text-to-Speech toggle and configuration (speaker icon, right side) |
| **STT** | Speech-to-Text toggle and configuration (microphone icon, right side) |
| **Source (English)** | Language selector for translations (far right) |

## The Left Sidebar: Beat List

This is your system's table of contents. Every beat you create appears here.

**Key Features:**
- **Search Box** - Filter beats by name (useful when you have dozens!)
- **Add Cluster** - Organize related beats into folders
- **Beat List** - All your beats, draggable for reordering

**Pro Tip:** Drag beats into clusters to keep things organized. A mystery might have clusters for "Act 1," "Investigation Scenes," "Suspect Interrogations," and "Endings."

## The Center: Canvas Views

This is where system building happens. Toggle between two views:

### Flowchart View (The Bird's Eye)

See your entire system structure as a graph. Beats appear as boxes, connections as arrows. This view is great for:
- Understanding overall structure
- Spotting dead ends and unreachable beats
- Reorganizing the possibility space
- Dragging in new beats from the palette

![Flowchart View](images/01-main-interface.png)
*The Flowchart view shows your system's structure*

### Visual Editor (The Close-Up)

Design what a specific beat looks like on screen. Position characters, add backgrounds, place text boxes. This view is for:
- Setting backgrounds
- Positioning characters
- Creating hotspots (clickable areas)
- Designing UI elements

When a **translation language** is active, the Visual Editor overlays translated text on top of the source text, so you can see how your layout looks in different languages without leaving the editor.

![Visual Editor](images/06-visual-editor.png)
*The Visual Editor lets you design how beats appear*

## The Right Sidebar: Inspector

When you select a beat, the Inspector shows everything about it:

- **Name & Type** - What this beat is called and what kind it is
- **Speaker** - For beats with dialog or narration, the [Character combobox](#character-combobox) lets you pick a defined Character, type a free-text name, or leave it blank for the narrator
- **Content** - The beat's main content (text, choices, etc.)
- **Connections** - Where the experience can go next
- **Advanced Settings** - Sounds, conditions, special behaviors

The Inspector changes based on what you've selected. Select a Dialog Tree and you'll see choice options. Select a Video Beat and you'll see playback settings.

![Inspector Panel](images/05-inspector-panel.png)
*The Inspector panel shows properties of the selected beat. The Speaker section uses a unified [Character combobox](#character-combobox) — pick a defined Character, type a free-text name, or leave blank for the narrator. The Dialog Tree Editor opens inline on dialog beats; click it to author choices, per-node speakers, and choice effects.*

## The Beat Palette (Right Side)

Your beat shopping catalog, docked to the right edge of the flowchart. Drag any beat type onto the canvas to add it to your system. Click the collapse arrow to hide it when you need more canvas space.

The palette is organized into three categories:
- **Visible Beats** - Moments the interactor encounters (Title Screen, Info Text, Dialog Tree, Movement Choice, Pick Prop, Video Beat, End Screen, Duration Screen, Input Text, Keypad, Hyper Text, 360 Panorama)
- **Logic Beats** - Behind-the-scenes processing (Set Variable/Counter, Condition Check, Random Target, Set Timer, Inventory Management)
- **AI Beats** - AI-powered dynamic content (Online Content, AI Condition, AI Dialog Tree, AI Conversation, AI Summary, AI Info Text, AI Duration Screen)

We'll explore every beat type in detail in [Part 3](#part-3-understanding-beats).

---

# Part 3: Understanding Beats

Beats are the atoms of your narrative system. Master them, and you can build anything.

## Visible Beats: What the Interactor Encounters

These are the beats the interactor sees and engages with directly.

### Title Screen

**Purpose:** The entrance to your experience.

Every IDN needs a title card. This beat displays:
- Title (big and bold)
- Subtitle (optional)
- Creator credit
- A "Start" button to begin

**When to Use:** Start your experience with a Title Screen. It sets the mood and gives interactors a moment to prepare.

**Pro Tip:** The title screen uses your visual editor settings—add a background image that captures your experience's essence!

---

### Info Text

**Purpose:** Deliver narrative text with a simple continue option.

This is your workhorse for narration. Write descriptive text, the interactor reads it, clicks "Continue," and moves on.

**Key Settings:**
- **Text** - Your narrative content
- **Button Text** - What the continue button says ("Continue...", "What next?", "Onward!")

**When to Use:** Scene descriptions, internal monologue, time jumps, exposition.

**Example:**
```
The forest grew darker with each step.
Elena pulled her cloak tighter, wishing she'd
listened to the old woman's warning.
[Button: "Press deeper into the woods"]
```

---

### Dialog Tree

**Purpose:** Branching conversations and multiple-choice decisions. This is where your system becomes truly interactive.

This is where interactivity shines. Present text and multiple choices, each potentially leading to different outcomes.

**Key Settings:**
- **Main Text** - The prompt or situation
- **Dialog Elements** - The choices (add as many as needed)
- **Presentation Mode** - How the dialog appears:
  - *Positioned* - Traditional visual novel style
  - *Chat Scroll* - Messaging app style
  - *Chat Bubble* - Speech bubbles

**Each Choice Can Have:**
- **Text** - What the option says
- **Target** - Which beat to go to
- **Condition** - Only show this choice if a condition is met

**When to Use:** Conversations, decision points, anywhere the interactor needs options.

**Pro Tip:** Use conditions to hide choices the player hasn't unlocked. Found a secret note? Show the "Ask about the mysterious symbol" option.

**Per-Node Speakers (Multi-Character Conversations):** Every NPC node in a Dialog Tree has its own **NPC Speaker** field — a [Character combobox](#character-combobox) that lets each line of dialog come from a different character. A wolf-and-grandmother scene can flow Granny → Wolf → Granny just by setting different linked characters per node. When a node's speaker is linked to a defined Character, the speaker label and portrait update everywhere automatically — no need to keep the names in sync by hand.

**NPC Auto-Exit:** Dialog nodes can have an **NPC Auto-Exit** target set. When a node has an auto-exit target, the NPC delivers their line and then automatically advances to the target beat without showing any choices. In the Dialog Tree Editor, nodes with an auto-exit show a green badge with the target beat name, and the choices list is hidden (since they are unreachable). Use this for NPC-initiated dismissals, forced exits, or transitions where the player has no say.

- Set auto-exit to a beat to advance there after the NPC speaks
- Set auto-exit to **Return to initial choices** (`__self__`) to loop back to the root of the dialog tree

**Recursive Dialogs:** Set a choice's target to `__self__` to loop back to the root of the dialog tree. This is powerful for "hub" conversations where the interactor can ask multiple questions before leaving. Combined with **per-choice visited tracking** (`markVisited`), choices the interactor has already picked can be visually dimmed or hidden.

**Choice Effects:** Each choice can trigger immediate side effects—set variables, modify counters, add/remove inventory, **nudge a character's mood**, **fire an emotion**, **add a sentiment**, **set a goal's status**, **switch a character's active variant**, or **append a reflection** to a Mode B character's memory. Open the **Effects** section on any choice and pick **+ Add Effect** (or **+ apply template…** for a preset bundle of affect-stack effects). The full list of affect-aware effects, the character-target dropdown that backs them, the inline labels and palette-backed comboboxes, the eight starter templates, and the live "what does this choice do?" summary are documented in [Affect-Aware Choice Effects](#choice-effects-affect) and [Easier authoring](#effects-easier-authoring).

---

### Movement Choice

**Purpose:** Location-based navigation.

Perfect for exploration! Display a scene and let interactors choose where to go. Each destination can have a name and optional image.

**Key Settings:**
- **Main Text** - Description of current location
- **Destinations** - Places the interactor can go, each with a target beat

**When to Use:** Exploration games, room-by-room adventures, maps.

**Example:**
```
You stand in the castle's great hall.
Three doorways beckon.

[North: The Tower Stairs]
[East: The Kitchen]
[West: The Dungeon]
```

---

### Pick Prop

**Purpose:** Select an item from the scene.

Present objects the interactor can interact with. Great for investigation scenes or collecting items.

**Key Settings:**
- **Main Text** - Description of what they're looking at
- **Props** - Items to choose from
- **Display Mode** - Text list or graphical icons

**When to Use:** Investigation scenes, inventory puzzles, examining objects.

---

### Duration Screen

**Purpose:** Timed text display.

Like Info Text, but advances automatically after a set time. Useful for dramatic pauses, cutscene-style moments, or keeping the pace moving.

**Key Settings:**
- **Text** - Content to display
- **Duration** - How long before auto-advancing (in seconds)
- **Show Timer** - Whether to display a countdown bar

**When to Use:** Tension building, dream sequences, "Meanwhile..." transitions.

---

### Video Beat

**Purpose:** Play video content.

Embed videos in your story—cutscenes, tutorials, animations, or any video content.

**Key Settings:**
- **Video Asset** - Which video to play
- **Autoplay** - Start immediately or wait for click
- **Controls** - Show playback controls
- **Skip Button** - Let interactors skip the video

**When to Use:** Cutscenes, intro sequences, tutorial segments.

---

### Input Text

**Purpose:** Free-form text entry from the interactor.

Let interactors type something—their character's name, a password, an answer to a riddle.

**Key Settings:**
- **Prompt** - What to ask
- **Placeholder** - Example text in the input field
- **Validation** - Require specific formats (email, numeric, alphanumeric)
- **Save To** - Store the input in a variable

**When to Use:** Character naming, puzzles, personalization.

---

### Keypad

**Purpose:** Numeric input via phone-style keypad or combination lock.

Present a keypad interface where interactors enter a code—a phone number, safe combination, PIN, or access code.

![Keypad Beat](images/12-keypad-beat.png)
*The Keypad beat configured as a phone dialer*

**Key Settings:**
- **Prompt Text** - Instruction shown above the keypad ("Dial the number", "Enter the code")
- **Layout** - Phone (1-9, *, 0, #), Numeric (1-9, ←, 0, ✓), or PIN (1-9, C, 0, ✓)
- **Min/Max Digits** - How many digits are required
- **Correct Code** - The code that triggers success (leave empty to accept any input)
- **Max Attempts** - How many tries before failure (0 = unlimited)
- **Mask Input** - Show `*` instead of digits (for PIN/password entry)
- **Save To** - Store the entered code in a variable or counter
- **Fail Target Beat** - Where to go when max attempts are exceeded

**When to Use:** Phone dialing puzzles, safe cracking, PIN entry, code doors, any numeric input scenario.

**Example:**
```
Prompt: "Enter the vault combination"
Layout: Simple (1-9, 0)
Correct Code: 4815162342
Max Attempts: 3
Fail: "Alarm Triggered" beat
```

---

### Hyper Text

**Purpose:** Clickable words within text.

Create text where specific words are clickable, each leading to different paths. Like a webpage, but for stories.

**Key Settings:**
- **Text** - Full text with clickable sections marked
- **Links** - What each clickable word connects to

**When to Use:** Subtle choices, exploration of details, non-linear reading.

**Example:**
```
On the desk sat a [letter], a [photograph], and a [strange key].
```

Each bracketed word can lead to a different beat.

---

### 360 Panorama

**Purpose:** Immersive panoramic exploration.

Drop the interactor into a 360-degree scene they can look around in. Place interactive hotspots at specific positions within the panorama for navigation or interaction.

**Key Settings:**
- **Panorama Image** - An equirectangular image for the 360-degree view
- **Hotspots** - Clickable points placed at pitch/yaw coordinates
- **Starting Orientation** - Where the camera faces initially
- **Field of View** - How wide the view is

**When to Use:** Virtual tours, immersive environments, location-based exploration, escape rooms.

---

### End Screen

**Purpose:** Story conclusion.

The final beat. Display an ending message with options to restart or view a dedicated credits page.

**Key Settings:**
- **Message** - Your ending message (defaults to "The End")
- **Show Restart** - Display a "Play Again" button. You can customize the button label with the **Restart Text** field.
- **Show Credits** - Display a "Credits" button that opens a scrollable credits page. Customize the button label with the **Credits Text** field.
- **Reset on Restart** - When enabled, clears story state when the interactor clicks "Play Again" (not when the End Screen first appears). You can choose exactly what gets reset (see below).

**Granular Reset Options:**

When the **Reset** toggle is turned on, a set of sub-options appears letting you control exactly which parts of the story state are cleared on restart. All are enabled by default, but you can uncheck any you want to preserve:

| Option | What It Clears |
|--------|---------------|
| **Variables** | All true/false story variables |
| **Counters** | All numeric counters (gold, health, etc.) |
| **Inventory** | All items held by all characters |
| **Timers** | All active timers |
| **Fictional Time** | The in-story date and time |
| **Visited Tracking** | Record of which beats and choices have been seen |
| **History** | The ordered log of beats visited during play |

This is especially useful for "New Game+" experiences where you want interactors to keep some progress. For example, you might reset variables and history but preserve inventory so the interactor carries their collected items into a second playthrough.

**Customizable Credits Page:**

When **Show Credits** is enabled, the interactor sees a "Credits" button on the end screen. Clicking it opens a dedicated credits page with its own title, body text, and close button. You can configure:

- **Credits Page Title** - The heading at the top of the credits page (defaults to "Credits")
- **Credits Page Body** - The main content of your credits page. This is a multi-line text area where you can write anything you like -- team members, acknowledgments, tools used, special thanks, licensing info, etc. If you leave it empty, ASAPS automatically populates it with your project's title and author from the project metadata.
- **Credits Close Text** - The label on the button that returns to the end screen (defaults to "Close")

All three credits fields support **variable interpolation**, so you can include dynamic content like `${playerName}` in your credits text.

**When to Use:** Every ending your story has. Good stories often have multiple endings, and each one can have its own unique message, reset behavior, and credits content.

---

### Online Content

**Purpose:** Pull live content from the web.

Fetch real-time data from APIs or AI web searches, then display it. Make stories that react to the real world.

**Key Settings:**
- **Mode** - Direct API call or AI-powered search
- **Query/URL** - What to fetch
- **Display Template** - How to show the results

**When to Use:** Current events integration, dynamic content, web-aware narratives.

---

## Logic Beats: The Invisible Machinery

These beats work behind the scenes. Readers never see them directly, but they make your story smart.

### Set Variable/Counter

**Purpose:** Change story state.

Set a variable to true/false or modify a counter value. This is how your story remembers things.

**Examples:**
- Set `hasKey` to `true` when the player finds a key
- Add 10 to `gold` when they find treasure
- Set `reputation` to 50 at story start

**Flow:** Executes instantly, then moves to the target beat.

---

### Condition Beat

**Purpose:** Branch based on conditions.

Check something and go different directions based on the result. "If this, go here. Otherwise, go there."

**Can Check:**
- Variable values (is `hasKey` true?)
- Counter comparisons (is `gold > 100`?)
- Inventory contents (does player have "Sword"?)
- Timer status (is the countdown active?)
- Fictional time (is it past midnight in the story?)
- **Character affect** (added in v0.9.43): mood, emotion intensity, trait value, sentiment toward another character, goal status, or which variant of a character is currently active

**Example Logic:**
```
IF hasKey = true
  → Go to "Enter the Tower"
ELSE
  → Go to "Locked Door"
```

The full set of checks and their per-form fields is documented in [Condition Beats](#condition-beats) further down.

> **Looking for "has the player visited beat X?"** That check lives on a beat's [Requirements section](#condition-beats), not in the standalone Condition Beat dropdown. Open the Requirements panel, click **Add requirement**, and pick *Visited beat*.

---

### Random Target

**Purpose:** Add unpredictability.

Connect multiple target beats, and the story randomly chooses one. Good for variety on replay.

**Key Settings:**
- **Targets** - Possible destinations (add several)
- **Weights** - Optional, make some outcomes more likely

**When to Use:** Random encounters, varied responses, games of chance.

---

### Set Timer

**Purpose:** Create timed events.

Start a countdown. When it expires, the story can jump to a specific beat.

**Key Settings:**
- **Timer Name** - Identifier for this timer
- **Duration** - How long until it triggers
- **Target Beat** - Where to go when time's up

**When to Use:** Time pressure, deadlines, real-time elements.

---

### Inventory Management

**Purpose:** Manage items.

Give characters items or take them away. Items can be transferred between characters too.

**Actions:**
- Add item to character's inventory
- Remove item from character
- Transfer item from one character to another

**Character fields:** All three character slots (`Character`, `From character`, `To character`) use the [Character combobox](#character-combobox). **Player** is pinned at the top of the dropdown — picking it routes to the player's inventory and preserves the global single-inventory shortcut some authors rely on. Picking any defined Character stores a stable id link, so renaming a character later updates these references automatically.

**When to Use:** Finding loot, using consumables, trading, losing items.

---

### Update Affect

**Purpose:** Drift a character's mood, fire an emotion, or strengthen a sentiment from a beat in the flow.

This is the logic-beat counterpart to the [affect-aware choice effects](#choice-effects-affect). Use it when the affect change isn't triggered by a player choice — e.g. *"on entering the haunted house, every NPC's fear rises"*, or *"at the end of Act 1, the player feels pride."*

**Key Settings:**
- **Character** — whose affect changes
- **Mood deltas** — optional ±valence and ±arousal (clamped to `[-1, 1]`)
- **Sentiment** — optional (target, emotion, strength delta) tuple
- **Emotion** — optional (emotion name, intensity delta); when the emotion is in the project's [Emotion Palette](#emotion-palette), the runtime auto-nudges mood by the palette weights so you don't have to specify mood deltas separately

All fields are optional — at minimum one of mood deltas, the sentiment trio, or the emotion pair must be set, otherwise the beat is a silent no-op.

**When to Use:** Atmosphere shifts, story-beat-level emotional pivots, "the world has changed" moments where affect should update without a player action.

---

### AI Condition

**Purpose:** AI-powered branching.

Let AI analyze the player's current state (variables, inventory, history) and choose the best next path. More flexible than fixed conditions.

**Key Settings:**
- **Evaluation Prompt** - What to consider
- **Categories** - Possible paths
- **Fallback** - Where to go if AI is uncertain

**When to Use:** Complex state evaluation, narrative judgment calls.

---

### AI Dialog Tree

**Purpose:** AI-generated conversations with pre-built branching.

Instead of scripting every possible response, let AI generate a contextually appropriate dialog tree at runtime. The AI produces a complete branching conversation with multiple choices, tailored to the player's current state.

**Key Settings:**
- **Scenario** - Scene description providing context
- **NPC Name** - Who the player is talking to. Uses the [Character combobox](#character-combobox) — pick a defined Character to link this beat to that character's identity. When you link a Character that has a description set, the description is auto-filled into **NPC Personality** below (only if that field is empty), so you don't have to rewrite the persona on every AI beat that uses the same NPC. Free-text names still work.
- **NPC Personality** - How the AI should "act"
- **Exit Targets** - Named exits with descriptions telling the AI when to use each one
- **Max Turns** - Limit conversation length
- **Presentation Mode** - Positioned, chat scroll, or chat bubble
- **Context Toggles** - Include variables, inventory, visited beats, choice history

**Exit Target Features:**
- **NPC Exit Message** - Each exit target can have an optional `npcExitMessage` prompt. When set, the AI generates a farewell line that directly acknowledges the player's last choice before transitioning. This makes exits feel natural rather than abrupt.
- **Exit Reason Tracking** - The AI includes an `exitReason` for each exit choice, explaining what the player said or expressed to satisfy the exit condition. This helps authors debug conversation flow.
- **Routing Plan** - The AI generates a `routingPlan` explaining its reasoning: how it mapped exit conditions to conversation branches and what player signals it looks for. This is logged in the session timeline for debugging.

**AI Prefetching:** The AI DialogTree supports background prefetching. When the story engine knows this beat is coming next, it generates the dialog tree in the background before the beat executes. This eliminates the loading delay the player would otherwise see, making AI conversations feel instantaneous.

**When to Use:** NPCs that feel alive, unlimited dialog, personalized responses.

---

### AI Conversation

**Purpose:** Real-time, free-form AI conversations with author-defined steering rules.

Unlike AI Dialog Tree (which pre-generates a branching tree), AI Conversation generates each NPC response live based on what the player actually types. The author controls the conversation through **directions** -- rules that steer the AI based on what the player says.

**Key Settings:**
- **Scenario** - Scene description
- **NPC Name** - The NPC the player is conversing with. Same [Character combobox](#character-combobox) as AI Dialog Tree — link to a defined Character to keep the identity stable, or type a free-text name. Linking a Character with a description auto-fills **NPC Personality** when that field is empty.
- **NPC Personality** - Character traits and behaviour the AI should embody
- **Opening Line** - Fixed first line (if empty, the AI generates one)
- **Max Turns** - Conversation length before fallback exit
- **Fallback Exit Target** - Where to go when max turns are reached
- **Enable Voice Input** - Show a microphone button for speech-to-text input
- **Context Toggles** - Include variables, inventory, visited beats, choice history
- **System Instructions** - Additional rules for the AI

**Conversation Directions:**

Directions are the heart of AI Conversation. Each direction has a **trigger** and an **action**:

**Trigger Types:**
| Trigger | What It Detects |
|---------|----------------|
| **Topic Mention** | Player mentions specific keywords |
| **Sentiment** | Player's emotional tone (positive, negative, angry, curious) |
| **Turn Count** | Conversation reaches a certain number of turns |
| **Variable** | A story variable has a specific value |
| **Custom** | Free-text description evaluated by AI |

**Action Types:**
| Action | What Happens |
|--------|-------------|
| **Steer** | Give the AI a steering instruction (e.g., "mention the hidden passage") |
| **Exit** | End the conversation and go to a target beat |
| **Set Variable** | Set a story variable based on the conversation |
| **Multi-Action** | Combine actions (e.g., steer + set variable, or exit + set variable) |

**Advanced Direction Features:**
- **Variable Guards** - Directions can require a specific variable value before they activate (e.g., only trigger the "secret info" direction if `hasKey` is true)
- **Once-Only** - Mark a direction to fire at most once per conversation
- **Negate Triggers** - Invert a trigger (fires when the condition is NOT met)
- **AI Value Extraction** - Instead of setting a static variable value, provide an extraction prompt and let the AI determine the value from the conversation context
- **Exit Messages** - When an exit direction fires, the NPC can deliver a farewell line that acknowledges what the player just said

**When to Use:** Open-ended conversations, investigation scenes where the player can ask anything, therapy/counseling simulations, NPC shopkeepers, any scenario where pre-scripted branches feel too limiting.

**Example Setup:**
```
Scenario: "The player meets a merchant in a bazaar"
NPC: "Fatima", personality: "shrewd but fair, loves haggling"

Directions:
  1. Topic "price, cost, expensive" → Steer: "offer a 10% discount"
  2. Sentiment "angry" → Steer: "apologize and offer a gift"
  3. Topic "secret, hidden, special" + requires secretContact=true
     → Exit to "Back Room" beat + set variable visitedBackRoom=true
  4. Turn count >= 5 → Exit to "Market Square" beat
```

---

### AI Summary

**Purpose:** Generate a story recap.

AI creates a personalized summary of the player's journey—their choices, discoveries, and path through the story.

**Styles:**
- **Narrative** - Prose summary
- **Bullet Points** - List of key events
- **Reflection** - Thoughtful commentary

**When to Use:** End-of-chapter recaps, endings that reference your journey, "Previously on..." moments.

---

# Part 4: Characters & Assets

A great experience needs a great cast and a rich world. Let's populate yours.

## Characters

![Character Manager](images/03-character-manager.png)
*The Character Manager panel*

### Why Characters Matter

Characters aren't just pretty faces. They're miniature systems in their own right:
- Multiple visual appearances (happy, sad, angry)
- Their own counters (health, trust, energy)
- Inventory they carry from beat to beat
- A personality (Big Five traits and an archetype) that quietly modulates how they react
- A 2D mood (valence × arousal) that can drift over the session
- Directed feelings — sentiments — toward the player and other characters
- Goals that the runtime tracks and that fire pride/joy or shame/sadness when met or failed
- Optional **variants** — alternate persona overlays sharing one stable id (introvert/extrovert Alex, masculine/feminine Sam) that the player can switch between

You can ignore all of this and ship a perfectly good story with just names and pictures. But if your AI-driven characters need to *feel like someone* — and especially if you want them to react differently depending on what the player has done — these are the dials.

### Creating a Character

1. Click **Characters** in the header
2. Click **Add Character**
3. Fill in the basics:
   - **Name** - Internal identifier (e.g., "elena")
   - **Display Name** - What interactors see (e.g., "Elena Blackwood")
   - **Role** - Player, NPC, or Companion
   - **Description** - Notes for yourself

### Character Appearances

Characters can have multiple visual states:

1. In the character editor, find **Appearances**
2. Click **Add Appearance**
3. Name it (e.g., "happy", "angry", "wounded")
4. Upload or select an image

In your story, you can then show the character in different states. Elena can look happy when things go well and worried when they don't.

### Character Counters (Stats)

Track numeric values for each character:

1. In the character editor, find **Counters**
2. Click **Add Counter**
3. Configure:
   - **Name** - "Health", "Trust", "Energy", etc.
   - **Min/Max Values** - Range limits
   - **Starting Value** - Initial amount
   - **Color** - For visual display
   - **Display Format** - Number, percentage, or fraction

Counters can be displayed as bars in your story, giving interactors visual feedback.

### Character Inventory

What can this character carry?

1. Find **Inventory** in the character editor
2. Configure inventory display (grid size, item sizing)
3. Add starting items if any

During the story, use Inventory beats to give or take items.

### Speaker Portraits

Give your characters a face that appears alongside their dialog. Speaker portraits are small images (typically a face or headshot) that display inside or above the text box whenever that character speaks.

1. Open a character in the Character Editor
2. Switch to the **Visual** tab
3. Scroll down to **Speaker Portrait**
4. Upload a portrait image (square or near-square works best)

To enable portraits globally, go to **Settings → Effects → Speaker Display** and check **Show speaker portraits**. You can also choose where portraits appear and how large they are — see [Speaker Display Settings](#speaker-display) for details.

**Tip:** Portraits are different from character appearances. Appearances are the full-body images placed on the visual stage; portraits are small face images shown in the text box during dialog.

### Character Name Translations

When your project has translation languages configured, the Character Editor gains a **Translations** tab (marked with a globe icon). This lets you enter translated display names for each character, per language.

1. Make sure you have at least one translation language configured (see [Multi-Language Translation](#multi-language-translation))
2. Open a character in the Character Editor
3. Click the **Translations** tab
4. Enter the translated display name for each language

When AI translation runs on your project, character name translations are auto-populated and kept in sync with translation resource files. During playback with a translation active, the translated name appears as the speaker label in text boxes.

<a id="character-combobox"></a>
### The Character Combobox — One Field for Every Character Reference

Anywhere in the Inspector that asks for a character — a beat's speaker, an inventory recipient, an AI NPC name, a per-node speaker inside a Dialog Tree — you'll see the same control: a **Character combobox**. Click into it (or start typing) and a dropdown opens with everything you might want to pick:

- **Pinned options** at the top — context-specific shortcuts. For a beat speaker the pins are *(Default — Narrator)*, *Narrator*, and your Player character (shown as e.g. *"Red (Player)"*). For inventory beats and the player-side fields the pin is *Player*.
- **Characters** — every Character you've defined in the Character Manager, each with its color dot and display name.
- **Used names** — every free-text speaker / character name used elsewhere in your project, with a usage count next to each (e.g. *"Mysterious Stranger 3×"*). Picking one stores it as free text — handy for keeping ad-hoc names consistent without committing to a full Character record.
- **+ Define "<typed name>" as a Character** — appears at the bottom of the dropdown when whatever you've typed isn't yet a defined Character. Click it to open the Character Manager pre-filled with that name, ready for you to add details.

**Where you'll see it.** The same combobox appears everywhere a character is referenced — five distinct sites in total:

1. The **Speaker** field on every beat type (used for TTS voice routing and speaker labels).
2. The **NPC Speaker** field on each individual node inside a **Dialog Tree** — so a single Dialog Tree can naturally flow Granny → Wolf → Granny by giving each node a different linked speaker.
3. The **Character**, **From character**, and **To character** fields on **AddRemoveInventory** beats. *Player* is pinned at the top of these dropdowns and preserves the global single-inventory routing some authors rely on.
4. The **NPC Name** field on **AI Dialog Tree** beats.
5. The **NPC Name** field on **AI Conversation** beats.

In the two AI cases the dropdown is filtered to non-player Characters — the player is never the NPC.

**What "linking" means.** When you pick a defined Character, the field shows a colored chip with the character's name and a small **✕** unlink button. The chip is a stable link to that character's identity — not just a string copy — so:

- Renaming the Character in the Character Manager updates **every** linked field across your project automatically.
- TTS voice routing, speaker portraits, and other character-aware features look up the linked record once and stay in sync.
- For AI Dialog Tree and AI Conversation, linking the NPC field to a Character that has a **description** auto-fills the **NPC Personality** slot from that description (only if the slot is currently empty). This means you can write the persona once on the Character record and have it reused on every AI beat that uses the same NPC.
- If you ever delete a Character that's still linked somewhere, those fields show a small *(deleted)* indicator so you can see what needs cleanup.

To go back to plain text, click the **✕** on the chip and type whatever you like.

**Define-as-Character with one-click bulk re-link.** Authoring stories often starts with free-text names — you scribble *"Town Crier"* into a few beats while drafting, then later decide the Town Crier deserves a real Character with a portrait and a personality. Clicking **+ Define "Town Crier" as a Character** opens the Character Manager pre-filled with that name. Once you fill in details and save, ASAPS asks:

> *"Link N references to Town Crier?"*

…and lists every beat field across your project that uses *"Town Crier"* as free text — speaker fields, dialog node speakers, AI NPC fields, inventory characters. One click links them all to the new Character and they start following renames automatically. References already linked to **other** Characters are never silently overwritten — the dialog skips them. If you'd rather leave the old refs as free text, click **Keep as free text** instead.

**Why this matters.** ASAPS treats characters as identities, not strings. When you link a field to a defined Character, the runtime resolves that link to a single canonical record — no matter how the character is referenced (id, name, or display name). That stable identity is what makes character-aware features such as per-character mood, sentiment-over-time, goals, variants, and dossier building work — see [The Affect Tab](#character-affect) for the full picture. Everything still works if you stick with free-text names; linking just unlocks more.

### The Player Character as Speaker

Your player character (the character with the "Player" role) automatically appears as a built-in option in beat speaker dropdowns. You'll see it listed by its display name with "(Player)" appended — for example, **Red (Player)**.

When you assign the player character as a beat's speaker, the character's actual display name is stored (not the generic "Interactor"). This means speaker labels and portraits work naturally for the player character, just like any other character.

**TTS behavior:** The player character is silent by default in text-to-speech mode. If you assign a TTS voice to the player character, their text will be spoken — and in multi-choice beats (like Dialog Trees), clicked choices are spoken aloud in the player character's voice.

### Character Templates

Start faster with pre-made templates:
- **Player** - Standard protagonist setup
- **Merchant NPC** - Comes with gold counter and inventory
- **Wizard NPC** - Magic-focused stats

Select a template, customize to fit your story.

<a id="character-affect"></a>
### The Affect Tab — Personality, Mood, Sentiments, Goals & Variants

Open any character in the Character Editor and click the **Affect** tab (heart icon). This is where the character's inner life lives. None of these fields are required — leave the tab untouched and the character behaves as a pleasant blank slate. Fill them in when you want richer, more reactive behavior in AI beats and emotion-aware logic.

![Affect tab overview](images/18-affect-tab-overview.png)
*The Affect tab on a fresh character — everything starts neutral / empty so authors only see what they care about.*

The tab is organized as a stack of cards, top to bottom: **Personality**, **Initial mood**, **Initial sentiments**, **Dossier policy**, **Goals**, **Variants**, **Mood HUD**. Take them one at a time — most stories only need two or three.

#### Personality — Big Five traits and archetype presets

Personality traits are static numbers in `[0, 1]` that scale how strongly a character's emotions react to events. They never gate choices on their own — they're a quiet multiplier on emotion deltas at runtime.

You have two ways to fill in this card:

**1. Pick an archetype.** The **Load archetype** dropdown ships with ten research-grounded presets — *Balanced, Narcissist, Anxious introvert, Conscientious leader, Free spirit, Recluse, Hothead, Peacekeeper, Stoic, Trickster*. Pick one and ASAPS replaces the Big Five sliders with that profile and shows a description plus any **Seeded toward self:** sentiments the preset implies (the Anxious introvert, for example, seeds a mild self-shame; the Stoic seeds nothing because the research doesn't ground a specific self-feeling for that profile).

![Personality archetype applied](images/20-archetype-applied.png)
*Picking "Anxious introvert" replaces the Big Five sliders, surfaces the description, and seeds a self-directed sentiment — all visible at a glance.*

**2. Tune by hand.** Click **+ Add Big Five** to seed Openness, Conscientiousness, Extraversion, Agreeableness, and Neuroticism at neutral 0.5. Each trait has its own slider and a one-line description so you don't need to remember which way the axis points. Click **+ Add custom trait** to invent your own (e.g. *bravery*, *curiosity_about_tech*) for story-specific use.

You can mix the two — pick an archetype to get 80% of the way there, then nudge individual sliders to taste. Custom (author-named) traits are preserved when you switch archetypes.

> **Why traits don't gate choices.** Locking a choice behind *"requires Extraversion ≥ 0.7"* would make the character feel deterministic in a way real personalities aren't. Traits modulate; they don't decide. If you want to branch on personality, branch on what the personality has *led the character to do* (mood, sentiment, visited beats) — that's more reactive and more readable.

#### Initial mood — the 2D Mood Pad

Mood is two numbers — **valence** (sad ↔ happy) and **arousal** (calm ↔ excited) — that together place the character on Russell's circumplex of affect. The pad in the editor is a 320-pixel interactive disc:

- Click or drag inside the disc to set both axes at once.
- Tiny **valence** and **arousal** sliders below the pad are for numeric fine-tune.
- If a project emotion palette is defined (see [Emotion Palette](#emotion-palette) below), faint purple markers show where each emotion sits in mood-space — *joy* up-and-right, *sadness* down-and-left, *surprise* almost pure-arousal, etc. Picking a mood near *fear* will literally drop the dot near the *fear* marker.
- A small subtitle under the pad describes the mood in plain language ("happy, alert" / "sad, calm" / "neutral").
- A **Reset to neutral** link appears whenever the mood isn't already at the origin.

Mood drifts at runtime via `nudgeMood` and `fireEmotion` effects, the **Update Affect** logic beat, and emotion decay (each emotion in the palette has its own decay rate). The Initial mood you set here is just the seed.

#### Initial sentiments — directed feelings at story start

A sentiment is a (target, emotion, strength) tuple: *fear toward wolf +0.7*, *trust toward player +0.5*. Click **Add sentiment**, type or pick the target, the emotion name, and slide the strength between -1 and +1. Each row is one feeling.

Sentiments can target other characters, the player, items, or any string you want to use as a key — but linking to a defined Character via id is what gives you stable references that survive renames.

When the sentiment's holder and target are the same character (a self-shame, self-pride etc.), ASAPS renders it with the *self-* prefix — e.g. **mild self-shame** instead of *mild shame toward Alex*. The same convention is used in the LLM dossier, which splits affect into "Feels toward themselves:" and "Feels toward others:" so prompts don't sound recursive.

#### Dossier policy — how the LLM sees this character

The dossier is the structured summary of the character that ASAPS injects into AI beats (AI Conversation, AI Dialog Tree, etc.) so the LLM knows who's speaking. The dossier policy radio controls how that summary is built each turn:

- **Re-anchor every turn (default — Mode A)** — Rebuilds the dossier from the character's structured state on every AI turn. The character cannot drift away from who they are. Recommended for almost every story.
- **Accumulate reflections (Mode B)** — Appends short author-or-runtime-seeded *reflections* across turns. The character is allowed to grow and remember subjectively. Choose this for protagonists or NPCs who should change over the session.

Mode B is paired with the new **`addReflection`** effect (see [Choice Effects](#choice-effects-affect) below) — a short narrative note in the character's voice plus a salience score in [0, 1]. Reflections survive longest when salience is high and oldest-low-salience entries are evicted first when the per-character cap fills up. Mode A characters silently ignore reflections in their dossier.

#### Goals — authored objectives with auto-fired emotions

Goals are simple authored objectives: an id, a name, an optional description, and an optional priority slider. The runtime tracks each goal's status (`open`, `met`, `failed`, `abandoned`); when a goal flips to `met` it auto-fires pride and joy on its owner, and when it flips to `failed` it auto-fires shame and sadness — both scaled by priority. The mechanism follows the GAMYGDALA model from the affective-computing literature.

You change a goal's status from a player choice via the new **`setGoalStatus`** effect, which exposes a target dropdown (the character whose goal it is), a `goal-id` field, and a status dropdown (`met`/`failed`/`abandoned`/`open`). For quiet goal updates you don't want to fire emotions on, the runtime supports a `suppressEmotion` flag on the effect.

> **Mode A vs Mode B for goals.** Mode A characters can leave Goals empty — they don't need them. Mode B / agentic stories generally want at least one or two goals to drive emergent behavior; goals are what give a Mode B character forward motion between scenes.

#### Variants — alternate persona overlays for one character

A variant is an alternate persona slice that shares the same character id. Use them when you want:

- *"Play as introvert Alex / extrovert Alex"* (player-picked persona)
- *"Play as a man / a woman / non-binary"* (gender-flexible protagonist)
- A single NPC who comes in two flavors and the runtime picks one

Click **+ Add variant** in the Variants section. The first time you add one, ASAPS migrates the base character's personality, mood, sentiments, and dossier policy onto the new variant so you don't lose work — and the parent's Personality / Initial mood / Initial sentiments / Dossier policy cards collapse into a banner reading *"This character has N variants. Personality, initial mood, and sentiments are authored per variant below…"* Subsequent variants clone from the first variant so you can copy-and-tweak.

![Affect tab with variants and a goal](images/21-affect-with-variants-goals.png)
*Once a character has variants, each variant card carries its own complete persona slice — Big Five sliders, archetype shortcut, MoodPad, sentiments, portrait override, displayName override. The "default" radio picks which variant auto-applies at story start.*

Each variant card carries:

- A **default** radio (one variant per character can be marked default — that one auto-applies at story start when no `setCharacterVariant` effect has fired yet).
- A **variant id** (stable identifier used by the `setCharacterVariant` effect and `characterVariant` condition).
- A **variant label** (e.g. *Anxious introvert*) and an optional **display name** override (the user-facing name when this variant is active).
- An optional description, surfaced in the dossier when the variant is active.
- A **trait preset** dropdown — the same ten archetypes as the base, but applied to *this variant only*. Variant traits can be cleared to fall back to base character traits.
- A 2D MoodPad and sentiment list specific to this variant.
- A **portrait override** (optional) — leave empty to inherit the base portrait. Variants share the base character's sprite sheet, states, and animations; only the affect/persona slice and the portrait swap.

To switch variants at runtime, drop a **`setCharacterVariant`** effect on a player choice (target = the character, value = the variant id). To branch on the active variant, drop a Condition Check beat and pick **Active variant** from the **Character affect** group in the Condition Type dropdown — the editor will then ask you for the character and the variant id to compare against (cascading from the character's authored variants, with a free-text fallback when none have been authored yet). The runtime evaluates this branch the same way it evaluates "player has lantern" — it just checks a different slice of state.

In the Character Manager the grid changes shape for characters with variants: instead of a single card you get a **grouped card** with a colored border (the parent's color), a parent header showing the display name and variant count, and one inner sub-card per variant.

![Character Manager showing a grouped card with variants](images/24-character-manager-grouped.png)
*A character with two variants in the Character Manager. The colored border is the parent's color; clicking the parent header opens the editor on the base character; clicking a variant sub-card opens the editor focused on that variant (Affect tab pre-selected, scrolled to and briefly outlined). The pencil and X buttons on each sub-card edit and remove that variant.*

#### Mood HUD — show a character's mood on stage

Each character can carry an optional **Mood HUD** — a small 2D mood-pad card that mounts on the running stage and shows the character's mood updating in real time during preview and exported web play.

![Mood HUD configuration](images/22-mood-hud.png)
*The Mood HUD card. Off by default — turn it on for characters whose emotional state should be visible to the player.*

In the **Mood HUD** card on the Affect tab:

- **Enable HUD pad** — master on/off switch. Off by default.
- **Dock mode** — *Anchored to character* (HUD floats next to the character's sprite on stage) or *Fixed to screen corner* (HUD pinned to one of the four screen corners).
- **Anchor / Corner** — eight character-relative positions (top, bottom, left, right, top-left, top-right, bottom-left, bottom-right) when docked to a character; four screen corners when fixed.
- **Size (px)** — between 48 and 320; defaults to ~140.
- **Opacity** — 0.2 to 1.0.
- **Show emotion-palette markers** — overlays the project's emotion palette on the disc.
- **Show axis labels** — the *sad / happy / calm / excited* corner labels.
- **Show qualitative mood label** — a one-line plain-English description below the disc (e.g. *"sad, alert"*).

If a character has variants, the HUD hides until the player picks a variant — so you don't end up showing a HUD for a character who hasn't been instantiated yet.

<a id="emotion-palette"></a>
### Emotion Palette — Names, Mood-Axis Weights, Decay Rates

Mood and emotions are project-wide. ASAPS ships with the **Ekman 6** (joy, anger, fear, sadness, surprise, disgust) plus *pride*, *shame*, and *interest* — nine emotions out of the box, each tuned to a position in mood-space and a decay rate.

To edit the palette, click **Emotion palette…** in the Character Manager toolbar (next to **Add Character**).

![Emotion palette editor](images/25-emotion-palette-editor.png)
*The Emotion Palette editor. Each row is one emotion: name, valence weight, arousal weight, and decay rate per beat-entry tick.*

For each emotion you can set:

- **Name** — what the runtime resolves against (case-sensitive).
- **Description** (optional) — purely for the author's reference.
- **Valence weight** in `[-1, 1]` — how strongly firing this emotion nudges the character's mood toward happy / sad.
- **Arousal weight** in `[-1, 1]` — how strongly it nudges toward excited / calm.
- **Decay rate** in `[0, 1]` — what fraction of the emotion's intensity bleeds off each beat-entry tick.

Click **Add emotion** to invent a new one, or **Reset to default** to wipe the palette back to the Ekman 6 + pride/shame/interest. The palette persists with the project.

When you fire an emotion via the `fireEmotion` effect or an Update Affect beat, the runtime auto-nudges the target's mood by the emotion's valence and arousal weights, scaled by the firing intensity and the target's neuroticism trait. That's why the palette weights matter: they wire the discrete *"the character felt fear"* event into the continuous mood space the HUD displays.

<a id="choice-effects-affect"></a>
### Affect-Aware Choice Effects

Anywhere ASAPS lets you attach **Effects** to a player choice — Dialog Tree choices, Movement Choice destinations, dialog node entries — the dropdown now includes six affect-aware effect types alongside the classic counter / variable / inventory ones:

| Effect | What it does | Extra fields |
|--------|--------------|--------------|
| **Nudge Mood** | Shifts the target's mood by a (valence, arousal) delta. Runtime clamps to `[-1, 1]`. | ±valence, ±arousal |
| **Add Sentiment** | Adds or strengthens a directed feeling (e.g. *trust toward player +0.3*). | sentimentTarget, sentimentEmotion, strengthDelta |
| **Fire Emotion** | Bumps an emotion intensity; the runtime auto-nudges mood per palette weights. | emotion name, ±intensity |
| **Add Reflection** | Appends a short narrative note (text + salience) to a Mode B character's reflection memory. Mode A characters ignore it. | reflectionText, reflectionSalience |
| **Set Goal Status** | Flips a goal to `met` / `failed` / `abandoned` / `open`. `met` and `failed` auto-fire pride/joy and shame/sadness scaled by priority. | goalId, goalStatus |
| **Set Character Variant** | Switches which variant of a character is active. Empty value clears the active variant. | variantId |

The **target** field for all six effect types is now a **dropdown of the project's characters** (display name shown, stable id stored under the hood) plus a sentinel **Player** entry pinned at the top. No more typing `char_alex` by hand and hoping you spelled it right. If the editor isn't given a project character roster (some compact sub-editors don't have one in scope), the field falls back to a free-text input.

> **Where to find Effects.** Effects sit on Dialog Tree choices, Dialog Tree nodes, Movement Choice destinations, and Pick Prop choices. Open the **Effects** section on any of these and click **+ Add Effect**.

<a id="effects-easier-authoring"></a>
### Easier authoring: labels, palette suggestions, templates, and a live summary

Affect effects are powerful — a single choice can stack five, six, or nine rows of mood, emotion, sentiment, and reflection changes — but a wall of anonymous numeric inputs is hard to read at a glance, and the right shape of a "supportive" or "dismissive" choice is something authors tend to learn the hard way. The choice editor now does four things to take that pain off your back.

![Inspector with the choice's effects panel and live summary](images/34-choice-effects-overview.png)
*A Late Night Follow Up choice in the **Standing Beside Alex** sample project. The Effects section stacks several affect rows; the small italic blue-tinted block at the bottom (`→ Alex: feels happier, calmer; joy spikes; …`) is the live "what does this choice do?" summary, updating every time you nudge a value.*

#### A walk-through

1. **Open a Dialog Tree beat** in the Flowchart and pick a player choice — for example, the third option ("You don't have to teach me perfectly, but I want to keep learning what helps you.") on the *Late Night Follow Up* beat in the Standing Beside Alex sample. The Inspector on the right shows the choice's text, its target, and an **Effects:** section directly below the text.
2. **If the choice is empty, pick a starting shape.** For a brand-new choice with no effects yet, you'll see two side-by-side controls: **+ Add Effect** (the manual route) and **+ apply template…** (the preset route). Pick a template from the dropdown — say, *Empathetic — full support* — and the editor appends a coherent multi-row bundle of mood, emotion, sentiment, and counter changes ready for fine-tuning.
3. **Tweak any value** — drop the trust delta from `0.4` to `0.3`, add an extra reflection — and watch the live summary at the bottom of the effects list update on every keystroke. If the summary still sounds right, the numbers are right.
4. **Use the emotion combobox** when adding `Fire Emotion` or `Add Sentiment` rows. Click into the **emotion** field and the dropdown surfaces every emotion from the project's palette (joy, fear, trust, gratitude, …) — you don't have to remember whether you spelled it `mistrust` or `anti-trust`. Free text still works for custom story emotions.

#### 1. Inline labels on the numeric inputs

Numbers without labels are riddles. Every affect row now wears a small label in front of each delta input, plus a hover tooltip explaining direction:

![Close-up of a Nudge Mood and Fire Emotion row showing val / aro / Δ labels](images/35-effect-row-labels-mood-emotion.png)
*Nudge Mood rows show **val** (valence — sad ↔ happy) and **aro** (arousal — calm ↔ excited). Fire Emotion rows show **Δ** (intensity delta).*

| Row type | Inline label(s) | What it means |
|----------|-----------------|---------------|
| Nudge Mood | **val**, **aro** | Valence delta (positive = happier, negative = sadder) and arousal delta (positive = more activated, negative = calmer). Runtime clamps to `[-1, 1]`. |
| Fire Emotion | **Δ** | Intensity delta. Positive bumps the emotion; mood is auto-nudged via the palette's authored weights. |
| Add Sentiment | **→**, **Δ** | The arrow precedes the *toward* (target) field — "this character feels *something* toward *that*". The Δ marks the strength delta. Trust and mistrust live on the same axis with opposite signs. |
| Add Reflection | **sal** | Salience in `[0, 1]`. Reserve `> 0.7` for moments the character will never forget — high-salience entries survive eviction longest when the per-character reflection cap (32 entries) fills up. |

![Close-up of Add Sentiment rows showing → and Δ labels with player and self-directed targets](images/36-effect-row-labels-sentiment.png)
*Two Add Sentiment rows from the same choice: `→ player trust Δ +0.5` (Alex's trust toward the player grows) and `→ char_alex shame Δ -0.06` (Alex's self-shame eases — pointing the sentiment at the holding character is the convention for self-directed feelings).*

Hover any label or input to see the full tooltip. The conventions documented in the tooltips match the runtime — there's only one source of truth.

#### 2. Emotion-name auto-complete from the project palette

The **emotion** field on `Fire Emotion` rows, and both the **toward** and **emotion** fields on `Add Sentiment` rows, are now combobox inputs backed by the project's [Emotion Palette](#emotion-palette). Click the field and pick from the suggestions, or keep typing — free text still works for custom story emotions that aren't in the palette. The **toward** field on sentiments additionally suggests every defined character plus the `player` sentinel, so you don't have to remember a character id by hand.

This is purely about discoverability — there's no validation barrier. The runtime accepts whatever you type. The combobox just keeps you from misremembering whether the palette uses `joy` or `happiness`, or whether you wrote `mistrust` or `anti-trust` last time.

#### 3. The effect-templates library

Eight intent-shaped presets cover the common shapes of player intent in support-and-care narrative — heavily inspired by, but not specific to, the Standing Beside Alex sample.

![The Add Effect button alongside the apply-template dropdown, with the live summary showing the cumulative effect of the empathetic-full-support template](images/37-effect-templates-and-live-summary.png)
*Bottom of a populated effects list. **+ Add Effect** appends a single empty row; **+ apply template…** appends a coherent bundle of 5–9 rows in one click. The italic blue-tinted block underneath is the live summary, reading the cumulative effect back to you in plain language.*

| Template | Player intent it shapes | Roughly what it bundles |
|----------|------------------------|-------------------------|
| **Empathetic — full support** | Full support landed exactly the way the character needed. | Mood lifts, joy fires, fear drops, trust grows, self-shame eases. |
| **Empathetic — partial / well-meaning** | Kind intent that doesn't quite land. | Smaller mood lift, gentle joy, gratitude grows, trust doesn't fully form. |
| **Pushy / dismissive** | Player overrides what the character needs. | Mood drops, fear and shame spike, trust erodes, self-doubt deepens. |
| **Silent / felt-abandoned** | Player doesn't step up; the absence registers as harm. | Mood drops, sadness fires, trust erodes. |
| **Boundary respecting** | Player names the overstep without making it about themselves. | Mood lifts, pride fires, fear softens, deep trust forms. |
| **Validating / "I see you"** | Player witnesses the feeling without trying to fix it. | Quiet positive shift, gentle joy, gratitude grows. |
| **Defensive overreach** | Well-meaning but speaks-for the character. | Ambivalent — fear ticks up, mood lifts slightly, trust mixed. |
| **Quiet recovery** | Small, non-demanding presence. | Mood eases toward neutral, fear softens, no sentiment shift. |

Picking a template **appends** to the existing rows — it never overwrites — so you can stack a template on top of a few hand-crafted effects, or layer two templates if a choice has two distinct shapes (rarely a good idea; usually the second template is a sign the first wasn't quite right).

A few things templates do quietly so you don't have to:

- **They infer the active character target** from any existing affect effect in the choice's list. Add a `Nudge Mood` row pointed at *Alex* first, then apply a template, and every row the template emits will target Alex too. If there's no existing affect row to read from, the template falls back to the first non-player character in the project, then to `player`.
- **They're project-aware about counters.** The bundles emit `incrementCounter` rows for `supportScore`, `maxSupport`, and `failedSupport` — but only when those counters actually exist in your project. A story without a `supportScore` counter won't have stray support-counter rows seeded.
- **They're starting points, not contracts.** Tweak the deltas, swap an emotion, drop the reflection — the templates exist to spare you the cold-start, not to lock you in.

#### 4. The live "what does this choice do?" summary

Below the effect rows there's now a small italic blue-tinted block prefixed with `→` that synthesises the cumulative effect in plain language. It reads every row, aggregates them by character, and tells you what the choice will *feel like* when the player picks it. It updates on every value change.

Two real examples from the Standing Beside Alex sample:

> → *Alex: feels happier, calmer; joy spikes; fear softens; trust toward the player grows (+0.50); self-shame eases (−0.06); self-fear eases (−0.06); reflects: "They said they'd keep learning. That's the only promise t…" • +2 supportScore, +1 maxSupport*

> → *Alex: feels sadder, calmer; sadness spikes; trust toward the player eases (−0.20); self-shame grows (+0.05); self-fear grows (+0.04); reflects: "They said they didn't know what to do. So we both don't k…" • -1 supportScore, +1 failedSupport*

How it reads things:

- **Multiple `nudgeMood` rows** are aggregated into a single net qualitative descriptor — *feels happier* / *feels sadder* / *more activated* / *calmer* — dropping deltas below ±0.05 as noise.
- **Fire Emotion rows** read as *<name> spikes* (positive) or *<name> softens* (negative), with a magnitude qualifier — *sharply* when |Δ| ≥ 0.4, *a little* when |Δ| < 0.2, and unqualified in between.
- **Sentiments toward someone else** read as *<emotion> toward <character> grows / eases (±0.NN)*; **self-directed sentiments** (where the sentiment target is the holder character) read as *self-<emotion>*, matching the affect panel and dossier conventions.
- **Goal-status changes** read as *goal '<id>' marked <status>*. **Variant changes** read as *switches to variant '<id>'*. **Reflections** are quoted with a soft truncation around 60 characters.
- **Counter, variable, and inventory effects** roll into a separate compact tally clause after the bullet (`+2 supportScore, +1 maxSupport`).
- **The block hides itself entirely** when there's nothing meaningful to say — no clutter on choices that don't move affect.

If the summary doesn't read the way you intended the choice to feel, the numbers are off — that's the test. Tweak until the prose matches your intent.

> **Why this exists.** Authoring affect-rich narrative is hard because the consequences of a single choice ripple across many small dimensions, and "did I get it right?" is hard to verify without playing the whole story. The summary closes that loop at edit time. It's not a substitute for testing the runtime — but it catches the easy mistakes (a sign flip, a forgotten row) before they reach the player.

---

## Assets

Assets are your media files—the images, sounds, and videos that bring your experience to life.

![Asset Manager](images/04-asset-manager.png)
*The Asset Manager panel*

### Managing Assets

1. Click **Assets** in the header
2. The Asset Manager opens with filter tabs across the top:
   - **All Assets** — every asset in the project
   - **Images** — backgrounds, characters, props, UI
   - **Audio** — music, sound effects, voice-over
   - **Videos** — cutscenes, animations
   - **Fonts** — custom typography
3. Below the tabs, an **Upload Files** button and a row of category shortcuts (Characters, Props, Backgrounds, Videos, Audio, Fonts) make it easy to drop files directly into the right bucket. **From URL** lets you reference web-hosted assets.

### Uploading Assets

- **Drag and drop** files directly into the panel
- **Click Upload** and select files
- **Add by URL** for web-hosted files

### Supported Formats

| Type | Formats |
|------|---------|
| Images | PNG, JPG, GIF, SVG, WebP |
| Audio | MP3, OGG, WAV, M4A |
| Video | MP4, WebM, MOV |
| Fonts | TTF, OTF, WOFF, WOFF2 |

### Asset Organization Tips

- Use clear, descriptive names ("forest_background.png" not "img_027.png")
- Organize by purpose: backgrounds, characters, props, UI elements
- Delete unused assets to keep projects lean
- Keep source files backed up outside ASAPS

---

# Part 5: Visual Design

Your story shouldn't just read well—it should look amazing. The Visual Editor is your canvas.

## Accessing the Visual Editor

1. Select a beat in the Flowchart
2. Click the **Visual Editor** tab

You'll see a stage representing what interactors see—default size is 1024×768 pixels (customizable in Settings).

## Setting the Scene

### Background Images

Every beat can have its own background:

1. In Visual Properties (left panel), click **Choose Background**
2. Select from your assets or upload new
3. The image fills the stage

**Pro Tip:** Prepare backgrounds at your stage size for best quality.

### Positioning Characters

1. Click **Add Character** in the toolbar
2. Select a character from your cast
3. Click on stage to place them
4. Drag to reposition
5. Use corner handles to resize

Each character placement includes:
- Position (x, y coordinates)
- Size (width, height)
- Which appearance to show
- Layer order (z-index)

### Adding Text Elements

1. Click **Add Text** in the toolbar
2. Click on stage to place
3. Configure in the Inspector:
   - Content
   - Font, size, color
   - Text box styling
   - Position and size

### Hotspots: Invisible Click Zones

Create clickable areas that don't have visible content:

1. Click **Add Hotspot**
2. Draw a rectangle on stage
3. Connect to choices or actions

Useful for "click on the suspicious painting" interactions.

## Layering & Z-Order

Elements stack on top of each other. A character should appear in front of the background, text in front of the character.

- Higher **z-index** = appears on top
- Use **Move Up/Down** buttons to reorder
- Or set z-index directly in the Inspector

## The Toolbar

| Tool | Function |
|------|----------|
| Select | Click and drag elements |
| Add Character | Place a character |
| Add Text | Place text element |
| Add Prop | Place item/object |
| Add Hotspot | Create click zone |
| Toggle Grid | Show alignment grid |
| Zoom | Adjust view scale |

---

# Part 6: AI Features

ASAPS Modern includes AI assistance to help you build narrative systems. Think of it as a collaborative partner for content generation and design suggestions.

![AI Menu](images/07-ai-menu.png)
*The AI tools menu*

## Setting Up AI

1. Click **AI** in the header (bottom-left, purple gradient button)
2. Select **Configure AI** from the dropdown
3. Choose your provider:
   - **Claude** - Anthropic's AI (recommended)
   - **OpenAI** - GPT models
   - **Ollama** - Local models (free, no API key needed)
4. Enter your API key (for cloud providers)
5. Adjust settings (model, temperature, etc.)

## AI Story Generation

Start with a concept, get a complete story structure:

1. Click **AI** in the header
2. Select **Generate Story** from the dropdown
3. Describe your story idea:
   ```
   A mystery set in a 1920s speakeasy where the player
   is a jazz musician who witnesses a murder
   ```
4. Select options:
   - **Genre** - Mystery, Romance, Adventure, etc.
   - **Length** - Short (10 beats), Medium (25), Long (50+)
   - **Complexity** - Linear, Moderate branching, Complex web
5. Click Generate

AI creates a complete story structure with beats, characters, and connections. You can then edit everything to your liking.

## AI Beat Suggestions

Stuck on what should happen next?

1. Select a beat in the flowchart
2. In the Inspector panel (right side), find the **AI Suggestions** section at the bottom
3. Click **Get Suggestions** -- AI analyzes your story context and offers options
4. Accept a suggestion or ask for alternatives

## Natural Language Beat Creation

Describe what you want in plain English:

1. Click **AI** in the header, then select **Create Beat from Description**
2. Type: "A tense conversation where the detective accuses the butler"
3. AI creates the appropriate beat type with content filled in

## AI Dialog Generation (Runtime)

The AI Dialog Tree beat generates conversations on the fly during play:

- Interactors get personalized responses
- NPC "remembers" previous exchanges and references the player's name, location, and other context
- Conversations adapt to story state (variables, inventory, history)
- Exit routing is intelligent -- the AI explains its reasoning via a routing plan

Configure with personality prompts:
```
You are Marcus, a gruff bartender who knows everyone's secrets
but rarely shares them. Speak in short sentences. You're
suspicious of newcomers but respect those who buy good whiskey.
```

For real-time conversations where you want the player to type freely (instead of picking from pre-generated choices), use the **AI Conversation** beat instead. See [AI Conversation](#ai-conversation) in the beat reference above.

## AI Condition Evaluation

Instead of complex branching logic, let AI decide:

```
Evaluate whether the player has been:
- Cooperative → Send to "Ally Path"
- Suspicious → Send to "Neutral Path"
- Hostile → Send to "Enemy Path"
```

AI considers variables, choices made, and overall behavior.

## AI Story Summaries

Generate personalized recaps:

```
In your journey through the Forgotten Realm, you chose to
help the wounded stranger (earning the Healer's Token),
confronted the Shadow King directly rather than sneaking past,
and ultimately sacrificed the ancient artifact to save the village.
```

Three styles:
- **Narrative** - Prose paragraph
- **Bullet Points** - Key events listed
- **Reflection** - Thoughtful commentary on choices

## AI Info Text (Runtime)

Generate contextual, personalized text based on the player's current state:

**Use Cases:**
- Personalized greetings using player name variables
- Context-aware reactions to player inventory
- Dynamic descriptions that change based on previous choices

**Parameters:**
- `prompt`: Context for the AI (e.g., "A merchant's reply when the player can't afford the item")
- `fallbackText`: Text shown if AI is unavailable
- `buttonText`: Continue button label
- `includeVariables`: Include player variables in AI context
- `includeInventory`: Include player's inventory in AI context
- `includeHistory`: Include visited beats in AI context
- `maxSentences`: Maximum sentences to generate (default: 2)

**Example:**
```
Prompt: "Describe how the room changes based on the player's mood variable"
Fallback: "The room feels different today."
Include Variables: true
```

## AI Duration Screen (Runtime)

Like AI Info Text, but auto-advances based on reading speed:

**Use Cases:**
- Atmospheric transitions that adapt to player state
- Dynamic montages reflecting player choices
- Personalized scene-setting text

**Additional Parameters:**
- `wordsPerMinute`: Reading speed (default: 200)
- `minDuration`: Minimum display time in ms (default: 2000)
- `maxDuration`: Maximum display time in ms (default: 15000)

The duration is calculated automatically: (word count / WPM) × 60 × 1000 ms, clamped between min and max.

## Text Variations (Non-AI)

For random variety without AI, both **Info Text** and **Duration Screen** beats support `textVariations`:

```json
{
  "text": "You enter the room.",
  "textVariations": [
    "The room greets you with familiar shadows.",
    "Everything looks just as you left it."
  ]
}
```

At runtime, one text is randomly selected from the main text plus all variations.

## Rich Text Formatting

Text boxes in ASAPS Modern support a lightweight markdown syntax for basic formatting. This works in any text field that displays to the interactor -- Info Text, Dialog Tree NPC lines, Duration Screen, and more.

**Supported Syntax:**

| Syntax | Result |
|--------|--------|
| `**bold**` or `__bold__` | **bold** text |
| `*italic*` or `_italic_` | *italic* text |
| `~~strikethrough~~` | ~~strikethrough~~ text |
| Line breaks (Enter key) | New paragraphs |
| `\n` (literal) | Line break |

**Example:**
```
**"Listen carefully,"** the old woman said, her voice barely a whisper.
*"The forest remembers everything."*

She paused, then added: "~~Especially~~ **especially** those who forget."
```

This renders with proper bold, italic, and strikethrough formatting in the preview and exported stories. HTML entities are safely escaped, so you cannot inject raw HTML.

---

# Part 7: Testing & Publishing

You've built something. Time to make sure it works and share it with the world.

## Preview Mode

The Preview Window is your primary tool for testing your interactive narrative. It provides a comprehensive testing environment with powerful debugging features.

![Preview Panel](images/08-preview-panel.png)
*The Preview panel*

### Starting a Preview

1. Click **Preview** in the header (or use the shortcut)
2. The preview window opens in a new panel
3. Click anywhere on the stage to begin, or use the controls

**Pro Tip:** You can preview from any beat in your story—just select a beat in the flowchart and open the Preview window. The preview automatically navigates to the selected beat.

![Preview Running](images/09-preview-running.png)
*Preview mode showing the experience in action*

### Preview Controls

The top toolbar provides essential controls:

| Control | Function |
|---------|----------|
| **Play/Pause** | Start, pause, or resume preview |
| **Stop** | End preview and return to editing |
| **Restart** | Start over from the beginning |
| **Step** | Advance one beat at a time |
| **Zoom** | Adjust display size |
| **Fit** | Auto-fit to window |
| **Text Animation** | Toggle typewriter effect on/off |
| **Mute** | Silence all audio |
| **Inventory** | Show/hide inventory panel (Ctrl/Cmd+I) |
| **Debug Panel** | Toggle debug information sidebar |

### Path-Based State Presets

When previewing from a beat other than the start, ASAPS Modern intelligently analyzes all paths to that beat and generates **state presets** representing different ways the interactor could have arrived there.

![Path Presets Menu](images/10-path-presets.png)
*The path presets menu showing different routes to the current beat*

**Using Path Presets:**

1. Select a beat in the flowchart and open the Preview window
2. Click the **Path Presets** dropdown in the toolbar
3. Browse presets grouped by ending/outcome:
   - Each preset shows the path taken (e.g., "Via Forest → Bridge")
   - State summary shows variables, counters, and inventory
   - Badge indicates if the path includes user input
4. Select a preset to load that state

**InputText Beats in Paths:**

When a path includes **inputText** beats (where the interactor types input), ASAPS Modern prompts you to enter values:

![InputText Values Modal](images/11-inputtext-modal.png)
*Modal for entering values that would have been typed by the interactor*

- Each input shows the beat name and prompt
- Enter meaningful values (e.g., a character name)
- Or click "Use Placeholders" for auto-generated values
- Values are merged into the state before preview starts

This ensures variables like `playerName` or `playerGender` have realistic values when testing later parts of your story.

### Session Timeline

As the interactor plays through your story, ASAPS Modern records a timeline of significant events: beat transitions, player choices, AI-generated content, branching decisions, and exit reasons. This session log is particularly useful for debugging AI beats, where you can see the AI's routing plan, which directions triggered, and what variables were set during a conversation.

The timeline is accessible through the debug panel and is recorded automatically -- you do not need to enable it.

### Debug Panel

The debug panel (toggle with the bug icon) shows real-time state information:

**Current Beat:**
- Beat name and ID
- Beat type

**Variables:**
- All story variables and their current values
- Updated in real-time as the story progresses

**Counters:**
- Numeric counters with current values
- Shows both character-specific and global counters

**Inventory:**
- Items held by each character
- Quantity of stackable items

**History:**
- List of visited beat IDs
- Useful for debugging conditions based on beat history

**Active Timers:**
- Running timers with remaining time
- Timer names and target beats

### Manual State Editing

For advanced testing, you can manually edit the current state:

1. Open the Debug Panel
2. Click **Edit State**
3. Modify variables, counters, or inventory
4. Changes take effect immediately

This is useful for testing edge cases like "What if the player has negative gold?" or "What happens with 100 items in inventory?"

### State Presets (Saved)

Save commonly-used test states for quick access:

1. Set up your desired state (through play or manual editing)
2. Click **Save Preset** in the debug panel
3. Name your preset (e.g., "Has all keys", "Low health scenario")
4. Access saved presets from the preset menu

Perfect for regression testing—create presets for critical game states and verify they still work after changes.

## Debug Tools

Click the **Debug** button in the header to open the **Debug Tools** window. It opens in a separate browser/desktop window so you can keep your story canvas visible while you investigate. The window has three tabs:

### Reachability

![Debug Tools — Reachability tab](images/31-debug-reachability.png)
*The Reachability tab shows total beats, how many are reachable from start, how many are orphaned, and any warnings detected. Click a beat to highlight it on the main flowchart.*

Finds beats that can never be reached — orphaned content with no paths leading to it. The summary cards count Total, Reachable, Unreachable, and Orphaned beats. Expand the *Reachable Beats* and *Warnings* sections to drill into the specifics. Clicking a beat in the list highlights it in the main builder flowchart.

### Path Analysis

![Debug Tools — Path Analysis tab](images/32-debug-path-analysis.png)
*The Path Analysis tab in Forward mode, showing every possible outcome from story start.*

Enumerates the possible journeys through your story. Three modes:
- **Forward** — all outcomes reachable from the start.
- **Tree** — the full branching tree as a hierarchy.
- **Backward** — given a target ending, which paths lead to it.

The summary shows *Outcomes*, *Total Paths*, *Unique Endings*, *Reachable Beats*, and how long the analysis took. Each outcome can be expanded to inspect the specific beat sequence and decision points. The query box at the top lets you filter by state ("`adult > 7`", "`has axe`", "`visits beat-123`") so you can ask, "show me only the paths where the player ends up with the axe."

### Story Logic

![Debug Tools — Story Logic tab](images/33-debug-story-logic.png)
*The Story Logic tab, surfacing hub beats reachable from many paths.*

Pattern-based validation that runs on the project's structure:
- **Hub Beat Analysis** — beats reachable from multiple paths. Each hub gets a card with its incoming-path count and a reminder to check that the text doesn't assume a specific player state.
- **Warnings / Info** — undefined variables, missing connections, unused counters, and similar logic issues.

> Story Logic uses keyword pattern matching for now. AI-powered semantic analysis (where an LLM reads each hub beat in context and flags continuity issues) is on the roadmap — when an AI provider is configured, the panel offers richer warnings.

## Text-to-Speech (TTS)

ASAPS Modern can read your story aloud using text-to-speech. This is useful for testing how dialog flows, for accessibility, and for creating voice-driven experiences.

### Setting Up TTS

1. Click the **TTS** button in the header toolbar (top-right area, with a volume icon) to open the TTS dropdown
2. Click **Enable TTS** to turn on text-to-speech
3. Click **Configure Provider** to open the provider settings dialog
4. Choose a **TTS provider**:
   - **Web Speech** — Free, built into your browser. Quality varies by OS and browser.
   - **ElevenLabs** — High-quality cloud voices. Requires an API key from [elevenlabs.io](https://elevenlabs.io).
   - **OpenAI** — Cloud TTS via OpenAI. Requires an API key.
   - **Local TTS** — Run open-source TTS models on your own machine. Supports Kokoro (via mlx-audio), Coqui, Piper, and Chatterbox with built-in presets. No API key needed.
   - **Custom Server** — Connect to any OpenAI-compatible TTS endpoint.
5. Enter your API key if using a cloud provider
6. Select a **model** (for providers that offer multiple models)

**ElevenLabs Models:**
| Model | Description |
|-------|-------------|
| **Eleven v3** | Most expressive, highest quality (default) |
| **Multilingual v2** | Good quality, supports many languages |
| **Flash v2.5** | Fastest response time, lowest cost |
| **Turbo v2.5** | Fast with good quality |

ElevenLabs uses audio streaming for faster time-to-first-audio, so you hear speech begin almost immediately rather than waiting for the full audio to generate.

**Local TTS with Kokoro:**

The Local TTS provider comes with built-in presets for popular open-source TTS servers. The recommended setup is **Kokoro** via mlx-audio (runs on Apple Silicon Macs):

1. Select the **Local TTS** tab in the TTS configuration
2. Choose the **Kokoro** preset from the server presets dropdown
3. The base URL auto-fills to `http://localhost:8880/v1`
4. Start your local Kokoro server (see the mlx-audio documentation)
5. A curated list of Kokoro voices appears automatically -- male and female voices in American, British, and other accents

Other presets include Coqui TTS, Piper, and Chatterbox. You can also enter a custom base URL for any OpenAI-compatible TTS server.

### Assigning Character Voices

Each character in your story can have a distinct TTS voice:

1. Open the TTS menu from the header
2. Under **Character Voices**, you'll see all speakers in your story
3. Use the dropdown next to each name to assign a voice
4. Available voices depend on your chosen TTS provider

Built-in speakers like **Narrator** appear automatically. Your player character appears with "(Player)" next to their name. The player character is silent by default — assign a voice to enable speech for the player's text and clicked dialog choices.

### TTS Language Awareness

TTS automatically adapts to the active language when translations are in use:

- **In the Preview Window** -- When you switch the translation language, TTS immediately updates to speak in the new language. This happens on every preview data change, so you always hear the correct language.
- **In HTML exports** -- The project's source language is embedded in the export. When the exported story includes bundled translations and the interactor switches languages, TTS switches language accordingly.

This means you do not need to configure TTS language manually -- it follows your translation settings.

### TTS in Project Settings

Your chosen TTS provider type and model are saved with the project, so collaborators automatically use the same configuration. API keys are **not** saved in the project — they stay in your browser's local storage for security.

## Speech-to-Text (STT)

ASAPS Modern supports voice input for AI Conversation beats and other text entry scenarios. When STT is configured, a microphone button appears in the header and inside conversation beats.

### Setting Up STT

1. Click the **Mic** button in the header toolbar (next to the TTS button)
2. Configure a **STT provider**:
   - **Web Speech** — Free, built into your browser. Real-time streaming, but quality varies.
   - **Whisper (OpenAI)** — Cloud-based, high accuracy. Requires an OpenAI API key.
   - **Local Server** — Self-hosted Whisper server (any OpenAI-compatible endpoint).
   - **Vosk** — Offline streaming recognition via WebSocket.
   - **Whisper.cpp** — Local whisper.cpp server for accurate offline recognition (default port: 8178).
3. Select a recognition **language** (English, German, French, Spanish, and more)

### STT in AI Conversations

When an AI Conversation beat has **Enable Voice Input** turned on, a microphone button appears next to the text input. The interactor can click it to speak their response instead of typing. The transcribed text fills the input field, and the interactor can edit it before sending.

This creates a natural voice-driven conversation flow, especially when combined with TTS -- the NPC speaks, the player responds by voice, and the NPC replies.

## Saving Your Project

### Quick Save

- Click **Save** or press **Ctrl/Cmd+S**
- Saves to browser storage

### Export Options

| Format | Description | Use Case |
|--------|-------------|----------|
| ASAPS Project (.zip) | Complete project + all assets | Backups, sharing with collaborators |
| ASML (.asml) | XML narrative structure only | Version control, lightweight sharing |
| HTML (.html) | Self-contained playable file | Distribution, embedding, sharing |

### HTML Export

Export your story as a single standalone HTML file that anyone can open in a browser—no server needed.

1. Click **Export → Export as HTML**
2. Configure options:
   - **Title** - Page title
   - **Include splash screen** - Show a start screen before the story begins
   - **Embed assets** - Bundle images/audio directly into the HTML
3. Click Export

The resulting HTML file includes the full renderer, all story data, and embedded assets. Share it via email, upload it to a website, or distribute it however you like. Recipients just double-click to play.

**Advanced HTML Export Options:**
- **Mobile-responsive** - Automatic font scaling and layout adaptation on phones/tablets
- **Bundled translations** - Include multiple language versions with a language selector
- **TTS language** - The project's source language is automatically embedded; when translations are bundled, switching languages also switches TTS speech language
- **Save/resume** - Interactors can save progress and resume later (via browser storage)
- **AI translation on-the-fly** - Optionally embed an API key for runtime AI translation to any language

### Export Steps

1. Click **Export** in the header to open the dropdown
2. Choose format: ASML (XML only), ASML with Assets, Project (ZIP), or HTML
3. Configure options if prompted
4. Download the file

## Importing Projects

### Supported Formats

- **ASAPS Project (.zip)** - Full project restore
- **ASML (.asml)** - Story structure (may need asset re-linking)
- **Twine/Twee** - Import from Twine (SugarCube format)

*Note: Ren'Py theme import is available in **Settings** via the "Import Ren'Py" button.*

### Import Steps

1. Click **Import** in the header to open the dropdown
2. Choose format: ASML (XML), Project (ZIP), or Twine (HTML)
3. Select the file
4. For asset-heavy imports, you'll be guided through asset mapping

---

# Part 8: Advanced Techniques

You've mastered the basics. Now let's explore the powerful features that separate good stories from great ones.

## Clusters: Organizing Complex Stories

As stories grow, organization becomes crucial.

### Creating Clusters

1. In the Beat List sidebar, click **Add Cluster**
2. Name it ("Act 1", "Dungeon Section", "Merchant Interactions")
3. Drag beats into the cluster

### Cluster Types

**Organizational Clusters** - Just folders for tidiness
**Spatial Clusters** - Represent physical locations
  - Can have map background images
  - Beats inside represent things in that location

### Cluster Features

- Expand/collapse in the Beat List
- Show as containers in Flowchart view
- Can have cluster-level background music
- Beats inherit cluster settings unless overridden

## Condition Beats

The Condition Beat provides branching logic — checking variables, counters, timers, fictional time, inventory, or any character's affect state, and routing to different targets based on the result.

### What You Can Check

The Condition Type dropdown groups the available checks into two families:

**Classic checks** (the original ASAPS condition vocabulary):
- **Variable** — true/false flags (`hasKey`, `metWizard`)
- **Counter** / **Counter Compare** — numeric comparisons (`gold > 50`, `reputation == respect`)
- **Inventory** — whether a character holds a named item, or how many copies
- **Timer** — whether a named timer has expired or has time left
- **Fictional Time** — compare the in-world clock to a target year/month/day/hour/minute

**Character affect** (added in v0.9.43, exposed under the *Character affect* optgroup):
- **Mood (axis ≷ value)** — branch on a character's valence or arousal, e.g. *"Alex's valence ≥ +0.3"*
- **Emotion intensity ≷ value** — branch on how strongly a single emotion is firing, e.g. *"Alex's fear > 0.4"*
- **Trait ≷ value** — branch on a Big Five trait (openness, conscientiousness, extraversion, agreeableness, neuroticism), respecting any active variant override, e.g. *"Alex's neuroticism ≥ 0.6"*
- **Sentiment toward target ≷ value** — branch on how one character feels about another (optionally summed across all emotions, or scoped to a single emotion like *trust*)
- **Goal status** — branch on whether a character's named goal is `open`, `met`, `failed`, or `abandoned`
- **Active variant** — branch on which authored variant of a character is currently in play (e.g. anxious-introvert vs. free-spirit)

![Condition Type dropdown showing the Character affect group](images/26-condition-type-dropdown-affect.png)
*The Condition Type dropdown. Classic checks at the top, the new Character affect group at the bottom. The runtime evaluates these the same way it evaluates "player has lantern" — it just checks a different slice of state.*

### Affect-Aware Forms

Each affect operator renders its own form so you can never enter a meaningless combination. The forms cascade — pick the character first and the goal / variant / trait dropdowns populate from that character's authored content, with a free-text fallback when none has been authored yet.

![Condition Beat editor with mood form populated](images/27-condition-mood-form.png)
*Mood condition: pick the character, the axis (valence or arousal), the operator, and a value in the range -1 to +1.*

![Condition Beat editor with trait form populated](images/28-condition-trait-form.png)
*Trait condition: the Trait Name dropdown lists exactly the traits this character has authored — including any traits a variant has overridden. The value is in the range 0 to 1.*

![Condition Beat editor with goal-status form](images/29-condition-goal-form.png)
*Goal status condition: pick the character, then the goal id (cascading from the character's authored goals), then `==` / `!=` against `open`, `met`, `failed`, or `abandoned`. If the character has no authored goals yet the dropdown becomes a free-text input so you can scaffold the condition before authoring the goal.*

> **Why the affect-aware operators matter.** They let you wire reactivity that *responds to who Alex has become this run* rather than to flags you had to remember to set. A scene-end beat can ask "is Alex lifted right now?" without you having to manually maintain a `currentlyLifted` boolean. Combined with `Update Affect` beats earlier in the path, you get an emergent emotional shape that's much closer to how memory and feeling actually work in human relationships.

### Compound Conditions

For complex logic requiring multiple checks, chain Condition Beats together — each beat handles one comparison, and you wire them into a decision tree:

```
[Check hasKey]
  → true: [Check gold > 50]
              → true: [Secret shop unlocked]
              → false: [Need more gold]
  → false: [Need the key first]
```

You can mix and match families freely: *"if Alex's mood is recovering AND the player has the journal, route to the reconciliation scene; otherwise route to the missed-opportunity scene."*

### Inventory Checks

You can check for item presence:
- Player HAS "Silver Key" ✓
- Player DOES NOT HAVE "Curse Mark" ✓

For quantity-based checks (e.g., "Gold > 100"), the inventory condition's **Quantity** mode lets you compare counts directly. The **AI Condition** beat is also available for fuzzier reasoning that doesn't reduce to a single numeric comparison.

### Per-Beat Requirements

The same condition vocabulary is also available on every regular beat under the **Requirements** section (collapsible at the bottom of the Inspector). A requirement is a guard that must hold when the player reaches that beat — if it doesn't, the engine redirects to the fallback beat you choose, and the path analyzer flags the situation as a soft-lock or a warning depending on the severity you set.

![Requirements section with a mood requirement](images/30-requirements-mood.png)
*A requirement on a regular beat: this beat will only run when Alex's valence is at least +0.3. If unmet at runtime, the engine redirects to the fallback (or just logs a warning if no fallback is set), and the path analyzer treats the unreachable case according to the chosen severity.*

Use requirements when the gating concept *belongs to the destination beat* — "this private conversation only makes sense if Alex is in a state to talk" — rather than when it belongs to the choice that leads there. The runtime treats both the same way; the distinction is for you, the author, when you re-read your own story.

## Animations

Bring scenes to life with movement.

### Waypoint Animations

1. Select an element (character, prop)
2. Open **Animations** tab
3. Click **Add Waypoint**
4. Click on stage to add path points
5. Drag bezier handles for curves
6. Set duration and easing

### Animation Properties

| Property | Effect |
|----------|--------|
| Duration | How long the animation takes |
| Easing | Acceleration curve (linear, ease-in, bounce, etc.) |
| Loop | Whether to repeat |
| Auto-start | Begin on beat load vs. triggered |

### Sprite Animations

Use sprite sheets for frame-by-frame animation:
1. Upload a sprite sheet image
2. Configure frame dimensions
3. Set frame sequence and timing
4. Assign to character appearances

## Theming & Styling

### Global Settings

![Settings Panel](images/02-settings-panel.png)
*The Settings panel*

**Settings → Project:**
- Stage dimensions and aspect ratio (4:3, 16:9, etc.)
- Scaling mode
- Mobile display settings (font scaling, safe zone preview)

**Settings → Colors:**
- Button colors
- Text box colors
- Background color

**Settings → Fonts:**
- Default fonts for titles, body, buttons
- Font sizes
- Line height

**Settings → Text Box:**
- Text box appearance: corners, padding, borders, position

**Settings → Effects:**
- Text animations (typewriter, fade)
- Hotspot visibility (Hotspot Area Visibility, Label Display)
- <a id="speaker-display"></a>**Speaker Display** (sub-section) — controls how speaker names and portrait graphics appear during playback:
  - **Show speaker names** — Master toggle for displaying character names during dialog
  - **Show speaker portraits** — Master toggle for character portrait images in text boxes
  - **Name style** — How the speaker name appears:
    - *Label* — Name shown above the text box
    - *Inline* — Name shown bold at the start of the text inside the box
    - *Off* — Name hidden
  - **Name position** — Left or right alignment for the speaker name
  - **Name color** — Custom color for the speaker name text
  - **Portrait position** — Where the portrait image appears:
    - *Inside left / Inside right* — Small portrait inside the text box
    - *Above left / Above right* — Larger portrait above the text box
  - **Portrait size** — Size in pixels (default: 48px inside, 80px above)

  Individual beats can override these global settings. This lets you hide the speaker name for narration beats while showing it for dialog, for example.

**Settings → HUD:**
- Timer / Time Display overlay (timer name, default text, position)
- Fictional Time overlay
- Countdown Meter overlay
Each overlay has its own *Enabled* toggle and renders on the running stage when on.

**Settings → Sound:**
- Background music and volume settings
- Background music respects browser autoplay policies -- if the browser blocks automatic playback (common on first page load), playback starts automatically on the interactor's first click, keypress, or tap

**Settings → Copyright:**
- Author name, copyright year, and license text embedded in exports and the credits page.

**Settings → Variables:**
- Define global variables for tracking story state

**Settings → Translation:**
- Source language and translation management

**Settings → Debug:**
- Testing options: start beat override, variable display

### Text Effects

- **Typewriter** - Letters appear one by one
- **Fade** - Text fades in
- **None** - Instant display

Adjust speed in Settings.

### Theme Presets

Load complete visual styles:
- **Visual Novel** - Traditional VN aesthetic
- **Twine** - Hypertext fiction style
- **Point-and-Click** - Adventure game look

### Custom Themes

Create and save your own themes, including:
- All color settings
- Typography choices
- UI element styling
- Bundled fonts

## Timers, Countdowns & Fictional Time

ASAPS Modern has two distinct time systems: **real-time timers** that count down in seconds, and **fictional time** that tracks an in-story date and clock.

### Real-Time Timers

1. Add a **Set Timer** beat before your choice
2. Configure duration and target (what happens when time runs out)
3. The following Dialog Tree will show a countdown
4. If time expires, story jumps to the timer's target

![Set Timer Beat](images/14-set-timer.png)
*A SetTimer beat creating a 30-second countdown*

**Key Settings:**
- **Timer Name** - Identifier (e.g., "countdown")
- **Duration** - Seconds until expiry
- **Timer Target Beat** - Where to go when time runs out
- **Countdown To Beat** - Which beat shows the countdown bar (optional)
- **Show Timer HUD** - Display a persistent countdown overlay

**Clearing Timers:** Set duration to 0 to clear a running timer. Useful after the interactor completes a challenge before time runs out.

### Timer HUD

The Timer HUD is a persistent overlay that appears in a corner of the stage. Configure it in **Settings → HUD → Timer / Time Display**. Toggle **Enabled** and the configuration unfolds:

- **Timer Name** — Which named timer to track (leave empty to follow the first active timer)
- **Show "00:00" when no timer active** — Whether to display a placeholder zero-time when nothing is counting down
- **Default Text** — What to show when no timer is running (e.g., *"9:00 AM"*, *"Day 1"*, *"2h left"*). Individual beats can override this in the Inspector's Advanced section.
- **Position** — Top Left, Top Right, Bottom Left, or Bottom Right
- **Style** — Digital clock font or plain text
- **Font size**, **text color**, **background color**, **background opacity**, **border radius**, **padding**
- **Show label** + **Label text** — Optional label rendered above the time display

The HUD's display logic is layered: an active timer countdown takes priority, then per-beat time text, then the default text. Two sibling overlays — **Fictional Time** and **Countdown Meter** — sit alongside it on the same Settings page and can be enabled independently.

### Fictional Time System

Fictional time tracks an in-story date and time that's independent of real-world time. Use it for day/night cycles, appointment deadlines, or "three days later" transitions.

![Fictional Time Setup](images/13-fictional-time.png)
*Setting the fictional time to January 31, 2025 at 9:00*

**Setting Fictional Time:** Use a **Set Variable** beat with type set to **Fictional Time**:

- **Operation** - *Set to datetime* (absolute), *Advance* (add time), *Subtract* (go back)
- **Date** - Day, month, year
- **Time** - Hour and minute

**Checking Fictional Time:** Use a **Condition Beat** with the fictional time variable:

![Checking Fictional Time](images/15-check-fictional-time.png)
*A condition beat checking whether fictional time is past a threshold*

- Compare with operators: equals, greater than, less than
- Branch your story based on what "time" it is in the narrative

**Displaying Fictional Time:** When the Timer HUD is enabled and fictional time is set, the HUD automatically displays the formatted time (e.g., "9:00 AM" or "Jan 31, 2025 9:00"). This appears even when no real-time countdown is active.

**Example: Day/Night Cycle**
```
[Set fictional time to 8:00 AM]
    ↓
[Morning scene - "The sun rises over the village"]
    ↓
[Advance time by 6 hours]
    ↓
[Check: time > 2:00 PM?]
  → true: "Afternoon market" (shops are open)
  → false: "Morning errands" (shops still closed)
```

### Timer Strategies

- **Urgency** - Force quick decisions under time pressure
- **Narrative time** - Track in-story hours/days with fictional time
- **Deadlines** - Combine real timers with fictional time for "you have until midnight"

## Random Elements

### Random Encounters

Use **Random Target** beats to add variety:
```
[Enter Forest]
    ↓
[Random Target]
  → 40% "Peaceful path"
  → 30% "Wolf encounter"
  → 20% "Find treasure"
  → 10% "Mysterious stranger"
```

Interactors get different experiences on replay.

## Inventory Management

### Transfer Items

Move items between characters:
```
[Trade Scene]
Player gives "Gold" (50) to Merchant
Merchant gives "Magic Sword" to Player
```

---

# Part 9: Version Control & Collaboration

Once your story grows past a certain size you'll want history, backups, and (eventually) co-authors. ASAPS has built-in Git support that talks directly to GitHub, so the trip from "I want to back this up" to "my collaborator just pushed an edit" doesn't require leaving the app.

This part of the guide is for the **Desktop app** working on **directory-format projects** (saved as a folder, not a single `.zip`). Web-builder projects don't currently support version control.

## Why Bother With Version Control?

Three good reasons:

- **History** — see what changed and when, and roll back mistakes without ceremony.
- **Backup** — your work lives on GitHub as well as your laptop. Spilled coffee, missing laptop, doesn't matter.
- **Collaboration** — co-authors edit the same project, and ASAPS handles the merging.

If you've never used Git before, that's fine — the on-screen prompts walk you through setup the first time. You don't need to learn the command line.

## Quick Start: Three Paths In

The **File menu** has the three entry points:

| Menu item | What it does |
|-----------|--------------|
| **File → New Project on GitHub…** | Creates a fresh project folder on disk, sets up Git, and publishes a brand-new repository to GitHub — all in one dialog. Best for "I'm starting something new and I want it backed up from day one." |
| **File → Open Project from GitHub…** | Clones an existing GitHub repository into a local folder and opens it. This is the path collaborators take when joining a project someone else created. |
| **File → Open Project Folder (VCS)…** | Opens an existing folder on your disk that's already a directory-format project (and usually already a Git repo). ASAPS auto-detects the repo and turns on the VCS panel. |

Whichever path you pick, if it's your first time using GitHub from ASAPS the app will hand you off to a guided onboarding flow before doing the actual work.

## First-Time Setup: The Onboarding Flow

ASAPS uses two command-line tools under the hood: **`git`** (the version control system itself) and **`gh`** (the official GitHub CLI, which handles authentication and creating repos). Both are free, well-maintained, and probably already installed if you've done any developer work — but if not, ASAPS will detect that and show install instructions.

### Step 1: Install the tools (if needed)

If `git` or `gh` is missing, you'll see a panel listing the status of each (✓ or ✗) and a copy-paste command appropriate for your operating system:

| OS | Suggested install command |
|----|---------------------------|
| **macOS** | `brew install git gh` |
| **Windows** | `winget install --id Git.Git -e ; winget install --id GitHub.cli -e` |
| **Linux** | `sudo apt install git gh` |

Each command has a **Copy** button so you can paste straight into a terminal. There are also direct links to the official installers if you'd rather download them by hand. After installing, click **Re-check** in ASAPS to refresh the detection.

### Step 2: Sign in to GitHub

Once `gh` is installed, click **Sign in with GitHub**. ASAPS runs `gh auth login --web` for you, which opens a browser window with a one-time code. Paste the code into the browser, authorise ASAPS, and come back. The signing-in process streams its output into a log box on screen so you can see exactly where it's at; if anything goes sideways, hit **Cancel sign-in** to abort and try again.

The credentials live in `gh`'s system-wide credential store — ASAPS doesn't keep a copy.

### Step 3: Connect to a remote (or skip)

If you're using **New Project on GitHub** or **Open Project from GitHub**, ASAPS handles this step automatically. If you've opened an existing project folder that isn't yet on GitHub, you can either:

- **Create a new GitHub repo** — pick a name and visibility (private by default — going public→private *after* pushing is a bad time), and ASAPS runs `gh repo create … --source=. --remote=origin --push`.
- **Connect to an existing empty repo** — paste a GitHub URL you've already created at `github.com/new` and ASAPS sets it as the remote and pushes.

ASAPS automatically handles a footgun that catches first-time users: if `git` doesn't have your name and email configured locally, the first commit fails with a cryptic error. Before committing, ASAPS reads your GitHub identity via `gh api user` and writes `user.name` / `user.email` into **the project's local repo** only — never into your global git config. If you've already configured git globally, that takes precedence.

## Creating a Brand-New Project on GitHub

**File → New Project on GitHub…** is the most direct route from "I have an idea" to "my project is on GitHub":

1. Pick a **parent folder** on disk — somewhere ASAPS can create a new sub-folder for the project.
2. Type a **project name**. This is also the GitHub repository name and the local folder name. ASAPS sanitises it (spaces become hyphens, special characters drop out) so it's a valid GitHub repo name.
3. Choose **Private** (recommended — only you and people you invite can see it) or **Public** (visible to the world). You can change this on GitHub.com later, but only with caveats — keep it private unless you're sure.
4. Click **Create and push**. ASAPS:
   - Creates the folder
   - Writes an empty ASAPS directory-format scaffold into it
   - Runs `git init` and makes the initial commit
   - Runs `gh repo create <username>/<name> --source=. --push` so the repo exists on GitHub with your initial commit already pushed

When that's done, ASAPS opens the project and you can start authoring. Every save is automatically tracked by Git, ready to be committed and pushed.

## Joining a Project Someone Else Created (Collaboration)

The everyday team workflow looks like this:

1. **Author A** creates the project via *File → New Project on GitHub…* and invites collaborators on **github.com** (Settings → Collaborators on the repo page).
2. **Author B** accepts the invite by email, copies the repository URL from GitHub, and uses *File → Open Project from GitHub…* in ASAPS. After cloning, the project opens and the VCS panel becomes available.
3. From here, both authors edit, commit, and push. The VCS panel's **Incoming** tab shows when one author has pushed work the other hasn't pulled yet.

The first time a collaborator joins, they go through the same install + auth onboarding as the project's creator did — install `git`/`gh`, sign in with GitHub, then clone.

## The VCS Panel

Once a project is under version control, the **VCS panel** lives at the bottom of the window. Toggle it with **Ctrl/Cmd+Shift+G** or via *Version Control → Toggle VCS Panel*. It has four tabs:

### Pending Changes

Everything you've changed since your last commit. Each modified file appears with a coloured indicator (added / modified / deleted) and you can:

- **Stage** an individual file (the green check) or **Stage All** at once.
- **Unstage** anything you don't want to commit yet.
- **Revert** to discard local changes (with a confirmation — this can't be undone).
- Click a file to open a diff in the right pane and see exactly what changed.

Below the file list, type a **commit message** and click **Commit** (or **Commit and Push** to send to GitHub in one step). If nothing's staged when you click Commit, ASAPS auto-stages everything currently changed for you — saves a click for the common "I want to commit everything" case.

### Incoming

This tab is where you fetch and push:

| Button | What it does |
|--------|--------------|
| **Fetch** | Checks GitHub for changes other collaborators have pushed. Doesn't apply them yet — just tells you what's there. |
| **Pull** | Fetches and applies remote changes, creating a merge commit if your local work and the remote work both moved on. |
| **Pull (Rebase)** | Fetches and replays your local commits on top of the remote ones — a tidier history with no merge commits. |
| **Push** | Sends your local commits up to GitHub. The button label shows how many commits are queued (e.g., "Push (3)"). |

The header shows **↑ ahead** (your local commits not yet pushed) and **↓ behind** (remote commits you haven't pulled) so you can see at a glance who's where.

### History

The full commit log for the project. Click any commit to see which files it touched and the diff for each. Useful for "who changed this and why?" investigations.

### Branches

View the current branch and switch between any branches that already exist. Note: ASAPS doesn't currently let you **create** new branches from inside the app — see [What's not (yet) supported](#vcs-not-supported) below.

## Beat-Level Status Indicators

Each beat on the canvas shows a small coloured dot in the top corner that mirrors its Git status:

| Colour | Meaning |
|--------|---------|
| Green | New (added since last commit, untracked) |
| Orange | Modified since last commit |
| Red | Has a merge conflict |
| Purple | Being edited by another collaborator (advisory) |

So you can see at a glance which parts of your story have unsaved-to-Git changes without opening the VCS panel.

## Merge Conflicts

When you and a collaborator edit the same beat in incompatible ways, pulling produces a **merge conflict**. ASAPS handles this gracefully:

1. The conflicting beat shows a **red dot** on the canvas.
2. The VCS panel highlights the conflicting file and offers two buttons: **Keep Mine** or **Accept Theirs**.
3. If a rebase is mid-flight with multiple conflicts, ASAPS walks you through them one at a time.

Merge conflicts in beats happen less often than you'd think because each beat is its own JSON file in the directory format — two collaborators can edit different beats freely without ever conflicting.

## Advisory Editing Locks

Even with per-beat files, two people editing the *same* beat at the same time will eventually conflict. ASAPS helps you avoid that by tracking who's currently editing what — **advisorily**, no actual locking:

- When you select a beat in the Inspector, ASAPS writes a small entry into `.asaps-editing.json` in the project root.
- That file rides along with normal commits/pushes/pulls.
- Collaborators see a **purple dot** on beats you're currently editing, and the Inspector banner says something like *"Alice is currently editing this beat"*.
- Locks expire automatically after **2 hours**, so a crashed app or forgotten session doesn't leave a permanent ghost lock.

Treat purple dots as a friendly "consider working on something else" hint rather than a hard barrier.

## Common Hiccups & How to Fix Them

### "I made changes but the VCS panel doesn't show anything to commit"

Open the **Pending Changes** tab. If your changes are there but unstaged, click **Stage All** (or the green check next to individual files), write a commit message, and click **Commit**. If they're already staged, just commit. If the panel really shows nothing, double-check you saved (Cmd/Ctrl+S) — Git only sees what's been written to disk.

### "Push rejected — the remote has commits I don't"

This means a collaborator pushed something while you were working. Switch to the **Incoming** tab, click **Pull** (or **Pull (Rebase)** if you prefer cleaner history), resolve any merge conflicts that pop up, and then come back and **Push** again.

### "My project is in iCloud / Dropbox / OneDrive — is that OK?"

It works, but synced folders sometimes interfere with Git in subtle ways (lock files, partial writes, two clients trying to apply the same changes). If you hit weird errors that don't make sense, try moving the project somewhere outside the synced folder — `~/Documents/GitHub/` is a popular choice. The version control history stays intact through GitHub, so moving the local copy is safe.

### "I cloned a repo but the assets are missing"

If the repo was created on a system with **Git LFS** enabled, the asset binaries may be stored as LFS pointers rather than real files. ASAPS explicitly disables LFS, so cloning an LFS-tracked repo will give you placeholder pointer files instead of the actual images/audio. Workaround: have the original author do a one-time `git lfs migrate import --everything` + `git push --force` to convert the binaries back to plain blobs. This is rare in practice — newer ASAPS projects don't use LFS at all.

<a id="vcs-not-supported"></a>
## What's Not (Yet) Supported

A few Git features that authors sometimes look for and don't find:

- **SSH-based remotes** — ASAPS uses HTTPS through `gh`'s credential helper. Repos with `git@github.com:...` URLs aren't directly supported; convert to the `https://github.com/...` form.
- **Creating branches inside ASAPS** — you can switch between existing branches, but creating new ones currently requires using `git` or `gh` in a terminal. (Branch authoring inside the app is on the roadmap.)
- **Multi-remote setups** — ASAPS assumes a single `origin`. If you've added other remotes manually, they won't appear in the UI but they won't break anything either.
- **Git LFS** — explicitly disabled. Asset binaries are committed as plain Git blobs.
- **GitLab, Bitbucket, self-hosted Git** — only GitHub is wired into the onboarding flow. You can manually `git init` and add a non-GitHub remote in a terminal, but the in-app authentication and "create repo" flows are GitHub-specific.

If any of these are blocking you, file an issue on the ASAPS repo — these are the features most likely to land first as the version-control story matures.

---

# Part 10: Search, Translation & Productivity

## Undo & Redo

ASAPS Modern maintains a full undo/redo history for beat operations:

- **Ctrl/Cmd+Z** - Undo the last operation
- **Ctrl/Cmd+Shift+Z** - Redo
- The **History dropdown** (next to undo/redo buttons) shows recent operations

Supported operations: edit beat properties, add beats, delete beats, move beats. The undo stack persists for the current session.

## Search & Replace

Find and modify content across your entire project:

1. Press **Ctrl/Cmd+F** or click **Tools → Search**
2. The Search panel appears at the bottom

**Features:**
- Search across beat names, text content, dialog choices, and properties
- **Replace** individual matches or replace all
- **Case-sensitive** toggle
- **Regex** support for pattern matching
- Results grouped by beat with context preview
- Click a result to select that beat in the canvas

**Use Cases:**
- Rename a character across all dialog
- Find all beats mentioning a specific location
- Replace placeholder text throughout the story

## Multi-Language Translation

Create localized versions of your story with AI-assisted translation:

1. Click the **language selector** (top right, shows "Source (English)")
2. Add target languages
3. Switch to a target language to enter translations

**How Translation Mode Works:**
- The Inspector shows translatable fields with the source text as reference
- AI can auto-translate all strings for a beat or the entire project
- Translations are stored alongside the story data
- **Staleness detection** highlights translations that may be outdated when the source text changes

**VCS-Aware:** Translations persist through git operations (push, pull, merge) and are saved in the directory project format.

## Transformation Commands

Bulk operations accessible from the **Tools** dropdown in the header:

- **Transformations** - Bulk transformation commands (also accessible via Ctrl/Cmd+Shift+K)
- **Merge DialogTrees** - Combine multiple DialogTree beats into a nested conversation

The **Auto-Arrange** button is available directly on the flowchart canvas (bottom-left controls). The **Debug** button in the header provides reachability analysis, path analysis, and logic validation.

## Desktop App Features

The ASAPS Desktop app (built with Electron) provides additional capabilities:

- **Directory projects** - Stories saved as folders of JSON files (better for version control)
- **Native file dialogs** - Save/open using OS file picker
- **Git integration** - Full VCS support (see Part 9)
- **Local file access** - Direct read/write without browser limitations

---

# Appendix A: Beat Reference

Quick reference for all beat types.

## Visible Beats

| Beat | Purpose | Key Settings |
|------|---------|--------------|
| Title Screen | Story opening | title, subtitle, author, button text |
| Info Text | Narration | text, button text, textVariations (optional array for random selection) |
| Dialog Tree | Choices | prompt, choices (each with text, target, condition), NPC auto-exit target, presentation mode, markVisited, choice effects |
| Movement Choice | Navigation | description, destinations |
| Pick Prop | Item selection | prompt, props, display mode |
| Duration Screen | Timed display | text, duration, show timer, textVariations (optional) |
| Video Beat | Video playback | video asset, autoplay, controls, skip |
| Input Text | Text entry | prompt, placeholder, validation, save target |
| Keypad | Numeric input | prompt, layout (phone/numeric/pin), correct code, max attempts, min/max digits, mask input, save to |
| Hyper Text | Clickable text | text with links, link targets |
| 360 Panorama | Panoramic view | panorama image, hotspots (pitch/yaw), starting orientation, field of view |
| End Screen | Story ending | message, show restart, show credits, reset (with granular sub-options: variables, counters, inventory, timers, fictional time, visited tracking, history), restart text, credits text, credits page title, credits page body, credits close text |
| Online Content | Live web data | mode (API/AI), query, template |

## Logic Beats

| Beat | Purpose | Key Settings |
|------|---------|--------------|
| Set Variable/Counter | Change state | variable name, value (true/false), counter operations, or fictional time |
| Condition Check | Branching | condition type (counter, counterCompare, timer, inventory, variable, fictionalTime, mood, emotion, trait, sentiment, goal, characterVariant), per-type fields, true target, false target. (Per-beat *Requirements* — see [Per-Beat Requirements](#condition-beats) — additionally support a `visitedBeat` check.) |
| Random Target | Randomization | targets with optional weights |
| Set Timer | Timed events | timer name, duration, expiration target |
| Inventory Management | Item management | action (add/remove/transfer), item, quantity, character |
| Update Affect | Mood / sentiment / emotion drift | character, ±valence, ±arousal, sentiment (target+emotion+strength), emotion (name+intensity) |

## AI Runtime Beats

| Beat | Purpose | Key Settings |
|------|---------|--------------|
| AI Info Text | Dynamic narrative text | prompt, fallbackText, buttonText, includeVariables, includeInventory, includeHistory, maxSentences |
| AI Duration Screen | Dynamic timed text | prompt, fallbackText, wordsPerMinute, minDuration, maxDuration, context options |
| AI Condition | AI branching | prompt, categories, fallback |
| AI Dialog Tree | AI pre-generated conversation | scenario, npcName, npcPersonality, exitTargets (with npcExitMessage), maxTurns, presentationMode, prefetch support |
| AI Conversation | Real-time AI conversation | scenario, npcName, npcPersonality, directions (trigger + action), maxTurns, fallbackExitTarget, enableVoiceInput, openingLine |
| AI Summary | Journey recap | style, length, include options |

---

# Appendix B: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + S | Save project |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + F | Search & Replace |
| Ctrl/Cmd + Shift + P | Open Preview window |
| Ctrl/Cmd + Shift + K | Open Transformations panel |
| Ctrl/Cmd + I | Toggle inventory (in preview) |
| Delete | Delete selected beat |
| Escape | Deselect / Close panel |
| Shift + Click | Multi-select elements (Visual Editor) |

---

# Appendix C: Glossary

**ASML** - Advanced Stories Markup Language. The XML format for storing narrative systems.

**Beat** - A potential moment in your narrative system. The atomic unit of IDN.

**Character** - An entity in your system with potential appearances, stats, and inventory.

**Cluster** - A group of beats organized together, either for tidiness or to represent a location.

**Connection** - A link between beats defining possible transitions in the experience.

**Counter** - A numeric variable that tracks quantities (gold, health, reputation).

**Flowchart** - The visual graph showing beats and their connections.

**Hotspot** - An invisible clickable area on the visual stage.

**IDN** - Interactive Digital Narrative. A narrative expression implemented as a dynamic computational system that changes due to input from interactors.

**Inspector** - The panel showing properties of the selected element.

**Instantiation** - What happens when an interactor engages with a protostory—a specific narrative emerges from the possibilities.

**Interactor** - The participant who engages with an IDN. Not a passive reader or viewer, but an active participant whose choices shape the experience.

**Logic Beat** - A beat that processes behind the scenes without displaying to the interactor.

**Narrative System Builder** - The creator of an IDN. Unlike traditional authors who produce fixed artifacts, system builders create dynamic systems containing multiple potential narratives.

**Protostory** - The narrative system you create—containing all the potential narratives that could emerge through interaction. Distinguished from a fixed "story."

**State** - The collective memory of your system: variables, counters, inventory, history.

**System Builder** - See "Narrative System Builder."

**Variable** - A true/false flag that tracks conditions (hasKey, metWizard).

**Visible Beat** - A beat that displays content to the interactor.

**Visual Editor** - The WYSIWYG interface for designing beat appearances.

**AI Conversation** - A beat type that enables real-time, free-form AI-powered conversations steered by author-defined directions.

**Conversation Direction** - A trigger + action rule that steers an AI Conversation. Triggers detect what the player says; actions control how the AI responds or where the story goes next.

**Choice Effects** - Variable, counter, inventory, or affect changes (nudge mood, fire emotion, add sentiment, set goal status, set character variant, add reflection) that trigger immediately when a dialog or movement choice is selected. Authored in the **Effects:** section of any choice via the **+ Add Effect** button or, for affect-stack bundles, the **+ apply template…** dropdown. See [Easier authoring: labels, palette suggestions, templates, and a live summary](#effects-easier-authoring).

**Effect Template** - A preset, intent-shaped bundle of affect-stack effects (mood, emotion, sentiment, reflection, counter changes) that the choice editor appends in one click. Eight defaults ship: *Empathetic — full support*, *Empathetic — partial / well-meaning*, *Pushy / dismissive*, *Silent / felt-abandoned*, *Boundary respecting*, *Validating / "I see you"*, *Defensive overreach*, *Quiet recovery*. Templates infer the target character from existing rows and only emit counter increments for counters that exist in the project.

**Affect Summary** - The small italic blue-tinted block (prefixed with `→`) shown below the effect rows in the Choice Effects editor. Synthesises the cumulative effect of the choice in plain language ("Alex: feels happier; joy spikes; trust toward the player grows (+0.50) · +2 supportScore"), updating live as the author tweaks values. Hidden when no effects or every delta is below noise.

**Personality Archetype** - One of ten research-grounded Big Five presets (Balanced, Narcissist, Anxious introvert, Conscientious leader, Free spirit, Recluse, Hothead, Peacekeeper, Stoic, Trickster) that can be loaded onto a character to seed traits and, in some cases, self-directed sentiments.

**Big Five** - The five static personality traits (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism) authored on a character in `[0, 1]`. Modulates emotion deltas at runtime; never gates choices on its own.

**Mood (Valence, Arousal)** - A character's two-dimensional affect, plotted on Russell's circumplex. Valence runs sad ↔ happy; arousal runs calm ↔ excited. Both axes are continuous in `[-1, 1]`.

**Mood Pad** - The 2D interactive disc used to set a character's initial mood. Available in the Affect tab (large) and as a runtime HUD overlay (small).

**Sentiment** - A directed feeling — a (holder, target, emotion, strength) tuple. *Trust toward player +0.5*, *fear toward wolf +0.7*. Self-directed sentiments (where holder = target) render as *self-shame*, *self-pride*, etc.

**Emotion Palette** - The project-wide list of emotions characters can feel. Defaults to the Ekman 6 (joy, anger, fear, sadness, surprise, disgust) plus pride, shame, and interest. Each emotion has valence and arousal weights and a decay rate.

**Goal** - An authored objective on a character (id, name, optional description, optional priority). The runtime tracks status; goals flipped to `met` or `failed` auto-fire pride/joy or shame/sadness scaled by priority (GAMYGDALA-style).

**Variant** - An alternate persona overlay on a character that shares the character's stable id but carries its own personality, mood, sentiments, dossier policy, portrait, and (optional) display name. Switched at runtime via the `setCharacterVariant` effect.

**Dossier Policy** - How the LLM sees a character in AI beats. *Mode A (re-anchor)* rebuilds the dossier from structured state every turn. *Mode B (accumulate reflections)* appends short narrative notes the character has made about themselves over the session.

**Reflection** - A short narrative note in a character's voice, paired with a salience score in `[0, 1]`, appended to a Mode B character's memory. Seeded via the `addReflection` choice effect or the runtime API.

**Mood HUD** - An optional small 2D mood-pad overlay that mounts on the running stage to show a character's mood updating in real time during play.

**NPC Auto-Exit** - A Dialog Tree feature where a dialog node automatically advances to a target beat after the NPC speaks, without showing choices to the player.

**Session Timeline** - An automatic log of significant events during story playback, including beat transitions, player choices, AI outputs, and branching decisions.

**Markdown-Lite** - Lightweight text formatting supported in text boxes: `**bold**`, `*italic*`, `~~strikethrough~~`, and line breaks.

**Speaker Portrait** - A small face/head image assigned to a character that appears in or above the text box during dialog. Configured in the Character Editor's Visual tab.

**STT (Speech-to-Text)** - Voice input that converts spoken words to text. Used in AI Conversation beats and other input scenarios. Supports Web Speech, Whisper (OpenAI), local Whisper servers, Vosk, and whisper.cpp.

**TTS (Text-to-Speech)** - The system that reads story text aloud using synthesized voices. Supports multiple providers including ElevenLabs, OpenAI, Web Speech, Local TTS (Kokoro, Coqui, Piper), and custom servers.

**Fictional Time** - An in-story date/time value independent of real-world time. Used for day/night cycles, deadlines, and time-based branching.

**Timer HUD** - A heads-up display overlay showing either a real-time countdown or fictional time in a corner of the screen.

**VCS** - Version Control System. Git integration for tracking changes and collaborating.

**Waypoint** - A point along an animation path.

---

# Appendix D: FAQ

### How do I undo a mistake?
Press Ctrl/Cmd+Z or click the Undo button in the header. ASAPS Modern maintains full undo history.

### What's the maximum project size?
There's no hard limit, but very large projects (500+ beats) may perform slower. Use clusters to stay organized.

### Can I use copyrighted images/music?
Only if you have the rights! Use royalty-free assets or create your own. Several free asset libraries exist online.

### My audio/video won't play. Why?
Check file format compatibility. MP3 and MP4 have the broadest support. Also verify the asset is properly linked.

### How do I back up my work?
Export regularly as ASAPS Project (.zip). These files contain everything needed to restore your project.

### Can I import from Twine?
Yes! Use Import → Import Twine (HTML). SugarCube format is supported, though complex macros may need manual adjustment.

### Do AI features require an API key?
AI features can work with cloud services (Claude or OpenAI) which require an API key and may incur costs. However, you can also use **local LLMs via Ollama** for free -- story generation may not work as well with smaller local models, but it's usable for many features.

### What is the difference between AI Dialog Tree and AI Conversation?
**AI Dialog Tree** pre-generates a complete branching conversation tree before the player sees it. The player picks from AI-generated choices. **AI Conversation** generates each NPC response in real time based on what the player types. Use AI Dialog Tree for structured conversations with clear branches; use AI Conversation for open-ended, free-form dialog.

### Can I use voice input and output together?
Yes! Configure TTS for voice output and STT for voice input. In AI Conversation beats with voice input enabled, the NPC speaks via TTS, the player responds by voice (STT), and the cycle continues naturally. This works with both cloud and local providers.

### How do I share my story with others?
Use **Export → Export as HTML** to create a standalone playable file. Recipients just open it in any browser—no ASAPS installation needed.

### How do I collaborate with a team?
The fastest path: one author uses **File → New Project on GitHub…** to create the project and publish it to GitHub in one step, then invites collaborators on github.com. Each collaborator uses **File → Open Project from GitHub…** to clone the repo and start working. Commit, push, and pull all happen from the **VCS panel** at the bottom of the app. Advisory editing locks (purple dots on beats someone else is editing) help you avoid stepping on each other's toes. See [Part 9: Version Control & Collaboration](#part-9-version-control--collaboration) for the full walkthrough.

### Can I translate my story to other languages?
Yes! Use the language selector (top right) to add target languages. You can translate manually or use AI-assisted translation. Translations are saved with the project.

### What browsers are supported?
Modern versions of Chrome, Firefox, Safari, and Edge all work. Chrome is recommended for best performance. The Desktop app (Electron) provides additional features like Git integration and directory projects.

---

## Still Have Questions?

- Check the [README](../README.md) for technical details
- Report issues at [GitHub Issues](https://github.com/sumo961/ASAPS_New)
- Sample projects ship as ZIP files in the project library — open one and use **Import → Import Project (ZIP)** to learn techniques. The canonical demonstration of the affect stack (variants, choice effects, mood-gated endings) is **Standing Beside Alex**.

---

*Now go build something that creates opportunities for others to explore. The narratives that emerge will surprise you.*

---

© 2024–2026 ASAPS Modern Team

---

## Further Reading

For a deeper understanding of interactive digital narrative theory and design:

**Koenitz, H. (2023). *Understanding Interactive Digital Narrative: Immersive Expressions for a Complex Time.* Routledge.**

This book provides the theoretical foundation for the concepts discussed in this guide, including the SPP (System, Process, Product) model, the distinction between system builders and traditional authors, and specific design principles for IDN.
