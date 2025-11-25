# RED: A Modern Tale - Story Guide

## Overview
A modern retelling of Little Red Riding Hood where the player is Riley, a 16-year-old girl navigating identity, peer pressure, and self-discovery.

## Story Structure

### The "Wolf" in Modern Form
Instead of a literal wolf, the dangers are:
- **Social media pressure** (the constant performance)
- **Toxic friendships** (people who don't value the real you)
- **FOMO** (fear of missing out)
- **People-pleasing** (losing yourself to fit in)

### The Journey
**Setup:** Riley must choose between visiting her grandmother (family, authenticity) or going to the mall with popular kids (social acceptance, performance).

**Three Main Paths:**
1. **Grandma Path (True Self)** - Choose family, face social pressure, gain wisdom
2. **Mall Path (Fitting In)** - Choose popularity, participate in mean behavior, feel hollow
3. **Compromise Path (Worst of Both)** - Try to do both, disappoint everyone, learn about priorities

### Key Themes
- **Identity vs. Performance** - Being yourself vs. who others want you to be
- **True Connection** - Depth vs. superficial relationships
- **Modern Red Flags** - Recognizing toxic behavior (gossip, exclusion, conditional acceptance)
- **Generational Wisdom** - Learning from those who've walked similar paths

## Story Statistics
- **23 Interactive Beats**
- **3 Major Endings** (True Self, Shallow Victory, Divided)
- **Multiple Choice Points** with meaningful consequences
- **6 Dialog Tree Interactions** with emotional depth
- **Timing Features** - Choice delays create dramatic tension

## Beat Types Used
✅ **TitleScreen** - Engaging opening
✅ **IntroText** - Narrative exposition (11 beats)
✅ **MovementChoice** - Major path selection with 3 routes
✅ **DialogTree** - Character interactions (6 conversations)
✅ **EndScreen** - 3 distinct endings with replay value

## How to Import This Story into Builder

### Option 1: Import Pre-packaged ZIP (Easiest)
The story is available as a ready-to-import ZIP file:

1. Open the ASAPS Builder
2. Go to File → Import ZIP
3. Navigate to `packages/builder/public/examples/`
4. Select `red-riding-hood-modern.asaps.zip`
5. The story will load with all 23 beats in the visual editor

### Option 2: Generate Fresh from TypeScript
```bash
cd "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"
npx tsx create-example-zip.ts
```

This regenerates the ZIP file from the TypeScript source.

### Option 3: Use Builder's AI Features to Enhance

After importing the ZIP file, you can enhance the story using AI integration:

1. **Use AI to enhance dialog:**
   - Open any DialogTree beat in the editor
   - Click "AI Generate" button
   - Describe the scene context
   - Generate richer, branching conversations

2. **Use AI Beat Suggestions:**
   - Select any beat
   - Open Inspector
   - Click "Get Suggestions"
   - Add additional story branches

3. **Use Natural Language Beat Creator:**
   - Click AI menu → "Create Beat"
   - Describe new scenes in plain English:
     - "Add a scene where Riley sees her old childhood friend at the park"
     - "Create a moment where Riley has to choose between posting or being present"
     - "Add a beat where the popular friends exclude someone else"

### Option 4: Start Fresh with AI Story Generator

Use the Builder's AI Story Generation feature:

**Prompt:**
```
Create an interactive narrative about a 16-year-old girl named Riley who must choose between visiting her grandmother or hanging out with popular kids at the mall. The story explores themes of authenticity vs. fitting in, social media pressure, and finding your true self. It's a modern retelling of Little Red Riding Hood where the "wolf" is toxic friendships and peer pressure. Include meaningful choices that affect Riley's character development and multiple endings based on whether she chooses authenticity or approval.
```

**Settings:**
- Genre: Coming of Age / Contemporary
- Length: Medium (15-20 beats)
- Complexity: Moderate branching

## Story Flow Map

```
Title Screen
    ↓
Introduction (Riley's dilemma)
    ↓
FIRST MAJOR CHOICE (3 paths)
    ├─→ GRANDMA PATH
    │      ├─ Walking scene
    │      ├─ Social media pressure (3 response choices)
    │      ├─ Grandma's door
    │      ├─ Heart-to-heart or surface conversation
    │      └─ → TRUE SELF ENDING
    │
    ├─→ MALL PATH
    │      ├─ Mall scene
    │      ├─ Drama/gossip (3 moral choices)
    │      │   ├─ Join mockery → HOLLOW VICTORY ENDING
    │      │   └─ Defend Sarah → Leave mall → Grandma → TRUE SELF ENDING
    │
    └─→ COMPROMISE PATH
           ├─ Rushed visit
           ├─ Grandma hurt
           └─ Choose again
               ├─ Stay → TRUE SELF ENDING
               └─ Leave → DIVIDED ENDING
```

## Key Moments & Teaching Points

### 1. **The Phone Pressure Moment**
When Riley sees the group chat, she can:
- **Silence phone** (confident, setting boundaries) → Feels lighter
- **Brief reply** (balanced, not over-explaining) → Neutral
- **Apologetic** (people-pleasing, anxious) → Feels worse

**Teaching:** How you respond to social pressure shapes how you feel about yourself.

### 2. **The Gossip Test**
At the mall, when friends mock Sarah:
- **Join in** → Accepted but empty
- **Defend** → Social risk but self-respect
- **Avoid** → Middle ground

**Teaching:** Your values are tested in moments like these.

### 3. **The Rushed Visit**
Trying to do both:
- Grandma notices distraction
- Neither experience is fulfilling
- You can course-correct or double down

**Teaching:** Being present matters more than being everywhere.

## Enhancing with AI Features

### Expand the Grandma Wisdom
**Use Dialog Generator:**
- Scene: "Riley and Grandma having tea"
- Character: "Wise grandmother"
- Goal: "Share life wisdom about authenticity"
- Branching: 2-3 player questions

### Add Social Media Scenes
**Use Beat Creator:**
- "Add a beat where Riley scrolls through Instagram and compares herself to others"
- "Create a scene where Riley has to decide whether to post a filtered vs. authentic photo"

### Deepen Character Moments
**Use Beat Suggestions:**
- From "Walking to Grandma" beat, suggest:
  - Encounter with old childhood friend
  - Memory flashback
  - Moment of doubt

### Alternative Endings
**Use Natural Language Creator:**
- "Create an ending where Riley starts a new friend group with authentic people"
- "Add an epilogue showing Riley one month later with new confidence"

## Playing the Story

**Recommended play order for full experience:**
1. **First playthrough:** Choose mall path → Join mockery → See hollow ending
2. **Second playthrough:** Choose grandma → Ignore phone → See true self ending
3. **Third playthrough:** Choose compromise → Stay with grandma → See redemption

Each path teaches different lessons about identity, values, and authentic connection.

## Modern "Red Flags" (The Wolves)

The story highlights toxic patterns:
- ✗ Conditional acceptance ("You're only cool if you act like us")
- ✗ Mean-girl behavior (gossip, exclusion, mockery)
- ✗ FOMO manipulation ("Everyone is here, where are you?")
- ✗ Passive aggression ("Whatever 🙄")
- ✗ Always-on pressure (constant notifications, performance anxiety)

**Healthy alternatives shown:**
- ✓ Unconditional love (Grandma)
- ✓ Setting boundaries (silencing phone)
- ✓ Speaking up for others (defending Sarah)
- ✓ Being present (putting phone away)
- ✓ Authentic connection (vulnerability with Grandma)

## Extension Ideas (Using AI)

### 1. Add a "Sarah" Path
Create beats where Riley encounters Sarah (the girl being mocked):
- Sarah thanks Riley for defending her
- They become real friends
- Alternative positive ending

### 2. School Aftermath
Add Monday-at-school beats showing consequences:
- Mall group ignores Riley → She finds better friends
- Mall group still toxic → Riley stands firm
- Riley and Sarah eat lunch together

### 3. Parent Conversation
Add Riley's mom character:
- Notices Riley's stress about friends
- Offers perspective
- Reveals she went through similar struggles

### 4. Deeper Grandma Backstory
Use Dialog Generator to create:
- Grandma shares her own "Little Red Riding Hood" moment
- Shows her scar from choosing wrong friends
- Explains how she learned to trust herself

## Technical Features Demonstrated

✅ **Choice Delays** - Creates tension before decisions
✅ **Branching Paths** - Different routes with unique content
✅ **Converging Paths** - Some choices lead back to same outcomes
✅ **Multiple Endings** - Replay value with different messages
✅ **Character Development** - Riley's confidence grows or shrinks based on choices
✅ **Emotional Pacing** - Quiet moments and intense decisions

## Success Metrics

A successful playthrough makes the player:
1. **Think** about their own friendships and authenticity
2. **Feel** the pressure Riley faces (relatable)
3. **Reflect** on times they chose approval over authenticity
4. **Learn** that the "scariest" choice (being yourself) often leads somewhere real
5. **Replay** to see alternative paths and outcomes

---

This story uses the classic fairytale structure but updates it for modern teenage life, showing that the "wolves" we face today are often social and psychological rather than physical.

The grandmother's "big eyes" become wisdom and perspective. The "big teeth" become toxic behavior patterns. And the "woodsman" who saves the day? That's Riley's own authentic voice and choices.
