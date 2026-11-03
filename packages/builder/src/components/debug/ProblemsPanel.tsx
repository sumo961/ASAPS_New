import React, { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, Search } from 'lucide-react';
import type { Story } from '@asaps/core';
import { searchSituations } from '../../services/storySimulation';
import { collectProblems, type Problem, type ProblemSeverity } from './problems';
import { MayBeReachable, SearchLimitNote } from './SimulationGate';

const SECTION: Record<ProblemSeverity, { title: string; icon: React.ReactNode; box: string }> = {
  error: { title: 'Errors: players get stuck or miss something', icon: <AlertCircle className="w-4 h-4 text-red-600" />, box: 'border-red-200 bg-red-50' },
  warning: { title: 'Warnings: worth checking', icon: <AlertTriangle className="w-4 h-4 text-amber-600" />, box: 'border-amber-200 bg-amber-50' },
  note: { title: 'Notes: may be intended', icon: <Info className="w-4 h-4 text-blue-500" />, box: 'border-blue-100 bg-blue-50' },
};

/** Everything the debug tools found wrong, in one list. */
export const ProblemsPanel: React.FC<{ story: Story; onHighlightBeat?: (beatId: string) => void }> = ({ story, onHighlightBeat }) => {
  const [search, setSearch] = useState('');
  const simulation = useMemo(() => searchSituations(story), [story]);
  const problems = useMemo(() => collectProblems(story, simulation), [story, simulation]);
  const term = search.trim().toLowerCase();
  const shown = term
    ? problems.filter((p) => `${p.label} ${p.beatName} ${p.message}`.toLowerCase().includes(term))
    : problems;

  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded border border-green-200 bg-green-50 text-sm text-green-800">
        <CheckCircle className="w-4 h-4" />
        {!simulation.analyzer.searchLimited ? 'No problems found.'
          : simulation.analyzer.searchLimitReason === 'replays' ? 'No problems found, but the search followed only a few replays of a Restart that keeps values.'
            : 'No problems found, but this story is too large to try every way through.'}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="problems-panel">
      {simulation.analyzer.searchLimited && <SearchLimitNote reason={simulation.analyzer.searchLimitReason} unsure={problems.filter((p) => p.unsure).length} afterReplays={problems.filter((p) => p.afterReplays).length} />}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${problems.length} problems…`}
          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm"
        />
      </div>
      {(['error', 'warning', 'note'] as ProblemSeverity[]).map((severity) => {
        const list = shown.filter((p) => p.severity === severity);
        if (list.length === 0) return null;
        return (
          <section key={severity}>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
              {SECTION[severity].icon}
              {SECTION[severity].title} ({list.length})
            </h3>
            <ul className="space-y-1.5">
              {list.map((p) => <ProblemRow key={p.id} problem={p} box={SECTION[severity].box} onHighlightBeat={onHighlightBeat} />)}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-gray-500">Check with AI, in Story Logic, also reads what each beat says against how players got there.</p>
    </div>
  );
};

const ProblemRow: React.FC<{ problem: Problem; box: string; onHighlightBeat?: (beatId: string) => void }> = ({ problem: p, box, onHighlightBeat }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className={`p-2 rounded border text-xs ${box}`}>
      <button type="button" onClick={() => onHighlightBeat?.(p.beatId)} className="font-medium text-gray-900 hover:underline text-left">
        {p.label}: {p.beatName}
      </button>
      {p.behindIt > 0 && <span className="font-medium text-gray-700">, {p.behindIt} more {p.behindIt === 1 ? 'beat' : 'beats'} behind it</span>}
      {p.more.length > 0 && <span className="ml-1 text-gray-500">×{p.more.length + 1}</span>}
      {p.unsure && <MayBeReachable afterReplays={p.afterReplays} />}
      <div className="text-gray-700 mt-0.5">{p.message}</div>
      {p.more.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-blue-600 hover:underline mt-0.5">
            {open ? 'Show fewer' : `Show ${p.more.length} more`}
          </button>
          {open && <ul className="mt-1 space-y-1 text-gray-700">{p.more.map((m) => <li key={m}>{m}</li>)}</ul>}
        </>
      )}
    </li>
  );
};
