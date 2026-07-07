#!/usr/bin/env node
/**
 * One-off: convert the 11 Sinhala-only fields in the Sri Lanka project into the
 * uniform "English\n\nSinhala" inline form, so splitInlineTranslation.mjs can
 * split them like every other field. 10 fields get a machine (Claude)
 * translation; beat_39 already carried English (Sinhala-first) and is just
 * reordered. Writes a patched project.json; original input is untouched.
 *
 * Usage: node scripts/patchSinhalaOnlyFields.mjs <input project.json> <output project.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , inPath, outPath] = process.argv;

// key -> English (machine-translated). beat_39 is handled by reordering, not here.
const MT = {
  'beat:beat_10.parameters.text':
    "Right. Let's get started then...",
  'beat:beat_12.parameters.dialogTree.choices.1.dialogNode.text':
    "You spend a little while googling to figure out what might be going on. Thinking like a teenager isn't all that easy. There could be a lot of issues — about friends, about romantic relationships, the tension of being at school, worries about the future, all sorts of things. A little uneasy, you set the phone aside. You feel you'll need to look into it a bit more going forward.",
  'beat:beat_20.parameters.text':
    "After that last deep conversation you had, you carry on with your routine as usual anyway. You go to work, help ${childName} get to school, sometimes ask what's new at school, but you never really find the time for a longer talk.",
  'beat:beat_34.parameters.dialogTree.choices.0.dialogNode.text':
    "Your child looks at you, gives a faint smile, takes a biscuit that was lying there and eats it.",
  'beat:beat_40.parameters.dialogTree.choices.0.dialogNode.text':
    "Together, you have a long talk about standing up for your beliefs as a group. You tell them that pushing their classmate wasn't a good thing to do. But you end the conversation by lovingly hugging them and telling them you understand why they did it.",
  'beat:beat_46.parameters.dialogTree.choices.0.dialogNode.text':
    "Even though you try to comfort them, it doesn't work. Because you realise this whole mess happened since you scolded them, you give them time to calm down and wait.",
  'beat:beat_6.parameters.dialogTree.choices.0.text':
    "Someone who mostly prefers to stay quiet and likes to do things on their own.",
  'beat:beat_6.parameters.dialogTree.choices.1.text':
    "Someone very curious, who talks openly about other things in their life.",
  'beat:beat_6.parameters.dialogTree.choices.2.text':
    "Someone sociable, who loves being together with friends.",
  'beat:beat_64.parameters.prompt':
    "What is your child's name?",
};

const wrapper = JSON.parse(readFileSync(inPath, 'utf8'));
const beats = Object.fromEntries(wrapper.project.story.beats.map((b) => [b.id, b]));

function ref(key) {
  const [head, rest] = key.split('.parameters.');
  const bid = head.split(':')[1];
  const parts = rest.split('.');
  let obj = beats[bid].parameters;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    obj = /^\d+$/.test(p) ? obj[Number(p)] : obj[p];
  }
  const last = parts[parts.length - 1];
  return { obj, key: /^\d+$/.test(last) ? Number(last) : last };
}

// 10 MT fields: English + \n\n + original Sinhala
for (const [k, en] of Object.entries(MT)) {
  const { obj, key } = ref(k);
  obj[key] = `${en}\n\n${obj[key]}`;
}

// beat_39: already "Sinhala  \n\n English" — reorder to "English\n\nSinhala".
{
  const { obj, key } = ref('beat:beat_39.parameters.dialogTree.text');
  const val = obj[key];
  const idx = val.indexOf('\n\n');
  if (idx !== -1) {
    const sinhala = val.slice(0, idx).trim();
    const english = val.slice(idx + 2).trim();
    obj[key] = `${english}\n\n${sinhala}`;
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(wrapper, null, 2));
console.log(`Patched ${Object.keys(MT).length} MT fields + beat_39 reorder -> ${outPath}`);
