/**
 * Tripwire: beatLinks (the review / story overview / layout link walk) must
 * report every link a beat itself reports through getConnections(). They
 * drifted — AI-condition categories, AI-dialog exits, AR anchors, location
 * targets, requirement fallbacks and the AI summary's restart were invisible
 * to the review and the AI tools' overview (2026-09-26), which then asked the
 * generator to "fix" beats that were fine.
 *
 * If this fails for a new beat type or field: teach utils/storyLinks.ts the
 * shape, and add a sample here.
 */
import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { beatLinks } from '../../src/utils/storyLinks';

const SAMPLES: Array<{ type: string; parameters: Record<string, any>; extra?: Record<string, any> }> = [
  { type: 'aiCondition', parameters: { categories: [{ name: 'a', description: 'a', targetId: 't_cat1' }, { name: 'b', description: 'b', targetId: 't_cat2' }], fallbackTarget: 't_fallback' } },
  { type: 'aiDialogTree', parameters: { exitTargets: [{ id: 't_exit1', description: 'done' }, { id: 't_exit2', description: 'more' }] } },
  { type: 'aiConversation', parameters: { npcName: 'N', fallbackExitTarget: 't_maxturns', directions: [{ id: 'd1', name: 'leave', actionExitTarget: 't_dir' }] } },
  { type: 'arBeat', parameters: { anchors: [{ id: 'a1', label: 'door', onTap: 't_anchor' }, { id: 'a2', onTap: 'asaps://beat/x' }], fallbackTarget: 't_skip' } },
  { type: 'aiSummary', parameters: { showRestart: true, restartTarget: 't_restart' } },
  { type: 'keypad', parameters: { code: '1', failTarget: 't_fail' }, extra: { connections: [{ targetId: 't_ok' }] } },
  { type: 'conditionBeat', parameters: { trueTarget: 't_true', falseTarget: 't_false', condition: { type: 'variable', variableName: 'x', operator: '==', value: 1 } } },
  { type: 'gpsLocation', parameters: { xrLocations: [{ id: 'l1', name: 'Hill', target: 't_gps', lat: 0, lng: 0 }] } },
  { type: 'indoorLocation', parameters: { xrLocations: [{ id: 'l1', name: 'Room', target: 't_indoor' }] } },
  { type: 'panorama', parameters: { hotspots: [{ id: 'h1', name: 'door', target: 't_hotspot', yaw: 0, pitch: 0 }] } },
  { type: 'hyperText', parameters: { text: 'go [here]', hyperlinks: [{ word: 'here', targetBeatId: 't_link' }] } },
  { type: 'movementChoice', parameters: { question: 'q', choices: [{ id: 'c1', text: 'North', target: 't_north' }] } },
  { type: 'multiChoice', parameters: { question: 'q', choices: [{ id: 'c1', text: 'One', target: 't_one' }] } },
  { type: 'pickProp', parameters: { props: [{ id: 'p1', name: 'Key', target: 't_prop' }] } },
  { type: 'dialogTree', parameters: { dialogTree: { id: 'n0', speaker: 'A', text: 'x', choices: [{ id: 'c1', text: 'a', dialogNode: { id: 'n1', speaker: 'A', text: 'y', choices: [{ id: 'c2', text: 'b', target: 't_nested' }] } }] } } },
  { type: 'randomTarget', parameters: { choices: [{ target: 't_rand1', weight: 2 }, 't_rand2'] } },
  { type: 'setTimer', parameters: { timerName: 'T', value: 10, timerTarget: 't_timer' }, extra: { connections: [{ targetId: 't_next' }] } },
  { type: 'infoText', parameters: { text: 'x' }, extra: { connections: [{ targetId: 't_next' }], requires: [{ type: 'variable', variableName: 'x', operator: '==', value: 1, fallbackTarget: 't_requires' }] } },
];

describe('beatLinks reports every link a beat reports', () => {
  const registry = BeatTypeRegistry.getInstance();
  for (const s of SAMPLES) {
    it(s.type, () => {
      const beat: any = registry.createBeat(s.type, { id: 'src', name: 's', type: s.type, parameters: s.parameters, ...(s.extra ?? {}) } as any);
      // The serialized shape every consumer of beatLinks sees.
      const saved = {
        id: beat.id, type: beat.type, parameters: beat.getParameters(), connections: beat.connections,
        defaultTarget: beat.defaultTarget, requires: beat.requires,
      };
      const walked = new Set(beatLinks(saved).map((l) => l.target));
      const own = (beat.getConnections() as Array<{ targetId: string }>).map((c) => c.targetId);
      const requires = (beat.requires ?? []).map((r: any) => r.fallbackTarget).filter(Boolean);
      expect(own.length + requires.length).toBeGreaterThan(0); // the sample exercises something
      for (const t of [...own, ...requires]) expect([s.type, t, walked.has(t)]).toEqual([s.type, t, true]);
    });
  }
});
