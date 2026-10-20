/**
 * A runCommand mock that answers by git subcommand rather than call order,
 * so a test of one operation doesn't break when the operation adds a check
 * (e.g. gitPull's "on a branch?" and duplicate-id steps).
 */
import { vi } from 'vitest';

type Result = { stdout: string; stderr: string; exitCode: number };
const ok = (stdout = ''): Result => ({ stdout, stderr: '', exitCode: 0 });

export function gitRouter(routes: Record<string, Result | Result[]>) {
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  return vi.fn(async (_cmd: string, args: string[]) => {
    const key = args[0];
    const q = queues.get(key);
    if (q && q.length) return q.length > 1 ? q.shift()! : q[0];
    if (key === 'symbolic-ref') return ok('main\n');
    if (key === 'rev-parse') return { stdout: '', stderr: '', exitCode: 1 }; // no MERGE_HEAD / HEAD^2
    return ok();
  });
}
