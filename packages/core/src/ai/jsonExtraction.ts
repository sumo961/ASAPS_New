/**
 * Tolerant JSON extraction + repair for LLM responses — single source of truth.
 *
 * Historically FOUR drifted copies of this logic existed:
 *   - PreviewWindow.tsx        — brace-matching extractJSON, greedy-regex fallback, no repair
 *   - WebAIProvider.ts         — markdown-fence stripping + brace matching, tail fallback, no repair
 *   - OpenAIProvider.ts        — greedy-regex extraction + the most complete repair pass (tryRepairJson)
 *   - ClaudeProvider.ts        — greedy-regex extraction + a simpler truncation repair with a
 *                                 quoted-key heuristic ("description: " → "description": ")
 *
 * This module pins the UNION of those behaviors:
 *   - extractJSON():        fence stripping (WebAIProvider) + brace matching (PreviewWindow)
 *                           + greedy/tail fallbacks for truncated output
 *   - repairJson():         the OpenAIProvider repair pass (superset of ClaudeProvider's,
 *                           minus its risky quoted-key regex)
 *   - repairJsonAggressive(): repairJson() plus ClaudeProvider's quoted-key heuristic —
 *                           the heuristic can corrupt string values that legitimately end
 *                           with a colon, so it only runs as a last resort
 *   - parseJSONWithRepair(): extract → parse → repair → parse → aggressive-repair → parse
 *
 * Lives in @asaps/core so the builder path, the in-app preview runtime, and the
 * exported-HTML runtime (player-web) all share it. Keep it framework-free:
 * no DOM, no React, no imports from @asaps/builder.
 */

/**
 * Extract a JSON object from LLM response text.
 *
 * Handles markdown code fences, prose before/after the JSON, nested braces,
 * and braces inside string values (string-aware brace matching). If no
 * balanced object is found (truncated output), falls back to the greedy
 * first-`{`-to-last-`}` span, then to everything from the first `{` — both
 * of which give the downstream repair pass something to close.
 *
 * @throws when the text contains no `{` at all.
 */
export function extractJSON(text: string): string {
  // Strip markdown code fences (```json ... ```)
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift(); // Remove opening ```json or ```
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) {
      lines.pop();
    }
    cleaned = lines.join('\n').trim();
  }

  const jsonStart = cleaned.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON object found in response');
  }

  // String-aware brace matching — stops at the MATCHING closing brace
  // instead of the last brace in the text, and ignores braces inside
  // string values and escaped quotes.
  let braceCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = jsonStart; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return cleaned.slice(jsonStart, i + 1);
        }
      }
    }
  }

  // No balanced close brace (typically truncated output). Greedy span first
  // (first `{` to last `}`), then everything from the first `{` — repair
  // can close the open structures either way.
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return cleaned.slice(jsonStart);
}

/**
 * Try to repair malformed JSON from LLM output.
 * Handles: unescaped control chars in strings, JavaScript comments,
 * unescaped interior quotes, unquoted keys, single quotes, trailing commas,
 * missing commas, truncation (unclosed strings/brackets/braces), and
 * spurious extra closing braces/brackets.
 */
export function repairJson(json: string): string {
  let repaired = json;
  const repairs: string[] = [];

  // Step 1: Escape unescaped control characters inside JSON strings
  // This handles newlines, tabs, etc. that smaller models write literally inside string values
  {
    let result = '';
    let inString = false;
    let i = 0;

    while (i < repaired.length) {
      const char = repaired[i];
      const charCode = char.charCodeAt(0);

      // Handle escape sequences
      if (char === '\\' && i + 1 < repaired.length) {
        result += char + repaired[i + 1];
        i += 2;
        continue;
      }

      // Track string boundaries
      if (char === '"') {
        inString = !inString;
        result += char;
        i++;
        continue;
      }

      // Inside a string, escape control characters
      if (inString && charCode < 32) {
        // Map common control characters to their escape sequences
        switch (charCode) {
          case 9:  result += '\\t'; break;  // Tab
          case 10: result += '\\n'; break;  // Newline
          case 13: result += '\\r'; break;  // Carriage return
          case 8:  result += '\\b'; break;  // Backspace
          case 12: result += '\\f'; break;  // Form feed
          default: result += `\\u${charCode.toString(16).padStart(4, '0')}`; // Other control chars
        }
        i++;
        continue;
      }

      // Outside strings, remove harmful control characters (but keep newlines for structure)
      if (!inString && charCode < 32 && charCode !== 10 && charCode !== 13 && charCode !== 9) {
        i++;
        continue;
      }

      result += char;
      i++;
    }

    if (result !== repaired) {
      const escapeCount = result.length - repaired.length + (repaired.match(/[\x00-\x1f]/g) || []).length;
      repairs.push(`escaped ${escapeCount} control characters in strings`);
      repaired = result;
    }
  }

  // Step 1b: Remove JavaScript-style comments (// and /* */) that smaller models add
  // Must be done carefully to not remove // inside string values
  {
    let result = '';
    let inString = false;
    let i = 0;

    while (i < repaired.length) {
      const char = repaired[i];

      // Handle escape sequences inside strings
      if (char === '\\' && inString && i + 1 < repaired.length) {
        result += char + repaired[i + 1];
        i += 2;
        continue;
      }

      // Track string boundaries
      if (char === '"') {
        inString = !inString;
        result += char;
        i++;
        continue;
      }

      // Outside strings, check for comments
      if (!inString) {
        // Single-line comment: // until end of line
        if (char === '/' && i + 1 < repaired.length && repaired[i + 1] === '/') {
          // Skip until newline
          while (i < repaired.length && repaired[i] !== '\n') {
            i++;
          }
          continue;
        }

        // Multi-line comment: /* ... */
        if (char === '/' && i + 1 < repaired.length && repaired[i + 1] === '*') {
          i += 2; // Skip /*
          while (i + 1 < repaired.length && !(repaired[i] === '*' && repaired[i + 1] === '/')) {
            i++;
          }
          i += 2; // Skip */
          continue;
        }
      }

      result += char;
      i++;
    }

    if (result !== repaired) {
      repairs.push('removed JavaScript comments');
      repaired = result;
    }
  }

  // Step 1c: Fix unescaped double quotes inside string values (common with Kimi K2.5).
  // Pattern: "text": "He said "something" and..." — the inner quotes break JSON parsing.
  // Strategy: when inside a string, a `"` that is NOT immediately followed by a JSON
  // structural character (`,`, `}`, `]`, `:`, `\n`, `\r`, or end-of-input) is an interior
  // quote and should be escaped. `:` is structural because it follows a KEY's closing
  // quote — without it this pass escaped every key close and corrupted even valid JSON
  // (latent in the historical OpenAIProvider copy, where repair only ran after a failed
  // parse; exposed once ClaudeProvider's direct-call tests hit the shared implementation).
  {
    let result = '';
    let i = 0;
    let fixCount = 0;

    while (i < repaired.length) {
      const char = repaired[i];

      // Pass through already-escaped sequences unchanged
      if (char === '\\' && i + 1 < repaired.length) {
        result += char + repaired[i + 1];
        i += 2;
        continue;
      }

      // Opening quote of a string
      if (char === '"') {
        result += char;
        i++;

        // Read string content, deciding for each `"` whether it closes the string
        while (i < repaired.length) {
          const sc = repaired[i];

          if (sc === '\\' && i + 1 < repaired.length) {
            result += sc + repaired[i + 1];
            i += 2;
            continue;
          }

          if (sc === '"') {
            // Peek at the first non-space/tab character after this quote
            let j = i + 1;
            while (j < repaired.length && (repaired[j] === ' ' || repaired[j] === '\t')) j++;
            const next = j < repaired.length ? repaired[j] : '';

            // These characters mean the string (key or value) is legitimately over
            const isStructural = next === ',' || next === '}' || next === ']' ||
                                 next === ':' ||
                                 next === '\n' || next === '\r' || next === '';

            if (isStructural) {
              result += sc; // closing quote
              i++;
              break;
            } else {
              result += '\\"'; // interior quote — escape it
              fixCount++;
              i++;
            }
            continue;
          }

          result += sc;
          i++;
        }
        continue;
      }

      result += char;
      i++;
    }

    if (fixCount > 0) {
      repairs.push(`escaped ${fixCount} unescaped interior quotes in strings`);
      repaired = result;
    }
  }

  // Step 2: Fix unquoted property names (common LLM error)
  // Match: { key: or , key: where key is not quoted
  // Be careful not to match inside strings
  const unquotedKeyPattern = /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  let hasUnquotedKeys = false;

  // First pass: check if we have unquoted keys (outside of strings)
  const testStr = repaired;
  let inStr = false;
  let escaped = false;
  let cleanedForTest = '';
  for (let i = 0; i < testStr.length; i++) {
    const c = testStr[i];
    if (escaped) { escaped = false; cleanedForTest += '_'; continue; }
    if (c === '\\') { escaped = true; cleanedForTest += '_'; continue; }
    if (c === '"') { inStr = !inStr; cleanedForTest += c; continue; }
    cleanedForTest += inStr ? '_' : c;
  }

  if (unquotedKeyPattern.test(cleanedForTest)) {
    hasUnquotedKeys = true;
  }

  if (hasUnquotedKeys) {
    // Replace unquoted keys with quoted ones, being careful about string context
    let result = '';
    let inString = false;
    let escape = false;
    let i = 0;

    while (i < repaired.length) {
      const char = repaired[i];

      if (escape) {
        result += char;
        escape = false;
        i++;
        continue;
      }

      if (char === '\\') {
        result += char;
        escape = true;
        i++;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        i++;
        continue;
      }

      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Outside string - check for unquoted key
      if ((char === '{' || char === ',')) {
        const rest = repaired.slice(i);
        const match = rest.match(/^([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
        if (match) {
          result += match[1] + '"' + match[2] + '":';
          i += match[0].length;
          continue;
        }
      }

      result += char;
      i++;
    }

    repaired = result;
    repairs.push('quoted unquoted property names');
  }

  // Step 3: Convert single quotes to double quotes (outside of double-quoted strings)
  let hasSingleQuotes = false;
  inStr = false;
  escaped = false;
  for (const c of repaired) {
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr && c === "'") { hasSingleQuotes = true; break; }
  }

  if (hasSingleQuotes) {
    let result = '';
    let inDoubleString = false;
    let inSingleString = false;
    let escape = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];

      if (escape) {
        result += char;
        escape = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escape = true;
        continue;
      }

      if (char === '"' && !inSingleString) {
        inDoubleString = !inDoubleString;
        result += char;
        continue;
      }

      if (char === "'" && !inDoubleString) {
        inSingleString = !inSingleString;
        result += '"'; // Convert to double quote
        continue;
      }

      result += char;
    }

    repaired = result;
    repairs.push('converted single quotes to double quotes');
  }

  // Step 4: Fix trailing commas before } or ]
  const beforeTrailing = repaired;
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  if (repaired !== beforeTrailing) {
    repairs.push('removed trailing commas');
  }

  // Step 5: Fix missing commas between properties/elements
  // Pattern: "value" "key" should be "value", "key"
  const beforeMissingComma = repaired;
  repaired = repaired.replace(/("\s*)(")(?=\s*"[^"]*"\s*:)/g, '$1,$2');
  // Pattern: } { or ] [ without comma
  repaired = repaired.replace(/(\})\s*(\{)/g, '$1,$2');
  repaired = repaired.replace(/(\])\s*(\[)/g, '$1,$2');
  // Pattern: "value" { or number {
  repaired = repaired.replace(/("|\d)\s*(\{)/g, '$1,$2');
  if (repaired !== beforeMissingComma) {
    repairs.push('added missing commas');
  }

  // Step 5b: Fix missing closing brace before next beat in array
  // Pattern: ], { "id": ... means beat object wasn't closed before next beat
  // Should be: ]}, { "id": ...
  const beforeMissingBrace = repaired;
  // Look for connections array ending with ],{ followed by "id" - missing } to close beat
  repaired = repaired.replace(/(\],)\s*(\{\s*"id"\s*:)/g, ']},\n    $2');
  if (repaired !== beforeMissingBrace) {
    repairs.push('added missing closing brace between beats');
  }

  // Step 6: Handle truncation - close open structures
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
  }

  // If in string, close it
  if (inString) {
    repaired += '"';
    repairs.push('closed unclosed string');
  }

  // Remove trailing incomplete content
  repaired = repaired.replace(/,\s*"[^"]*":\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*$/, '');
  repaired = repaired.replace(/,\s*$/, '');

  // Recount after cleanup — keep a LIFO stack of openers, not just counts:
  // truncated `{"a": [{"b": 1` must close as `}]}`, in nesting order.
  // (Count-based closing emitted all `]` then all `}`, which is invalid for
  // mixed nesting.)
  openBraces = 0;
  openBrackets = 0;
  inString = false;
  escape = false;
  const openStack: Array<'{' | '['> = [];
  for (const char of repaired) {
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') { openBraces++; openStack.push('{'); }
    else if (char === '}') { openBraces--; if (openStack[openStack.length - 1] === '{') openStack.pop(); }
    else if (char === '[') { openBrackets++; openStack.push('['); }
    else if (char === ']') { openBrackets--; if (openStack[openStack.length - 1] === '[') openStack.pop(); }
  }

  // Close open structures in reverse nesting order
  if (openBrackets > 0 || openBraces > 0) {
    while (openStack.length > 0) {
      repaired += openStack.pop() === '[' ? ']' : '}';
    }
    repairs.push(`closed ${openBrackets} brackets, ${openBraces} braces`);
  }

  // Remove extra closing braces (common smaller model error)
  // Pattern: `] }` where the } is spurious (e.g., after beats array closes)
  if (openBraces < 0) {
    const extraBraces = Math.abs(openBraces);
    // Find and remove extra } that appear after ] (array end followed by spurious brace)
    // Common pattern: `]\n  }` or `]\n}\n,`
    let removed = 0;
    // Look for pattern: ] followed by whitespace and } followed by whitespace and , or "
    // This catches the specific error where model adds extra } after array closes
    const extraBracePattern = /(\])\s*(\})\s*(,|")/g;
    const beforeRemove = repaired;
    while (removed < extraBraces) {
      const match = repaired.match(extraBracePattern);
      if (match) {
        repaired = repaired.replace(extraBracePattern, '$1$3');
        removed++;
      } else {
        break;
      }
    }
    // If pattern didn't catch all, try removing lone } before , (outside strings)
    if (removed < extraBraces) {
      // More aggressive: find any } that's followed by , and preceded by ] (possibly with whitespace)
      const loneExtraBrace = /(\][\s\n]*)\}([\s\n]*,)/g;
      while (removed < extraBraces && loneExtraBrace.test(repaired)) {
        repaired = repaired.replace(loneExtraBrace, '$1$2');
        removed++;
      }
    }
    if (repaired !== beforeRemove) {
      repairs.push(`removed ${removed} extra closing brace(s)`);
    }
  }

  // Remove extra closing brackets
  if (openBrackets < 0) {
    const extraBrackets = Math.abs(openBrackets);
    let removed = 0;
    // Look for pattern: } followed by whitespace and ] followed by whitespace and , or "
    const extraBracketPattern = /(\})\s*(\])\s*(,|")/g;
    const beforeRemove = repaired;
    while (removed < extraBrackets) {
      const match = repaired.match(extraBracketPattern);
      if (match) {
        repaired = repaired.replace(extraBracketPattern, '$1$3');
        removed++;
      } else {
        break;
      }
    }
    if (repaired !== beforeRemove) {
      repairs.push(`removed ${removed} extra closing bracket(s)`);
    }
  }

  if (repairs.length > 0) {
    console.log(`[repairJson] JSON repairs applied: ${repairs.join('; ')}`);
  }

  return repaired;
}

/**
 * repairJson() plus the ClaudeProvider quoted-key heuristic:
 *   "propertyName: "value"  →  "propertyName": "value"   (the Kimi case)
 *
 * The heuristic regex can false-positive on string VALUES that end with a
 * colon (e.g. `"label": "Values: "`), so callers should only reach for this
 * after plain repairJson() has failed — parseJSONWithRepair() does exactly
 * that.
 */
export function repairJsonAggressive(json: string): string {
  let repaired = json.trim();
  // Fix malformed property names missing the closing quote before the colon:
  // "description: "value"  →  "description": "value"
  repaired = repaired.replace(/"([^"]+):\s*"/g, '"$1": "');
  return repairJson(repaired);
}

/**
 * Extract and parse a JSON object from LLM response text, escalating through
 * the repair passes:
 *   1. extractJSON() candidate parsed as-is
 *   2. repairJson() (control chars, comments, quotes, commas, truncation, …)
 *   3. repairJsonAggressive() (adds the risky quoted-key heuristic)
 *
 * @throws when no `{` exists in the text, or when all repair passes fail —
 *         in that case the ORIGINAL parse error is propagated so callers can
 *         surface a meaningful message (e.g. truncation position).
 */
export function parseJSONWithRepair<T = any>(text: string): T {
  const candidate = extractJSON(text);
  try {
    return JSON.parse(candidate) as T;
  } catch (parseError) {
    try {
      return JSON.parse(repairJson(candidate)) as T;
    } catch {
      try {
        return JSON.parse(repairJsonAggressive(candidate)) as T;
      } catch {
        throw parseError;
      }
    }
  }
}
