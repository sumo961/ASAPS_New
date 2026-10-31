/**
 * A beat's own look (Beat.look) as an AI proposal sets it: a PATCH over the
 * look the beat has. Fields it names change, fields it leaves out stay,
 * null removes one; `look: null` (or {}) gives the beat the project's look
 * again. Every field is checked against BeatLook, so a typo or a wrong
 * value is refused with a reason instead of being stored and ignored.
 */
import type { BeatLook } from '@asaps/core';

type FieldKind = 'string' | 'percent' | 'px' | 'fontSize' | { oneOf: readonly string[] };

const GROUPS: Record<'textBox' | 'button' | 'fonts', Record<string, FieldKind>> = {
  textBox: {
    backgroundColor: 'string',
    opacity: 'percent',
    borderColor: 'string',
    borderWidth: 'px',
    borderRadius: 'px',
    padding: 'px',
    visibility: { oneOf: ['all', 'hideText', 'hideAll'] },
    framePicture: { oneOf: ['off'] },
  },
  button: {
    backgroundColor: 'string',
    textColor: 'string',
    borderColor: 'string',
    borderRadius: 'px',
  },
  fonts: {
    titleFont: 'string',
    textFont: 'string',
    buttonFont: 'string',
    titleFontSize: 'fontSize',
    textFontSize: 'fontSize',
    buttonFontSize: 'fontSize',
  },
};
const TOP: Record<string, FieldKind> = { stageColor: 'string', textColor: 'string' };

function fieldProblem(path: string, kind: FieldKind, v: unknown): string | null {
  if (v === null) return null; // removes the field
  if (typeof kind === 'object') {
    return kind.oneOf.includes(v as string) ? null : `${path} must be ${kind.oneOf.map((o) => `"${o}"`).join(' or ')}`;
  }
  if (kind === 'string') return typeof v === 'string' && v.trim() ? null : `${path} must be a non-empty string`;
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${path} must be a number`;
  if (kind === 'percent' && (v < 0 || v > 100)) return `${path} must be 0–100`;
  if (kind === 'px' && (v < 0 || v > 200)) return `${path} must be 0–200 (px)`;
  if (kind === 'fontSize' && (v < 6 || v > 200)) return `${path} must be 6–200 (px)`;
  return null;
}

/** What's wrong with a look patch, or null when every field is known and valid. */
export function beatLookPatchProblem(patch: unknown): string | null {
  if (patch === null) return null;
  if (typeof patch !== 'object' || Array.isArray(patch)) return 'look must be an object (or null for the project\'s look)';
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (key in TOP) {
      const p = fieldProblem(`look.${key}`, TOP[key], value);
      if (p) return p;
      continue;
    }
    const group = GROUPS[key as keyof typeof GROUPS];
    if (!group) {
      return `look.${key} is not a look field (use stageColor, textColor, textBox, button, fonts)`;
    }
    if (value === null) continue;
    if (typeof value !== 'object' || Array.isArray(value)) return `look.${key} must be an object`;
    for (const [field, v] of Object.entries(value as Record<string, unknown>)) {
      if (!(field in group)) return `look.${key}.${field} is not a look field (use ${Object.keys(group).join(', ')})`;
      const p = fieldProblem(`look.${key}.${field}`, group[field], v);
      if (p) return p;
    }
  }
  return null;
}

/**
 * The beat's look after the patch (call beatLookPatchProblem first).
 * undefined = the project's look.
 */
export function applyBeatLookPatch(current: BeatLook | undefined, patch: Record<string, unknown> | null): BeatLook | undefined {
  if (patch === null || Object.keys(patch).length === 0) return undefined;
  const out: Record<string, Record<string, unknown> | unknown> = JSON.parse(JSON.stringify(current ?? {}));
  for (const [key, value] of Object.entries(patch)) {
    if (key in TOP) {
      if (value === null) delete out[key];
      else out[key] = value;
      continue;
    }
    if (value === null) { delete out[key]; continue; }
    const group: Record<string, unknown> = { ...(out[key] ?? {}) };
    for (const [field, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) delete group[field];
      else group[field] = v;
    }
    if (Object.keys(group).length > 0) out[key] = group;
    else delete out[key];
  }
  return Object.keys(out).length > 0 ? (out as BeatLook) : undefined;
}

/** One line for the digest: what this beat changes about the project's look. */
export function describeBeatLook(look: BeatLook | undefined, textBoxBorder?: string): string | null {
  const parts: string[] = [];
  if (look && Object.keys(look).length > 0) parts.push(JSON.stringify(look));
  if (textBoxBorder === 'show' || textBoxBorder === 'hide') parts.push(`textBoxBorder: ${textBoxBorder}`);
  return parts.length > 0 ? parts.join('; ') : null;
}
