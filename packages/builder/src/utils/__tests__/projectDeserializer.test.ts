import { describe, it, expect, beforeEach } from 'vitest';
import { deserializeBeats, loadProjectData } from '../projectDeserializer';
import { BeatTypeRegistry } from '@asaps/core';
import type { Project } from '../../storage/types';

describe('projectDeserializer', () => {
  beforeEach(() => {
    // Ensure registry is initialized with default beats
    BeatTypeRegistry.getInstance();
  });

  describe('deserializeBeats', () => {
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
      const beatsData = [
        {
          id: 'beat_1',
          name: 'Dialog',
          type: 'infoText',
          parameters: { text: 'Hello' },
          locations: [
            { name: 'char_1', x: 100, y: 200, char: 'character_id' }
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
});
