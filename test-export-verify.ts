import { MovementChoiceBeat } from './packages/core/src/beats/MovementChoiceBeat';
import { Story } from './packages/core/src/engine/Story';
import { ASMLGenerator } from './packages/core/src/xml/ASMLGenerator';

console.log('Testing ASML export with choiceDelay...\n');

const beat = new MovementChoiceBeat({
  id: 'test',
  name: 'Test',
  question: 'Where?',
  choiceDelay: 2.0,
  choices: [{id: 'a', text: 'A', location: 'loc', target: 'next', conditions: [], effects: []}]
});

const story = new Story();
story.addBeat(beat);

const gen = new ASMLGenerator();
const xml = gen.generate(story);

console.log('Generated XML (relevant section):\n');
const lines = xml.split('\n');
const start = lines.findIndex(l => l.includes('kind="movementChoice"'));
console.log(lines.slice(start, start + 10).join('\n'));

console.log('\n--- Check Results ---');
console.log('XML length:', xml.length);
console.log('Contains "<delay":', xml.includes('<delay'));
console.log('Contains "choiceDelay":', xml.includes('choiceDelay'));
console.log('\nFull beat parameters:', JSON.stringify(beat.getParameters(), null, 2));
