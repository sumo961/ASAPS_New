/**
 * Tests for the shared affect-prompt module.
 *
 * Covers tier filtering (sparse skips affect catalog / effects /
 * dossier; standard and rich include them), depth-dial guidance always
 * being present, the active-depth marker showing up in non-auto modes,
 * and the Layer-2 foundations always being included.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAffectPromptSection,
  type AffectDepth,
} from '../../src/prompts/affectPrompt';

describe('buildAffectPromptSection', () => {
  describe('always-included sections', () => {
    it.each(['auto', 'sparse', 'standard', 'rich'] as AffectDepth[])(
      'includes Layer-2 foundations at depth=%s',
      (depth) => {
        const out = buildAffectPromptSection(depth);
        expect(out).toContain('Characters Are Runtime Entities');
        expect(out).toContain("'player'");
        expect(out).toContain('character-scoped state');
      },
    );

    it.each(['auto', 'sparse', 'standard', 'rich'] as AffectDepth[])(
      'includes the depth dial guidance at depth=%s',
      (depth) => {
        const out = buildAffectPromptSection(depth);
        expect(out).toContain('Affect Depth Dial');
        // All three tier headings appear in the dial guidance.
        expect(out).toContain('Sparse');
        expect(out).toContain('Standard');
        expect(out).toContain('Rich');
      },
    );
  });

  describe('sparse mode — lean output', () => {
    it('does NOT include the affect catalog at sparse', () => {
      const out = buildAffectPromptSection('sparse');
      expect(out).not.toContain('Affect Catalog');
      expect(out).not.toContain('Russell');
      expect(out).not.toContain('GAMYGDALA');
    });

    it('does NOT include the effects/conditions reference section at sparse', () => {
      const out = buildAffectPromptSection('sparse');
      // The reference SECTION (with operator catalog, baseline modes,
      // template names, authoring rhythm) is what's omitted. Specific
      // terms like "bookmarkAffectState" still appear in the always-on
      // depth-dial guidance because it teaches when each tier is
      // appropriate — that's intentional.
      expect(out).not.toContain('Affect-Aware Effects & Conditions');
      expect(out).not.toContain('Authoring rhythm');
      expect(out).not.toContain("'literal' (default)");
    });

    it('does NOT include dossier policy heuristic at sparse', () => {
      const out = buildAffectPromptSection('sparse');
      expect(out).not.toContain('Dossier Policy Selection');
    });

    it('marks the active depth so the AI knows it is locked into sparse', () => {
      const out = buildAffectPromptSection('sparse');
      expect(out).toContain('Active depth: `sparse`');
    });
  });

  describe('standard and rich modes — full deployment', () => {
    it.each(['standard', 'rich'] as AffectDepth[])(
      'includes the affect catalog at depth=%s',
      (depth) => {
        const out = buildAffectPromptSection(depth);
        expect(out).toContain('Affect Catalog');
        expect(out).toContain('Russell');
        expect(out).toContain('GAMYGDALA');
      },
    );

    it.each(['standard', 'rich'] as AffectDepth[])(
      'includes effects/conditions reference at depth=%s',
      (depth) => {
        const out = buildAffectPromptSection(depth);
        expect(out).toContain('Affect-Aware Effects & Conditions');
        expect(out).toContain('bookmarkAffectState');
        expect(out).toContain('baseline');
      },
    );

    it.each(['standard', 'rich'] as AffectDepth[])(
      'includes dossier policy heuristic at depth=%s',
      (depth) => {
        const out = buildAffectPromptSection(depth);
        expect(out).toContain('Dossier Policy Selection');
        expect(out).toContain("'reAnchor'");
        expect(out).toContain("'reflection'");
      },
    );

    it.each(['standard', 'rich'] as AffectDepth[])(
      'marks the active depth at depth=%s',
      (depth) => {
        const out = buildAffectPromptSection(depth);
        expect(out).toContain(`Active depth: \`${depth}\``);
      },
    );
  });

  describe('auto mode — same content as standard, no active-depth marker', () => {
    it('includes everything', () => {
      const out = buildAffectPromptSection('auto');
      expect(out).toContain('Characters Are Runtime Entities');
      expect(out).toContain('Affect Catalog');
      expect(out).toContain('Affect-Aware Effects & Conditions');
      expect(out).toContain('Dossier Policy Selection');
      expect(out).toContain('Affect Depth Dial');
    });

    it('does NOT mark an active depth (the AI is free to pick)', () => {
      const out = buildAffectPromptSection('auto');
      expect(out).not.toContain('Active depth');
    });

    it('is the default when no depth is passed', () => {
      const explicit = buildAffectPromptSection('auto');
      const implicit = buildAffectPromptSection();
      expect(implicit).toBe(explicit);
    });
  });

  describe('output shape', () => {
    it('returns a non-empty string for every tier', () => {
      for (const d of ['auto', 'sparse', 'standard', 'rich'] as AffectDepth[]) {
        const out = buildAffectPromptSection(d);
        expect(out.length).toBeGreaterThan(500);
      }
    });

    it('sparse output is meaningfully shorter than standard / rich', () => {
      const sparse = buildAffectPromptSection('sparse');
      const standard = buildAffectPromptSection('standard');
      // Standard should be at least ~2× the sparse length once the
      // catalog + effects + dossier sections are added back.
      expect(standard.length).toBeGreaterThan(sparse.length * 1.8);
    });
  });
});
