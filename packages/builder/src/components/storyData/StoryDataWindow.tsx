/**
 * Story Data: the story's variables and counters in one place, each with
 * the beats that set it, test it and show it. Variables are edited here;
 * a story counter exists as soon as an effect changes it, and a character's
 * counters are edited on the character (Characters), so both are listed
 * with their uses and a way across.
 */
import React, { useMemo, useState } from 'react';
import { Hash, Variable } from 'lucide-react';
import { storyDataUsage, type StoryDataUse } from '@asaps/core';
import { VariablesPanel, type StoryVariable } from './VariablesPanel';

interface BeatLike { id: string; name?: string; type: string }
interface CharacterLike { id?: string; name: string; displayName?: string; role?: string; counters?: Array<{ name: string; displayName?: string; value?: number; source?: unknown }> }

interface Props {
  variables: StoryVariable[];
  onVariablesChange: (variables: StoryVariable[]) => void;
  beats: ReadonlyArray<BeatLike>;
  characters: ReadonlyArray<CharacterLike>;
  /** Cast roles: an effect on @confidant's counter is listed with every character who can play the confidant. */
  roles?: ReadonlyArray<{ id: string; candidates?: string[] }>;
  /** Select the beat in the editor (the window closes so it can be seen). */
  onGoToBeat: (beatId: string) => void;
  /** Open the Characters window, where a character's counters are edited. */
  onOpenCharacters?: () => void;
}

type View = 'variables' | 'counters';

const merged = (uses: StoryDataUse[]) => ({
  sets: [...new Set(uses.flatMap((u) => u.sets))],
  tests: [...new Set(uses.flatMap((u) => u.tests))],
  shows: [...new Set(uses.flatMap((u) => [...u.shows, ...u.displays]))],
});

export const StoryDataWindow: React.FC<Props> = ({ variables, onVariablesChange, beats, characters, roles = [], onGoToBeat, onOpenCharacters }) => {
  const [view, setView] = useState<View>('variables');
  const uses = useMemo(() => storyDataUsage(beats as any), [beats]);
  const beatName = useMemo(() => new Map(beats.map((b) => [b.id, b.name?.trim() || b.id])), [beats]);

  const BeatList: React.FC<{ label: string; ids: string[]; empty: string }> = ({ label, ids, empty }) => (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 shrink-0 text-gray-500 pt-0.5">{label}</span>
      {ids.length === 0 ? (
        <span className="text-gray-400 pt-0.5">{empty}</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <button
              key={id}
              onClick={() => onGoToBeat(id)}
              className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-800"
              title="Go to this beat"
            >
              {beatName.get(id) ?? id}
            </button>
          ))}
        </span>
      )}
    </div>
  );

  const Usage: React.FC<{ of: StoryDataUse[]; testid?: string; follows?: boolean }> = ({ of, testid, follows }) => {
    const u = merged(of);
    return (
      <div className="space-y-1 pt-1" data-testid={testid}>
        {follows
          ? <p className="text-xs text-gray-500">Follows the character's feelings. It isn't set directly; choices change the feeling it shows.</p>
          : <BeatList label="Set in" ids={u.sets} empty="nowhere yet" />}
        <BeatList label="Tested in" ids={u.tests} empty="nowhere yet" />
        {u.shows.length > 0 && <BeatList label="Shown in" ids={u.shows} empty="" />}
      </div>
    );
  };

  const declared = new Set(variables.map((v) => v.name));
  const variableUses = (name: string) => uses.filter((u) => u.kind === 'variable' && u.name === name);
  const undeclared = [...new Set(uses.filter((u) => u.kind === 'variable' && !declared.has(u.name) && u.name !== 'playthrough').map((u) => u.name))].sort();

  // A counter named without a character belongs to a character when exactly
  // one of them has a counter of that name (as the story itself decides);
  // otherwise it is the story's own.
  const owners = (name: string) => characters.filter((c) => (c.counters ?? []).some((k) => k.name === name));
  const isOf = (u: StoryDataUse, c: CharacterLike) => {
    if (u.kind !== 'counter') return false;
    if (u.character?.startsWith('@')) {
      const role = roles.find((r) => r.id === u.character!.slice(1));
      return !!c.id && !!role?.candidates?.includes(c.id);
    }
    if (u.character === 'player' && c.role === 'player') return true;
    if (u.character) return u.character === c.id || u.character === c.name;
    const own = owners(u.name);
    return own.length === 1 && own[0] === c;
  };
  const storyCounterNames = [...new Set(uses
    .filter((u) => u.kind === 'counter' && !u.character && owners(u.name).length !== 1)
    .map((u) => u.name))].sort();
  const withCounters = characters.filter((c) => (c.counters ?? []).length > 0);

  return (
    <div className="flex flex-col h-full" data-testid="story-data-window">
      <div className="flex items-center gap-1 px-4 pt-3 border-b" role="tablist">
        {([['variables', `Variables (${variables.length})`, Variable], ['counters', `Counters (${storyCounterNames.length + withCounters.reduce((n, c) => n + (c.counters ?? []).length, 0)})`, Hash]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === id ? 'border-b-2 border-blue-500 text-blue-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {view === 'variables' && (
          <div className="space-y-6">
            <VariablesPanel
              variables={variables}
              onChange={onVariablesChange}
              renderUsage={(name) => <Usage of={variableUses(name)} testid={`usage-${name}`} />}
            />
            {undeclared.length > 0 && (
              <div className="space-y-3" data-testid="story-data-undeclared">
                <h3 className="font-medium text-gray-700">Used in the story, not listed above</h3>
                <p className="text-sm text-gray-600">
                  These work as they are and start empty. Add one to the list to give it a type, a starting value
                  or <em>Keep across restarts</em>. A name here that you didn't mean is often a misspelling of one above.
                </p>
                {undeclared.map((name) => (
                  <div key={name} className="p-3 border rounded-lg bg-white">
                    <div className="flex items-center justify-between">
                      <code className="font-mono text-sm">{name}</code>
                      <button
                        onClick={() => onVariablesChange([...variables, { name, type: 'string', defaultValue: '', description: '' }])}
                        className="px-2 py-1 text-xs border border-blue-500 text-blue-600 rounded hover:bg-blue-50"
                      >
                        Add to the list
                      </button>
                    </div>
                    <Usage of={variableUses(name)} testid={`usage-${name}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'counters' && (
          <div className="space-y-6" data-testid="story-data-counters">
            <div className="space-y-3">
              <h3 className="font-medium text-gray-700">Story counters</h3>
              <p className="text-sm text-gray-600">
                Numbers that belong to the story, not to a character: a score, the days passed. There is nothing to set
                up. A story counter starts at 0 and exists as soon as a choice's effect or a Set Variable/Counter beat changes it.
              </p>
              {storyCounterNames.length === 0 ? (
                <p className="text-sm text-gray-500 border-2 border-dashed rounded-lg p-4 text-center">No story counters yet.</p>
              ) : storyCounterNames.map((name) => (
                <div key={name} className="p-3 border rounded-lg bg-white" data-testid={`counter-${name}`}>
                  <code className="font-mono text-sm">{name}</code>
                  <Usage of={uses.filter((u) => u.kind === 'counter' && !u.character && u.name === name)} />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-700">Characters' counters</h3>
                {onOpenCharacters && (
                  <button onClick={onOpenCharacters} className="px-2 py-1 text-xs border border-indigo-500 text-indigo-600 rounded hover:bg-indigo-50">
                    Edit in Characters
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600">
                Trust, health, courage: numbers a character carries. Their names, starting values and meters are set on the character.
              </p>
              {withCounters.length === 0 ? (
                <p className="text-sm text-gray-500 border-2 border-dashed rounded-lg p-4 text-center">No character has a counter yet.</p>
              ) : withCounters.map((c) => (
                <div key={c.id ?? c.name} className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">{c.displayName || c.name}</div>
                  {(c.counters ?? []).map((k) => (
                    <div key={k.name} className="p-3 border rounded-lg bg-white" data-testid={`counter-${c.name}-${k.name}`}>
                      <div className="flex items-baseline gap-2">
                        <code className="font-mono text-sm">{k.name}</code>
                        {k.displayName && k.displayName !== k.name && <span className="text-sm text-gray-600">{k.displayName}</span>}
                        <span className="text-xs text-gray-500">starts at {k.value ?? 0}</span>
                      </div>
                      <Usage of={uses.filter((u) => u.name === k.name && isOf(u, c))} follows={!!k.source} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
