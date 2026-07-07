// Infer a value-dimension CultureProfile for an ARBITRARY named culture
// (e.g. "New Zealand", "Karnataka, India") via an injected LLM `generate` fn,
// so cultures aren't limited to the hardcoded reference profiles. Grounded in
// the same value frameworks as docs/KG/value-dimensions-research.md.

import {
  CultureProfile,
  CultureValuePosition,
  VALUE_DIMENSION_TYPES,
  ValueDimensionType,
} from './types';
import { extractJSONObject, GenerateFn } from './culturalExtraction';

export interface CultureInferenceRequest {
  /** Culture name, e.g. "New Zealand" or "Karnataka". */
  label: string;
  /** Optional region or ethnicity WITHIN the culture (not a country), e.g. "Tamil", "Karnataka". */
  region?: string;
  /** Optional associated language (informational only), e.g. "Kannada". */
  language?: string;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'culture';

const DIM_SET = new Set<string>(VALUE_DIMENSION_TYPES as readonly string[]);

/** Build the culture-positioning prompt. Pure. */
export function buildCultureProfilePrompt(req: CultureInferenceRequest): string {
  const dims = VALUE_DIMENSION_TYPES.map((d) => `  - ${d}`).join('\n');
  const who = [req.label, req.region && `(region or ethnicity: ${req.region})`, req.language && `(language: ${req.language})`]
    .filter(Boolean)
    .join(' ');
  return `Position the culture "${who}" on each cultural VALUE DIMENSION below, grounded in cross-cultural scholarship (Hofstede, World Values Survey / Inglehart–Welzel, Schwartz, Moral Foundations Theory, Dignity–Face–Honor).

DIMENSIONS:
${dims}

For each dimension give:
- "position": a number from -1 to 1 (see polarity below),
- "label": a short stance (e.g. "strongly secular-rational").

POLARITY (which end is +1):
- TraditionalVsSecularRational: +1 = secular-rational, -1 = traditional/religious
- SurvivalVsSelfExpression: +1 = self-expression/tolerance, -1 = survival
- IndividualismCollectivism: +1 = individualist, -1 = collectivist
- PowerDistance: +1 = high power distance, -1 = low
- GenderRoleRigidity: +1 = rigid gender roles, -1 = egalitarian
- AutonomyVsEmbeddedness: +1 = autonomy, -1 = embeddedness
- HonorFaceDignity: use the "label" to say dignity / face / honor
- MoralFoundations: use the "label" for the dominant foundations

These are necessarily approximate; base them on the best available evidence and mark uncertainty in the label if needed.

OUTPUT: STRICT JSON only:
{"description": "<one line>", "values": [{"dimension": "<one of the above>", "position": 0.0, "label": "<short stance>"}]}

Return ONLY the JSON object.`;
}

/** Parse the model output into a CultureProfile. Pure. */
export function parseCultureProfile(raw: string, req: CultureInferenceRequest): CultureProfile {
  const jsonStr = extractJSONObject(raw);
  let data: { description?: unknown; values?: unknown[] } = {};
  if (jsonStr) {
    try {
      data = JSON.parse(jsonStr);
    } catch {
      data = {};
    }
  }

  const values: CultureValuePosition[] = [];
  const seen = new Set<string>();
  for (const rawV of data.values ?? []) {
    const v = rawV as Record<string, unknown>;
    const dimension = typeof v.dimension === 'string' ? v.dimension.trim() : '';
    if (!DIM_SET.has(dimension) || seen.has(dimension)) continue;
    seen.add(dimension);
    values.push({
      dimension: dimension as ValueDimensionType,
      position:
        typeof v.position === 'number' ? Math.max(-1, Math.min(1, v.position)) : undefined,
      label: typeof v.label === 'string' ? v.label : undefined,
      source: 'LLM-inferred',
      basis: 'inferred',
    });
  }

  return {
    id: slug(req.region ? `${req.label}-${req.region}` : req.label),
    label: req.label,
    region: req.region,
    languages: req.language ? [req.language] : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    values,
  };
}

/** Infer a CultureProfile end-to-end with an injected LLM `generate`. */
export async function inferCultureProfile(
  req: CultureInferenceRequest,
  generate: GenerateFn
): Promise<CultureProfile> {
  const raw = await generate(buildCultureProfilePrompt(req));
  return parseCultureProfile(raw, req);
}
