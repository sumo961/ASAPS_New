/**
 * Tests for normalizeSpeakerDisplay — the migration function that
 * converts old-format speakerDisplay settings to the new format.
 *
 * Old format: { namePosition: 'off'|'left'|'right', graphicPosition: 'left-of-text'|... }
 * New format: { nameStyle: 'off'|'label'|'inline', namePosition: 'left'|'right',
 *               graphicPosition: 'off'|'inside-left'|'inside-right'|'above-left'|'above-right' }
 *
 * This migration runs on every project load that has a speakerDisplay
 * setting. Bugs here silently flip speaker labels off, mis-position
 * graphics, or break the inspector UI display because the inspector
 * reads the migrated values via its useState initializer (per the
 * architecture memory).
 */
import { describe, it, expect } from 'vitest';
import { normalizeSpeakerDisplay } from '../themeConverter';

describe('normalizeSpeakerDisplay', () => {
  describe('passes through new-format values', () => {
    it('preserves nameStyle: label + namePosition: left', () => {
      const result = normalizeSpeakerDisplay({
        nameStyle: 'label',
        namePosition: 'left',
        graphicPosition: 'off',
      });
      expect(result.nameStyle).toBe('label');
      expect(result.namePosition).toBe('left');
      expect(result.graphicPosition).toBe('off');
    });

    it('preserves nameStyle: inline + namePosition: right', () => {
      const result = normalizeSpeakerDisplay({
        nameStyle: 'inline',
        namePosition: 'right',
        graphicPosition: 'inside-right',
      });
      expect(result.nameStyle).toBe('inline');
      expect(result.namePosition).toBe('right');
      expect(result.graphicPosition).toBe('inside-right');
    });

    it('preserves nameStyle: off', () => {
      const result = normalizeSpeakerDisplay({ nameStyle: 'off' });
      expect(result.nameStyle).toBe('off');
    });

    it('preserves nameColor and graphicSize from new format', () => {
      const result = normalizeSpeakerDisplay({
        nameStyle: 'label',
        namePosition: 'left',
        nameColor: '#ff0000',
        graphicSize: 48,
      });
      expect(result.nameColor).toBe('#ff0000');
      expect(result.graphicSize).toBe(48);
    });

    it('defaults namePosition to "left" when new format omits it', () => {
      const result = normalizeSpeakerDisplay({ nameStyle: 'label' });
      expect(result.namePosition).toBe('left');
    });

    it('defaults graphicPosition to "off" when new format omits it', () => {
      const result = normalizeSpeakerDisplay({ nameStyle: 'label' });
      expect(result.graphicPosition).toBe('off');
    });
  });

  describe('migrates old-format namePosition → nameStyle + namePosition', () => {
    it('migrates old namePosition "off" → nameStyle "off"', () => {
      // The trickiest case — the old format encoded "speaker off"
      // as namePosition='off'. If the migration mis-handles this,
      // speakers silently disappear across the project on load.
      const result = normalizeSpeakerDisplay({ namePosition: 'off' });
      expect(result.nameStyle).toBe('off');
      expect(result.namePosition).toBe('left'); // default fallback for the side
    });

    it('migrates old namePosition "left" → nameStyle "label" + namePosition "left"', () => {
      const result = normalizeSpeakerDisplay({ namePosition: 'left' });
      expect(result.nameStyle).toBe('label');
      expect(result.namePosition).toBe('left');
    });

    it('migrates old namePosition "right" → nameStyle "label" + namePosition "right"', () => {
      const result = normalizeSpeakerDisplay({ namePosition: 'right' });
      expect(result.nameStyle).toBe('label');
      expect(result.namePosition).toBe('right');
    });

    it('migrates undefined namePosition → nameStyle "off"', () => {
      // Defensive — projects with no speakerDisplay value at all
      // still must produce a valid normalized object.
      const result = normalizeSpeakerDisplay({});
      expect(result.nameStyle).toBe('off');
    });
  });

  describe('migrates old graphicPosition values', () => {
    it('migrates "left-of-text" → "inside-left"', () => {
      const result = normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'left-of-text',
      });
      expect(result.graphicPosition).toBe('inside-left');
    });

    it('migrates "right-of-text" → "inside-right"', () => {
      const result = normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'right-of-text',
      });
      expect(result.graphicPosition).toBe('inside-right');
    });

    it('passes "above-left" through unchanged', () => {
      const result = normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'above-left',
      });
      expect(result.graphicPosition).toBe('above-left');
    });

    it('passes "above-right" through unchanged', () => {
      const result = normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'above-right',
      });
      expect(result.graphicPosition).toBe('above-right');
    });

    it('passes new "inside-left"/"inside-right" through unchanged (mixed-state projects)', () => {
      // Per the source comment: a project mid-migration may have
      // new-format graphicPosition with old-format namePosition.
      // Must handle the mix cleanly.
      expect(normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'inside-left',
      }).graphicPosition).toBe('inside-left');
      expect(normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'inside-right',
      }).graphicPosition).toBe('inside-right');
    });

    it('falls back to "off" for unknown graphicPosition values', () => {
      const result = normalizeSpeakerDisplay({
        namePosition: 'left',
        graphicPosition: 'totally-invalid-value',
      });
      expect(result.graphicPosition).toBe('off');
    });
  });

  describe('showNames / showGraphics derivation', () => {
    it('derives showNames=true when nameStyle is non-off (new format)', () => {
      // The inspector UI uses showNames as a master toggle; if a
      // project carries new-format values without explicit
      // showNames, we infer it from nameStyle.
      const result = normalizeSpeakerDisplay({ nameStyle: 'label', namePosition: 'left' });
      expect(result.showNames).toBe(true);
    });

    it('derives showNames=false when nameStyle is off (new format)', () => {
      const result = normalizeSpeakerDisplay({ nameStyle: 'off' });
      expect(result.showNames).toBe(false);
    });

    it('preserves explicit showNames=false even when nameStyle is non-off', () => {
      // Author may have intentionally turned off speaker names
      // while keeping nameStyle configured for later. Don't
      // override their explicit choice.
      const result = normalizeSpeakerDisplay({
        nameStyle: 'label',
        namePosition: 'left',
        showNames: false,
      });
      expect(result.showNames).toBe(false);
    });

    it('derives showGraphics=false when graphicPosition is off', () => {
      const result = normalizeSpeakerDisplay({
        nameStyle: 'label',
        graphicPosition: 'off',
      });
      expect(result.showGraphics).toBe(false);
    });

    it('derives showGraphics=true when graphicPosition is set (new format)', () => {
      const result = normalizeSpeakerDisplay({
        nameStyle: 'label',
        graphicPosition: 'inside-left',
      });
      expect(result.showGraphics).toBe(true);
    });

    it('derives both flags in the old-format migration path', () => {
      // Migration: 'left' → label, derived showNames=true.
      const a = normalizeSpeakerDisplay({ namePosition: 'left' });
      expect(a.showNames).toBe(true);
      expect(a.showGraphics).toBe(false); // no graphics declared

      // Migration: 'off' → off, derived showNames=false.
      const b = normalizeSpeakerDisplay({ namePosition: 'off' });
      expect(b.showNames).toBe(false);
    });
  });
});
