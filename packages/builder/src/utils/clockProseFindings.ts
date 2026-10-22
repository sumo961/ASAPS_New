/**
 * Prose that names a clock time the story clock doesn't show (generation
 * review). "At 6:00 the alarm goes off" under a HUD reading 1:30 AM is the
 * case from The Reliable One (2026-10-21): the generator set the clock on one
 * path only and left the others behind.
 *
 * Only the time of day is followed: a "set" puts the clock at its hour and
 * minute, minute/hour advances move it, day-and-longer advances leave it.
 * A finding needs the clock visible on the beat, every way in known, and at
 * least one of them more than half an hour off the time in the text (the
 * gates on the way are not evaluated: a path they rule out still counts).
 */
import { beatLinks } from './storyLinks';

const DAY = 24 * 60;
const TOLERANCE = 30;
/** More distinct times than this at one beat: stop following (unknown). */
const MAX_TIMES = 12;
const DATE_ONLY = new Set(['date', 'day-number', 'year']);

export interface ClockProseMismatch {
  beatId: string;
  beatName?: string;
  /** Minutes after midnight the text names (first reading of an ambiguous hour). */
  named: number;
  /** Minutes after midnight the clock can show on arrival that don't fit the text. */
  shown: number[];
}

/** Clock times a beat's text opens with: "01:30.", "At 6:00 …", "At 9 a.m. …". Several readings for a bare 1–12 hour. */
export function namedTimeOfDay(text: string): number[] | null {
  const head = text.replace(/[*_]/g, '').trimStart().slice(0, 40);
  const m = head.match(/^(?:at\s+|it'?s\s+|it is\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?=[\s.,;:!?—–-]|$)/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  // A bare number ("At 6 …") is too often a count; a time needs minutes or am/pm.
  if (m[2] === undefined && !m[3]) return null;
  if (hour > 23 || minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    const pm = /^p/i.test(m[3]);
    return [((hour % 12) + (pm ? 12 : 0)) * 60 + minute];
  }
  const at = hour * 60 + minute;
  return hour >= 1 && hour <= 12 ? [at, (at + 12 * 60) % DAY] : [at];
}

function beatText(beat: any): string {
  const p = beat?.parameters ?? {};
  for (const v of [p.text, p.question, p.message, p.prompt, p.dialogTree?.text]) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

function minutesOf(unit: string, value: number): number | 'none' | null {
  const u = unit.toLowerCase().replace(/s$/, '');
  if (u === 'minute') return value;
  if (u === 'hour') return value * 60;
  if (['day', 'week', 'month', 'year'].includes(u)) return 'none';
  return null;
}

type ClockStep = { set: number } | { by: number };

/** What a beat does to the clock's time of day: undefined = nothing, null = unknowable. */
function clockStep(beat: any): ClockStep | null | undefined {
  const p = beat?.parameters ?? {};
  if (beat?.type !== 'setVariable' || p.type !== 'fictionalTime') return undefined;
  const op = String(p.operation ?? 'set');
  if (op === 'set') {
    const h = Number(p.timeHour ?? 9);
    const m = Number(p.timeMinute ?? 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return { set: (h * 60 + m) % DAY };
  }
  const value = Number(p.value ?? p.amount ?? 0);
  const delta = minutesOf(String(p.timeUnit ?? p.unit ?? ''), value);
  if (delta === null || !Number.isFinite(value)) return null;
  if (delta === 'none') return undefined;
  return { by: delta };
}

export function findClockProseMismatches(story: any, startId: string | null): ClockProseMismatch[] {
  const beats: any[] = Array.isArray(story?.beats) ? story.beats : [];
  const byId = new Map<string, any>(beats.filter((b) => b?.id).map((b) => [b.id, b]));
  if (!startId || !byId.has(startId)) return [];
  const sets = beats.filter((b) => b?.type === 'setVariable' && b?.parameters?.type === 'fictionalTime');
  if (sets.length === 0) return [];
  const format = story?.globalSettings?.hudOverlays?.fictionalTime?.displayFormat ?? story?.globalSettings?.fictionalTime?.displayFormat;
  if (typeof format === 'string' && DATE_ONLY.has(format)) return [];

  // Times of day the clock can show on arriving at each beat. 'unset' = the
  // clock hasn't been set on this way in (its start time lives elsewhere);
  // null = unknowable (too many, or an advance we can't read).
  type Times = Set<number | 'unset'> | null;
  const arrive = new Map<string, Times>();
  const merge = (id: string, incoming: Times): boolean => {
    const have = arrive.get(id);
    if (have === null) return false;
    if (incoming === null) { arrive.set(id, null); return true; }
    const next = new Set(have ?? []);
    const before = next.size;
    incoming.forEach((t) => next.add(t));
    if (next.size > MAX_TIMES) { arrive.set(id, null); return true; }
    if (have !== undefined && next.size === before) return false;
    arrive.set(id, next);
    return true;
  };
  merge(startId, new Set(['unset']));
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    const beat = byId.get(id);
    const into = arrive.get(id);
    const step = clockStep(beat);
    let out: Times;
    if (into === null || step === null) out = null;
    else if (step === undefined) out = into!;
    else if ('set' in step) out = new Set([step.set]);
    else out = new Set([...into!].map((t) => (t === 'unset' ? 'unset' : (((t + step.by) % DAY) + DAY) % DAY)));
    for (const link of beatLinks(beat)) {
      if (byId.has(link.target) && merge(link.target, out)) queue.push(link.target);
    }
  }

  const found: ClockProseMismatch[] = [];
  for (const beat of beats) {
    const mode = beat?.timeDisplayMode ?? beat?.parameters?.timeDisplayMode;
    if (mode === 'none' || mode === 'manual') continue;
    const named = namedTimeOfDay(beatText(beat));
    if (!named) continue;
    const times = arrive.get(beat.id);
    if (!times || times.size === 0 || times.has('unset')) continue;
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), DAY - Math.abs(a - b)) <= TOLERANCE;
    const off = ([...times] as number[]).filter((s) => !named.some((n) => near(s, n)));
    if (off.length === 0) continue;
    const fits = named.find((n) => [...times].some((s) => near(s as number, n)));
    found.push({ beatId: beat.id, beatName: beat.name, named: fits ?? named[0], shown: off.sort((a, b) => a - b) });
  }
  return found;
}

export function showTimeOfDay(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
