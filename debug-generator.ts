import { MovementChoiceBeat } from './packages/core/src/beats/MovementChoiceBeat';
import { Story } from './packages/core/src/engine/Story';
import { ASMLGenerator } from './packages/core/src/xml/ASMLGenerator';

// Monkey-patch the ASMLGenerator to add debug logging
const originalGenerateBeat = ASMLGenerator.prototype.generateBeat;
ASMLGenerator.prototype.generateBeat = function(beat: any, lines: string[]) {
  console.log('\n=== DEBUG generateBeat ===');
  console.log('Beat type:', beat.type);

  const beatData = beat.toJSON();
  const params = beatData.parameters || {};
  console.log('params.choiceDelay:', params.choiceDelay);
  console.log('params.choiceDelay > 0:', params.choiceDelay && params.choiceDelay > 0);

  const connections = beat.getConnections();
  const hasConnections = connections.length > 0;
  const hasComplexContent = params.dialogTree?.choices || params.choices || params.props || params.condition;
  const needsClosingTag = hasConnections || hasComplexContent;

  console.log('hasConnections:', hasConnections);
  console.log('hasComplexContent:', hasComplexContent);
  console.log('needsClosingTag:', needsClosingTag);

  // Monkey-patch the switch statement to add logging
  const originalSwitch = (type: string, params: any, lines: string[], indent: string) => {
    console.log('=== DEBUG switch statement ===');
    console.log('type:', type);
    console.log('params.choiceDelay:', params.choiceDelay);

    switch (type) {
      case 'movementChoice':
      case 'pickProp':
      case 'dialogTree':
        console.log('Inside movementChoice/pickProp/dialogTree case');
        if (params.choiceDelay && params.choiceDelay > 0) {
          console.log('Adding delay element with value:', params.choiceDelay);
          lines.push(`${indent}  <delay val="${params.choiceDelay}" />`);
        } else {
          console.log('NOT adding delay element');
        }
        break;
    }
  };

  // Call the patched switch logic
  originalSwitch(beat.type, params, lines, `${this.indent}${this.indent}`);

  // Call original
  return originalGenerateBeat.call(this, beat, lines);
};

console.log('Testing with debug logging...\n');

const beat = new MovementChoiceBeat({
  id: 'test',
  name: 'Test',
  type: 'movementChoice',
  question: 'Where?',
  choiceDelay: 2.0,
  choices: [{id: 'a', text: 'A', location: 'loc', target: 'next', conditions: [], effects: []}]
});

const story = new Story();
story.addBeat(beat);

const gen = new ASMLGenerator();
const xml = gen.generate(story);

console.log('\n\n=== FINAL XML ===');
console.log(xml);
