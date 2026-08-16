/**
 * Tripwire: nobody re-implements the link walk.
 *
 * There were six private copies of "which beat does this beat point at", and
 * every disagreement between them was a shipped bug — the worst being a
 * validator that reported an injected story VALID while its links pointed at
 * beats that did not exist. The copies are gone; this test is here so a
 * seventh cannot appear quietly.
 *
 * If it fails: use `beatLinks` / `storyLinks` from utils/storyLinks instead of
 * walking beat parameters yourself. If a beat type gained a new target field,
 * add it to storyLinks — every consumer learns it at once.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** Files allowed to know the shapes: the authority and its tests. */
const ALLOWED = [
  join('utils', 'storyLinks.ts'),
];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
};

describe('storyLinks is the only link walk', () => {
  const files = walk(SRC).filter(f => !ALLOWED.some(a => f.endsWith(a)));

  it('no file re-declares a dialog-tree target extractor', () => {
    const offenders = files.filter(f =>
      /extractDialog(Tree)?Targets|function\s+extractTargetIds/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => f.replace(SRC, ''))).toEqual([]);
  });

  it('no file outside the authority walks trueConnection/falseConnection for link graphs', () => {
    // Reading the field to MIGRATE it (importers rewrite trueConnection into
    // trueTarget) is legitimate; collecting it into a targets/edges list is
    // the pattern that forked six times. Heuristic: both connection sides
    // read AND pushed within one file.
    const offenders = files.filter(f => {
      const src = readFileSync(f, 'utf8');
      return /trueConnection\?\.target/.test(src)
        && /falseConnection\?\.target/.test(src)
        && /(targets?\.push|addEdge|targetedBeatIds\.add|connectionsToCreate\.push)/.test(src);
    });
    expect(offenders.map(f => f.replace(SRC, ''))).toEqual([]);
  });
});
