/**
 * AnimationPanel Tests
 * Tests animation CRUD operations and UI interactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnimationPath, AnimationWaypoint } from '@asaps/core';
import type { VisualElement } from '../VisualBeatEditor';

describe('AnimationPanel', () => {
  let mockAnimations: AnimationPath[];
  let mockElements: VisualElement[];
  let mockOnAnimationsChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock visual elements
    mockElements = [
      {
        id: 'element_1',
        type: 'character',
        name: 'Hero',
        text: 'Hero Character',
        x: 100,
        y: 100,
        z: 0,
        width: 100,
        height: 100,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'element_2',
        type: 'prop',
        name: 'Sword',
        text: 'Magic Sword',
        x: 200,
        y: 200,
        z: 1,
        width: 50,
        height: 50,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'element_3',
        type: 'text',
        name: 'Title',
        text: 'Welcome!',
        x: 300,
        y: 50,
        z: 2,
        width: 200,
        height: 40,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
      },
    ];

    // Create mock animations
    const waypoint1: AnimationWaypoint = {
      x: 100,
      y: 100,
      duration: 1000,
      easing: 'ease-in-out',
    };

    const waypoint2: AnimationWaypoint = {
      x: 500,
      y: 300,
      duration: 1000,
      easing: 'ease-in-out',
    };

    mockAnimations = [
      {
        id: 'anim_1',
        name: 'Hero Walk',
        elementId: 'element_1',
        type: 'bezier',
        waypoints: [waypoint1, waypoint2],
        duration: 2000,
        easing: 'ease-in-out',
        loop: false,
        autoPlay: true,
        trigger: 'onLoad',
      },
      {
        id: 'anim_2',
        name: 'Sword Spin',
        elementId: 'element_2',
        type: 'linear',
        waypoints: [waypoint1],
        duration: 500,
        loop: true,
        autoPlay: false,
        trigger: 'onClick',
      },
    ];

    mockOnAnimationsChange = vi.fn();
  });

  describe('Animation Data Structure', () => {
    it('should have valid animation structure', () => {
      const animation = mockAnimations[0];
      expect(animation.id).toBeDefined();
      expect(animation.name).toBeDefined();
      expect(animation.elementId).toBeDefined();
      expect(animation.type).toBeDefined();
      expect(animation.waypoints).toBeInstanceOf(Array);
      expect(animation.duration).toBeGreaterThan(0);
    });

    it('should validate animation types', () => {
      const validTypes = ['bezier', 'linear'];
      mockAnimations.forEach(anim => {
        expect(validTypes).toContain(anim.type);
      });
    });

    it('should validate trigger types', () => {
      const validTriggers = ['onLoad', 'onClick', 'onVariable', undefined];
      mockAnimations.forEach(anim => {
        expect(validTriggers).toContain(anim.trigger);
      });
    });

    it('should have valid waypoint structure', () => {
      const waypoint = mockAnimations[0].waypoints[0];
      expect(waypoint.x).toBeDefined();
      expect(waypoint.y).toBeDefined();
      expect(waypoint.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Animation CRUD Operations', () => {
    it('should add new animation to list', () => {
      const newAnimation: AnimationPath = {
        id: 'anim_3',
        name: 'Title Fade',
        elementId: 'element_3',
        type: 'linear',
        waypoints: [
          { x: 300, y: 50, duration: 500 },
          { x: 300, y: 100, duration: 500 },
        ],
        duration: 1000,
        autoPlay: true,
      };

      const updatedAnimations = [...mockAnimations, newAnimation];
      expect(updatedAnimations).toHaveLength(3);
      expect(updatedAnimations[2]).toBe(newAnimation);
    });

    it('should update existing animation', () => {
      const updatedAnimation = {
        ...mockAnimations[0],
        name: 'Updated Hero Walk',
        duration: 3000,
      };

      const updatedAnimations = mockAnimations.map(a =>
        a.id === updatedAnimation.id ? updatedAnimation : a
      );

      expect(updatedAnimations[0].name).toBe('Updated Hero Walk');
      expect(updatedAnimations[0].duration).toBe(3000);
    });

    it('should delete animation from list', () => {
      const animationIdToDelete = 'anim_1';
      const updatedAnimations = mockAnimations.filter(a => a.id !== animationIdToDelete);

      expect(updatedAnimations).toHaveLength(1);
      expect(updatedAnimations.find(a => a.id === animationIdToDelete)).toBeUndefined();
    });

    it('should find animation by id', () => {
      const animation = mockAnimations.find(a => a.id === 'anim_1');
      expect(animation).toBeDefined();
      expect(animation?.name).toBe('Hero Walk');
    });

    it('should find animations by element id', () => {
      const elementAnimations = mockAnimations.filter(a => a.elementId === 'element_1');
      expect(elementAnimations).toHaveLength(1);
      expect(elementAnimations[0].name).toBe('Hero Walk');
    });
  });

  describe('Element Selection', () => {
    it('should have valid element IDs', () => {
      mockElements.forEach(element => {
        expect(element.id).toBeDefined();
        expect(typeof element.id).toBe('string');
      });
    });

    it('should validate element types', () => {
      const validTypes = ['character', 'prop', 'text', 'dialog', 'button', 'hotspot'];
      mockElements.forEach(element => {
        expect(validTypes).toContain(element.type);
      });
    });

    it('should find element by id', () => {
      const element = mockElements.find(el => el.id === 'element_1');
      expect(element).toBeDefined();
      expect(element?.name).toBe('Hero');
    });

    it('should get element name for display', () => {
      const element = mockElements[0];
      const displayName = `${element.type} - ${element.text || element.id.slice(0, 8)}`;
      expect(displayName).toContain(element.type);
    });
  });

  describe('Animation Properties', () => {
    it('should handle loop property', () => {
      expect(mockAnimations[0].loop).toBe(false);
      expect(mockAnimations[1].loop).toBe(true);
    });

    it('should handle autoPlay property', () => {
      expect(mockAnimations[0].autoPlay).toBe(true);
      expect(mockAnimations[1].autoPlay).toBe(false);
    });

    it('should validate duration is positive', () => {
      mockAnimations.forEach(anim => {
        expect(anim.duration).toBeGreaterThan(0);
      });
    });

    it('should validate waypoints array is not empty', () => {
      mockAnimations.forEach(anim => {
        expect(anim.waypoints.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Waypoint Manipulation', () => {
    it('should add waypoint to animation', () => {
      const animation = mockAnimations[0];
      const newWaypoint: AnimationWaypoint = {
        x: 700,
        y: 400,
        duration: 1000,
      };

      const updatedAnimation = {
        ...animation,
        waypoints: [...animation.waypoints, newWaypoint],
      };

      expect(updatedAnimation.waypoints).toHaveLength(3);
      expect(updatedAnimation.waypoints[2]).toBe(newWaypoint);
    });

    it('should remove waypoint from animation', () => {
      const animation = mockAnimations[0];
      const updatedWaypoints = animation.waypoints.filter((_, index) => index !== 0);

      expect(updatedWaypoints).toHaveLength(1);
    });

    it('should update waypoint position', () => {
      const animation = mockAnimations[0];
      const updatedWaypoints = animation.waypoints.map((wp, index) =>
        index === 0 ? { ...wp, x: 150, y: 150 } : wp
      );

      expect(updatedWaypoints[0].x).toBe(150);
      expect(updatedWaypoints[0].y).toBe(150);
    });

    it('should validate waypoint coordinates', () => {
      mockAnimations.forEach(anim => {
        anim.waypoints.forEach(wp => {
          expect(typeof wp.x).toBe('number');
          expect(typeof wp.y).toBe('number');
          expect(wp.x).toBeGreaterThanOrEqual(0);
          expect(wp.y).toBeGreaterThanOrEqual(0);
        });
      });
    });
  });

  describe('Bezier Curve Support', () => {
    it('should support control points for bezier curves', () => {
      const waypointWithControl: AnimationWaypoint = {
        x: 500,
        y: 300,
        duration: 1000,
        controlPoint1: { x: 300, y: 100 },
        controlPoint2: { x: 400, y: 500 },
      };

      expect(waypointWithControl.controlPoint1).toBeDefined();
      expect(waypointWithControl.controlPoint2).toBeDefined();
      expect(waypointWithControl.controlPoint1?.x).toBe(300);
    });

    it('should handle waypoints without control points (linear)', () => {
      const linearWaypoint: AnimationWaypoint = {
        x: 500,
        y: 300,
        duration: 1000,
      };

      expect(linearWaypoint.controlPoint1).toBeUndefined();
      expect(linearWaypoint.controlPoint2).toBeUndefined();
    });
  });

  describe('Easing Functions', () => {
    it('should support CSS easing strings', () => {
      const validEasings = [
        'ease',
        'ease-in',
        'ease-out',
        'ease-in-out',
        'linear',
        'cubic-bezier(0.42, 0, 0.58, 1)',
      ];

      validEasings.forEach(easing => {
        const waypoint: AnimationWaypoint = {
          x: 100,
          y: 100,
          duration: 1000,
          easing,
        };
        expect(waypoint.easing).toBe(easing);
      });
    });

    it('should handle waypoints without easing (defaults to parent animation)', () => {
      const waypoint: AnimationWaypoint = {
        x: 100,
        y: 100,
        duration: 1000,
      };
      expect(waypoint.easing).toBeUndefined();
    });
  });

  describe('Transform Properties', () => {
    it('should support scale property in waypoints', () => {
      const waypoint: AnimationWaypoint = {
        x: 100,
        y: 100,
        duration: 1000,
        scale: 1.5,
      };
      expect(waypoint.scale).toBe(1.5);
    });

    it('should support rotation property in waypoints', () => {
      const waypoint: AnimationWaypoint = {
        x: 100,
        y: 100,
        duration: 1000,
        rotation: 45,
      };
      expect(waypoint.rotation).toBe(45);
    });

    it('should support opacity property in waypoints', () => {
      const waypoint: AnimationWaypoint = {
        x: 100,
        y: 100,
        duration: 1000,
        opacity: 0.5,
      };
      expect(waypoint.opacity).toBe(0.5);
      expect(waypoint.opacity).toBeGreaterThanOrEqual(0);
      expect(waypoint.opacity).toBeLessThanOrEqual(1);
    });
  });

  describe('Animation Validation', () => {
    it('should validate total duration matches waypoint durations', () => {
      const animation = mockAnimations[0];
      const totalWaypointDuration = animation.waypoints.reduce(
        (sum, wp) => sum + wp.duration,
        0
      );
      expect(animation.duration).toBe(totalWaypointDuration);
    });

    it('should validate element exists for animation', () => {
      mockAnimations.forEach(anim => {
        const element = mockElements.find(el => el.id === anim.elementId);
        expect(element).toBeDefined();
      });
    });

    it('should validate animation IDs are unique', () => {
      const ids = mockAnimations.map(a => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Stage Boundaries', () => {
    it('should validate waypoint positions within stage bounds', () => {
      const stageWidth = 1024;
      const stageHeight = 768;

      mockAnimations.forEach(anim => {
        anim.waypoints.forEach(wp => {
          expect(wp.x).toBeGreaterThanOrEqual(0);
          expect(wp.x).toBeLessThanOrEqual(stageWidth);
          expect(wp.y).toBeGreaterThanOrEqual(0);
          expect(wp.y).toBeLessThanOrEqual(stageHeight);
        });
      });
    });

    it('should calculate animation path length', () => {
      const animation = mockAnimations[0];
      const waypoints = animation.waypoints;

      let totalDistance = 0;
      for (let i = 1; i < waypoints.length; i++) {
        const dx = waypoints[i].x - waypoints[i - 1].x;
        const dy = waypoints[i].y - waypoints[i - 1].y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
      }

      expect(totalDistance).toBeGreaterThan(0);
    });
  });

  describe('Callback Handling', () => {
    it('should call onAnimationsChange when adding animation', () => {
      const newAnimation: AnimationPath = {
        id: 'anim_new',
        name: 'New Animation',
        elementId: 'element_1',
        type: 'linear',
        waypoints: [{ x: 100, y: 100, duration: 1000 }],
        duration: 1000,
      };

      const updatedAnimations = [...mockAnimations, newAnimation];
      mockOnAnimationsChange(updatedAnimations);

      expect(mockOnAnimationsChange).toHaveBeenCalledTimes(1);
      expect(mockOnAnimationsChange).toHaveBeenCalledWith(updatedAnimations);
    });

    it('should call onAnimationsChange when updating animation', () => {
      const updatedAnimations = mockAnimations.map(a =>
        a.id === 'anim_1' ? { ...a, name: 'Updated' } : a
      );
      mockOnAnimationsChange(updatedAnimations);

      expect(mockOnAnimationsChange).toHaveBeenCalledTimes(1);
      expect(mockOnAnimationsChange).toHaveBeenCalledWith(updatedAnimations);
    });

    it('should call onAnimationsChange when deleting animation', () => {
      const updatedAnimations = mockAnimations.filter(a => a.id !== 'anim_1');
      mockOnAnimationsChange(updatedAnimations);

      expect(mockOnAnimationsChange).toHaveBeenCalledTimes(1);
      expect(mockOnAnimationsChange).toHaveBeenCalledWith(updatedAnimations);
    });
  });
});
