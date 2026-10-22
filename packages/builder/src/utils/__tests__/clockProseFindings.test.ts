import { describe, it, expect } from 'vitest';
import { findClockProseMismatches, namedTimeOfDay } from '../clockProseFindings';
import { analyzeStoryFindings } from '../generationReview';

const set = (id: string, h: number, m: number, to: string) => ({ id, name: id, type: 'setVariable', parameters: { type: 'fictionalTime', operation: 'set', timeYear: 2024, timeMonth: 5, timeDay: 13, timeHour: h, timeMinute: m, connection: { target: to } } });
const advance = (id: string, value: number, timeUnit: string, to: string) => ({ id, name: id, type: 'setVariable', parameters: { type: 'fictionalTime', operation: 'advance', value, timeUnit, connection: { target: to } } });
const text = (id: string, t: string, to?: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'infoText', parameters: { text: t, ...(to ? { connection: { target: to } } : {}) }, ...extra });
const ending = (id: string, message: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'endScreen', parameters: { message, ...extra } });
const choice = (id: string, q: string, targets: string[]) => ({ id, name: id, type: 'multiChoice', parameters: { question: q, choices: targets.map((t, i) => ({ id: `c${i}`, text: t, target: t })) } });
const story = (beats: any[]) => ({ metadata: { title: 't' }, beats });
const ids = (s: any) => findClockProseMismatches(s, s.beats[0].id).map((m) => m.beatId);

describe('namedTimeOfDay', () => {
  it('reads a time the text opens with', () => {
    expect(namedTimeOfDay('01:30. The phone buzzes.')).toEqual([90, 810]);
    expect(namedTimeOfDay('23:48. Your desk lamp')).toEqual([1428]);
    expect(namedTimeOfDay('At 6:00 the alarm goes off')).toEqual([360, 1080]);
    expect(namedTimeOfDay('At 9 a.m. the exam starts')).toEqual([540]);
    expect(namedTimeOfDay("It's 11:15 pm.")).toEqual([1395]);
  });
  it('ignores counts and times later in the text', () => {
    expect(namedTimeOfDay('At 6 people arrive')).toBeNull();
    expect(namedTimeOfDay('The alarm is set for 6:00.')).toBeNull();
    expect(namedTimeOfDay('3 apples')).toBeNull();
  });
});

describe('findClockProseMismatches', () => {
  it('flags an ending that names the morning while a way in leaves the clock at night (The Reliable One)', () => {
    const s = story([
      set('clock', 23, 48, 'night'),
      choice('night', '23:48. Danny calls.', ['late', 'drive']),
      set('late', 1, 30, 'text130'),
      text('text130', '01:30. The phone buzzes again.', 'end'),
      set('drive', 5, 40, 'end'),
      ending('end', 'At 6:00 the alarm goes off.'),
    ]);
    const found = findClockProseMismatches(s, 'clock');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ beatId: 'end', named: 360, shown: [90] });
  });

  it('follows minute and hour advances; day advances keep the time of day', () => {
    const s = story([
      set('clock', 23, 0, 'wait'),
      advance('wait', 90, 'minutes', 'a'),
      text('a', '00:30. Still awake.', 'days'),
      advance('days', 2, 'days', 'b'),
      text('b', '00:30. Two nights later.'),
    ]);
    expect(ids(s)).toEqual([]);
  });

  it('stays quiet when the clock is hidden on the beat or only shows the date', () => {
    const night = [set('clock', 1, 30, 'end')];
    expect(ids(story([...night, ending('end', 'At 6:00 the alarm.', { timeDisplayMode: 'none' })]))).toEqual([]);
    expect(ids(story([...night, { ...ending('end', 'At 6:00 the alarm.'), timeDisplayMode: 'none' }]))).toEqual([]);
    expect(ids(story([...night, ending('end', 'At 6:00 the alarm.')]))).toEqual(['end']);
    const dateOnly: any = story([...night, ending('end', 'At 6:00 the alarm.')]);
    dateOnly.globalSettings = { hudOverlays: { fictionalTime: { displayFormat: 'date' } } };
    expect(ids(dateOnly)).toEqual([]);
  });

  it('stays quiet before the story sets its clock, and in stories without one', () => {
    expect(ids(story([text('a', 'At 6:00 the alarm.', 'clock'), set('clock', 1, 0, 'b'), text('b', 'Later.')]))).toEqual([]);
    expect(ids(story([text('a', 'At 6:00 the alarm.')]))).toEqual([]);
  });

  it('allows half an hour of leeway', () => {
    expect(ids(story([set('clock', 5, 40, 'end'), ending('end', 'At 6:00 the alarm.')]))).toEqual([]);
    expect(ids(story([set('clock', 5, 20, 'end'), ending('end', 'At 6:00 the alarm.')]))).toEqual(['end']);
  });

  it('becomes a review finding with advice', () => {
    const findings = analyzeStoryFindings(story([set('clock', 1, 30, 'end'), ending('end', 'At 6:00 the alarm goes off.')]));
    const f = findings.find((x) => x.kind === 'clock-prose');
    expect(f?.message).toContain('says it is 6:00, but the story clock can show 1:30');
    expect(f?.message).toContain('Set the clock just before this beat.');
    // Info Text has the Time Display menu; an End Screen doesn't.
    const onText = analyzeStoryFindings(story([set('clock', 1, 30, 'b'), text('b', 'At 6:00 the alarm goes off.')]));
    expect(onText.find((x) => x.kind === 'clock-prose')?.message).toContain('Time Display: None');
  });
});
