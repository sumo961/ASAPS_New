# Embedded AI in the Desktop / Mobile Players — Design Document

> **Status:** Design proposal, per roadmap Tier-5 item 15. **Partially
> superseded (2026-08-18):** Hartmut expanded the goal to a self-contained
> mobile app with an embedded Gemma-class LLM plus geo-AR — see
> `Mobile-Field-App-Plan.md`, which replaces this doc's "mobile: explicitly
> parked" stance. The desktop recommendations below (Phase 0 Ollama probe,
> Phase 1 bundled llama.cpp) remain valid and independent.
> **Decision owner:** Hartmut.

## 1. The problem

A story with runtime AI beats (AI Conversation, AI Dialog Tree, AI Condition,
AI Info Text, AI Duration Screen, AI Summary) needs a model at *play* time.
Today an exported or installed story has three ways to get one, each with a
hole:

| Path | Works | Hole |
|------|-------|------|
| Embedded API key | anywhere with internet | the author's key is in the artifact; costs land on the author; leak risk (why the relay exists) |
| Classroom relay (v0.9.86) | classroom / hosted deployments | someone must run the relay and own its key; needs internet |
| Local Ollama (config) | an author's own desktop | interactors don't have Ollama; nothing for mobile |

The missing quadrant is **a story that plays with AI, offline, on a machine
the author doesn't control** — a museum kiosk, a field study on phones, a
player who downloaded the desktop app. "Embedded AI" = the player engine
carries (or fetches once) a local model and serves AI beats from it.

## 2. What the architecture already gives us

The unified runtime adapter (`@asaps/core/ai/runtimeAdapter.ts`, Phase 2
landed 2026-07-12) made every AI call site transport-pluggable:

```
RuntimeTransport = (body: Record<string, unknown>) => Promise<any>
```

with four existing factories (direct Anthropic, direct OpenAI, relay, dev
proxy). **Embedded AI is a fifth factory — `createEmbeddedTransport` — and
zero changes to call sites.** The body arrives in OpenAI chat shape; the
transport's job is to answer it. This is the whole integration surface, and
it is why the feature was parked *behind* the adapter work rather than built
before it.

What the model must actually do (from the per-function audit, v0.9.93): hold
a persona in conversation, judge direction conditions (small classification),
write short info texts. **Conversation quality at 3-8B is known-acceptable**
— the model-guidance work already tells authors small local models "hold a
persona surprisingly well." Strict-JSON story generation and translation are
NOT runtime jobs; the embedded model never needs to do them.

## 3. Options

### A. Bundle an inference runtime in the players
- **Desktop (Tauri/Rust):** llama.cpp via a Rust crate; ships as part of
  the player binary. Weights fetched on first AI story (GGUF, ~2-5 GB for
  the 3-8B class) into app data, with a progress UI and a "this story uses
  on-device AI" consent moment.
- **Mobile (Capacitor 6):** llama.cpp via a native plugin (iOS Metal /
  Android). Real but harder: thermal + memory budgets on mid-range phones,
  app-store review of downloadable executables-adjacent content (weights are
  data, but review friction is real), and 2-4 GB downloads on cellular.
- Cost: a native build + CI story per platform, model-update policy,
  support surface ("why is the AI slow on my phone").

### B. Detect a system-level runtime (desktop only)
Player-desktop probes for a running Ollama / LM Studio endpoint and uses it
via the existing OpenAI-compatible transport. Zero inference code of our
own; nothing for mobile or kiosks without setup; the interactor must have
installed something. Cheap, real, narrow.

### C. WebGPU in-browser models (HTML exports)
web-llm / MLC serving the same OpenAI-ish chat shape in the browser — would
cover the *widest* artifact (HTML export) with no install. WebGPU is now on
in Chrome/Edge/Safari, but 2-4 GB weight fetches into browser cache, cold
compile time, and iOS Safari memory ceilings make it demo-grade for our
audience today. Watch, don't build.

### D. Status quo (relay + key + Ollama config)
Covers classrooms and authors. The museum-kiosk / field-study quadrant stays
empty.

## 4. Recommendation

**Phase 0 (build soon, small): Option B.** A `createEmbeddedTransport` that
probes `localhost:11434` (Ollama) with graceful fallback to the story's
configured transport, plus a player-desktop settings row ("Use local AI when
available") and a kiosk doc page. This closes the kiosk case for anyone who
can install Ollama next to the player — which describes museum/kiosk
deployments well — for roughly a week of work, and it exercises the exact
transport seam Phase 1 would formalize.

**Phase 1 (decide separately, larger): Option A desktop-only.** Bundled
llama.cpp in the Tauri player with fetch-on-demand weights. Do it only when
a concrete deployment (a museum partner, a field study) actually needs
zero-setup offline AI — the trigger should be a real request, not
completeness. Model pinned per player release; conversation-tier only.

**Mobile embedded AI: explicitly parked.** The thermal/review/download costs
buy the narrowest slice of the audience. Revisit if a funded project needs
it; the transport seam means nothing is foreclosed by waiting.

**Not doing:** WebGPU browser inference (watch), and any attempt to run
story *generation* or *translation* embedded — those stay authoring-time,
cloud-tier jobs per the per-function guidance.

## 5. Open questions for the decision

1. Is there a concrete kiosk/field deployment on the horizon that should
   pull Phase 1 forward, or does Phase 0 + relay cover 2026?
2. Which model family gets blessed for Phase 1? (Candidate criterion:
   permissive license + strong small-model conversation; verify against the
   rehearsal template as the acceptance test.)
3. Does the story format need an authored hint ("this story is designed for
   on-device AI — small model OK / needs cloud tier"), or is the existing
   per-function guidance enough?
