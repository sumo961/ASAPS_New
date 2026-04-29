# Sequencing: Character Plan ↔ Knowledge Graphs

> **Status:** Planning, written 2026-04-29 to capture the agreed sequence between the rich-character roadmap (`Character-State-Design.md`) and the proposed knowledge-graph track (cultural-adaptation experiment, inspired by Abhilash & Nack 2025).
>
> **Premise (clarified):** Steps 4–8 of the character roadmap are wanted for their own narrative-design value, independent of any KG work. The question is therefore purely about *sequencing two independently-justified tracks* — not "do we do affect at all?"

---

## 1. Phase 1 — character cleanup (Steps 1–3) goes first

Prerequisite for both tracks. Roughly 2–3 weeks of mostly mechanical refactor.

- **Step 1 — Layer 2, character-scoped runtime state.** Promote `speaker`, `AddRemoveInventory.character`, `InputText.characterId`, counter/variable namespacing from name strings to a stable `characterRef: <id>`. Legal to keep un-namespaced globals.
- **Step 2 — Layer 5 slice, NPC persona to `characterRef`.** Add the field on `AIDialogTree` / `AIConversation`, ship the "Promote to Character" button, automatic dossier injection from real Character data when bound.
- **Step 3 — Layer 4, narrative memory query view.** Slice `choiceHistory`/`history` per character. Pure derived data, no new state.

After Phase 1 the runtime has a stable spine. *Both* tracks can proceed without inheriting the current name-string fragmentation.

## 2. Phase 2 — fork into two parallel tracks

Run concurrently, not sequentially. A single track moving in isolation for months tends to drift; the cross-track feedback loop is the point.

### Character track — Step 4 (mood + sentiments MVP)

Highest narrative value independent of KG. New `UpdateAffect` beat, `ConditionBeat` operators on `mood.valence`, `emotion.X`, `sentimentTo(entity).strength`, "NPC remembers" mechanics. Sentiments persist across beats automatically.

### KG track — minimum-viable export

Reads the post-Phase-1 runtime. JSON-LD or property-graph dump, no Neo4j commitment yet. Schema covers characters, beats, choices, conditions, transitions, inventory deltas. The point of doing this *before* the affect work fully lands is to force the schema decisions while character semantics are still simple — discover what should be a node, edge, or property by iterating on real story data, not by designing in the abstract.

## 3. Phase 3 — schema feedback into Steps 5–8

Once the KG export exists and the character track has reached Step 5 (emotion nodes), you'll find concrete things you wish the KG had. That feedback shapes Steps 5–8:

- *"We need emotion-typed sentiment edges"* — Step 5 was already going to add them.
- *"We need beat-content semantic features"* — outside the affect roadmap, opens a new track (semantic embeddings, content hashing).
- *"We need shared-history edges between characters"* — already free from Step 3 (Layer 4 narrative memory).

Cultural-adaptation experiments meaningfully begin here, not earlier. Comparing two adapted stories' KGs before the schema has been stress-tested against real data produces graph-structural diffs without semantic grounding.

---

## 4. Intersection points to decide up front

These are decisions that cost nothing now but cost a lot later.

### 4.1 Sentiment ↔ KG edge unification

`Sentiment.toEntityRef` (Step 4) is *already* a directed, labelled, runtime relation between two entities. That's structurally identical to a KG edge. **Decide once: is `Sentiment` mirrored into the KG, or do they have separate models?** Recommendation: unified. The KG largely writes itself for affect when the runtime sentiment store *is* the KG-edge store.

### 4.2 Goals as outgoing semantics

`Character.goals[]` (Step 8 / Layer 3b) gives nodes meaningful outgoing edges (`character —wants→ outcome`). Designing the goal model with KG queryability in mind costs nothing at Step 8 design time and saves a re-modelling pass later.

### 4.3 Versioning model — VCS-derived vs. KG-internal

Abhilash & Nack's KG bakes versioning into every node and edge (`created_at`, `updated_at`, `is_active`, `deleted_at`). ASAPS already has VCS at the file level. **Two versioning models will fight each other unless you decide early whether KG snapshots are derived-from-commits or maintained as a parallel timeline.**

Recommendation: derived-from-commits (one source of truth). Complication: branching narratives where multiple "versions" coexist as different paths within the same project — those aren't VCS branches, they're authored possibility space, and the KG needs to represent both axes (VCS history × narrative branching) without conflating them.

### 4.4 Beat content vs. KG references

A Chatman-shaped KG schema (per Abhilash/Nack) captures structural narrative elements but not the strings that make up beat *content* — speaker text, choice labels, prompt text, character descriptions in their authored language. Cultural adaptation lives mostly *inside* those strings.

**Decide:** does the KG *include* beat text (large, denormalised, culturally loaded), just *reference* it via beat ID, or reference + content-hash + optional semantic embedding?

Recommendation: reference + content-hash, with semantic embeddings as a separate optional layer. This keeps the KG clean for structural queries while leaving room for content-based cultural diff later.

---

## 5. What this sequence buys you

- **Phase 1** ships standalone authoring wins (the "piecemeal feeling" goes away) without committing to either deeper track.
- **Phase 2** lets you ship Step 4 (mood + sentiments) as a real feature *and* get a first look at what the KG can do, in parallel.
- **Phase 3** is where the cultural-adaptation experiment can produce findings worth writing up — because by then the KG schema is grounded in actual data, not guessed.
- The two tracks inform each other rather than one waiting on the other to finish.

---

## 6. What this sequence does *not* commit to

- A specific KG technology choice (Neo4j vs Apache Jena vs in-process). The MVP export should be technology-agnostic.
- Mode B (agent loop, Step 8). Still held behind all of Steps 4–7.
- Mode C (INTP, see `Character-State-Design.md` Addendum). Parallel research track, not on this critical path.
- The cultural-adaptation experiment as the *justification* for any of the character work. The character work justifies itself.
