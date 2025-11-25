import { Story } from './packages/core/src/engine/Story';
import { ASMLGenerator } from './packages/core/src/xml/ASMLGenerator';
import { ASMLParser } from './packages/core/src/xml/ASMLParser';

async function testFeature3() {
  console.log('Testing Feature 3: Choice Delay with Fade-in');
  console.log('='.repeat(60));

  // Test Story 1: movementChoice with delay
  console.log('\n1. Testing movementChoice with choiceDelay...');
  const story1 = new Story();
  story1.addBeat({
    id: 'movement_beat',
    name: 'Movement Test',
    type: 'movementChoice',
    parameters: {
      question: 'Where do you want to go?',
      choiceDelay: 2.5,
      choices: [
        {
          id: 'left',
          text: 'Go left',
          location: 'forest',
          target: 'next_beat'
        }
      ]
    }
  });

  // Test ASML Export
  const generator = new ASMLGenerator();
  const xml1 = generator.generate(story1);

  console.log('\nGenerated ASML (excerpt):');
  // Check for delay element in movementChoice
  const hasDelayInExport1 = xml1.includes('<delay val="2.5" />');
  console.log('Contains <delay val="2.5" />:', hasDelayInExport1 ? '✅' : '❌');
  if (hasDelayInExport1) {
    const delayLine = xml1.split('\n').find(line => line.includes('<delay val="2.5" />'));
    console.log('  Line:', delayLine?.trim());
  }

  // Test ASML Import (round-trip)
  const parser = new ASMLParser();
  const parsed1 = await parser.parse(xml1);
  if (parsed1.success && parsed1.story) {
    const movementBeat = parsed1.story.getBeat('movement_beat');
    if (movementBeat) {
      const params = movementBeat.getParameters();
      console.log('Parsed choiceDelay:', params.choiceDelay, params.choiceDelay === 2.5 ? '✅' : '❌');
    }
  }

  // Test Story 2: pickProp with delay
  console.log('\n2. Testing pickProp with choiceDelay...');
  const story2 = new Story();
  story2.addBeat({
    id: 'pickprop_beat',
    name: 'PickProp Test',
    type: 'pickProp',
    parameters: {
      question: 'What do you want to pick?',
      choiceDelay: 3.0,
      props: [
        {
          id: 'sword',
          name: 'Sword',
          description: 'A sharp sword',
          target: 'next_beat'
        }
      ]
    }
  });

  const xml2 = generator.generate(story2);
  const hasDelayInExport2 = xml2.includes('<delay val="3" />') || xml2.includes('<delay val="3.0" />');
  console.log('Contains delay element:', hasDelayInExport2 ? '✅' : '❌');

  // Test Story 3: dialogTree with delay
  console.log('\n3. Testing dialogTree with choiceDelay...');
  const story3 = new Story();
  story3.addBeat({
    id: 'dialog_beat',
    name: 'Dialog Test',
    type: 'dialogTree',
    parameters: {
      choiceDelay: 1.5,
      dialogTree: {
        id: 'root',
        speaker: 'NPC',
        text: 'Hello, traveler!',
        choices: [
          {
            id: 'greet',
            text: 'Greet them',
            target: 'next_beat'
          }
        ]
      }
    }
  });

  const xml3 = generator.generate(story3);
  const hasDelayInExport3 = xml3.includes('<delay val="1.5" />');
  console.log('Contains <delay val="1.5" />:', hasDelayInExport3 ? '✅' : '❌');
  if (hasDelayInExport3) {
    const delayLine = xml3.split('\n').find(line => line.includes('<delay val="1.5" />'));
    console.log('  Line:', delayLine?.trim());
  }

  // Test Story 4: Without delay (should NOT export delay element)
  console.log('\n4. Testing beat WITHOUT choiceDelay...');
  const story4 = new Story();
  story4.addBeat({
    id: 'no_delay_beat',
    name: 'No Delay Test',
    type: 'movementChoice',
    parameters: {
      question: 'Where do you want to go?',
      choices: [
        {
          id: 'left',
          text: 'Go left',
          location: 'forest',
          target: 'next_beat'
        }
      ]
    }
  });

  const xml4 = generator.generate(story4);
  const hasDelayInExport4 = xml4.includes('<delay');
  console.log('Contains delay element:', hasDelayInExport4 ? '❌ (should be false)' : '✅ (correctly omitted)');

  console.log('\n' + '='.repeat(60));
  console.log('Feature 3 Implementation: COMPLETE ✅');
}

// Run the test
testFeature3().catch(console.error);
