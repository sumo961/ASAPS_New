import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '@asaps/core';
import { scriptFields } from '../scriptFields';
import { exportScriptMarkdown, importScriptMarkdown } from '../scriptMarkdown';

const registry = BeatTypeRegistry.getInstance();
const make = (id: string, name: string, type: string, parameters: Record<string, any>) =>
  registry.createBeat(type, { id, name, type, parameters } as any) as any;

const story = () => [
  make('intro', 'Introduction', 'infoText', { text: 'Rain.\n\n# Not a heading\n**Note:** not a label\n> not a quote\n\\backslash' }),
  make('choice', 'Choose', 'multiChoice', { question: 'Now?', choices: [{ id: 'a', text: 'Run', target: 'x' }, { id: 'b', text: 'Hide', target: 'y' }] }),
  make('talk', 'Talk', 'dialogTree', { dialogTree: {
    id: 'r', speaker: 'Ann', text: 'Tea or coffee?\nOr water?',
    choices: [
      { id: 't', text: 'Tea', dialogNode: { id: 'n', speaker: 'Ann', text: 'Good.', choices: [{ id: 'x', text: 'Thanks' }] } },
      { id: 'c', text: 'Coffee' },
    ],
  } }),
];
const rows = (beats: any[]) => beats.map((beat) => ({ beat, fields: scriptFields(beat) }));

describe('script Markdown', () => {
  it('reads back what it wrote without changes, tricky lines included', () => {
    const beats = story();
    const md = exportScriptMarkdown(rows(beats), 'Rainy Day');
    const back = importScriptMarkdown(md, beats);
    expect(back).toMatchObject({ changes: [], unknown: [], mismatched: [], matched: 3 });
  });

  it('writes readable Markdown: headings with hidden ids, labels, branches as quotes', () => {
    const md = exportScriptMarkdown(rows(story()), 'Rainy Day');
    expect(md).toContain('# Rainy Day\n\n## Introduction\n<!-- asaps:intro -->\n\nRain.\n\n\\# Not a heading');
    expect(md).toContain('**Question:** Now?\n\n**Choice 1:** Run');
    expect(md).toContain('**Ann:** Tea or coffee?\nOr water?\n\n> **Reply:** Tea\n>\n> **Ann:** Good.');
  });

  it('finds the edits, by id or by a unique name', () => {
    const beats = story();
    let md = exportScriptMarkdown(rows(beats));
    md = md.replace('**Choice 2:** Hide', '**Choice 2:** Hide under the table')
      .replace('> **Ann:** Good.', '> **Ann:** Good choice.\n>\n> She smiles.')
      .replace('<!-- asaps:intro -->\n', '')
      .replace('Rain.', 'Heavy rain.');
    const back = importScriptMarkdown(md, beats);
    expect(back.mismatched).toEqual([]);
    expect(back.changes.map((c) => [c.beatId, c.path, c.after])).toEqual([
      ['intro', 'text', expect.stringMatching(/^Heavy rain\./)],
      ['choice', 'choices[1].text', 'Hide under the table'],
      ['talk', 'dialogTree.choices[0].dialogNode.text', 'Good choice.\n\nShe smiles.'],
    ]);
  });

  it('leaves alone a beat whose lines no longer match, and names headings it does not know', () => {
    const beats = story();
    const md = exportScriptMarkdown(rows(beats))
      .replace('**Choice 2:** Hide', '**Option B:** Hide')
      + '\n## A beat that is not in the project\n\nHello\n';
    const back = importScriptMarkdown(md, beats);
    expect(back.mismatched).toEqual(['Choose']);
    expect(back.unknown).toEqual(['A beat that is not in the project']);
    expect(back.changes).toEqual([]);
  });
});
