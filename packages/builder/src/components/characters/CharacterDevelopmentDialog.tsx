/**
 * Character Development Dialog — the AI "Develop character" helper.
 *
 * Progressive disclosure over the existing Character / CharacterVariant
 * model: a seeded free-text brief, an OPTIONAL adaptive-questions stage
 * (the AI asks 2-3 behavior questions with tappable answers; always
 * skippable), then preview cards refined by free-text direction — never
 * by sliders. Accept writes a real Character (or enriches an existing
 * one); the nitty-gritty stays editable in CharacterEditor.
 *
 * Two entry points share this dialog:
 *   - AI conversation beat inspector ("Develop character…"): seeded from
 *     scenario + npcPersonality, generates immediately by default.
 *   - Character Manager ("Generate with AI"): blank brief, questions
 *     stage on by default (askFirst).
 */

import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertCircle, X, RefreshCw } from 'lucide-react';
import { useAI } from '../../hooks/useAI';
import { getAIService } from '../../services';
import type { Character } from '../../types/character';
import type {
  GeneratedCharacterProfile,
  GeneratedCharacterQuestion,
} from '../../services/prompts/characterGeneration';

export interface CharacterDevelopmentSession {
  seed: { name?: string; brief?: string; scenario?: string };
  /** Enrich this character instead of creating a new one. */
  existingCharacterId?: string;
  /** Run the follow-up-questions stage by default (Character Manager entry). */
  askFirst?: boolean;
  /** Called with the created/updated character after accept. */
  onAccepted?: (character: Character) => void;
}

export interface CharacterDevelopmentDialogProps {
  /** Null = closed. A new session object resets the dialog. */
  session: CharacterDevelopmentSession | null;
  onClose: () => void;
  characters: Character[];
  onCharactersChange: (characters: Character[]) => void;
}

const SUGGESTED_DISPOSITIONS = ['Cooperative', 'Hostile', 'Avoidant', 'Ambivalent'];

const EXAMPLE_BRIEF =
  'A 45-year-old client who recently lost custody of her son. Polite on the ' +
  'surface, deflects every direct question, blames the system. Wants to be ' +
  'seen as a good mother.';

type Stage = 'brief' | 'questions' | 'preview';

/** Compact read-only Big Five row for preview cards. */
const TraitRow: React.FC<{ traits: Record<string, number> }> = ({ traits }) => (
  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
    {Object.entries(traits).map(([name, value]) => (
      <span key={name} className="flex items-center gap-1" title={`${name}: ${value.toFixed(2)}`}>
        <span className="capitalize">{name.slice(0, 4)}</span>
        <span className="inline-block w-10 h-1.5 bg-gray-200 rounded overflow-hidden">
          <span
            className="block h-full bg-blue-400"
            style={{ width: `${Math.round(value * 100)}%` }}
          />
        </span>
      </span>
    ))}
  </div>
);

const moodLabel = (mood: { valence: number; arousal: number }) =>
  `mood v ${mood.valence >= 0 ? '+' : ''}${mood.valence.toFixed(2)} · a ${mood.arousal >= 0 ? '+' : ''}${mood.arousal.toFixed(2)}`;

export const CharacterDevelopmentDialog: React.FC<CharacterDevelopmentDialogProps> = ({
  session,
  onClose,
  characters,
  onCharactersChange,
}) => {
  const { isConfigured } = useAI();

  const [stage, setStage] = useState<Stage>('brief');
  const [brief, setBrief] = useState('');
  const [wantVariants, setWantVariants] = useState(false);
  const [dispositions, setDispositions] = useState<string[]>([]);
  const [customDisposition, setCustomDisposition] = useState('');
  const [questions, setQuestions] = useState<GeneratedCharacterQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [profile, setProfile] = useState<GeneratedCharacterProfile | null>(null);
  const [includedVariantIds, setIncludedVariantIds] = useState<Set<string>>(new Set());
  const [randomPolicy, setRandomPolicy] = useState(true);
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'questions' | 'profile' | string>(null);
  const [error, setError] = useState<string | null>(null);

  // A new session resets everything and re-seeds the brief.
  useEffect(() => {
    if (!session) return;
    setStage('brief');
    setBrief(session.seed.brief || '');
    setWantVariants(false);
    setDispositions([...SUGGESTED_DISPOSITIONS]);
    setCustomDisposition('');
    setQuestions([]);
    setAnswers([]);
    setProfile(null);
    setIncludedVariantIds(new Set());
    setRandomPolicy(true);
    setAdjustDrafts({});
    setBusy(null);
    setError(null);
  }, [session]);

  if (!session) return null;

  const existingCharacter = session.existingCharacterId
    ? characters.find((c) => c.id === session.existingCharacterId) || null
    : null;
  const characterName =
    session.seed.name || existingCharacter?.displayName || existingCharacter?.name || '';
  const canGenerate = Boolean(brief.trim() || session.seed.scenario || characterName);

  const buildSeed = (withAnswers: boolean) => ({
    name: characterName || undefined,
    brief: brief.trim(),
    scenario: session.seed.scenario,
    dispositions: wantVariants ? dispositions : [],
    answers: withAnswers
      ? questions
          .map((q, i) => ({ question: q.question, answer: (answers[i] || '').trim() }))
          .filter((a) => a.answer)
      : [],
  });

  const runQuestions = async () => {
    setBusy('questions');
    setError(null);
    try {
      const result = await getAIService().generateCharacterQuestions(buildSeed(false));
      if (result.length === 0) {
        // Nothing worth asking — go straight to generation.
        await runGenerate(false);
        return;
      }
      setQuestions(result);
      setAnswers(result.map(() => ''));
      setStage('questions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate questions');
    } finally {
      setBusy(null);
    }
  };

  const runGenerate = async (withAnswers: boolean) => {
    setBusy('profile');
    setError(null);
    try {
      const result = await getAIService().generateCharacterProfile(buildSeed(withAnswers));
      setProfile(result);
      setIncludedVariantIds(new Set((result.variants || []).map((v) => v.id)));
      setAdjustDrafts({});
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate character');
    } finally {
      setBusy(null);
    }
  };

  const runRevise = async (target: 'base' | string) => {
    const direction = (adjustDrafts[target] || '').trim();
    if (!profile || !direction) return;
    setBusy(target);
    setError(null);
    try {
      const revised = await getAIService().reviseCharacterCard(profile, target, direction);
      setProfile(revised);
      setAdjustDrafts((d) => ({ ...d, [target]: '' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revise card');
    } finally {
      setBusy(null);
    }
  };

  const toggleDisposition = (label: string) => {
    setDispositions((prev) =>
      prev.includes(label) ? prev.filter((d) => d !== label) : [...prev, label],
    );
  };

  const addCustomDisposition = () => {
    const label = customDisposition.trim();
    if (!label) return;
    if (!dispositions.some((d) => d.toLowerCase() === label.toLowerCase())) {
      setDispositions((prev) => [...prev, label]);
    }
    setCustomDisposition('');
  };

  const handleAccept = () => {
    if (!profile) return;
    const now = new Date().toISOString();
    const included = (profile.variants || []).filter((v) => includedVariantIds.has(v.id));

    // Convention (matches CharacterEditor's variant migration): when variants
    // exist, personality lives per-variant; the base owns identity + a
    // disposition-neutral description. Without variants, base gets it all.
    const hasVariants = included.length > 0;
    const baseAffect = hasVariants
      ? { traits: undefined, initialMood: undefined }
      : { traits: profile.traits, initialMood: profile.initialMood };
    const variantPolicy = !hasVariants
      ? {}
      : included.length >= 2 && randomPolicy
        ? { variantSelectionPolicy: 'random' as const, defaultVariantId: undefined }
        : { variantSelectionPolicy: undefined, defaultVariantId: included[0].id };

    let accepted: Character;
    if (existingCharacter) {
      // Enrich in place: overwrite the previewed fields, append variants
      // (suffix ids that collide with ones already on the character).
      const existingIds = new Set((existingCharacter.variants || []).map((v) => v.id));
      const newVariants = included.map((v) => {
        let id = v.id;
        while (existingIds.has(id)) id = `${id}_2`;
        existingIds.add(id);
        return { ...v, id };
      });
      accepted = {
        ...existingCharacter,
        description: profile.description,
        ...(hasVariants || (existingCharacter.variants || []).length > 0
          ? {}
          : { traits: profile.traits, initialMood: profile.initialMood }),
        variants: [...(existingCharacter.variants || []), ...newVariants],
        ...variantPolicy,
        updatedAt: now,
      };
      onCharactersChange(characters.map((c) => (c.id === accepted.id ? accepted : c)));
    } else {
      const usedNames = new Set(characters.map((c) => (c.name || '').toLowerCase()));
      let name = profile.name;
      while (usedNames.has(name.toLowerCase())) name = `${name}_2`;
      accepted = {
        id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        displayName: profile.displayName,
        role: 'npc',
        visual: { type: 'static' },
        states: [{ id: 'default', name: 'default', displayName: 'Default', visual: {} }],
        defaultState: 'default',
        counters: [],
        inventory: [],
        description: profile.description,
        ...baseAffect,
        ...(hasVariants ? { variants: included } : {}),
        ...variantPolicy,
        tags: [],
        createdAt: now,
        updatedAt: now,
      } as Character;
      onCharactersChange([...characters, accepted]);
    }
    session.onAccepted?.(accepted);
    onClose();
  };

  const renderCard = (opts: {
    target: 'base' | string;
    title: string;
    subtitle?: string;
    description: string;
    traits: Record<string, number>;
    mood: { valence: number; arousal: number };
    includeToggle?: { checked: boolean; onChange: (v: boolean) => void };
  }) => (
    <div
      key={opts.target}
      className={`border rounded-lg p-4 space-y-2 ${
        opts.includeToggle && !opts.includeToggle.checked ? 'opacity-50 bg-gray-50' : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {opts.includeToggle && (
            <input
              type="checkbox"
              checked={opts.includeToggle.checked}
              onChange={(e) => opts.includeToggle!.onChange(e.target.checked)}
              title="Include this variant"
            />
          )}
          <span className="font-medium text-sm truncate">{opts.title}</span>
          {opts.subtitle && <span className="text-xs text-gray-400">{opts.subtitle}</span>}
        </div>
        <span className="text-[11px] text-gray-400 whitespace-nowrap">{moodLabel(opts.mood)}</span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{opts.description}</p>
      <TraitRow traits={opts.traits} />
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={adjustDrafts[opts.target] || ''}
          onChange={(e) => setAdjustDrafts((d) => ({ ...d, [opts.target]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runRevise(opts.target);
          }}
          placeholder='Adjust: e.g. "more passive-aggressive"'
          className="flex-1 px-2 py-1 text-xs border rounded"
          disabled={busy !== null}
        />
        <button
          onClick={() => runRevise(opts.target)}
          disabled={busy !== null || !(adjustDrafts[opts.target] || '').trim()}
          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40"
          title="Regenerate this card following the direction"
        >
          {busy === opts.target ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );

  const includedCount = profile ? (profile.variants || []).filter((v) => includedVariantIds.has(v.id)).length : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {existingCharacter
                  ? `Develop character: ${characterName}`
                  : characterName
                    ? `Develop character: ${characterName}`
                    : 'Generate a character'}
              </h2>
              <p className="text-sm text-gray-500">
                {stage === 'brief' && 'Describe the person — the AI drafts the profile.'}
                {stage === 'questions' && 'Optional: sharpen the brief. Tap an answer or type your own.'}
                {stage === 'preview' && 'Review the draft. Adjust any card with a direction, then accept.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!isConfigured && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">
                Configure an AI provider (AI button in the header) before generating characters.
              </p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {stage === 'brief' && (
            <>
              {session.seed.scenario && (
                <div className="text-xs text-gray-500 bg-gray-50 border rounded p-2">
                  <span className="font-medium text-gray-600">Scenario context: </span>
                  {session.seed.scenario}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Who is this person?
                </label>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder={EXAMPLE_BRIEF}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none text-sm"
                  rows={5}
                  disabled={busy !== null}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Plain language is fine — role, situation, how they treat people. The AI turns it
                  into personality, mood, and speaking style.
                </p>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantVariants}
                    onChange={(e) => setWantVariants(e.target.checked)}
                    disabled={busy !== null}
                  />
                  <span className="font-medium">Generate disposition variants</span>
                  <span className="text-xs text-gray-400">
                    — versions of the same person for replay variety
                  </span>
                </label>
                {wantVariants && (
                  <div className="flex flex-wrap items-center gap-2">
                    {dispositions.map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleDisposition(d)}
                        disabled={busy !== null}
                        className="px-2.5 py-1 rounded-full text-xs border transition-colors bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                        title="Click to remove"
                      >
                        {d} ✕
                      </button>
                    ))}
                    {SUGGESTED_DISPOSITIONS.filter((d) => !dispositions.includes(d)).map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleDisposition(d)}
                        disabled={busy !== null}
                        className="px-2.5 py-1 rounded-full text-xs border border-gray-200 text-gray-500 hover:bg-gray-50"
                        title="Click to add"
                      >
                        + {d}
                      </button>
                    ))}
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={customDisposition}
                        onChange={(e) => setCustomDisposition(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addCustomDisposition();
                        }}
                        placeholder="own disposition…"
                        className="px-2 py-1 text-xs border rounded w-32"
                        disabled={busy !== null}
                      />
                      <button
                        onClick={addCustomDisposition}
                        disabled={busy !== null || !customDisposition.trim()}
                        className="text-xs text-purple-600 hover:bg-purple-50 px-1.5 py-1 rounded disabled:opacity-40"
                      >
                        add
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {stage === 'questions' && (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm font-medium text-gray-800">{q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() =>
                          setAnswers((prev) => prev.map((a, j) => (j === i ? s : a)))
                        }
                        disabled={busy !== null}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          answers[i] === s
                            ? 'bg-purple-100 border-purple-400 text-purple-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={answers[i] || ''}
                    onChange={(e) =>
                      setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                    }
                    placeholder="…or type your own (leave empty to skip)"
                    className="w-full px-2 py-1.5 text-sm border rounded"
                    disabled={busy !== null}
                  />
                </div>
              ))}
            </div>
          )}

          {stage === 'preview' && profile && (
            <div className="space-y-3">
              {renderCard({
                target: 'base',
                title: profile.displayName,
                subtitle: (profile.variants?.length ?? 0) > 0 ? 'base profile (shared identity)' : undefined,
                description: profile.description,
                traits: profile.traits,
                mood: profile.initialMood,
              })}
              {(profile.variants || []).map((v) =>
                renderCard({
                  target: v.id,
                  title: v.name,
                  subtitle: 'variant',
                  description: v.characterDescription,
                  traits: v.traits,
                  mood: v.initialMood,
                  includeToggle: {
                    checked: includedVariantIds.has(v.id),
                    onChange: (checked) =>
                      setIncludedVariantIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(v.id);
                        else next.delete(v.id);
                        return next;
                      }),
                  },
                }),
              )}
              {includedCount >= 2 && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg p-3 bg-purple-50/50">
                  <input
                    type="checkbox"
                    checked={randomPolicy}
                    onChange={(e) => setRandomPolicy(e.target.checked)}
                  />
                  Pick a disposition at random each playthrough
                  <span className="text-xs text-gray-400">(rehearsal variety)</span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-200 bg-gray-50">
          <div>
            {stage === 'questions' && (
              <button
                onClick={() => setStage('brief')}
                disabled={busy !== null}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                ← Back
              </button>
            )}
            {stage === 'preview' && (
              <button
                onClick={() => setStage('brief')}
                disabled={busy !== null}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                ← Back to brief
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {stage === 'brief' && (
              <>
                {session.askFirst ? (
                  <>
                    <button
                      onClick={() => runGenerate(false)}
                      disabled={!isConfigured || !canGenerate || busy !== null}
                      className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                      {busy === 'profile' ? 'Generating…' : 'Skip — just generate'}
                    </button>
                    <button
                      onClick={runQuestions}
                      disabled={!isConfigured || !canGenerate || busy !== null}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {busy === 'questions' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                        </>
                      ) : (
                        'Continue'
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={runQuestions}
                      disabled={!isConfigured || !canGenerate || busy !== null}
                      className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                      {busy === 'questions' ? 'Thinking…' : 'Refine with questions first'}
                    </button>
                    <button
                      onClick={() => runGenerate(false)}
                      disabled={!isConfigured || !canGenerate || busy !== null}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {busy === 'profile' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Generate
                        </>
                      )}
                    </button>
                  </>
                )}
              </>
            )}
            {stage === 'questions' && (
              <button
                onClick={() => runGenerate(true)}
                disabled={!isConfigured || busy !== null}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {busy === 'profile' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate character
                  </>
                )}
              </button>
            )}
            {stage === 'preview' && (
              <button
                onClick={handleAccept}
                disabled={busy !== null}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {existingCharacter ? `Apply to ${characterName}` : 'Add character'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
