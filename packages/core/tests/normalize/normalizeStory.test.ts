/**
 * Tests for the orchestrator that ties beat-normalize, character-normalize,
 * cluster auto-create, and validate together.
 *
 * These reproduce the v0.9.50 patch scenarios end-to-end so the patches
 * can eventually be deleted.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeStory,
  buildRefIndex,
  buildClustersFromBeats,
  normalizeCharacter,
} from '../../src/normalize/normalizeStory';
import type { BeatSchema } from '../../src/normalize/types';

const schemaPath = resolve(__dirname, '../../../../beat-definitions/core-beats.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as BeatSchema;

describe('normalizeCharacter — editor-only field backfill', () => {
  it('backfills missing visual / states / defaultState / timestamps', () => {
    const raw = { id: 'mara', name: 'Mara', goals: [{ id: 'g1' }] };
    const { character, changed } = normalizeCharacter(raw);
    expect(changed).toBe(true);
    expect(character.visual).toEqual({ type: 'static' });
    expect(character.states).toEqual([
      { id: 'default', name: 'default', displayName: 'Default', visual: {} },
    ]);
    expect(character.defaultState).toBe('default');
    expect(character.counters).toEqual([]);
    expect(character.inventory).toEqual([]);
    expect(character.tags).toEqual([]);
    expect(character.traits).toEqual([]);
    expect(character.goals).toEqual([{ id: 'g1' }]);
    expect(typeof character.createdAt).toBe('string');
    expect(typeof character.updatedAt).toBe('string');
  });

  it('does not change a fully-formed character', () => {
    const raw = {
      id: 'alex',
      name: 'Alex',
      visual: { type: 'animated' },
      states: [{ id: 's1' }],
      defaultState: 's1',
      counters: [{ id: 'c1' }],
      inventory: [],
      tags: ['x'],
      traits: [],
      goals: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-02-02',
    };
    const { changed } = normalizeCharacter(raw);
    expect(changed).toBe(false);
  });
});

describe('buildClustersFromBeats — auto-create from per-beat strings', () => {
  it('groups beats by cluster name and computes a bbox per group', () => {
    const beats = [
      { id: 'b1', type: 'infoText', cluster: 'Act I', position: { x: 0, y: 0 } },
      { id: 'b2', type: 'infoText', cluster: 'Act I', position: { x: 400, y: 100 } },
      { id: 'b3', type: 'infoText', cluster: 'Act II', position: { x: 1200, y: 0 } },
    ];
    const clusters = buildClustersFromBeats(beats);
    expect(clusters.length).toBe(2);
    const actI = clusters.find(c => c.id === 'Act I');
    expect(actI).toBeDefined();
    expect(actI?.containerPosition.x).toBeLessThan(0); // padding subtracted
    expect(actI?.isExpanded).toBe(true);
    expect(actI?.type).toBe('organizational');
  });

  it('skips beats without a cluster string', () => {
    const beats = [
      { id: 'b1', type: 'infoText', position: { x: 0, y: 0 } },
      { id: 'b2', type: 'infoText', cluster: '', position: { x: 0, y: 0 } },
    ];
    expect(buildClustersFromBeats(beats)).toEqual([]);
  });

  it('reads x/y from top-level when position is absent', () => {
    const beats = [
      { id: 'b1', type: 'infoText', cluster: 'X', x: 100, y: 200 },
    ];
    const clusters = buildClustersFromBeats(beats);
    expect(clusters.length).toBe(1);
  });
});

describe('buildRefIndex', () => {
  it('collects characters / beats / clusters / assets from a story', () => {
    const story = {
      characters: [{ id: 'mara' }, { id: 'alex' }],
      beats: [
        { id: 'b1', cluster: 'Act I' },
        { id: 'b2', cluster: 'Act II' },
      ],
      clusters: [{ id: 'Prologue', name: 'Prologue' }],
      assets: [{ id: 'a1' }, { id: 'a2' }],
    };
    const ref = buildRefIndex(story);
    expect(ref.characterIds.has('mara')).toBe(true);
    expect(ref.beatIds.has('b1')).toBe(true);
    expect(ref.clusterNames.has('Act I')).toBe(true);
    expect(ref.clusterNames.has('Prologue')).toBe(true);
    expect(ref.assetIds.has('a1')).toBe(true);
  });
});

describe('normalizeStory — end-to-end on a v0.9.50-patch-shaped story', () => {
  it('flattens conditions, coerces quantity, normalizes characters, auto-creates clusters', () => {
    const raw = {
      metadata: { title: 'Smoke', author: 'AI' },
      characters: [
        { id: 'mara', name: 'Mara' }, // missing visual/states/timestamps
        { id: 'alex', name: 'Alex', goals: [] },
      ],
      beats: [
        {
          id: 'b1',
          type: 'infoText',
          cluster: 'Act I',
          position: { x: 0, y: 0 },
          parameters: { text: 'Hi', connection: { target: 'b2' } },
        },
        {
          id: 'b2',
          type: 'addRemoveInventory',
          cluster: 'Act I',
          position: { x: 400, y: 0 },
          parameters: {
            action: 'add',
            item: 'Card',
            character: 'player',
            quantity: 1, // numeric, schema wants string
            connection: { target: 'b3' },
          },
        },
        {
          id: 'b3',
          type: 'conditionBeat',
          cluster: 'Act II',
          position: { x: 800, y: 0 },
          parameters: {
            condition: {
              type: 'sentiment',
              character: 'mara',
              sentimentTarget: 'player',
              sentimentEmotion: 'trust',
              operator: '>=',
              value: 0.2,
              baseline: 'initial',
            },
            trueConnection: { target: 'b4' },
            falseConnection: { target: 'b5' },
          },
        },
      ],
    };

    const result = normalizeStory(raw, schema);

    // Characters: visual filled in
    expect(result.story.characters[0].visual).toBeDefined();
    expect(result.report.charactersNormalized).toBe(2);

    // Beats: condition flattened
    const b3 = result.story.beats.find((b: any) => b.id === 'b3');
    expect(b3.parameters.conditionType).toBe('sentiment');
    expect(b3.parameters.sentimentTarget).toBe('player');
    expect(b3.parameters.baseline).toBe('initial');
    expect(b3.parameters.condition).toBeUndefined();

    // Beats: quantity coerced
    const b2 = result.story.beats.find((b: any) => b.id === 'b2');
    expect(b2.parameters.quantity).toBe('1');

    // Clusters auto-created (Act I + Act II)
    expect(result.story.clusters.length).toBe(2);
    expect(result.report.clustersCreated.sort()).toEqual(['Act I', 'Act II']);

    // No errors
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('does not duplicate clusters that the AI already declared explicitly', () => {
    const raw = {
      clusters: [{ id: 'Act I', name: 'Act I' }],
      beats: [
        { id: 'b1', type: 'infoText', cluster: 'Act I', position: { x: 0, y: 0 }, parameters: {} },
      ],
    };
    const result = normalizeStory(raw, schema);
    expect(result.story.clusters.length).toBe(1);
    expect(result.report.clustersCreated).toEqual([]);
  });

  it('handles a story with no characters, no clusters, no beats gracefully', () => {
    const result = normalizeStory({ metadata: { title: 'Empty' } }, schema);
    expect(result.errors).toEqual([]);
    expect(result.report.beatsNormalized).toBe(0);
  });
});
