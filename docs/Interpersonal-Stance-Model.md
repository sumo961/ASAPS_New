# Interpersonal Stance Model — Disposition Variants and the Big Five

*Status: implemented 2026-07-17 (AI character helper, disposition variants). This document records the theoretical grounding and the implementation so the design rationale isn't lost.*

## The problem

The AI character helper ("Develop character…") generates **disposition variants** of a character — Cooperative, Hostile, Avoidant, Ambivalent versions of the same person — for replay variety in rehearsal scenarios (AI conversation beat, social-work training use case from the Södertörn stakeholder review).

The first implementation let the AI author each variant's Big Five traits freely. That risked **forking the character model**: manually authored characters use trait presets ("personality archetypes") that are points in Big Five space, while AI-generated variants would have carried unconstrained, unprincipled trait values. Two questions followed:

1. Is there a theoretical model for *conversational dispositions* that can be related to personality traits?
2. Do dispositions need a separate "behavior during conversation" aspect in the data model — or can both live in one system?

## Theory

### Dispositions are interpersonal stances (Scherer)

Scherer's taxonomy of affective phenomena distinguishes five constructs by duration, intensity, and object-directedness: **emotions** (brief, event-driven), **moods** (diffuse, longer), **interpersonal stances** (an affective position *toward another person in a specific interaction* — warm, cold, distant, supportive, contemptuous), **attitudes** (enduring, object-directed), and **personality traits** (stable dispositions).

A disposition variant is precisely an **interpersonal stance held across a session**: "how this person shows up toward you today." It is conceptually distinct from the character's stable personality — which is why a separate construct is legitimate — but, crucially, the two are not independent (next section), which is why no separate *stored* model dimension is needed.

### One trait space, two lenses (Interpersonal Circumplex)

The **Interpersonal Circumplex** (Leary's "Rose", 1957; Wiggins' Interpersonal Adjective Scales) organizes interpersonal behavior *and* interpersonal traits on two axes:

- **Dominance / Control** — submissive (−) … dominant (+)
- **Warmth / Affiliation** — cold (−) … warm (+)

McCrae & Costa (1989) showed that these axes and Big Five **Extraversion** and **Agreeableness** define the *same plane*, rotated by roughly 30°: Extraversion ≈ *friendly dominance*, Agreeableness ≈ *warm submissiveness*. Aspect-level work (DeYoung et al.) refines this: the assertiveness aspect of E aligns with dominance, the compassion aspect of A with warmth.

**Consequence:** the circumplex is not a second personality model. It is a rotated *lens* on the interpersonal plane of the Big Five. Trait presets (archetypes, defined in Big Five coordinates) and dispositions (defined in circumplex coordinates) provably live in one space, with a deterministic conversion in both directions. Nothing about the archetypes needed to change — their circumplex position is derivable.

### Speech acts are the realization layer (Brown & Levinson)

Speech act theory does not model dispositions; it models utterance-level *moves*. Brown & Levinson's **politeness theory** (built on speech acts) supplies the vocabulary for how a stance manifests turn-by-turn:

- Hostile → *bald-on-record* face threats: interruptions, demands, refusals, blame.
- Cooperative → *positive politeness*: direct answers, unprompted information, mild hedges.
- Avoidant → *off-record* and withdrawal moves: topic changes, minimal answers, vague deflection.

Walker, Cahn & Whittaker (1997) showed that exactly these realization choices drive the *perceived* personality of a conversational agent. Therefore speech-act guidance belongs in the **generation prompt** (shaping the variant's behavioral description), not in the stored data model. The "separate conversational-behavior aspect" fails the necessity test for storage and passes it for prompting.

### Precedent for the use case

The **TARDIS** project (EU FP7) built virtual recruiters for job-interview social-skills training whose interpersonal stances are modeled on Leary's circumplex; the same framework is used in police-interview training to model suspect stances. Disposition-varying training agents grounded in the circumplex are validated practice — directly relevant to the social-work rehearsal scenarios this feature targets.

## Implementation

Code: `packages/builder/src/services/prompts/interpersonalStance.ts` (model) and `characterGeneration.ts` (integration). Tests: `packages/builder/src/services/prompts/__tests__/characterGeneration.test.ts` ("interpersonal stance grounding" block).

### Data

```ts
interface InterpersonalStance { warmth: number; dominance: number }  // each [-1, 1]
```

Each suggested disposition chip is a `DispositionDefinition`: circumplex coordinates plus a politeness-theory `manifestation` string injected into the prompt.

| Disposition | warmth | dominance | Realization (prompt hint) |
|---|---|---|---|
| Cooperative | +0.7 | −0.2 | positive politeness, direct answers, mild hedges |
| Hostile | −0.7 | +0.5 | bald-on-record face threats, interruptions, demands |
| Avoidant | −0.4 | −0.6 | off-record moves, topic changes, minimal answers |
| Ambivalent | +0.1 | −0.1 | approach–withdraw oscillation (position near origin by design; the signature is instability, carried by the manifestation text) |

Custom (author-typed) dispositions get their coordinates placed by the AI into the same space (`"stance"` field required in the variant JSON), so the mapping is total.

The stance is persisted on `CharacterVariant.stance` (builder and core types) — informational for the runtime today, reserved for stance-aware features (e.g. Leary *complementarity* feedback in rehearsal: a stance invites a complementary response, which is trainable material).

### Trait derivation

A variant's Extraversion and Agreeableness are **derived, not AI-authored**:

```
ΔE = (dominance + warmth) / √2        // E loads on friendly dominance
ΔA = (warmth − dominance) / √2        // A loads on warm submissiveness

variant.E = clamp01(base.E + w · ΔE)
variant.A = clamp01(base.A + w · ΔA)      with w = STANCE_TRAIT_WEIGHT = 0.35
```

The AI authors only O/C/N and the prose. Deriving from the **base** character's traits keeps the person recognizable across dispositions — a shy character turned hostile stays shy (live-verified: base E = 0.15 → hostile 0.10, cooperative 0.27, avoidant 0.00 clamped; every value matched the rotation exactly).

`bigFiveToStance()` provides the inverse rotation (where any Big Five profile — including the existing archetypes — sits on the circumplex), demonstrating the one-space property and enabling a future Leary-rose visualization of characters and presets.

Preview refinement is stance-aware: a revision direction like "more dominant" moves the stance, and A/E are re-derived.

### Editor visualization (StancePad)

`packages/builder/src/components/characters/StancePad.tsx` renders the stance as an interactive Leary's Rose — the sibling of the MoodPad (Russell's circumplex for mood). Warmth runs left→right, dominance bottom→top, with the four octant labels (hostile / leading / withdrawn / cooperative) in the corners. `describeStance()` provides the qualitative readout ("cold-dominant (hostile)"). It appears in three places:

1. **CharacterEditor variant cards** (Affect tab): dragging writes the variant's `stance` **and re-derives its extraversion + agreeableness** via the weighted rotation, so the trait sliders follow the dot — the coupling is visible, not hidden. A variant without an authored stance shows a dashed dot at its trait-derived position (`bigFiveToStance`); once a stance exists, a hollow "traits" ghost marker appears whenever hand-tuned sliders drift away from the authored stance.
2. **CharacterEditor base personality section** (shown when the character has no variants): here the pad is a pure two-way *lens* — the dot mirrors the E/A sliders via `bigFiveToStance`, and dragging sets both at once via the full-scale inverse rotation (`stanceToBigFive`, no weighting). Corners of the E×A square map slightly outside the unit disc; the pad clamps the dot at the rim.
3. **AI helper preview cards** (CharacterDevelopmentDialog): each variant card carries its stance pad (dragging moves that variant: stance + derived E/A, same math the generator used), and the base card carries the lens — dragging the base re-derives every stance-bearing variant from the new base traits, keeping the whole family consistent before accepting.

### Two documented simplifications (tunable)

1. **Rotation angle**: the literature's angle is ~30°; the implementation uses 45° for symmetric math. 
2. **Displacement weight**: `STANCE_TRAIT_WEIGHT = 0.35` sets how far a stance displaces A/E from the base.

Both are single constants in `interpersonalStance.ts`, to be tuned against how variants feel in actual rehearsal play.

## References

- Scherer, K. R. (2005). What are emotions? And how can they be measured? *Social Science Information*, 44(4). (Affect taxonomy: emotion / mood / interpersonal stance / attitude / personality trait.)
- Leary, T. (1957). *Interpersonal Diagnosis of Personality*. (The interpersonal circle / "Leary's Rose".)
- Wiggins, J. S. (1979–1995). Interpersonal Adjective Scales and circumplex structure.
- McCrae, R. R., & Costa, P. T. (1989). The structure of interpersonal traits: Wiggins's circumplex and the five-factor model. *JPSP*, 56(4), 586–595. (E/A as ~30° rotation of dominance/warmth.)
- DeYoung, C. G., Weisberg, Y. J., Quilty, L. C., & Peterson, J. B. (2013). Unifying the aspects of the Big Five, the interpersonal circumplex, and trait affiliation. *Journal of Personality*, 81(5). ([researchgate.net/publication/232926949](https://www.researchgate.net/publication/232926949_Unifying_the_Aspects_of_the_Big_Five_the_Interpersonal_Circumplex_and_Trait_Affiliation))
- Brown, P., & Levinson, S. C. (1987). *Politeness: Some Universals in Language Usage*. (Face-threatening acts; bald-on-record / positive / negative / off-record strategies.)
- Walker, M. A., Cahn, J. E., & Whittaker, S. J. (1997). Improvising linguistic style: Social and affective bases for agent personality. *Proc. Autonomous Agents*. ([arxiv.org/pdf/cmp-lg/9702015](https://arxiv.org/pdf/cmp-lg/9702015))
- Anderson, K., et al. (2013). The TARDIS framework: Intelligent virtual agents for social coaching in job interviews. *Advances in Computer Entertainment*. ([springer link](https://link.springer.com/chapter/10.1007/978-3-319-03161-3_35))
- NEO-PI-R circumplex octant scales: [pmc.ncbi.nlm.nih.gov/articles/PMC5102510](https://pmc.ncbi.nlm.nih.gov/articles/PMC5102510/)
