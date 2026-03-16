# ASAPS Modern User Guide

**Your Complete Guide to Building Interactive Narrative Systems**

*Version 0.9.28*

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
- [Part 6: AI Features](#part-6-ai-features) - AI-assisted system building
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
The ASAPS logo, version number, and a large text field where you can type or edit your project's title directly.

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

**Row 3 -- AI and Language:**

| Button | What it Does |
|--------|--------------|
| **AI** | Dropdown: Generate Story, Create Beat from Description, Configure AI |
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

![Visual Editor](images/06-visual-editor.png)
*The Visual Editor lets you design how beats appear*

## The Right Sidebar: Inspector

When you select a beat, the Inspector shows everything about it:

- **Name & Type** - What this beat is called and what kind it is
- **Content** - The beat's main content (text, choices, etc.)
- **Connections** - Where the experience can go next
- **Advanced Settings** - Sounds, conditions, special behaviors

The Inspector changes based on what you've selected. Select a Dialog Tree and you'll see choice options. Select a Video Beat and you'll see playback settings.

![Inspector Panel](images/05-inspector-panel.png)
*The Inspector panel shows properties of the selected beat*

## The Beat Palette (Right Side)

Your beat shopping catalog, docked to the right edge of the flowchart. Drag any beat type onto the canvas to add it to your system. Click the collapse arrow to hide it when you need more canvas space.

The palette is organized into three categories:
- **Visible Beats** - Moments the interactor encounters (Title Screen, Info Text, Dialog Tree, Movement Choice, Pick Prop, Video Beat, End Screen, Duration Screen, Input Text, Keypad, Hyper Text)
- **Logic Beats** - Behind-the-scenes processing (Set Variable/Counter, Condition Check, Random Target, Set Timer, Inventory Management)
- **AI Beats** - AI-powered dynamic content (Online Content, AI Condition, AI Dialog Tree, AI Summary, AI Info Text, AI Duration Screen)

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

**Recursive Dialogs:** Set a choice's target to `__self__` to loop back to the root of the dialog tree. This is powerful for "hub" conversations where the interactor can ask multiple questions before leaving. Combined with **per-choice visited tracking** (`markVisited`), choices the interactor has already picked can be visually dimmed or hidden.

**Choice Effects:** Each choice can trigger immediate side effects—set variables, modify counters, or add/remove inventory items—without needing a separate logic beat. Open the **Effects** section on any choice to configure these. This keeps simple state changes co-located with the choice that triggers them.

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

### End Screen

**Purpose:** Story conclusion.

The final beat. Display an ending message with options to restart or view a dedicated credits page.

**Key Settings:**
- **Message** - Your ending message (defaults to "The End")
- **Show Restart** - Display a "Play Again" button. You can customize the button label with the **Restart Text** field.
- **Show Credits** - Display a "Credits" button that opens a scrollable credits page. Customize the button label with the **Credits Text** field.
- **Reset on Restart** - When enabled, clears story state before restarting. You can choose exactly what gets reset (see below).

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
- Variable values (is hasKey true?)
- Counter comparisons (is gold > 100?)
- Inventory contents (does player have "Sword"?)
- Visited beats (have they seen the secret room?)
- Timer status (is the countdown active?)

**Example Logic:**
```
IF hasKey = true
  → Go to "Enter the Tower"
ELSE
  → Go to "Locked Door"
```

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

**When to Use:** Finding loot, using consumables, trading, losing items.

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

**Purpose:** AI-generated conversations.

Instead of scripting every possible response, let AI generate contextually appropriate dialog based on the conversation so far.

**Key Settings:**
- **NPC Personality** - How the AI should "act"
- **Context** - What the AI knows about the situation
- **Max Turns** - Limit conversation length

**When to Use:** NPCs that feel alive, unlimited dialog, personalized responses.

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

Characters aren't just pretty faces. They're systems that can:
- Have multiple visual appearances (happy, sad, angry)
- Track their own counters (health, trust, energy)
- Carry inventory items
- Remember their state throughout the story

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

To enable portraits globally, go to **Settings → Speaker Display** and check **Show speaker portraits**. You can also choose where portraits appear and how large they are — see [Speaker Display Settings](#speaker-display) for details.

**Tip:** Portraits are different from character appearances. Appearances are the full-body images placed on the visual stage; portraits are small face images shown in the text box during dialog.

### Character Name Translations

When your project has translation languages configured, the Character Editor gains a **Translations** tab (marked with a globe icon). This lets you enter translated display names for each character, per language.

1. Make sure you have at least one translation language configured (see [Multi-Language Translation](#multi-language-translation))
2. Open a character in the Character Editor
3. Click the **Translations** tab
4. Enter the translated display name for each language

When AI translation runs on your project, character name translations are auto-populated and kept in sync with translation resource files. During playback with a translation active, the translated name appears as the speaker label in text boxes.

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

---

## Assets

Assets are your media files—the images, sounds, and videos that bring your experience to life.

![Asset Manager](images/04-asset-manager.png)
*The Asset Manager panel*

### Managing Assets

1. Click **Assets** in the header
2. The Asset Manager opens with tabs for:
   - **Images** - Backgrounds, characters, props, UI
   - **Audio** - Music, sound effects, voice-over
   - **Video** - Cutscenes, animations
   - **Fonts** - Custom typography

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

- Readers get personalized responses
- NPC "remembers" previous exchanges
- Conversations adapt to story state

Configure with personality prompts:
```
You are Marcus, a gruff bartender who knows everyone's secrets
but rarely shares them. Speak in short sentences. You're
suspicious of newcomers but respect those who buy good whiskey.
```

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

**Pro Tip:** You can preview from any beat in your story—just right-click a beat in the flowchart and select "Preview from here."

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

1. Right-click a beat and select **Preview from here**
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

Click the **Debug** button in the header to open the Debug Panel. It has three tabs:

### Reachability Analysis

Finds beats that can never be reached -- orphaned content with no paths leading to it.

### Path Analysis

Traces all possible routes through your story:
- Identifies dead ends
- Shows branch points
- Validates that all endings are reachable

### Logic Validation

Checks for common errors:
- Missing connections
- References to undefined variables
- Missing assets
- Invalid conditions

## Text-to-Speech (TTS)

ASAPS Modern can read your story aloud using text-to-speech. This is useful for testing how dialog flows, for accessibility, and for creating voice-driven experiences.

### Setting Up TTS

1. Click the **volume icon** in the header toolbar to open the TTS dropdown
2. Click **Enable TTS** to turn on text-to-speech
3. Click **Configure Provider** to open the provider settings dialog
4. Choose a **TTS provider**:
   - **Web Speech** — Free, built into your browser. Quality varies by OS and browser.
   - **ElevenLabs** — High-quality cloud voices. Requires an API key from [elevenlabs.io](https://elevenlabs.io).
   - **OpenAI** — Cloud TTS via OpenAI. Requires an API key.
   - **Custom Server** — Connect to your own TTS endpoint.
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

### Assigning Character Voices

Each character in your story can have a distinct TTS voice:

1. Open the TTS menu from the header
2. Under **Character Voices**, you'll see all speakers in your story
3. Use the dropdown next to each name to assign a voice
4. Available voices depend on your chosen TTS provider

Built-in speakers like **Narrator** appear automatically. Your player character appears with "(Player)" next to their name. The player character is silent by default — assign a voice to enable speech for the player's text and clicked dialog choices.

### TTS in Project Settings

Your chosen TTS provider type and model are saved with the project, so collaborators automatically use the same configuration. API keys are **not** saved in the project — they stay in your browser's local storage for security.

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

The Condition Beat provides branching logic—checking variables, counters, or visited beats and routing to different targets based on the result.

### What You Can Check

- **Variables** - True/false flags (hasKey, metWizard)
- **Counters** - Numeric comparisons (gold > 50)
- **Visited Beats** - Whether the interactor has seen a specific beat

### Compound Conditions

For complex logic requiring multiple checks, chain Condition Beats together:

```
[Check hasKey]
  → true: [Check gold > 50]
              → true: [Secret shop unlocked]
              → false: [Need more gold]
  → false: [Need the key first]
```

### Inventory Checks

You can check for item presence:
- Player HAS "Silver Key" ✓
- Player DOES NOT HAVE "Curse Mark" ✓

For quantity-based checks (e.g., "Gold > 100"), use the **AI Condition** beat which can evaluate complex states.

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
- Text animations (typewriter, fade) and hotspot visibility

**Settings → HUD:**
- Timer display and countdown meter overlays

**Settings → Sound:**
- Background music and volume settings

<a id="speaker-display"></a>
**Settings → Speaker Display:**
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

The Timer HUD is a persistent overlay that appears in a corner of the screen. Configure it in **Settings → HUD**:

- **Position** - Top-left, top-right, bottom-left, bottom-right
- **Style** - Digital (clock-style) or Minimal
- **Colors** - Text color, background color, opacity
- **Label** - Optional label above the time display

The HUD automatically shows the active countdown when a timer is running. When no timer is active, it can display fictional time or static text.

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

ASAPS Modern includes built-in Git version control for team collaboration. This works with the **Desktop app** on directory-format projects.

## Why Version Control?

When building a complex narrative system, you need:
- **History** - See what changed and when, roll back mistakes
- **Collaboration** - Multiple people working on the same story
- **Backup** - Your work is safely stored in a remote repository

## Setting Up Git

### New Project
1. Open or save your story as a **directory project** (File → Save As Folder)
2. Open the **VCS Panel** (sidebar icon or Ctrl/Cmd+Shift+G)
3. Click **Initialize Repository**
4. Optionally add a remote URL (GitHub, GitLab, etc.)

### Existing Repository
1. **Clone** an existing repo: File → Clone Repository
2. Enter the remote URL and choose a local folder
3. The project opens automatically

## The VCS Panel

The VCS panel (accessible from the sidebar) has several tabs:

### Pending Changes
Shows all modified, added, or deleted files since last commit:
- **Stage** individual files or all at once
- **Unstage** files you don't want to commit
- **Revert** files to discard local changes
- Click any file to see a **diff** of what changed

### Commit & Push
1. Stage your changes
2. Write a commit message describing what you did
3. Click **Commit**
4. Click **Push** to send to the remote

### Pull & Sync
- **Pull** downloads changes from the remote
- **Pull with Rebase** replays your local commits on top of remote changes
- The header shows **↑ ahead** and **↓ behind** counts

### Branches
- View and switch between branches
- Create new branches for features or experiments
- Merge branches back together

### History
- Browse the full commit log
- See which files changed in each commit
- View diffs for any historical commit

## Beat-Level Status Indicators

Each beat on the canvas shows a colored dot indicating its VCS status:

| Color | Meaning |
|-------|---------|
| Green | New (added/untracked) |
| Orange | Modified since last commit |
| Red | Merge conflict |
| Purple | Being edited by another user |

## Merge Conflicts

When two people edit the same beat and their changes conflict:

1. The beat shows a **red dot** on the canvas
2. The VCS panel highlights conflicting files
3. Choose resolution: **Keep Mine** or **Accept Theirs**
4. For rebases with multiple conflicts, ASAPS resolves them step by step

## Advisory Editing Locks

When collaborating via Git, ASAPS tracks which beats each team member is currently editing. This is **advisory only**—it warns you but doesn't prevent editing.

**How it works:**
- When you select a beat in the Inspector, a lock entry is written to `.asaps-editing.json`
- This file propagates through normal git commit/push/pull
- Other team members see a **purple dot** on beats you're editing
- The Inspector shows a warning banner: "*Alice is currently editing this beat*"
- Locks automatically expire after 2 hours (handles crashes and forgotten sessions)

**What to do:** If you see a purple indicator, consider working on a different beat to avoid merge conflicts later.

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
| Dialog Tree | Choices | prompt, choices (each with text, target, condition) |
| Movement Choice | Navigation | description, destinations |
| Pick Prop | Item selection | prompt, props, display mode |
| Duration Screen | Timed display | text, duration, show timer, textVariations (optional) |
| Video Beat | Video playback | video asset, autoplay, controls, skip |
| Input Text | Text entry | prompt, placeholder, validation, save target |
| Keypad | Numeric input | prompt, layout (phone/numeric/pin), correct code, max attempts, min/max digits, mask input, save to |
| Hyper Text | Clickable text | text with links, link targets |
| End Screen | Story ending | message, show restart, show credits, reset (with granular sub-options: variables, counters, inventory, timers, fictional time, visited tracking, history), restart text, credits text, credits page title, credits page body, credits close text |
| Online Content | Live web data | mode (API/AI), query, template |

## Logic Beats

| Beat | Purpose | Key Settings |
|------|---------|--------------|
| Set Variable/Counter | Change state | variable name, value (true/false), counter operations, or fictional time |
| Condition Check | Branching | condition type, comparison, true target, false target |
| Random Target | Randomization | targets with optional weights |
| Set Timer | Timed events | timer name, duration, expiration target |
| Inventory Management | Item management | action (add/remove/transfer), item, quantity, character |

## AI Runtime Beats

| Beat | Purpose | Key Settings |
|------|---------|--------------|
| AI Info Text | Dynamic narrative text | prompt, fallbackText, buttonText, includeVariables, includeInventory, includeHistory, maxSentences |
| AI Duration Screen | Dynamic timed text | prompt, fallbackText, wordsPerMinute, minDuration, maxDuration, context options |
| AI Condition | AI branching | prompt, categories, fallback |
| AI Dialog Tree | AI conversation | personality, context, max turns |
| AI Summary | Journey recap | style, length, include options |

---

# Appendix B: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + S | Save project |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + F | Search & Replace |
| Ctrl/Cmd + Shift + G | Toggle VCS panel |
| Ctrl/Cmd + Shift + P | Open Preview window |
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

**Choice Effects** - Variable, counter, or inventory changes that trigger immediately when a dialog or movement choice is selected.

**Speaker Portrait** - A small face/head image assigned to a character that appears in or above the text box during dialog. Configured in the Character Editor's Visual tab.

**TTS (Text-to-Speech)** - The system that reads story text aloud using synthesized voices. Supports multiple providers including ElevenLabs, OpenAI, Web Speech, and custom servers.

**Fictional Time** - An in-story date/time value independent of real-world time. Used for day/night cycles, deadlines, and time-based branching.

**Timer HUD** - A heads-up display overlay showing either a real-time countdown or fictional time in a corner of the screen.

**VCS** - Version Control System. Git or Perforce integration for tracking changes and collaborating.

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
AI features can work with cloud services (Claude or OpenAI) which require an API key and may incur costs. However, you can also use **local LLMs via Ollama** for free—story generation may not work as well with smaller local models, but it's usable for many features.

### How do I share my story with others?
Use **Export → Export as HTML** to create a standalone playable file. Recipients just open it in any browser—no ASAPS installation needed.

### How do I collaborate with a team?
Save your project as a directory format, initialize a Git repository, and push to a shared remote (GitHub, GitLab, etc.). Team members clone the repo and use the built-in VCS panel for commit/push/pull. Advisory editing locks help avoid conflicts.

### Can I translate my story to other languages?
Yes! Use the language selector (top right) to add target languages. You can translate manually or use AI-assisted translation. Translations are saved with the project.

### What browsers are supported?
Modern versions of Chrome, Firefox, Safari, and Edge all work. Chrome is recommended for best performance. The Desktop app (Electron) provides additional features like Git integration and directory projects.

---

## Still Have Questions?

- Check the [README](../README.md) for technical details
- Report issues at [GitHub Issues](https://github.com/sumo961/ASAPS_New)
- Review example projects (Import → Examples) to learn techniques

---

*Now go build something that creates opportunities for others to explore. The narratives that emerge will surprise you.*

---

© 2024–2026 ASAPS Modern Team

---

## Further Reading

For a deeper understanding of interactive digital narrative theory and design:

**Koenitz, H. (2023). *Understanding Interactive Digital Narrative: Immersive Expressions for a Complex Time.* Routledge.**

This book provides the theoretical foundation for the concepts discussed in this guide, including the SPP (System, Process, Product) model, the distinction between system builders and traditional authors, and specific design principles for IDN.
