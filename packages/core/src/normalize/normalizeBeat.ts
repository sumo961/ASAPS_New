/**
 * Schema-driven beat normalization.
 *
 * Walks a single raw beat (typically from an AI response) and produces a
 * canonical form, using the metadata in core-beats.json:
 *
 *   - `aliases`: rename messy input names to canonical (e.g. `variableName`
 *     → `variable` on inputText)
 *   - `nested`: flatten an embedded object's fields up to top-level
 *     (e.g. `params.condition.sentimentTarget` → `params.sentimentTarget`),
 *     using a registry like `conditionTypes` to know which fields are valid
 *     for the chosen discriminator value
 *   - `coerce`: convert primitive types when the schema declares a string
 *     but the AI emitted a number / boolean
 *   - `default`: fill missing fields from the schema's `default`
 *
 * Mutates a shallow clone of the input beat. Returns the canonical beat
 * along with a list of changes for diagnostic logging / regression tests.
 */

import type {
  BeatSchema,
  BeatTypeSpec,
  NormalizeChange,
  ParameterSpec,
} from './types';

export interface NormalizeBeatOptions {
  /** Defaults to true — apply schema defaults for missing required params. */
  applyDefaults?: boolean;
  /** Defaults to true — delete nested object after flattening. */
  deleteNestedAfterFlatten?: boolean;
}

export function normalizeBeat(
  rawBeat: any,
  schema: BeatSchema,
  options: NormalizeBeatOptions = {}
): { beat: any; changes: NormalizeChange[] } {
  const opts = {
    applyDefaults: options.applyDefaults !== false,
    deleteNestedAfterFlatten: options.deleteNestedAfterFlatten !== false,
  };

  const changes: NormalizeChange[] = [];
  if (!rawBeat || typeof rawBeat !== 'object') {
    return { beat: rawBeat, changes };
  }

  const beat = { ...rawBeat, parameters: { ...(rawBeat.parameters || {}) } };
  const beatId: string = beat.id || '?';
  const beatType: string = beat.type;
  const beatSpec: BeatTypeSpec | undefined = schema.beatTypes?.[beatType];

  if (!beatSpec) {
    // Unknown beat type — nothing schema-driven we can do. The validator
    // will flag this separately.
    return { beat, changes };
  }

  const params = beat.parameters as Record<string, any>;
  const paramSpecs = beatSpec.parameters || {};

  // Step 1 — flatten nested objects (e.g. conditionBeat.condition.*)
  if (beatSpec.nested) {
    for (const [nestedKey, nestedSpec] of Object.entries(beatSpec.nested)) {
      const nested = params[nestedKey];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;

      // Discriminator (e.g. type → conditionType)
      let discValue: any;
      if (nestedSpec.discriminator && nestedSpec.discriminatorMapsTo) {
        discValue = nested[nestedSpec.discriminator];
        const target = nestedSpec.discriminatorMapsTo;
        if (discValue !== undefined && params[target] === undefined) {
          params[target] = discValue;
          changes.push({
            beatId,
            path: `parameters.${nestedKey}.${nestedSpec.discriminator} → parameters.${target}`,
            kind: 'flattened',
            from: undefined,
            to: discValue,
          });
        }
      }

      // Look up the registry entry for this discriminator value (e.g.
      // conditionTypes.sentiment) so we can honor per-type field aliases
      // (e.g. variable.aliases = { variableName: ['variable', 'left'] }).
      let registryEntry: any = undefined;
      if (nestedSpec.registry === 'conditionTypes' && discValue && schema.conditionTypes) {
        registryEntry = schema.conditionTypes[discValue];
      }
      const registryAliases: Record<string, string[]> | undefined = registryEntry?.aliases;

      // Apply registry-level aliases to the nested object IN PLACE so the
      // subsequent flatten copies the canonical name to top-level.
      if (registryAliases) {
        for (const [canonical, aliasList] of Object.entries(registryAliases)) {
          if (nested[canonical] !== undefined) continue;
          for (const alias of aliasList) {
            if (nested[alias] !== undefined) {
              nested[canonical] = nested[alias];
              delete nested[alias];
              changes.push({
                beatId,
                path: `parameters.${nestedKey}.${alias} → parameters.${nestedKey}.${canonical}`,
                kind: 'aliased',
                to: nested[canonical],
                note: `via conditionTypes.${discValue}.aliases`,
              });
              break;
            }
          }
        }
      }

      // Flatten all other fields
      if (nestedSpec.flattenAll) {
        for (const [k, v] of Object.entries(nested)) {
          if (k === nestedSpec.discriminator) continue; // already handled above
          if (params[k] === undefined && v !== undefined) {
            params[k] = v;
            changes.push({
              beatId,
              path: `parameters.${nestedKey}.${k} → parameters.${k}`,
              kind: 'flattened',
              from: undefined,
              to: v,
            });
          }
        }
      }

      // Delete the nested object after copying its contents
      const shouldDelete = nestedSpec.deleteAfterFlatten !== false && opts.deleteNestedAfterFlatten;
      if (shouldDelete) {
        delete params[nestedKey];
        changes.push({
          beatId,
          path: `parameters.${nestedKey}`,
          kind: 'deleted',
          note: 'nested object flattened, original removed',
        });
      }
    }
  }

  // Step 2 — apply aliases (rename param to canonical name)
  for (const [canonicalName, paramSpec] of Object.entries(paramSpecs)) {
    if (!paramSpec || typeof paramSpec !== 'object') continue;
    const aliases = paramSpec.aliases;
    if (!Array.isArray(aliases) || aliases.length === 0) continue;
    if (params[canonicalName] !== undefined) continue;
    for (const alias of aliases) {
      if (params[alias] !== undefined) {
        params[canonicalName] = params[alias];
        delete params[alias];
        changes.push({
          beatId,
          path: `parameters.${alias} → parameters.${canonicalName}`,
          kind: 'aliased',
          to: params[canonicalName],
        });
        break;
      }
    }
  }

  // Step 3 — coerce primitive types
  for (const [name, paramSpec] of Object.entries(paramSpecs)) {
    if (!paramSpec || typeof paramSpec !== 'object') continue;
    const value = params[name];
    if (value === undefined || value === null) continue;
    if (paramSpec.coerce === 'primitiveToString' && paramSpec.type === 'string') {
      if (typeof value === 'number' || typeof value === 'boolean') {
        const before = value;
        params[name] = String(value);
        changes.push({
          beatId,
          path: `parameters.${name}`,
          kind: 'coerced',
          from: before,
          to: params[name],
        });
      }
    }
  }

  // Step 4 — fill defaults for required fields that are still missing
  if (opts.applyDefaults) {
    for (const [name, paramSpec] of Object.entries(paramSpecs)) {
      if (!paramSpec || typeof paramSpec !== 'object') continue;
      if (!paramSpec.required) continue;
      if (params[name] !== undefined) continue;
      if (paramSpec.default === undefined) continue;
      // Don't auto-fill complex defaults (connection objects); only primitives.
      const def = paramSpec.default;
      if (typeof def === 'object') continue;
      params[name] = def;
      changes.push({
        beatId,
        path: `parameters.${name}`,
        kind: 'defaulted',
        to: def,
      });
    }
  }

  // Carry over top-level cluster/notes already on raw (no transformation).
  // These survive untouched since they're not under `parameters`.

  return { beat, changes };
}
