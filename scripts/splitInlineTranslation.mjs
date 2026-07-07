#!/usr/bin/env node
/**
 * Split inline bilingual (English + appended Sinhala) text fields in an ASAPS
 * project into: English in the source fields + a proper `si` translation
 * resource. Non-destructive — reads an input project.json and writes a NEW
 * directory of files (project.json + translations/) that `projectZipManager`
 * can re-zip into a .asaps.zip.
 *
 * Translation KEYS mirror packages/builder/src/export/StoryTranslator.ts exactly
 * (`beat:{id}.parameters.…`, dialogTree walk into `.choices.{i}.text` /
 * `.dialogNode`), so the app binds the Sinhala to the right fields.
 *
 * Usage: node scripts/splitInlineTranslation.mjs <input project.json> <output dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , inPath, outDir] = process.argv;
if (!inPath || !outDir) {
  console.error('Usage: node splitInlineTranslation.mjs <input project.json> <output dir>');
  process.exit(1);
}

const SINHALA = /[඀-෿]/;

/** Split an inline "English … Sinhala" blob at the first Sinhala codepoint. */
function splitBilingual(text) {
  const m = SINHALA.exec(text);
  if (!m) return { en: text, si: null, kind: 'english-only' };
  const en = text.slice(0, m.index).trim();
  const si = text.slice(m.index).trim();
  if (!en) return { en: text, si: null, kind: 'sinhala-only' }; // no English to extract; leave as authored
  return { en, si, kind: 'bilingual' };
}

// djb2 — identical to core/src/translation/sync.ts computeSourceHash.
function computeSourceHash(sourceStrings) {
  const sorted = Object.keys(sourceStrings).sort();
  const content = sorted.map((k) => `${k}=${sourceStrings[k]}`).join('\n');
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

const wrapper = JSON.parse(readFileSync(inPath, 'utf8'));
const project = wrapper.project ?? wrapper;
const story = project.story;

const siStrings = {};        // key -> { value, status }
const sourceSnapshot = {};   // key -> english source (for staleness)
const allSource = {};        // key -> english source (all translatable, for sourceHash)
const flagged = [];          // sinhala-only keys (no English extracted)
const stats = { bilingual: 0, 'sinhala-only': 0, 'english-only': 0 };

/** Read obj[prop], split, write English back, record Sinhala under `key`. */
function handleField(obj, prop, key) {
  const val = obj[prop];
  if (typeof val !== 'string' || !val.trim()) return;
  const r = splitBilingual(val);
  stats[r.kind]++;
  obj[prop] = r.en;              // English (or unchanged for english/sinhala-only) into source
  allSource[key] = r.en;
  if (r.si) {
    siStrings[key] = { value: r.si, status: 'translated' };
    sourceSnapshot[key] = r.en;
  } else if (r.kind === 'sinhala-only') {
    flagged.push(key);
  }
}

const COMMON = ['text', 'buttonText', 'prompt', 'question', 'message', 'title', 'author'];

function processBeat(beat) {
  const prefix = `beat:${beat.id}`;
  const params = beat.parameters || beat;
  const type = beat.type || '';
  const isAi = type.startsWith('ai');

  if (beat.speaker && typeof beat.speaker === 'string' && type !== 'dialogTree') {
    handleField(beat, 'speaker', `${prefix}.speaker`);
  }
  for (const field of COMMON) {
    if (field === 'prompt' && isAi) continue;
    handleField(params, field, `${prefix}.parameters.${field}`);
  }
  if (Array.isArray(params.textVariations)) {
    params.textVariations.forEach((_, j) =>
      handleField(params.textVariations, j, `${prefix}.parameters.textVariations.${j}`)
    );
  }

  if (type === 'dialogTree' && params.dialogTree) {
    const walk = (node, path) => {
      if (!node) return;
      if (node.speaker) handleField(node, 'speaker', `${path}.speaker`);
      if (node.text) handleField(node, 'text', `${path}.text`);
      if (Array.isArray(node.choices)) {
        node.choices.forEach((choice, i) => {
          if (choice.text) handleField(choice, 'text', `${path}.choices.${i}.text`);
          if (choice.dialogNode) walk(choice.dialogNode, `${path}.choices.${i}.dialogNode`);
        });
      }
    };
    walk(params.dialogTree, `${prefix}.parameters.dialogTree`);
  }

  // End-screen / credits family.
  for (const f of ['restartText', 'creditsText', 'creditsPageTitle', 'creditsPageBody', 'creditsCloseText', 'placeholder', 'clearButtonText']) {
    if (params[f]) handleField(params, f, `${prefix}.parameters.${f}`);
  }
}

for (const beat of story.beats || []) processBeat(beat);

const now = new Date(wrapper.metadata?.exportedAt || project.modifiedAt || '2026-06-23T00:00:00.000Z').toISOString();

const siResource = {
  languageCode: 'si',
  languageName: 'Sinhala',
  origin: 'human',
  direction: 'ltr',
  requiredFonts: [],
  sourceHash: computeSourceHash(allSource),
  createdAt: now,
  modifiedAt: now,
  strings: siStrings,
  _sourceSnapshot: sourceSnapshot,
};

const translatedCount = Object.values(siStrings).filter((e) => e.status === 'translated').length;
const totalCount = Object.values(siStrings).length;
const manifest = {
  sourceLanguage: 'en',
  languages: [
    {
      languageCode: 'si',
      languageName: 'Sinhala',
      origin: 'human',
      direction: 'ltr',
      translatedCount,
      totalCount,
      completeness: totalCount > 0 ? Math.round((translatedCount / totalCount) * 100) : 0,
      hasStaleStrings: false,
      filename: 'si.strings.json',
    },
  ],
  modifiedAt: now,
};

// Register source language so the selector shows en + si.
project.globalSettings = project.globalSettings || {};
project.globalSettings.translation = { sourceLanguage: 'en' };

mkdirSync(join(outDir, 'translations'), { recursive: true });
writeFileSync(join(outDir, 'project.json'), JSON.stringify(wrapper, null, 2));
writeFileSync(join(outDir, 'translations', 'si.strings.json'), JSON.stringify(siResource, null, 2));
writeFileSync(join(outDir, 'translations', '_manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Split complete:');
console.log('  field outcomes:', stats);
console.log('  si translation entries:', totalCount);
console.log('  sourceHash:', siResource.sourceHash);
console.log(`  flagged (Sinhala-only, no English extracted): ${flagged.length}`);
for (const k of flagged) console.log('    -', k);
