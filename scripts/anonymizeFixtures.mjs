#!/usr/bin/env node
/**
 * Anonymize a KG test fixture: replace narrative TEXT with a placeholder while
 * keeping all structure intact — ids, beat types, connections, choices, effects,
 * conditions, counter/character/variable names. The systemic-graph builder is
 * content-agnostic, so scrubbed fixtures exercise identical code paths and keep
 * the "structurally identical" property, without shipping study content.
 *
 * Usage: node scripts/anonymizeFixtures.mjs <fixture.json> [<fixture2.json> ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';

// Narrative-text keys to scrub (NOT ids, names, types, labels, conditions).
const SCRUB_KEYS = new Set([
  'text', 'displayText', 'prompt', 'question', 'message', 'buttonText',
  'title', 'author', 'restartText', 'creditsText', 'creditsPageTitle',
  'creditsPageBody', 'creditsCloseText', 'placeholder', 'clearButtonText',
]);
const PLACEHOLDER = 'Placeholder text.';

function scrub(node) {
  if (Array.isArray(node)) return node.forEach(scrub);
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (SCRUB_KEYS.has(k) && typeof v === 'string' && v.trim()) node[k] = PLACEHOLDER;
      else scrub(v);
    }
  }
}

for (const path of process.argv.slice(2)) {
  const wrapper = JSON.parse(readFileSync(path, 'utf8'));
  const project = wrapper.project ?? wrapper;

  scrub(project.story?.beats ?? []); // beat narrative text only
  scrub(project.story?.metadata ?? {}); // story-level title/author metadata

  // Story/project-level identifiers → generic.
  if (project.story) {
    if (project.story.title) project.story.title = 'Anonymized Story';
    if (project.story.author) project.story.author = 'Anonymous';
  }
  if (project.name) project.name = 'Anonymized Project';
  if (wrapper.metadata?.projectName) wrapper.metadata.projectName = 'Anonymized Project';

  writeFileSync(path, JSON.stringify(wrapper, null, 2));
  console.log('anonymized', path);
}
