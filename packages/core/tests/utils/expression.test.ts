import { describe, it, expect } from 'vitest';
import {
  isArithmeticExpression,
  evaluateArithmeticExpression,
  createContextResolver,
  coerceNumeric,
  type NumericRefResolver,
} from '../../src/utils/expression';
import { StoryContext } from '../../src/engine/StoryContext';

/** Resolver over a plain map for pure-parser tests. */
function mapResolver(values: Record<string, number>): NumericRefResolver {
  return (ref) =>
    Object.prototype.hasOwnProperty.call(values, ref) ? values[ref] : null;
}

const none: NumericRefResolver = () => null;

describe('isArithmeticExpression', () => {
  it('accepts strings with leading = (optionally after whitespace)', () => {
    expect(isArithmeticExpression('=1+2')).toBe(true);
    expect(isArithmeticExpression('= (a + b) / 100')).toBe(true);
    expect(isArithmeticExpression('  = 5')).toBe(true);
  });

  it('rejects non-expression values', () => {
    expect(isArithmeticExpression('5+3')).toBe(false);
    expect(isArithmeticExpression('hello')).toBe(false);
    expect(isArithmeticExpression('=')).toBe(false); // nothing after =
    expect(isArithmeticExpression('=  ')).toBe(false);
    expect(isArithmeticExpression(5)).toBe(false);
    expect(isArithmeticExpression(null)).toBe(false);
    expect(isArithmeticExpression(undefined)).toBe(false);
    expect(isArithmeticExpression({})).toBe(false);
  });
});

describe('evaluateArithmeticExpression - literals and operators', () => {
  it('evaluates numeric literals', () => {
    expect(evaluateArithmeticExpression('= 42', none)).toBe(42);
    expect(evaluateArithmeticExpression('=3.5', none)).toBe(3.5);
    expect(evaluateArithmeticExpression('= .5', none)).toBe(0.5);
  });

  it('works without the leading = (prefix is optional at this layer)', () => {
    expect(evaluateArithmeticExpression('1 + 2', none)).toBe(3);
  });

  it('applies operator precedence (* / before + -)', () => {
    expect(evaluateArithmeticExpression('= 2 + 3 * 4', none)).toBe(14);
    expect(evaluateArithmeticExpression('= 20 - 10 / 2', none)).toBe(15);
    expect(evaluateArithmeticExpression('= 2 * 3 + 4 * 5', none)).toBe(26);
  });

  it('is left-associative for same-precedence operators', () => {
    expect(evaluateArithmeticExpression('= 10 - 4 - 3', none)).toBe(3);
    expect(evaluateArithmeticExpression('= 100 / 10 / 2', none)).toBe(5);
  });

  it('respects parentheses', () => {
    expect(evaluateArithmeticExpression('= (2 + 3) * 4', none)).toBe(20);
    expect(evaluateArithmeticExpression('= ((1 + 1) * (2 + 3))', none)).toBe(10);
  });

  it('handles unary minus (and unary plus)', () => {
    expect(evaluateArithmeticExpression('= -5', none)).toBe(-5);
    expect(evaluateArithmeticExpression('= -5 + 3', none)).toBe(-2);
    expect(evaluateArithmeticExpression('= 2 * -3', none)).toBe(-6);
    expect(evaluateArithmeticExpression('= -(2 + 3)', none)).toBe(-5);
    expect(evaluateArithmeticExpression('= +7', none)).toBe(7);
  });

  it('returns null on division by zero (never NaN/Infinity)', () => {
    expect(evaluateArithmeticExpression('= 10 / 0', none)).toBeNull();
    expect(evaluateArithmeticExpression('= 5 / (3 - 3)', none)).toBeNull();
    expect(evaluateArithmeticExpression('= 0 / 0', none)).toBeNull();
  });

  it('returns null on syntax errors', () => {
    expect(evaluateArithmeticExpression('= 1 +', none)).toBeNull();
    expect(evaluateArithmeticExpression('= (1 + 2', none)).toBeNull();
    expect(evaluateArithmeticExpression('= 1 2', none)).toBeNull();
    expect(evaluateArithmeticExpression('= 1 ** 2', none)).toBeNull();
    expect(evaluateArithmeticExpression('= foo(1)', mapResolver({ foo: 1 }))).toBeNull();
    expect(evaluateArithmeticExpression('= 1 + "x"', none)).toBeNull();
    expect(evaluateArithmeticExpression('=', none)).toBeNull();
  });
});

describe('evaluateArithmeticExpression - references', () => {
  const resolver = mapResolver({ score: 10, gold: 40, 'alice.trust': 7 });

  it('resolves plain identifiers', () => {
    expect(evaluateArithmeticExpression('= score + gold', resolver)).toBe(50);
  });

  it('resolves ${name} syntax', () => {
    expect(evaluateArithmeticExpression('= (${score} + ${gold}) / 100', resolver)).toBe(0.5);
  });

  it('resolves $name$ legacy syntax', () => {
    expect(evaluateArithmeticExpression('= $score$ * 2', resolver)).toBe(20);
  });

  it('resolves bare {name} syntax', () => {
    expect(evaluateArithmeticExpression('= {gold} - {score}', resolver)).toBe(30);
  });

  it('mixes syntaxes in one expression', () => {
    expect(evaluateArithmeticExpression('= ${score} + $gold$ + {score} + gold', resolver)).toBe(100);
  });

  it('resolves dotted character-scoped refs (plain and braced)', () => {
    expect(evaluateArithmeticExpression('= alice.trust + 3', resolver)).toBe(10);
    expect(evaluateArithmeticExpression('= ${alice.trust} * 2', resolver)).toBe(14);
  });

  it('returns null for unknown identifiers', () => {
    expect(evaluateArithmeticExpression('= unknown + 1', resolver)).toBeNull();
    expect(evaluateArithmeticExpression('= ${missing}', resolver)).toBeNull();
    expect(evaluateArithmeticExpression('= score + nope', resolver)).toBeNull();
  });
});

describe('coerceNumeric', () => {
  it('passes through finite numbers and numeric strings', () => {
    expect(coerceNumeric(5)).toBe(5);
    expect(coerceNumeric(-2.5)).toBe(-2.5);
    expect(coerceNumeric('42')).toBe(42);
    expect(coerceNumeric(' 3.5 ')).toBe(3.5);
  });

  it('rejects non-numeric values', () => {
    expect(coerceNumeric('hello')).toBeNull();
    expect(coerceNumeric('')).toBeNull();
    expect(coerceNumeric(NaN)).toBeNull();
    expect(coerceNumeric(Infinity)).toBeNull();
    expect(coerceNumeric(true)).toBeNull();
    expect(coerceNumeric(null)).toBeNull();
    expect(coerceNumeric(undefined)).toBeNull();
    expect(coerceNumeric({})).toBeNull();
  });
});

describe('createContextResolver (against StoryContext)', () => {
  it('resolves variables first, then counters', () => {
    const context = new StoryContext();
    context.setVariable('score', 10); // variable wins over any counter
    context.setCounter('score', 999);
    context.setCounter('gold', 40);
    const resolve = createContextResolver(context);

    expect(resolve('score')).toBe(10);
    expect(resolve('gold')).toBe(40);
  });

  it('coerces numeric-string variables and fails non-numeric ones', () => {
    const context = new StoryContext();
    context.setVariable('strNum', '25');
    context.setVariable('word', 'hello');
    const resolve = createContextResolver(context);

    expect(resolve('strNum')).toBe(25);
    expect(resolve('word')).toBeNull();
  });

  it('fails for identifiers that exist nowhere (no default-0 for unset counters)', () => {
    const context = new StoryContext();
    const resolve = createContextResolver(context);
    expect(resolve('nothing')).toBeNull();
  });

  it('resolves character-scoped counters via owner.counter', () => {
    const context = new StoryContext();
    context.setCharacterCounter('alice', 'trust', 7);
    const resolve = createContextResolver(context);

    expect(resolve('alice.trust')).toBe(7);
    expect(resolve('alice.unknown')).toBeNull();
    expect(resolve('bob.trust')).toBeNull();
  });

  it('evaluates the motivating example end-to-end', () => {
    const context = new StoryContext();
    context.setVariable('variable1', 30);
    context.setVariable('variable2', 70);
    const resolve = createContextResolver(context);

    expect(
      evaluateArithmeticExpression('= (variable1 + variable2) / 100', resolve)
    ).toBe(1);
  });
});
