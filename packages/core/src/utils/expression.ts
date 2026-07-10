/**
 * Safe arithmetic expression evaluator for story authoring.
 *
 * Lets authors compute values in setVariable beats, e.g.
 *   value: "= (var1 + var2) / 100"
 *
 * Design goals:
 * - NO eval / new Function — a hand-rolled tokenizer + recursive-descent parser.
 * - Opt-in: authors prefix the value with '=' (spreadsheet convention), so
 *   existing stories where value "5+3" means the literal string "5+3" keep working.
 * - Clean failure: division by zero, unknown identifiers, non-numeric variable
 *   values, or syntax errors all return `null` — NaN/Infinity never leaks into
 *   story state.
 *
 * Supported grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := ('-' | '+') factor | number | ref | '(' expr ')'
 *
 * Variable/counter references support the same syntaxes the runtime already
 * uses in Beat.processText — ${name}, $name$, {name} — plus plain identifiers
 * (e.g. `score`, `gold`). References resolve against story variables first,
 * then story-global counters. Character-scoped counters use a dotted ref:
 * `owner.counter` (or `${owner.counter}` when the character name contains
 * spaces, split at the LAST dot), e.g. `alice.trust`.
 */

export type NumericRefResolver = (ref: string) => number | null;

/** Minimal structural slice of StoryContext used to resolve references. */
export interface NumericScope {
  getVariable(name: string): unknown;
  getCounters(): Record<string, number>;
  getCharacterState?(charRef: string): { counters: Record<string, number> };
}

const EXPR_PREFIX = /^\s*=/;

/**
 * True when the value opts in to expression evaluation: a string starting
 * with '=' (after optional whitespace) with something after it.
 */
export function isArithmeticExpression(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    EXPR_PREFIX.test(value) &&
    value.replace(EXPR_PREFIX, '').trim().length > 0
  );
}

/**
 * Coerce a raw variable value to a finite number, or null when it isn't one.
 * Numeric strings ("42", "3.5") count; booleans/objects/NaN do not.
 */
export function coerceNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Build a NumericRefResolver over a StoryContext(-like) scope.
 *
 * Resolution rules (strict — an unresolvable ref fails the whole expression):
 * - `owner.counter` (dotted, split at last dot): character-scoped counter;
 *   resolves only if that counter has been set for that character.
 * - plain name: variables first (must coerce to a number), then story-global
 *   counters (only if the counter has actually been set — unset counters do
 *   NOT default to 0 inside expressions, so typos fail loudly).
 */
export function createContextResolver(scope: NumericScope): NumericRefResolver {
  return (ref: string): number | null => {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    const dot = trimmed.lastIndexOf('.');
    if (dot > 0 && dot < trimmed.length - 1) {
      const owner = trimmed.slice(0, dot).trim();
      const counter = trimmed.slice(dot + 1).trim();
      const counters = scope.getCharacterState?.(owner)?.counters;
      if (counters && Object.prototype.hasOwnProperty.call(counters, counter)) {
        return coerceNumeric(counters[counter]);
      }
      return null;
    }

    const variable = scope.getVariable(trimmed);
    if (variable !== undefined && variable !== null) {
      // A variable with this name exists — it must be numeric. Do NOT fall
      // through to a same-named counter; that would silently mix state.
      return coerceNumeric(variable);
    }

    const counters = scope.getCounters();
    if (Object.prototype.hasOwnProperty.call(counters, trimmed)) {
      return coerceNumeric(counters[trimmed]);
    }

    return null;
  };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

const ID_START = /[A-Za-z_]/;
const ID_CHAR = /[A-Za-z0-9_]/;
const LEGACY_DOLLAR = /^\$([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\$/;
const NUMBER = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)/;

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ kind: 'op', op: c });
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const m = NUMBER.exec(src.slice(i));
      if (!m) return null;
      tokens.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '.') {
      // Leading-dot decimal (.5)
      const m = NUMBER.exec(src.slice(i));
      if (!m) return null;
      tokens.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '$') {
      if (src[i + 1] === '{') {
        // ${name}
        const close = src.indexOf('}', i + 2);
        if (close === -1) return null;
        const name = src.slice(i + 2, close).trim();
        if (!name) return null;
        tokens.push({ kind: 'ref', name });
        i = close + 1;
        continue;
      }
      // $name$ (legacy ASML)
      const m = LEGACY_DOLLAR.exec(src.slice(i));
      if (!m) return null;
      tokens.push({ kind: 'ref', name: m[1] });
      i += m[0].length;
      continue;
    }
    if (c === '{') {
      // bare {name}
      const close = src.indexOf('}', i + 1);
      if (close === -1) return null;
      const name = src.slice(i + 1, close).trim();
      if (!name) return null;
      tokens.push({ kind: 'ref', name });
      i = close + 1;
      continue;
    }
    if (ID_START.test(c)) {
      // plain identifier, optionally dotted (owner.counter)
      let j = i + 1;
      while (j < n && ID_CHAR.test(src[j])) j++;
      if (src[j] === '.' && j + 1 < n && ID_START.test(src[j + 1])) {
        let k = j + 2;
        while (k < n && ID_CHAR.test(src[k])) k++;
        tokens.push({ kind: 'ref', name: src.slice(i, k) });
        i = k;
        continue;
      }
      tokens.push({ kind: 'ref', name: src.slice(i, j) });
      i = j;
      continue;
    }

    // Unknown character — not an arithmetic expression we support.
    return null;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent, throws internally; callers get null)
// ---------------------------------------------------------------------------

class ExpressionError extends Error {}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly resolve: NumericRefResolver
  ) {}

  parse(): number {
    const value = this.parseExpr();
    if (this.pos !== this.tokens.length) {
      throw new ExpressionError('Unexpected trailing tokens');
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
        this.pos++;
        const rhs = this.parseTerm();
        value = t.op === '+' ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.op === '*' || t.op === '/')) {
        this.pos++;
        const rhs = this.parseFactor();
        if (t.op === '/') {
          if (rhs === 0) throw new ExpressionError('Division by zero');
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      } else {
        return value;
      }
    }
  }

  private parseFactor(): number {
    const t = this.peek();
    if (!t) throw new ExpressionError('Unexpected end of expression');

    if (t.kind === 'op' && (t.op === '-' || t.op === '+')) {
      this.pos++;
      const value = this.parseFactor();
      return t.op === '-' ? -value : value;
    }
    if (t.kind === 'num') {
      this.pos++;
      return t.value;
    }
    if (t.kind === 'ref') {
      this.pos++;
      const resolved = this.resolve(t.name);
      if (resolved === null || !Number.isFinite(resolved)) {
        throw new ExpressionError(`Unresolvable reference '${t.name}'`);
      }
      return resolved;
    }
    if (t.kind === 'lparen') {
      this.pos++;
      const value = this.parseExpr();
      const close = this.peek();
      if (close?.kind !== 'rparen') {
        throw new ExpressionError('Missing closing parenthesis');
      }
      this.pos++;
      return value;
    }

    throw new ExpressionError('Unexpected token');
  }
}

/**
 * Evaluate an arithmetic expression against the given reference resolver.
 * A leading '=' (spreadsheet opt-in prefix) is stripped if present.
 *
 * Returns the finite numeric result, or `null` on any failure (syntax error,
 * unknown reference, division by zero, non-finite result). Never NaN.
 */
export function evaluateArithmeticExpression(
  expression: string,
  resolve: NumericRefResolver
): number | null {
  if (typeof expression !== 'string') return null;
  const src = expression.replace(EXPR_PREFIX, '');
  const tokens = tokenize(src);
  if (!tokens || tokens.length === 0) return null;
  try {
    const result = new Parser(tokens, resolve).parse();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
