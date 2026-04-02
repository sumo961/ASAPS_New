/**
 * Automated scoring for LLM evaluation responses
 */

import type { TestScenario, TestResult, ValidationRules } from './scenarios.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreDetail {
  check: string;
  passed: boolean;
  message: string;
  weight?: number;
}

export interface ScoreReport {
  scenario: string;
  category: string;
  passed: boolean;
  totalScore: number;
  maxScore: number;
  details: ScoreDetail[];
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// JSON extraction helpers
// ---------------------------------------------------------------------------

/** Extract JSON from a response that might contain extra text */
function extractJSON(text: string): string {
  // Try to find a JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];

  // Try to find a JSON array
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];

  return text.trim();
}

/** Navigate a dot-path into an object (e.g. "choices.0.id") */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((curr, key) => {
    if (curr == null) return undefined;
    const idx = parseInt(key, 10);
    return isNaN(idx) ? curr[key] : curr[idx];
  }, obj);
}

/** Count sentences (rough heuristic) */
function countSentences(text: string): number {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 0);
  return Math.max(1, sentences.length);
}

/** Count words */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function score(scenario: TestScenario, result: TestResult): ScoreReport {
  const details: ScoreDetail[] = [];
  const v = scenario.validation;
  const text = result.cleanResponse;

  // 1. JSON validity (weight: 3 for JSON tests, 0 for text)
  if (v.mustBeValidJSON) {
    const jsonStr = extractJSON(text);
    try {
      JSON.parse(jsonStr);
      details.push({ check: 'json-valid', passed: true, message: 'Valid JSON', weight: 3 });
    } catch (e) {
      details.push({ check: 'json-valid', passed: false, message: `Invalid JSON: ${(e as Error).message}`, weight: 3 });
    }
  }

  // 2. Required top-level fields (weight: 2)
  if (v.requiredFields) {
    const jsonStr = extractJSON(text);
    try {
      const obj = JSON.parse(jsonStr);
      const missing = v.requiredFields.filter(f => !(f in obj));
      details.push({
        check: 'required-fields',
        passed: missing.length === 0,
        message: missing.length === 0
          ? `All fields present: ${v.requiredFields.join(', ')}`
          : `Missing fields: ${missing.join(', ')}`,
        weight: 2,
      });
    } catch {
      details.push({ check: 'required-fields', passed: false, message: 'Cannot check — invalid JSON', weight: 2 });
    }
  }

  // 3. Array field minimum length (weight: 2)
  if (v.arrayFieldMinLength) {
    const jsonStr = extractJSON(text);
    try {
      const obj = JSON.parse(jsonStr);
      const arr = getNestedValue(obj, v.arrayFieldMinLength.path);
      const len = Array.isArray(arr) ? arr.length : 0;
      details.push({
        check: 'array-length',
        passed: len >= v.arrayFieldMinLength.min,
        message: `${v.arrayFieldMinLength.path}: ${len} items (need ≥${v.arrayFieldMinLength.min})`,
        weight: 2,
      });
    } catch {
      details.push({ check: 'array-length', passed: false, message: 'Cannot check — invalid JSON', weight: 2 });
    }
  }

  // 4. Array item fields (weight: 1)
  if (v.arrayItemFields) {
    const jsonStr = extractJSON(text);
    try {
      const obj = JSON.parse(jsonStr);
      const arr = getNestedValue(obj, v.arrayItemFields.path);
      if (Array.isArray(arr) && arr.length > 0) {
        const allHaveFields = arr.every((item: any) =>
          v.arrayItemFields!.fields.every(f => f in item)
        );
        details.push({
          check: 'array-item-fields',
          passed: allHaveFields,
          message: allHaveFields
            ? `All items have: ${v.arrayItemFields.fields.join(', ')}`
            : `Some items missing fields: ${v.arrayItemFields.fields.join(', ')}`,
          weight: 1,
        });
      }
    } catch {
      // Skip if can't parse
    }
  }

  // 5. Word count (weight: 1)
  if (v.maxWords !== undefined || v.minWords !== undefined) {
    const words = countWords(text);
    const withinMax = v.maxWords === undefined || words <= v.maxWords;
    const withinMin = v.minWords === undefined || words >= v.minWords;
    details.push({
      check: 'word-count',
      passed: withinMax && withinMin,
      message: `${words} words${v.maxWords ? ` (max: ${v.maxWords})` : ''}${v.minWords ? ` (min: ${v.minWords})` : ''}`,
      weight: 1,
    });
  }

  // 6. Sentence count (weight: 1)
  if (v.maxSentences !== undefined) {
    const sentences = countSentences(text);
    details.push({
      check: 'sentence-count',
      passed: sentences <= v.maxSentences,
      message: `${sentences} sentences (max: ${v.maxSentences})`,
      weight: 1,
    });
  }

  // 7. Must contain any (weight: 2)
  if (v.mustContainAny) {
    const lower = text.toLowerCase();
    const found = v.mustContainAny.filter(s => lower.includes(s.toLowerCase()));
    details.push({
      check: 'must-contain',
      passed: found.length > 0,
      message: found.length > 0
        ? `Found: ${found.join(', ')}`
        : `None of [${v.mustContainAny.join(', ')}] found in response`,
      weight: 2,
    });
  }

  // 8. Must not contain (weight: 2)
  if (v.mustNotContain) {
    const lower = text.toLowerCase();
    const found = v.mustNotContain.filter(s => lower.includes(s.toLowerCase()));
    details.push({
      check: 'must-not-contain',
      passed: found.length === 0,
      message: found.length === 0
        ? 'No forbidden content'
        : `Found forbidden: ${found.join(', ')}`,
      weight: 2,
    });
  }

  // 9. Must be one of (weight: 3 — critical for classification)
  if (v.mustBeOneOf) {
    const trimmed = text.trim().toLowerCase();
    const matched = v.mustBeOneOf.some(val => trimmed === val.toLowerCase());
    details.push({
      check: 'exact-match',
      passed: matched,
      message: matched
        ? `Matched: "${text.trim()}"`
        : `"${text.trim()}" not in [${v.mustBeOneOf.join(', ')}]`,
      weight: 3,
    });
  }

  // 10. Custom validator (weight: 2)
  if (v.custom) {
    const jsonStr = extractJSON(text);
    const customResult = v.custom(jsonStr);
    details.push({
      check: 'custom',
      passed: customResult.passed,
      message: customResult.message,
      weight: 2,
    });
  }

  // Calculate totals
  let totalScore = 0;
  let maxScore = 0;
  for (const d of details) {
    const w = d.weight || 1;
    maxScore += w;
    if (d.passed) totalScore += w;
  }

  // A test passes if it scores ≥70% of possible points
  const passed = maxScore > 0 ? (totalScore / maxScore) >= 0.7 : true;

  return {
    scenario: scenario.id,
    category: scenario.category,
    passed,
    totalScore,
    maxScore,
    details,
    latencyMs: result.latencyMs,
  };
}
