import { describe, it, expect, beforeEach } from 'vitest';
import { deserializeBeats, getDroppedBeats, loadProjectData } from '../projectDeserializer';
import { BeatTypeRegistry } from '@asaps/core';
import type { Project } from '../../storage/types';

describe('projectDeserializer', () => {
  beforeEach(() => {
    // Ensure registry is initialized with default beats
    BeatTypeRegistry.getInstance();
  });

  describe('deserializeBeats', () => {
    it('preserves requires and requiresMode across deserialization', () => {
      const beatsData = [
        {
          id: 'beat_gated',
          name: 'Gated',
          type: 'infoText',
          parameters: { text: 'hi' },
          connections: [{ targetId: 'next' }],
          requires: [
            {
              condition: { type: 'inventory', operator: '==', item: 'Lantern', value: true },
              explanation: 'needs lantern',
              severity: 'error',
              fallbackTarget: 'hall',
            },
          ],
          requiresMode: 'any',
        },
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats).toHaveLength(1);
      const b: any = beats[0];
      expect(Array.isArray(b.requires)).toBe(true);
      expect(b.requires).toHaveLength(1);
      expect(b.requires[0].fallbackTarget).toBe('hall');
      expect(b.requires[0].explanation).toBe('needs lantern');
      expect(b.requiresMode).toBe('any');
    });

    it('accepts requires nested under parameters for backwards compatibility', () => {
      const beatsData = [
        {
          id: 'beat_legacy',
          name: 'Legacy',
          type: 'infoText',
          parameters: {
            text: 'hi',
            requires: [
              {
                condition: { type: 'inventory', operator: '==', item: 'Key', value: true },
                explanation: 'needs key',
              },
            ],
            requiresMode: 'all',
          },
          connections: [],
        },
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats).toHaveLength(1);
      const b: any = beats[0];
      expect(Array.isArray(b.requires)).toBe(true);
      expect(b.requires[0].condition.item).toBe('Key');
      expect(b.requiresMode).toBe('all');
    });

    it('should deserialize a simple beat', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Intro',
          type: 'infoText',
          x: 100,
          y: 200,
          parameters: {
            text: 'Welcome to the story',
            buttonText: 'Continue'
          },
          connections: [],
          locations: []
        }
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats).toHaveLength(1);
      expect(beats[0].id).toBe('beat_1');
      expect(beats[0].name).toBe('Intro');
      expect(beats[0].type).toBe('infoText');
      expect(beats[0].x).toBe(100);
      expect(beats[0].y).toBe(200);

      // Check that it's a proper Beat instance
      expect(beats[0].getParameters).toBeDefined();
      expect(beats[0].updateParameters).toBeDefined();
    });

    it('should handle multiple beats', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Title',
          type: 'titleScreen',
          x: 0,
          y: 0,
          parameters: { title: 'My Story', author: 'Author', buttonText: 'Start' }
        },
        {
          id: 'beat_2',
          name: 'Intro',
          type: 'infoText',
          x: 200,
          y: 0,
          parameters: { text: 'Welcome', buttonText: 'Continue' }
        },
        {
          id: 'beat_3',
          name: 'End',
          type: 'endScreen',
          x: 400,
          y: 0,
          parameters: { message: 'The End' }
        }
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats).toHaveLength(3);
      expect(beats[0].type).toBe('titleScreen');
      expect(beats[1].type).toBe('infoText');
      expect(beats[2].type).toBe('endScreen');
    });

    it('should preserve connections', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Start',
          type: 'infoText',
          parameters: { text: 'Start' },
          connections: [
            { targetId: 'beat_2', label: 'Next' }
          ]
        }
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats[0].getConnections()).toHaveLength(1);
      expect(beats[0].getConnections()[0].targetId).toBe('beat_2');
      expect(beats[0].getConnections()[0].label).toBe('Next');
    });

    it('should preserve locations', () => {
      // Locations need a canonical `kind` (or a salvageable legacy `type`) —
      // kind-less elements are intentionally dropped by the corrupted-project
      // repair (salvageBeatLocations, v0.9.68) so they regenerate cleanly.
      // Repair semantics themselves are covered in projectRepair.test.ts.
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Dialog',
          type: 'infoText',
          parameters: { text: 'Hello' },
          locations: [
            { kind: 'character', name: 'char_1', x: 100, y: 200 }
          ]
        }
      ];

      const beats = deserializeBeats(beatsData);

      const locations = Array.from(beats[0].locations.values());
      expect(locations).toHaveLength(1);
      expect(locations[0].name).toBe('char_1');
      expect(locations[0].x).toBe(100);
      expect(locations[0].y).toBe(200);
    });

    it('upgrades legacy type-format locations instead of dropping them', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Dialog',
          type: 'infoText',
          parameters: { text: 'Hello' },
          locations: [
            { type: 'text', name: 'prompt', x: 50, y: 60, width: 300, height: 80 }
          ]
        }
      ];

      const beats = deserializeBeats(beatsData);

      const locations = Array.from(beats[0].locations.values());
      expect(locations).toHaveLength(1);
      expect(locations[0].kind).toBe('text');
      expect(locations[0].x).toBe(50);
    });

    it('should handle beats with node references', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Scene',
          type: 'infoText',
          node: 'background_asset_id',
          parameters: { text: 'Scene text', node: 'background_asset_id' }
        }
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats[0].node).toBe('background_asset_id');
    });

    it('should skip beats with missing type', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Valid',
          type: 'infoText',
          parameters: {}
        },
        {
          id: 'beat_2',
          name: 'Invalid',
          // Missing type
          parameters: {}
        }
      ];

      const beats = deserializeBeats(beatsData);

      expect(beats).toHaveLength(1);
      expect(beats[0].id).toBe('beat_1');
    });

    it('should handle unknown beat types gracefully', () => {
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Unknown Type',
          type: 'nonExistentBeatType',
          parameters: {}
        }
      ];

      // Should fallback to InfoTextBeat based on registry implementation
      const beats = deserializeBeats(beatsData);

      expect(beats).toHaveLength(1);
      // The registry falls back to infoText for unknown types
      expect(beats[0]).toBeDefined();
    });
  });

  describe('loadProjectData', () => {
    it('should load project with Story instance', () => {
      const mockStory = {
        getAllBeats: () => [
          {
            id: 'beat_1',
            name: 'Test',
            type: 'infoText',
            getParameters: () => ({ text: 'Test', buttonText: 'Continue' }),
            updateParameters: () => {},
            x: 0,
            y: 0,
            connections: [],
            locations: new Map()
          }
        ],
        getMetadata: () => ({ title: 'Test Story', author: 'Test Author' }),
        getSettings: () => ({ width: 1024, height: 768 }),
        getEnvironment: () => ({ props: [], nodes: [] }),
        getCharacters: () => [],
        getClusters: () => []
      };

      const project: Project = {
        id: 'project_1',
        name: 'Test Project',
        description: 'A test project',
        story: mockStory as any,
        settings: { width: 1024, height: 768, fonts: [] },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0'
      };

      const result = loadProjectData(project);

      // Project name takes precedence over story metadata title
      expect(result.title).toBe('Test Project');
      expect(result.author).toBe('Test Author');
      expect(result.beats).toHaveLength(1);
      expect(result.settings).toEqual({ width: 1024, height: 768 });
    });

    it('should load project with serialized data', () => {
      const project: Project = {
        id: 'project_1',
        name: 'Test Project',
        story: {
          metadata: { title: 'Serialized Story', author: 'Serialized Author' },
          beats: [
            {
              id: 'beat_1',
              name: 'Intro',
              type: 'infoText',
              parameters: { text: 'Welcome', buttonText: 'Start' },
              connections: [],
              locations: [],
              x: 0,
              y: 0
            }
          ],
          settings: { width: 800, height: 600 },
          environment: { props: [], nodes: [] },
          characters: [],
          clusters: []
        } as any,
        settings: { width: 800, height: 600, fonts: [] },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0'
      };

      const result = loadProjectData(project);

      // Project name takes precedence over story metadata title
      expect(result.title).toBe('Test Project');
      expect(result.author).toBe('Serialized Author');
      expect(result.beats).toHaveLength(1);
      expect(result.beats[0].id).toBe('beat_1');
    });

    it('should use project name as fallback title', () => {
      const project: Project = {
        id: 'project_1',
        name: 'Fallback Project Name',
        story: {
          beats: []
        } as any,
        settings: { width: 1024, height: 768, fonts: [] },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0'
      };

      const result = loadProjectData(project);

      expect(result.title).toBe('Fallback Project Name');
      expect(result.author).toBe('Unknown Author');
    });

    it('should handle projects with environment data', () => {
      const project: Project = {
        id: 'project_1',
        name: 'Test Project',
        story: {
          beats: [],
          environment: {
            props: [{ id: 'prop_1', name: 'Sword' }],
            nodes: [{ id: 'bg_1', url: 'background.jpg' }]
          }
        } as any,
        settings: { width: 1024, height: 768, fonts: [] },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0'
      };

      const result = loadProjectData(project);

      expect(result.environment.props).toHaveLength(1);
      expect(result.environment.nodes).toHaveLength(1);
      expect(result.environment.props[0].name).toBe('Sword');
    });

    it('should handle projects with characters', () => {
      const project: Project = {
        id: 'project_1',
        name: 'Test Project',
        story: {
          beats: [],
          characters: [
            { id: 'char_1', name: 'Hero', poses: [] }
          ]
        } as any,
        settings: { width: 1024, height: 768, fonts: [] },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0'
      };

      const result = loadProjectData(project);

      expect(result.characters).toHaveLength(1);
      expect(result.characters[0].name).toBe('Hero');
    });

    it('should handle projects with clusters', () => {
      const project: Project = {
        id: 'project_1',
        name: 'Test Project',
        story: {
          beats: [],
          clusters: [
            { id: 'cluster_1', name: 'Chapter 1', beatIds: [] }
          ]
        } as any,
        settings: { width: 1024, height: 768, fonts: [] },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0'
      };

      const result = loadProjectData(project);

      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].name).toBe('Chapter 1');
    });
  });

  describe('pickProp multiple connections to same target', () => {
    it('should preserve all connections when multiple props target the same beat', () => {
      const beatsData = [
        {
          id: '5',
          name: 'Pick something',
          type: 'pickProp',
          x: 100,
          y: 800,
          parameters: {
            question: 'Pick an item:',
            props: [
              { id: '1', name: 'sweets', description: 'Candy', target: '6' },
              { id: '2', name: 'knife', description: 'A knife', target: '6' },
              { id: '3', name: 'book', description: 'A book', target: '6' },
            ],
          },
          connections: [
            { targetId: '6', label: 'sweets' },
            { targetId: '6', label: 'knife' },
            { targetId: '6', label: 'book' },
          ],
          locations: [],
        },
        {
          id: '6',
          name: 'Next beat',
          type: 'infoText',
          x: 100,
          y: 1000,
          parameters: { text: 'You picked something', buttonText: 'Continue' },
          connections: [],
          locations: [],
        },
      ];

      const beats = deserializeBeats(beatsData);
      const pickProp = beats.find(b => b.id === '5')!;

      // All 3 connections must be preserved (same targetId, different labels)
      expect(pickProp.connections).toHaveLength(3);
      expect(pickProp.connections.map((c: any) => c.label)).toEqual(['sweets', 'knife', 'book']);
    });

    it('should round-trip pickProp connections through toJSON and deserialize', () => {
      // Simulate: load → toJSON → deserialize again
      const beatsData = [
        {
          id: '5',
          name: 'Pick something',
          type: 'pickProp',
          parameters: {
            question: 'Pick an item:',
            props: [
              { id: '1', name: 'sweets', target: '6' },
              { id: '2', name: 'knife', target: '6' },
              { id: '3', name: 'book', target: '6' },
            ],
          },
          connections: [
            { targetId: '6', label: 'sweets' },
            { targetId: '6', label: 'knife' },
            { targetId: '6', label: 'book' },
          ],
          locations: [],
        },
      ];

      // First deserialize
      const beats1 = deserializeBeats(beatsData);
      const pickProp1 = beats1.find(b => b.id === '5')!;
      expect(pickProp1.connections).toHaveLength(3);

      // toJSON and deserialize again (simulates save/reload cycle)
      const json = pickProp1.toJSON();
      const beats2 = deserializeBeats([json]);
      const pickProp2 = beats2.find(b => b.id === '5')!;
      expect(pickProp2.connections).toHaveLength(3);
      expect(pickProp2.connections.map((c: any) => c.label)).toEqual(['sweets', 'knife', 'book']);
    });
  });

  describe('dropped beats are recorded, not just logged', () => {
    // The case that proved the gap: an aiConversation whose `directions` was
    // authored as prose. It is an array of structured rules, so the
    // constructor throws `.map is not a function`, the beat was silently
    // skipped, and the story imported 7 of its 8 beats — the author found out
    // at runtime as "Beat not found".
    const proseDirections = {
      id: 'beat_talk',
      name: 'Keep her talking',
      type: 'aiConversation',
      parameters: {
        npcName: 'Jo',
        scenario: 'Night train',
        directions: 'Be evasive about the suitcase.', // WRONG: must be an array
      },
    };

    it('records the drop with id, name, type, and the constructor error', () => {
      const beats = deserializeBeats([
        { id: 'beat_a', name: 'A', type: 'infoText', parameters: { text: 'hi' } },
        proseDirections,
      ]);

      expect(beats.map(b => b.id)).toEqual(['beat_a']);
      const drops = getDroppedBeats();
      expect(drops).toHaveLength(1);
      expect(drops[0]).toMatchObject({
        id: 'beat_talk',
        name: 'Keep her talking',
        type: 'aiConversation',
      });
      expect(drops[0].error).toMatch(/map is not a function/);
    });

    it('resets between runs — a clean load reports no stale drops', () => {
      deserializeBeats([proseDirections]);
      expect(getDroppedBeats()).toHaveLength(1);
      deserializeBeats([{ id: 'beat_a', type: 'infoText', parameters: { text: 'hi' } }]);
      expect(getDroppedBeats()).toEqual([]);
    });

    it('records beats missing type or id instead of vanishing them', () => {
      deserializeBeats([{ name: 'Nameless shape', parameters: {} }]);
      const drops = getDroppedBeats();
      expect(drops).toHaveLength(1);
      expect(drops[0].id).toBe('(no id)');
      expect(drops[0].error).toMatch(/no type or no id/);
    });

    it('loadProjectData carries the drops out to the caller', () => {
      const project = {
        id: 'p1',
        name: 'Night Train',
        story: {
          title: 'Night Train',
          author: 'test',
          beats: [
            { id: 'beat_chat', type: 'infoText', parameters: { text: 'hello' },
              connections: [{ targetId: 'beat_talk' }] },
            proseDirections,
          ],
        },
      } as unknown as Project;

      const data = loadProjectData(project);
      expect(data.beats.map(b => b.id)).toEqual(['beat_chat']);
      expect(data.droppedBeats).toHaveLength(1);
      expect(data.droppedBeats[0].id).toBe('beat_talk');
      // The link that pointed at the dropped beat is now dangling — that is
      // what turns a drop into the banner's BrokenTarget rows in App.
    });
  });
});
