/**
 * Schema-driven beat validation.
 *
 * Runs against an already-normalized beat (so condition fields are
 * top-level, not nested). Checks:
 *
 *   - Required parameters present
 *   - Per-condition-type required fields (sentiment needs sentimentTarget, …)
 *   - Type matches (post-coercion)
 *   - References resolve (character / beat / asset / cluster)
 *
 * Designed to share its result shape with the legacy AIValidator so the
 * builder UI can swap to it without dialog/inspector changes.
 */

import type {
  BeatSchema,
  ConditionTypeSpec,
  ParameterSpec,
  RefIndex,
  ValidationIssue,
} from './types';

export interface ValidateBeatResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateBeat(
  beat: any,
  schema: BeatSchema,
  refIndex: RefIndex
): ValidateBeatResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!beat || typeof beat !== 'object') {
    errors.push({ path: '', message: 'Beat is not an object', severity: 'error' });
    return { errors, warnings };
  }

  const beatId: string = beat.id || '?';
  const path = `beat[${beatId}]`;
  const beatType: string = beat.type;
  if (!beatType) {
    errors.push({ path, message: 'Beat is missing type', severity: 'error' });
    return { errors, warnings };
  }

  const beatSpec = schema.beatTypes?.[beatType];
  if (!beatSpec) {
    warnings.push({
      path,
      message: `Beat type '${beatType}' not in schema`,
      severity: 'warning',
    });
    return { errors, warnings };
  }

  const params = beat.parameters || {};
  const paramSpecs = beatSpec.parameters || {};

  // Required-param check (skipping aliases — pipeline normalizes those before this runs)
  for (const [name, spec] of Object.entries(paramSpecs)) {
    if (!spec || typeof spec !== 'object') continue;
    if (!spec.required) continue;
    // Skip the conditionBeat `condition` field after normalize — it gets
    // flattened into top-level params, so the nested object disappears.
    // Per-condition-type required-field check (below) handles the real
    // requirements.
    if (beatSpec.nested && Object.prototype.hasOwnProperty.call(beatSpec.nested, name)) continue;
    const value = params[name];
    if (value === undefined || value === null || value === '') {
      errors.push({
        path: `${path}.parameters.${name}`,
        message: `Required parameter '${name}' is missing`,
        severity: 'error',
      });
    }
  }

  // Type-check parameters that are present
  for (const [name, value] of Object.entries(params)) {
    const spec = paramSpecs[name] as ParameterSpec | undefined;
    if (!spec || typeof spec !== 'object') continue;
    if (value === undefined || value === null) continue;
    if (!matchesType(value, spec.type)) {
      errors.push({
        path: `${path}.parameters.${name}`,
        message: `Parameter '${name}' has incorrect type. Expected ${spec.type}, got ${primitiveType(value)}`,
        severity: 'error',
      });
    }
    // Reference resolution
    if (spec.references && typeof value === 'string' && value.length > 0) {
      const ok = referenceResolves(value, spec.references, refIndex);
      if (!ok) {
        warnings.push({
          path: `${path}.parameters.${name}`,
          message: `Parameter '${name}' references unknown ${spec.references}: '${value}'`,
          severity: 'warning',
        });
      }
    }
  }

  // Per-condition-type required-field check for conditionBeat
  if (beatType === 'conditionBeat' && schema.conditionTypes) {
    const condType = params.conditionType;
    if (condType) {
      const condSpec = schema.conditionTypes[condType] as ConditionTypeSpec | undefined;
      if (condSpec && Array.isArray(condSpec.required)) {
        for (const req of condSpec.required) {
          const v = params[req];
          if (v === undefined || v === null || v === '') {
            warnings.push({
              path: `${path}.parameters.${req}`,
              message: `ConditionBeat type '${condType}' missing required field '${req}'`,
              severity: 'warning',
            });
          }
        }
      } else if (!condSpec) {
        warnings.push({
          path: `${path}.parameters.conditionType`,
          message: `Unknown conditionType '${condType}'`,
          severity: 'warning',
        });
      }
    } else {
      warnings.push({
        path: `${path}.parameters.conditionType`,
        message: 'ConditionBeat is missing conditionType discriminator',
        severity: 'warning',
      });
    }
  }

  return { errors, warnings };
}

function matchesType(value: any, expectedType: string | undefined): boolean {
  if (!expectedType) return true;
  switch (expectedType) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'connection':
      // Either a connection object { target, label?, … } or a bare string id.
      return typeof value === 'string'
        || (typeof value === 'object' && value !== null);
    case 'condition':
      // After flatten the condition object is gone; this only fires if the
      // pipeline didn't run. Accept either form.
      return typeof value === 'object' && value !== null;
    default:
      // array<X>, object types, etc. — too loose to type-check generically.
      if (expectedType.startsWith('array<')) return Array.isArray(value);
      return value !== undefined;
  }
}

function primitiveType(v: any): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function referenceResolves(
  value: string,
  kind: 'character' | 'beat' | 'asset' | 'cluster',
  refIndex: RefIndex
): boolean {
  switch (kind) {
    case 'character':
      // 'player' is the implicit always-present character.
      return value === 'player' || refIndex.characterIds.has(value);
    case 'beat':
      return refIndex.beatIds.has(value);
    case 'asset':
      return refIndex.assetIds.has(value);
    case 'cluster':
      return refIndex.clusterNames.has(value);
  }
}
