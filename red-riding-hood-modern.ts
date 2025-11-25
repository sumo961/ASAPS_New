/**
 * Modern Little Red Riding Hood - Interactive Narrative
 * A teenage girl's journey of self-discovery
 *
 * To use: Run this script to generate the story structure
 */

import { BeatTypeRegistry } from './packages/core/src/beats/BeatRegistry';
import { Story } from './packages/core/src/engine/Story';

export function createRedRidingHoodStory() {
  const registry = BeatTypeRegistry.getInstance();
  const story = new Story('red-riding-hood-modern', 'Red: A Modern Tale', 'ASAPS Builder');

  // Title Screen
  const beat1 = registry.createBeat('titleScreen', {
    id: 'beat_title',
    name: 'Title Screen',
    type: 'titleScreen',
    x: 100,
    y: 200,
    parameters: {
      title: 'RED: A Modern Tale',
      author: 'Interactive Narrative',
      buttonText: 'Begin Journey'
    }
  });
  beat1.addConnection({ targetId: 'beat_intro', label: 'Start' });

  // Introduction
  const beat2 = registry.createBeat('introText', {
    id: 'beat_intro',
    name: 'Introduction',
    type: 'introText',
    x: 300,
    y: 200,
    parameters: {
      text: `You're Riley, a 16-year-old trying to figure out where you fit in.

Today, your grandmother texted asking you to visit. She lives across town in the old neighborhood where you used to play as a kid. Your mom packed some homemade cookies for her.

But there's a problem: your new "friends" just invited you to hang out at the mall. They're the popular crowd you've been trying to impress all semester.`,
      buttonText: 'What do I do?'
    }
  });
  beat2.addConnection({ targetId: 'beat_choice_path', label: 'Continue' });

  // First Major Choice
  const beat3 = registry.createBeat('movementChoice', {
    id: 'beat_choice_path',
    name: 'Choose Your Path',
    type: 'movementChoice',
    x: 500,
    y: 200,
    parameters: {
      question: 'What matters more right now?',
      choices: [
        {
          id: 'choice_grandma',
          text: 'Visit Grandma (family comes first)',
          location: 'grandma_path',
          target: 'beat_walk_start'
        },
        {
          id: 'choice_friends',
          text: 'Go to the mall (fitting in matters)',
          location: 'mall_path',
          target: 'beat_mall_scene'
        },
        {
          id: 'choice_compromise',
          text: 'Try to do both (visit quickly, then mall)',
          location: 'both_path',
          target: 'beat_rush_visit'
        }
      ],
      choiceDelay: 2
    }
  });

  // GRANDMA PATH - Longer, more rewarding
  const beat4 = registry.createBeat('introText', {
    id: 'beat_walk_start',
    name: 'Walking to Grandma',
    type: 'introText',
    x: 700,
    y: 100,
    parameters: {
      text: `You text your "friends" that you can't make it and head to Grandma's.

As you walk through the old neighborhood, memories flood back. The corner store where you'd buy candy. The park where you learned to ride a bike. Everything seems smaller now, but somehow more real than the filtered world of social media.

Your phone buzzes constantly with messages from the group chat.`,
      buttonText: 'Check phone'
    }
  });
  beat4.addConnection({ targetId: 'beat_phone_pressure', label: 'Continue' });

  const beat5 = registry.createBeat('dialogTree', {
    id: 'beat_phone_pressure',
    name: 'Social Media Pressure',
    type: 'dialogTree',
    x: 900,
    y: 100,
    parameters: {
      speaker: 'Group Chat',
      dialogTree: {
        id: 'root',
        text: 'Madison: "OMG where r u?? We\'re at the food court. Jake is here 👀"',
        emotion: 'neutral',
        choices: [
          {
            id: 'ignore',
            text: 'Silence phone and keep walking',
            target: 'response_ignore'
          },
          {
            id: 'reply_brief',
            text: 'Reply: "Family thing. Have fun!"',
            target: 'response_brief'
          },
          {
            id: 'feel_bad',
            text: 'Reply: "Sorry! I really wanted to come 😞"',
            target: 'response_apologetic'
          }
        ]
      },
      choiceDelay: 1.5
    }
  });

  // Different responses lead to character development
  const beat6a = registry.createBeat('introText', {
    id: 'response_ignore',
    name: 'Confident Choice',
    type: 'introText',
    x: 1100,
    y: 50,
    parameters: {
      text: `You silence your phone. For the first time in weeks, you feel... lighter.

The pressure to respond instantly, to always be available, to perform for an audience - it all fades as you walk these familiar streets.

Maybe you don't need their approval as much as you thought.`,
      buttonText: 'Arrive at Grandma\'s'
    }
  });
  beat6a.addConnection({ targetId: 'beat_grandma_door', label: 'Continue' });

  const beat6b = registry.createBeat('introText', {
    id: 'response_brief',
    name: 'Balanced Choice',
    type: 'introText',
    x: 1100,
    y: 150,
    parameters: {
      text: `You send a quick reply and put your phone away.

They send back some laughing emojis, but you notice they stopped tagging you in their stories. Whatever. You made your choice.

Your phone stays quiet the rest of the walk.`,
      buttonText: 'Arrive at Grandma\'s'
    }
  });
  beat6b.addConnection({ targetId: 'beat_grandma_door', label: 'Continue' });

  const beat6c = registry.createBeat('introText', {
    id: 'response_apologetic',
    name: 'Anxious Choice',
    type: 'introText',
    x: 1100,
    y: 250,
    parameters: {
      text: `Madison replies: "Whatever 🙄"

Your stomach knots. Did you just ruin everything? Will they still talk to you on Monday?

The rest of the walk is spent refreshing the group chat, watching them post stories from the mall. Each notification makes you feel worse.`,
      buttonText: 'Arrive at Grandma\'s'
    }
  });
  beat6c.addConnection({ targetId: 'beat_grandma_door', label: 'Continue' });

  // Grandma's House
  const beat7 = registry.createBeat('dialogTree', {
    id: 'beat_grandma_door',
    name: 'At Grandma\'s Door',
    type: 'dialogTree',
    x: 1300,
    y: 150,
    parameters: {
      speaker: 'Grandma',
      dialogTree: {
        id: 'root',
        text: 'Oh, Riley! Come in, come in! I made your favorite tea. You look troubled, sweetheart. What\'s on your mind?',
        emotion: 'happy',
        choices: [
          {
            id: 'open_up',
            text: 'Open up about feeling lost',
            target: 'grandma_wisdom'
          },
          {
            id: 'keep_surface',
            text: 'Keep it surface-level',
            target: 'grandma_surface'
          }
        ]
      },
      choiceDelay: 1
    }
  });

  const beat8a = registry.createBeat('dialogTree', {
    id: 'grandma_wisdom',
    name: 'Heart to Heart',
    type: 'dialogTree',
    x: 1500,
    y: 100,
    parameters: {
      speaker: 'Grandma',
      dialogTree: {
        id: 'root',
        text: `Listen, Riley. When I was your age, I tried so hard to be someone I wasn\'t. I wore uncomfortable clothes, pretended to like things I hated, all to fit in.

You know what I learned? The people worth knowing will like you for YOU. Not the person you pretend to be.`,
        emotion: 'thoughtful',
        next: 'wisdom_2'
      },
      choiceDelay: 1
    }
  });
  beat8a.addConnection({ targetId: 'beat_reflection', label: 'Continue' });

  // MALL PATH - Shorter, hollow victory
  const beat9 = registry.createBeat('introText', {
    id: 'beat_mall_scene',
    name: 'At the Mall',
    type: 'introText',
    x: 700,
    y: 300,
    parameters: {
      text: `You text Grandma that you'll visit tomorrow and head to the mall.

Madison waves you over to their table at the food court. Jake is there, along with Emma and Tyler - the core of the popular group.

"Finally! We thought you ghosted us," Madison says with a smile that doesn't quite reach her eyes.`,
      buttonText: 'Join them'
    }
  });
  beat9.addConnection({ targetId: 'beat_mall_drama', label: 'Continue' });

  const beat10 = registry.createBeat('dialogTree', {
    id: 'beat_mall_drama',
    name: 'Mall Drama',
    type: 'dialogTree',
    x: 900,
    y: 300,
    parameters: {
      speaker: 'Madison',
      dialogTree: {
        id: 'root',
        text: 'So, did you see what Sarah posted? She\'s trying SO hard. It\'s embarrassing.',
        emotion: 'smug',
        choices: [
          {
            id: 'join_in',
            text: 'Laugh along with them',
            target: 'mall_join_mockery'
          },
          {
            id: 'defend',
            text: 'Actually, I think Sarah is cool',
            target: 'mall_defend'
          },
          {
            id: 'change_subject',
            text: 'Change the subject',
            target: 'mall_avoid'
          }
        ]
      },
      choiceDelay: 2
    }
  });

  const beat11a = registry.createBeat('introText', {
    id: 'mall_join_mockery',
    name: 'Hollow Victory',
    type: 'introText',
    x: 1100,
    y: 250,
    parameters: {
      text: `You laugh along. Madison gives you an approving nod.

For the next hour, you sit with them, laughing at their jokes, agreeing with everything they say. They let you be in their stories. You're finally "in."

But as you walk home alone, you feel... empty. Like you left something important behind.

Your phone buzzes. It's your grandma: "Hope you're having fun, sweetheart. Love you ❤️"

The cookies are still in your bag, crushed.`,
      buttonText: 'Go home'
    }
  });
  beat11a.addConnection({ targetId: 'beat_end_shallow', label: 'Finish' });

  const beat11b = registry.createBeat('introText', {
    id: 'mall_defend',
    name: 'Stand Your Ground',
    type: 'introText',
    x: 1100,
    y: 350,
    parameters: {
      text: `The table goes quiet. Madison's smile freezes.

"Oh my god, are you serious right now?" she says.

Jake looks uncomfortable. Emma and Tyler exchange glances. You just committed social suicide.

"Whatever. We're going to Sephora. You coming or not?"

You realize: you don't want to go. You don't want to be here at all.`,
      buttonText: 'Make a choice'
    }
  });
  beat11b.addConnection({ targetId: 'beat_leave_mall', label: 'Continue' });

  // COMPROMISE PATH - Worst of both worlds
  const beat12 = registry.createBeat('introText', {
    id: 'beat_rush_visit',
    name: 'Rushed Visit',
    type: 'introText',
    x: 700,
    y: 500,
    parameters: {
      text: `You race to Grandma's house, planning to stay just 20 minutes.

She opens the door with a bright smile that fades when she sees you checking your phone.

"Riley, sweetheart, is everything okay? You seem distracted."

You hand her the cookies while texting Madison that you'll be there soon.`,
      buttonText: 'Continue'
    }
  });
  beat12.addConnection({ targetId: 'beat_grandma_hurt', label: 'Continue' });

  const beat13 = registry.createBeat('dialogTree', {
    id: 'beat_grandma_hurt',
    name: 'Grandma\'s Disappointment',
    type: 'dialogTree',
    x: 900,
    y: 500,
    parameters: {
      speaker: 'Grandma',
      dialogTree: {
        id: 'root',
        text: 'You don\'t have to stay if you don\'t want to, dear. I know you have your own life now.',
        emotion: 'sad',
        choices: [
          {
            id: 'stay',
            text: 'Put phone away and stay',
            target: 'choose_grandma_late'
          },
          {
            id: 'leave',
            text: 'Kiss her goodbye and leave',
            target: 'choose_friends_late'
          }
        ]
      },
      choiceDelay: 1.5
    }
  });

  // Reflection and endings
  const beat14 = registry.createBeat('introText', {
    id: 'beat_reflection',
    name: 'Reflection',
    type: 'introText',
    x: 1700,
    y: 150,
    parameters: {
      text: `You spend the afternoon with Grandma, listening to her stories, learning her secret cookie recipe, just... being yourself.

No performance. No anxiety about what to post or how to look. Just you and someone who loves you unconditionally.

When you leave, she hugs you tight. "You're going to be just fine, Riley. Trust yourself."

Walking home, you finally understand what she means.`,
      buttonText: 'Continue'
    }
  });
  beat14.addConnection({ targetId: 'beat_end_good', label: 'Finish' });

  // Multiple endings
  const beat15a = registry.createBeat('endScreen', {
    id: 'beat_end_good',
    name: 'True Self Ending',
    type: 'endScreen',
    x: 1900,
    y: 100,
    parameters: {
      message: `ENDING: Finding Your Path

You chose authenticity over approval. Monday at school might be awkward, but you know who you are now.

Sometimes the scariest path - being yourself - is the one that leads somewhere real.

Your grandma was right. The people worth knowing will find you.`,
      restartButtonText: 'Try Another Path'
    }
  });

  const beat15b = registry.createBeat('endScreen', {
    id: 'beat_end_shallow',
    name: 'Shallow Victory Ending',
    type: 'endScreen',
    x: 1900,
    y: 300,
    parameters: {
      message: `ENDING: The Hollow Crown

You got what you wanted - acceptance from the popular crowd. But at what cost?

You missed meaningful connection with your grandma. You laughed at someone else's expense. You shaped yourself into what others wanted.

The crown you wear feels heavier than it looks.

Maybe there's another way...`,
      restartButtonText: 'Try Another Path'
    }
  });

  const beat15c = registry.createBeat('endScreen', {
    id: 'beat_end_divided',
    name: 'Divided Ending',
    type: 'endScreen',
    x: 1900,
    y: 500,
    parameters: {
      message: `ENDING: Split in Two

You tried to please everyone and ended up pleasing no one - including yourself.

Your grandma felt rushed. Your friends felt like an afterthought. You felt exhausted.

Sometimes you can't have it all. Sometimes you have to choose what matters.

What will you choose next time?`,
      restartButtonText: 'Try Another Path'
    }
  });

  // Additional paths for completeness
  const beat16 = registry.createBeat('introText', {
    id: 'beat_leave_mall',
    name: 'Walking Away',
    type: 'introText',
    x: 1300,
    y: 350,
    parameters: {
      text: `"I think I'm going to head out actually."

Madison's face hardens. "Seriously? Whatever. Don't bother texting us later."

You walk out of the mall alone. Your heart is pounding. Did you just throw away your entire social life?

But then you remember the cookies in your bag. Grandma.

You pull out your phone and text her: "On my way. Can I still visit?"

Her reply is instant: "My door is always open, sweetheart ❤️"`,
      buttonText: 'Go to Grandma\'s'
    }
  });
  beat16.addConnection({ targetId: 'beat_grandma_door', label: 'Continue' });

  const beat17a = registry.createBeat('introText', {
    id: 'choose_grandma_late',
    name: 'Better Late Than Never',
    type: 'introText',
    x: 1100,
    y: 450,
    parameters: {
      text: `You silence your phone and put it in your pocket.

"Actually, Grandma, I'd love to stay. I'm sorry I was being distracted."

Her face lights up. "Really? Oh, that makes me so happy!"

The mall can wait. This matters more.`,
      buttonText: 'Spend time together'
    }
  });
  beat17a.addConnection({ targetId: 'beat_reflection', label: 'Continue' });

  const beat17b = registry.createBeat('introText', {
    id: 'choose_friends_late',
    name: 'Missing Out',
    type: 'introText',
    x: 1100,
    y: 550,
    parameters: {
      text: `You kiss Grandma on the cheek and rush out.

By the time you get to the mall, everyone's already leaving. Madison barely looks at you.

"Where were you? We're done here."

You spent the whole afternoon rushing between places and ended up nowhere that mattered.

Grandma's disappointed. Your friends are annoyed. You feel terrible.`,
      buttonText: 'Go home'
    }
  });
  beat17b.addConnection({ targetId: 'beat_end_divided', label: 'Finish' });

  // Add all beats to story
  const allBeats = [
    beat1, beat2, beat3, beat4, beat5, beat6a, beat6b, beat6c,
    beat7, beat8a, beat9, beat10, beat11a, beat11b, beat12, beat13,
    beat14, beat15a, beat15b, beat15c, beat16, beat17a, beat17b
  ];

  allBeats.forEach(beat => story.addBeat(beat));

  return story;
}

// Export the story data for import into builder
export function exportStoryForBuilder() {
  const story = createRedRidingHoodStory();
  const beats = Array.from((story as any).beats.values());

  return {
    metadata: {
      title: 'RED: A Modern Tale',
      author: 'ASAPS Builder',
      description: 'A modern retelling of Little Red Riding Hood about a teenage girl finding her authentic self',
      genre: 'Coming of Age',
      created: new Date().toISOString()
    },
    beats: beats.map(beat => beat.toJSON()),
    settings: {},
    environment: { props: [], nodes: [] },
    characters: [],
    clusters: []
  };
}

console.log('Story created! Beat count:', Object.keys(exportStoryForBuilder().beats).length);
console.log(JSON.stringify(exportStoryForBuilder(), null, 2));
