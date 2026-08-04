# ASAPS Modern — Version History

A feature-by-version summary for ASAPS Modern. This is the high-level overview;
for detailed release notes (including file-level changes and the *why* behind
decisions) see [`Progress.md`](Progress.md). For the latest published build,
visit the [GitHub Releases page](https://github.com/sumo961/ASAPS_New/releases).

Current release: **v0.9.86**. This is a **beta**: core functionality works,
features below reflect what has been shipped since active development began.
(Detailed narrative notes for every release, including the v0.9.58–v0.9.65
entries not yet folded into the matrix below, live in [`Progress.md`](Progress.md).)

## Feature Matrix

| Feature | Status |
|---------|--------|
| **API-key relay, signed macOS builds, real transitions** | **v0.9.86**: *API-key relay for public AI stories*: new "Use a relay" export mode — the story POSTs `{provider, body}` to a generated same-origin Netlify function; the key lives in host env vars and **never ships in the HTML**; upstream endpoints hardcoded (relay can't be redirected); **streaming end-to-end for both providers** (SSE piped through the function, reassembled client-side into the plain response shape) so long generations survive serverless timeouts (Netlify's ~10 s buffered cap killed aiDialogTree); the export is **one deploy-ready zip** (story as index.html + function + netlify.toml + README with three walkthroughs: browser-only GitHub+Netlify, Netlify CLI, and a **shared classroom relay** via `ALLOWED_ORIGINS` with exact origins / dot-boundary `*.suffix` wildcards so student stories stay drag-and-drop). Validated in three live field rounds; generated-function behavior pinned by tests (CORS boundary, lookalike rejection, SSE pass-through). *macOS signing + notarization*: CI signs (Developer ID) and notarizes (ASC Team Key) every build — Gatekeeper says "Notarized Developer ID", entitlements cover camera/mic/location beats, `codesign`/`spctl`/`stapler` verify step proves each build, and **Mac auto-update finally works** (electron-updater refuses unsigned builds; one-time manual download crossing the boundary). App icon recovered (gitignore had kept it out of CI builds since the start). *Transitions get real*: dissolve is a true blur-dissolve, slide direction authorable, easing honored; verified with a new Panorama & Transitions kit (equirect + cylindrical fixtures), round 1 PASS. *aiDialogTree must branch*: prompt now hard-requires 2–3 choices per node (models were sacrificing branching for depth → single-choice "choices"); validator warns on under-branched nodes. *First-touch batch*: start-screen Import tile activated, template naming step, chat-view speaker portraits, playSound effect on every effect host, GPS point-set binding UI in XRLocationsEditor, complete rehearsal-template display settings, User Guide QA pass + 5 new screenshots |
| **Experimental-beats protocol closed (AR Scene + Indoor Location)** | **v0.9.85**: *Verification protocol complete — no beat carries the EXP badge anymore.* **AR Scene** passed three iPhone field rounds, each exposing a real bug: exports silently dropped the compiled `.mind` tracker (AssetResolver folder list predated projectZipManager — `other/`/`videos/` missing), and importing ANY project destroyed arBeat's authored exits (`updateParameters` answered every anchors update with `clearConnections()`; now only re-points edges at replaced anchor targets). Kit ships with a deterministic seeded marker + tracker compiled at kit-build time. **Indoor Location** passed a full beacon-zone mock pass (floor plan + 3 zones + equidistant determinism probe); found + fixed: Mock Sensors panel was gated on GPS-only settings so indoor-only projects couldn't be tested. *Claude 5 family support*: single-segment model ids (claude-sonnet-5 / opus-5 / fable-5) were misclassified into the legacy thinking shape → guaranteed 400 with reasoning effort; classifier fixed, default model → claude-sonnet-5. *AI failures diagnose themselves*: refusals fail fast (nonRetryable) with an actionable message; thinking-ate-the-budget says what to change; corrupted stored dates no longer crash the Projects menu. *Fixed-layout overflow contained*: title-aware collision pass, per-box `maxHeight` with indicator scroll, measured button labels, whole choice stack shifts as a unit — long runtime AI text can no longer overlap titles or push buttons off-stage |
| **Camera & embed beats graduate (QR Scan + Web View)** | **v0.9.84**: *Verification-driven release* — both beats passed full manual rounds and dropped their EXP pill; bundled importable kits ship in `examples/`. *QR Scan*: 4-station story (asaps:// beat-jump with dashed flowchart jump edges, variable + inventory URIs condition-verified, raw payload + regex accept-pattern with rejection probe) + a printable code sheet generated with the in-repo qrcode lib; CI test pins printed payloads to story beat ids. Verified desktop + iOS. *Web View*: kit with 3 deployable test pages + `${baseUrl}`-substituted story; the round exposed that the **Electron `<webview>` path had never run** (`isElectron()` failed under contextIsolation; no `webviewTag`) — fixed (userAgent detection + webviewTag on main/preview windows), giving the desktop app real `did-navigate` exit-URL matching and X-Frame-Options bypass; **postMessage exits now work in webviews** via a guest preload bridge (`webview-bridge.js` → `sendToHost` relay; same page protocol as iframes); action rows honor schema-declared buttons (no phantom "Play Again"); prompt-clipping fixed. *Web View first-class in the editor*: VE tab for webView/qrScan/arBeat, panel slot rows for surface slots, author-sized frame ("Height" slider via `slotIntent.heightPercent`, smarter fill default ~71%), and fixed-canvas support (initializer bakes prompt + 900×480 frame, migrator converts, VE shows a no-load placeholder while authoring). Fixture-lesson baked in: verification kits always close the replay loop back to the start |
| **Location-based storytelling logic + multi-language video** | **v0.9.83**: *Set GPS Location beat*: new invisible logic beat writes named GPS point sets into story state (new `geoPoints` primitive, save-serialized) in four modes — **capture** the player's live position (authored fallback when no fix), **explicit** lat/lng, **scatter** N points uniformly-by-area within a radius of the current position / another point set / explicit coords, **preset** (author-curated). GpsLocation entries bind to a set via `pointName` — one entry expands into a geofence per stored point (inherits target/radius/effects) — closing the loop: scatter → geofence → `gpsProximity` condition (the geocaching mechanic). *Walkable placement*: scatter's `placement:'walkable'` samples points ALONG footways/paths/pedestrian streets and INSIDE parks from OpenStreetMap Overpass (no API key; accessible-by-construction; uniform top-up when coverage is thin or offline); the same sampler powers preset mode's authoring **map curator** (Leaflet: center+radius, "Generate on streets & parks", drag/remove/add pins — human review filters walkable≠safe). *Field-verified* on iOS + Android + macOS with a location-agnostic field kit (zero authored coordinates); the round surfaced + fixed a real bug — GPS/Indoor skip exits (permission denied, empty point store) returned the FIRST connection = the arrival target, masquerading as success; skip exits now prefer `defaultTarget`, and the kit's fail screen documents iOS's no-prompt-when-pre-denied state. Importable verification fixtures + CI validity tests. *Multi-language video*: VideoBeat gains `videoTranslations` ({lang→videoAssetId}, applied at the data layer in export's per-language pass + preview switching; localized videos ship in exports and survive import remapping) and **captions** — cue rows authored once in the VE, translated via the standard pipeline (`captions.N.displayText`), rendered as an auto-generated WebVTT `<track>` per language in preview + exports. ~90 new tests |
| **AI Conversation first-class fixed mode + stance-aware Co-Designer** | **v0.9.82**: *AI Conversation Chat vs Dialog*: new per-beat **presentation** choice (default `chat`, existing conversations unchanged) — `chat` renders the responsive scrolling `ChatDialogView` panel; `dialog` renders a positioned back-and-forth NPC dialog box with a free-text reply (the live mic/STT input reused), like a Dialog Tree and placeable on a fixed canvas. Gained a Visual Editor tab (was missing from `visualBeatTypes`), wired into the layout migrator + SchemaLocationInitializer (dialog bakes `text`/`input` positions; chat short-circuits), and the toggle lives in the VE "Conversation Settings" (schema param `ui.scope: 've-left'`, Inspector skips it). Faithful both modes: dialog paint now renders a stage-filling background + drops the drop-shadow + styles from `theme.textBox`; chat no longer shows slot rows over a blank stage — it uses the VBE `ChatDialogView` preview seeded with the opening line; switching Chat↔Dialog re-bakes/clears the positioned elements live. *AI Dialog Tree picker fixed*: `AIDialogTreeBeat` got the v0.9.62 `layoutTemplate` unification it never received — the picker read a non-existent field and always showed "Stacked" while the beat ran from the legacy `presentationMode` (a stored `chat-scroll` beat showed "Stacked" but ran as chat); now an authoritative `layoutTemplate` with legacy migration + runtime driven from it. *Co-Designer stance-aware + undoable*: the `updateCharacter` proposal (was displayName/description/color only) now sees traits/variants/stances/policy in the story digest, proposes stance/trait/variant/`variantSelectionPolicy` changes, and derives each variant's E/A from base traits + stance at apply time; Co-Designer character edits are now undoable (routed through `UpdateCharactersCommand`, one undo step per batch) |
| **Glanceable mood HUD + AI learns the stance model** | **v0.9.81**: *Mood display redesign*: the on-stage mood HUD (a shrunk circumplex disc — a dot to hunt, no mobile scaling, overlapping cards for several characters) becomes a glanceable **CharacterMoodToken** (SVG, no canvas/DPR bugs): a coloured gradient blob sitting IN the mood's quadrant over a dark ground so position AND hue name the mood, clean-grey neutral (no muddy tint blend), four-corner quadrant compass, and a one-word self-teaching label (moodWord). **MoodRail** lays several screen-docked characters out in a wrapping per-corner row instead of stacking; the token clamps into the stage (fixes mobile clip) and takes mobileFontScale. New per-character `moodFrame.displayStyle: token\|disc` (default token; existing HUDs auto-upgrade, disc kept as detail tier), Display select in the editor; wired into all three render paths. Tap-to-expand + first-encounter reveal deferred to phase 2. *AI generation learns stance/policy*: `stance` (circumplex coords + E/A-consistency rule) and `variantSelectionPolicy: random` (rehearsal variety) added to affectPrompt.ts (canonical), storyGenerationEnhanced.ts (first variant JSON shape example), both MCP servers (exact-match, no drift), and the Ideator synthesis prompt — the import path already preserved both fields, prompts were the only gap. 12 new tests |
| **Background fit + one-name rename + VE/Preview parity** | **v0.9.80**: *Background fit*: the "Background fit" select (Contain — letterbox / Cover — crop) next to "Change Background" now appears for EVERY beat type except panorama (was spatial-only); `spatialFit` became a base Beat field (generic parse, renderer-state push that also clears stale values between beats, base toJSON persistence), SlotFlowView gained `backgroundFit` with theme-colored letterbox bars; honored in VE, Preview, and HTML exports. *VE/Preview parity*: the VE's responsive slot preview now resolves backgroundAssetId → asset URL (asset-backed backgrounds were invisible in the VE for all slot beats); root-caused the deeper divergence to React's shorthand/longhand hazard — removing a `background` shorthand between renders wipes every background longhand and the diff doesn't re-set "unchanged" ones (VE's two-phase mount triggered it; Preview never transitioned) — fixed longhands-only with a documented house rule. *One-name rename*: header title box and Browser-card rename both write project name AND story title; header renames now reach the library card/banner/window title, and Browser renames of the open project survive auto-save. *Polish*: StancePad enlarged (220-240px, ~2× axis labels); User Guide screenshots for template gallery, stance pad, and AI helper (images 45, 48-51) |
| **Project templates (.asapst) + stance visualization** | **v0.9.79**: *Templates*: "Start from a template" 4th card in the new-project picker → gallery (description, "what this shows", tags, AI badge); adaptive template shelf in the Project Browser (full cards for small libraries, slim browse-line once established); `.asapst` format à la Word's .dotx — `projectType:'template'` flag is the source of truth (extension the affordance), importing ALWAYS instantiates a fresh copy (flag stripped, overwrite impossible) so distributed masters can't be edited; "Export as Template (.asapst)" completes the teacher loop; Electron file association added; first bundled template "Rehearsal: The Difficult Client" (briefing → AI conversation with a client in 4 stance-grounded disposition variants drawn at random → debrief) with CI consistency tests. *StancePad*: interactive Leary's Rose (warmth × dominance, octant labels) in variant cards (drag writes stance + re-derives E/A — sliders follow; trait-drift ghost marker), base personality (two-way lens via full-scale inverse rotation), and AI-helper preview cards (base drag re-derives all variants). *Fixes*: Windows/cold-start double-click file-open (argv parsing + signal-based pending-open IPC handshake; macOS cold-start no longer dropped); preview debug panel badges mid-story-start injected beats as "seeded"; AI-conversation topic keywords now match case-insensitively (explicit MATCHING RULES in the LLM eval prompt). User Guide audited/updated for v0.9.78+79. 54 new tests |
| **AI character helper + disposition variants** | **v0.9.78**: *Variant selection policy*: per-character `fixed`\|`random` — with `random`, story start draws uniformly from the character's variants and every restart re-draws (rehearsal variety); authored setCharacterVariant effects still override (instructor-controlled sessions); "At story start" dropdown in the CharacterEditor variants section. *Character development helper*: CharacterDevelopmentDialog — seeded plain-language brief + disposition chips (Cooperative/Hostile/Avoidant/Ambivalent/custom) → optional AI follow-up questions with tappable answers (always skippable) → preview cards refined by free-text direction, never sliders; accept writes a real Character (base owns identity, personality per-variant; 2+ variants default to random policy). Two entry points: "✨ Develop character with AI…" in the AI-conversation beat's NPC field (seeded from scenario+personality, links the result back to the beat) and "Generate with AI" in the Character Manager template picker. *Interpersonal stance model*: dispositions are stances on the Leary/Wiggins circumplex (warmth × dominance) with Brown-Levinson politeness manifestation hints in the prompts; variant agreeableness/extraversion DERIVED from base traits + circumplex rotation (McCrae & Costa 1989) so a shy person stays shy when hostile — one Big Five model for AI-generated and hand-authored characters alike; `stance` persisted per variant; theory + refs in docs/Interpersonal-Stance-Model.md. 40 new tests |
| **Workspace flexibility + project setup up front** | **v0.9.77**: *Vertical resize (finding 9)*: Inspector AI-suggestions footer gets a drag divider (double-click resets, persisted); sidebar cluster/unclustered divider position persisted. *Large dialog editor (finding 10)*: "Open large editor" opens the same DialogTreeEditor in a max-w-6xl modal — shared render helper, same onChange path, dormant `expanded` prop now drives scroll-box height + wider indentation. *Language up front (finding 14)*: Story Language select in the New Project dialog writes translation.sourceLanguage; shared languageCatalog.ts feeds LanguageSelector + dialog + settings select; TranslationContext gains sourceLanguage synced from globalSettings — Header selector and manifest stop hardcoding English. *Cultural setting*: collapsed optional New-Project section (profile dropdown + culture/region/community fields via shared CultureSettingFields); filling it writes globalSettings.culture AND enables features.showKnowledgeGraph — declaring a culture IS the KG opt-in, resolving the per-project-flag catch-22 |
| **Stakeholder-review response — scope clarity + HIGH bugs** | **v0.9.76**: Response to the Södertörn University expert review. *Scope/outcome clarity*: AI Suggestions renamed "Suggest Next Beat" with an explicit "creates a new beat after this one — never edits the selected beat" hint; Add emotion scrolls/focuses/selects the new row and the palette header names its project-wide scope; character delete confirmation names the character; translation add-menu actions labeled **AI**/**Manual** with legend; language search moved to the top, always visible, auto-focused. *HIGH bugs*: loading an AI-generated story now asks before replacing a non-empty workspace (the old project always survived in the library — the silent swap read as "AI deleted my beats"); dead "+ Add" on AI-generated Movement Choice beats fixed (text-derived choice ids collided on duplicate text → duplicate React keys/index desync; ids now unique + collision-proof row keys); ghost "Unclustered Beats" verified already-solved (list derives live) with an adjacent leak fixed — deleteBeat now prunes spatial-cluster containerBeatPositions |
| **Co-Designer — AI collaborator for the OPEN story** | **v0.9.75**: Design-phase counterpart to the Ideator (AI menu → "Design with Co-Designer"). Teal pop-out chat grounded in a live snapshot of the open project: FULL beat text (240k-char budget; huge stories degrade to marked snippets + a `get_beat_content` tool that fetches any beat's complete content mid-conversation), plus a systemic-KG STORY STRUCTURE section (counter/variable owners+writers+gates, choice inventory, narrative vectors, FLOW WARNINGS incl. dead ends). ↻ refreshes the snapshot from live state; menu-reopen and applies refresh automatically. On explicit request the model emits reviewable change proposals (editText / updateParams / addBeat with wiring / addNote) — per-item checkboxes, validated against live state, stale-project batches refused, auto library-backup before the first apply per day (skipped under VCS), every change one undo step. Per-project session history. *Fixes en route*: Ideator/Co-Designer pop-out refs could be hijacked by an open Preview window (capture now type-gated); preview start silently ignored clicks when the engine wasn't ready (now a visible banner) |
| **AI on existing stories: transformations + beat suggestions repaired** | **v0.9.74**: Helper-command AI parse was broken on every modern model (deprecated `temperature` to Claude — the sixth body the v0.9.53 sweep missed; `max_tokens`+`temperature` to gpt-5.x; no proxy support) — now routed through the providers' generateConversationTurn. Beat suggestions fixed (5 causes: gpt-5.x reasoning-token starvation on default budgets — effectiveMaxTokens floor now blanket-applies to all OpenAI-path defaults; Local/Ollama configs never auto-restored ("AI Not Configured"); 150KB schema dumped into every prompt → ~10KB digest; params not normalized → now via core normalizeBeat; fake story metadata). New schema-derived beat vocabulary (`beatSchemaVocabulary.ts`) feeds the deterministic parser, AI prompts, and suggestions — all 32 beat types targetable/suggestable, aliases from ids+displayNames+shorthands. Verified live on Claude Opus 4.8 AND Ollama. *Export*: `<noscript>` explainer for iOS QuickLook (file attachments in Messages/Mail render with JS disabled — recipients saw an eternal spinner). *Maintenance*: 17 runtime-adapter pinning tests; undici bump clears 3 Dependabot alerts |
| **GPT-5.6 family + pro reasoning, beat multi-selection, cluster fixes, unified AI adapter** | **v0.9.73**: *AI*: OpenAI GPT-5.6 tiers supported (Sol default / Terra / Luna); opt-in "Reasoning mode: Pro" routes through OpenAI's Responses API for GPT-5.6's deepest tier, triple-gated (explicit opt-in + 5.6 model + official endpoint) so Ollama/Kimi/custom endpoints are untouched. All ~6 drifted runtime AI adapter copies consolidated into @asaps/core (runtimeAdapter + jsonExtraction, −1,655 lines); exported players inherit thinking-block stripping, reasoning-token headroom, and vision parity; two latent JSON-repair bugs fixed (key-corrupting interior-quote pass, wrong-order truncation closing). *Graph editor*: multi-selection (shift-marquee / cmd-click), group drag incl. dropping several beats into a cluster at once, "Duplicate N beats" with internal connections rewired to the copies, "Delete N beats", ghost Backspace-delete removed. *Clusters*: autosize to the member grid (drop/merge/AI pipeline), AI-generated stories auto-arrange so clusters stop overlapping beats, cluster delete no longer crashes (beats survive), beats removable via hover ⏏ or drag to "Unclustered Beats". *Layout modes*: responsive→static conversion no longer triggers the false "corrupted project — legacy format" repair alert (migrator bakes canonical kind locations). *HUD/preview*: screen-docked counter meter frames hoisted to the top-level overlay — render in both layout modes, on every beat, and in HTML exports for the first time; preview mood tracker only shows when the story actually uses affect. *Docs*: User Guide audited/updated for v0.9.70–0.9.73 features |
| **Static-project VE options + clearer layout choice** | **v0.9.72**: After switching a project to Fixed canvas (static), the Visual Editor now shows the static option set (baked element rows with z-order/lock on the pixel stage) instead of the responsive slot controls — VisualPropertiesPanel suppresses slot rows in absolute mode and its layoutMode prop now mirrors the canvas gates (projectIsResponsive || !beatHasAuthorLocations). New Project dialog explains Responsive vs Static (fixed canvas) in author terms with best-for hints and a switch-later note |
| **Story Merge + setVariable calculations + i18n completion** | **v0.9.71**: *Story Merge* (Import → Merge Story): combine another exported .asaps story into the open project — incoming beats arrive as their own cluster beside the existing graph, character collisions decided per character (same person = references rewired; keep both = renamed "Elena 2"/`elena_2`), all beat/character/asset IDs and references remapped conflict-free, variables unioned by name. *setVariable calculations*: values starting with '=' evaluate as arithmetic (`= (var1 + var2) / 100`) with variables, counters, and character-scoped counters (`alice.trust`); safe evaluator, clean fallback on div-by-zero/unknown names, existing stories unaffected. *Fixes*: text-box visibility/opacity settings honored in Preview Window + exported player + slot mode (were VE-only); character images survive .asaps export across machines (orphan-asset safety net accepted only UUID ids; all in-app uploads use timestamp ids) + video assets no longer vanish on import; runtime UI-string catalog completes translation coverage (renderer chrome, AI loading messages, inventory HUD, multiChoice labels, aiConversation openingLine, AR anchor labels) in preview AND exports |
| **Input Image beat — AI vision analysis of player photos** | **v0.9.70**: New beat type: the player submits a photo (camera on mobile via the file-input `capture` attribute, file picker on desktop), a vision-capable AI model analyzes it against an author-defined analysis prompt, and the answer text is stored in a story variable. Photos are downscaled client-side to 1568px JPEG before upload (fits vision-API limits; the image itself is never stored — only the analysis text). Every failure mode — no vision provider, player skip, timeout, API error — resolves to an author-set fallback value so the story never stalls. Works in the Preview Window and HTML exports (all three AI runtime adapters gained `analyzeImage`); Claude (all current models), OpenAI (GPT-4o+), and local/Ollama vision models supported. Branching composes with the AI Condition beat. New `imageInput` slot role + `ImageInputElement` in the renderer, editor-mode placeholder, schema-driven inspector, palette entry with AI badge. 15 new unit tests |
| **OpenAI request correctness — Ideator + packaged-app fixes** | **v0.9.69**: Ideator story generation now works with OpenAI models — the tool-call loop and conversation turns sent the legacy `max_tokens` field (rejected by GPT-5 / o-series / gpt-4o) and forced `response_format: json_object` on free-text replies; both now route through the shared request builder (Claude unaffected — separate provider). AI beat-schema fetch fixed under `file://` in the packaged app (was 404ing and silently using a stale fallback); translate/export OpenAI paths hardened with the same token-param + "json"-in-messages guards. Zscaler/corporate-proxy blocking of `api.openai.com` diagnosed as network policy (not an app bug) — workaround is the Local (Ollama) provider |
| **Corrupted-project auto-repair + AI beat fixes** | **v0.9.68**: Projects with structural damage (partial `globalSettings`, legacy `type`-format layout elements) previously crashed the preview and Settings panel or rendered blank — now detected on load, settings reset to defaults preserving valid values, beat layouts salvaged (`type`→`kind` upgrade), unrecoverable elements dropped so they regenerate, author notified once. AI Dialog Tree no longer collapses to one level (choice matching by text fallback + bigger token budget + nesting-forcing prompt). AI Conversation: comma-separated keywords, deterministic variable/turn-count exits, interactor message appears instantly. Knowledge-graph cultural-adaptation scaffold landed behind a settings flag. Core+renderer+builder test suites now run in CI |
| **Visual-editor fixes + QR/ASML correctness** | **v0.9.67**: Element-add buttons (Character/Prop/Text) restored in slot/spatial beats (were gated to absolute mode); toolbar Characters button no longer crashes on selection; character-card edit button restored. QR-Scan target-beat handling clarified with QR jumps drawn as dashed flowchart edges. ASML importer round-trips project/variable metadata it previously dropped. ~280 new tests across renderer views, camera/AR beats, STT/TTS providers, hooks, and undo/redo commands. Two web-service security advisories cleared |
| **Test-coverage hardening + bug-fix release** | **v0.9.66**: Stability release, no new authoring features. Test suite grew 2788 → **4728 passing** across core/builder/renderer; the breadth-first coverage push surfaced and fixed **nine real bugs** plus one user-facing hang. Headline runtime fix: `ClaudeProvider.generateStory` now **streams** (`messages.stream().finalMessage()`) so long high-effort generations no longer stall past the Anthropic SDK's 10-minute request timeout (the "stuck at 21 minutes" report). Other fixes: `disconnectBeats` not actually removing the edge; Claude thinking-config misclassification for date-suffixed / 4.5 model ids (default model → `claude-sonnet-4-6`); silent asset-load failure after untitled→named save (`metadata.path` not rewritten on reassociation); `DeterministicCommandParser` plural-element matching; Ren'Py author dropped for canonical `_p("""...""")`; EndScreen/AISummary phantom-restart loop on empty action. ~3700 lines of dead code removed |
| **Ideator sessions UI + Markdown export** | **v0.9.57**: The IndexedDB-backed session store scaffolded in v0.9.53 is now wired up. New SessionsPanel (history icon, opens a modal listing past conversations newest-first with timestamp, status badge — In progress / Has draft prompt / Handed off — turn count, first-user-message preview, and Load / Export / Delete actions per row). Autosave on every assistant turn, on synthesized-prompt creation, and on GENERATION_COMPLETE. New "Export" button downloads the current transcript as Markdown (`ideator-YYYY-MM-DD-HH-MM-<slug>.md`) including metadata header, every turn as readable dialogue, web-search chips as blockquotes, and the synthesized prompt + knobs if reached. New "New" button cleanly starts a fresh conversation while preserving the current in Sessions. Per-machine scoping (not per-project, since Ideator output creates new projects on handoff). Progress strip's "30-90 seconds" estimate updated to "1-3 minutes; 5-10+ for reasoning models" |
| **HTML export runtime fixes (rich-affect stories)** | **v0.9.57**: A single test export of "The Weight of Late Light" (38 beats, rich affect, AI-generated) reproduced three independent runtime bugs that didn't show in the in-app Preview Window. (1) `calculateSmartTextBoxDimensions` used charWidth = fontSize * 0.42 — same outdated multiplier the v0.9.55 SchemaLocationInitializer fix already corrected to 0.58. The runtime kept the old value; for twine theme Courier monospace at 18px it estimated ~79 chars/line when reality is ~55, so auto-grown text boxes ended up too short and overflowed into the action button. Bumped to 0.58 — matches both proportional and monospace. (2) `DefaultLocationGenerator` placed `creditsButton` at currentY (in the text area) while `restartButton` was anchored at the bottom, so both centered at the same x and rendered on top of each other ("Begredagain"). Now side-by-side at stageHeight-100 (restart right, credits left). (3) `LOCATION_TYPE_MAP.message` had a legacy fontSize 24 — sized for "The End." placeholders but 33% bigger than the body-text `text` (18). AI-generated literary endings rendered visibly oversized vs surrounding story and pushed smart-sizing to grow into 921×631. Aligned to 18 |
| **AI runtime beat hardening** | **v0.9.57**: Two layers, both from the same field report. (1) `WebAIProvider.generateContent` had no reasoning-model headroom — AIInfoTextBeat asks for maxTokens: 250 (sized for 2-3 sentences) but on GPT-5 / Kimi-K2 / o-series the hidden reasoning_content consumes that budget entirely, returning truncated JSON. Mirrored the v0.9.54 PreviewWindow shim: `effectiveMaxTokens(model, requested)` floors reasoning-model budgets at 4096, leaves non-reasoning models untouched. Lives inline in WebAIProvider (no cross-package dep on builder). (2) `AIInfoTextBeat.generateText` previously leaked raw JSON braces to the screen on parse failure — two failure paths both set `text = rawResponse`. New two-stage extraction: full JSON.parse on a `{…"text"…}` block, fallback to tolerant regex salvaging just the "text" field even from truncated JSON, then authored `fallbackText` if both fail. Under no path does raw JSON reach the user |
| **Story-gen craft: traits + variants required at rich tier** | **v0.9.57**: Strengthened the rich-affect prompt rules after observing real gaps in an AI-generated rich-tier story — zero traits on any character (collapsing rich into decorated-standard since runtime emotion modulation requires populated traits) and zero variants despite an explicit `bookmarkAffectState` naming a character transition (the bookmark captures the runtime snapshot but the variant captures the authorial shift the player sees). Both `affectPrompt.ts` (the core "rich tier" guidance) and `storyGenerationEnhanced.ts` (the Anti-Patterns section) now require: every recurring character has at least 3 Big Five trait dimensions populated (with explicit mapping examples — "disciplined" → high conscientiousness, "depressive silences" → high neuroticism), and every bookmark whose name describes a character transition pairs with a variant on that character (visibly distinct displayName, shifted mood/sentiments, setCharacterVariant Effect at the transition). Mirrored to both MCP server copies |
| **Dialog-tree text/dialog/npc false-positive fix** | **v0.9.57**: PositionedBeatView's text-element fallback matched any location whose name contained the substrings "text", "dialog", or "npc" and returned the dialog narrative. The bug surfaced on a `dialogTree` beat with a choice text *"Say no, warmly. Tell him you'll be asleep, and to text you the score with the first coffee."* — the word "text" inside the choice label hijacked the branch, so the third button rendered the speaker text instead of the choice label. Gated the keyword fallback on `loc.kind !== 'button'`; explicit-kind buttons now route to the button-label path correctly. Same fix covers "dialog" and "npc" substring collisions |
| **HTML export endless-loading fixes** | **v0.9.56**: Targeted bug-fix release driven by a field report — exports deployed to web servers were producing endless loading screens. Three independent failure modes, all fixed. (1) Folder-mode export was only running 9 of the 12 `.replace()` calls the HTML template requires; `{{TTS_CONFIG}}`, `{{TTS_LANGUAGE}}`, and `{{SHOW_SESSION_LOG}}` were emitted verbatim into the inline `window.ASAPS_CONFIG = {…}` block, producing `Unexpected token '{'` and leaving ASAPS_CONFIG undefined — every downstream access threw. Single-file mode was unaffected. (2) Cloudflare Rocket Loader was rewriting inline scripts on Cloudflare-fronted deployments, mangling the config literal AND loading the base64-data-URL player bundle before its config script. Added `data-cfasync="false"` to all 9 `<script>` tags in both export templates — Cloudflare's documented opt-out, harmless on non-Cloudflare deployments. (3) `WebPlayer` URL-fetch branch hung silently on bad zip downloads (HTML SPA fallback, slow/incomplete responses). Added a 30s AbortController fetch timeout and a ZIP magic-byte check (`PK` at offset 0) with specific error messages — "server returned an HTML page instead of the zip" when the first byte is `<`, hex preview of the first 16 bytes otherwise |
| **Visual-first-impression layout pass** | **v0.9.55**: A focused visual-quality release for AI-generated stories. People see before they think — bad layouts hurt first-impression credibility even when content is fine. Six iterations of calibration on the title→text→button stack in `SchemaLocationInitializer.ts` produced layouts that read cleanly at preview scale: `autoSizeText` charWidth multiplier 0.42→0.58 (titles stop wrapping spontaneously); TitleScreen title + author default to ≥75% stage width as visual centerpieces; text-box height clamped to availableHeight as hard ceiling (was Math.max — could overflow); title→text gap calibrated through 5 rounds to +50 (comfortable rhythm); button minWidth 120→160 ("Learn More" / "Continue" / "Play Again" stop wrapping to 2 lines); action buttons moved stageHeight-150→stageHeight-100 to use the dead air below. Plus `requireScrollToBottom` extended to OnlineContent / AIInfoText so long AI-fetched content scrolls with the existing gradient indicator + button-gate machinery instead of overflowing into the button area. New **Reset Layout** button in the Visual Editor toolbar (LayoutGrid icon) so existing beats can opt into new layout math without delete-and-re-add — re-runs `initializeLocationsFromSchema` with confirmation + undo support |
| **Long-title handling (prompt + defensive font shrink)** | **v0.9.55**: Two-pronged. Prompt-side: `storyGenerationEnhanced.ts` tells the AI explicit title-length limits — `titleScreen.title` 2-5 words ≤40 chars, `titleScreen.author` ≤40 chars, `onlineContent.title` 2-5 words ≤35 chars — with concrete short-and-good examples ("Bergen Transport") and the long-title counterexample ("Transport options in Bergen, Norway's Coastal Hub", 49 chars). Layout-side defensive backstop: if the AI ignores the rule and emits a long title anyway, the title font size auto-shrinks in 2px steps until the text fits the box's inner width, down to a 14px floor. Short titles render at full size unchanged. Logs the shrink decision so anomalies are visible |
| **gpt-5.5 default + Claude max effort tier** | **v0.9.55**: Default OpenAI model bumped `gpt-5.2 → gpt-5.5` across 8 callsites (config dialog, providers, AIService, PreviewWindow, StoryPreview, HtmlExportDialog, HtmlExporter, ai.ts comment). Verified per `developers.openai.com/api/docs/guides/reasoning` that GPT-5 reasoning levels are `none | minimal | low | medium | high | xhigh` — no `max` upstream. New `max` effort tier exposed in the UI dropdown labelled "Max (Claude 4.5+ only)" since Anthropic adaptive thinking supports five tiers (`low | medium | high | xhigh | max`). ClaudeProvider passes `max` through unchanged on adaptive; legacy `enabled`-shape models cap at xhigh's 32000 budget. Default `max_tokens` for `max` effort = 128k since thinking spans are larger. OpenAI defensive cap: if a user sets `max` globally and switches to an OpenAI provider, the effort is downgraded to `xhigh` before sending so the request doesn't 400 |
| **Ideator follow-ups: clean project independence + variant naming** | **v0.9.55**: The v0.9.54 cleanup continued. Ideator's system-prompt context line "The author is working in an ASAPS project called X" was misleading — the conversation doesn't depend on the open project's content, and the generated story creates a NEW project on handoff (not modifying the open one). Both the visible subtitle and the model-side context line are now gone; the conversation has zero anchor to the open project's identity. Plus a new craft rule in `storyGenerationEnhanced.ts`: every character variant's `displayName` must be visibly distinct from the base character's name (triggered by "How to Hold Someone" generating Sam's variant with displayName="Sam", which made the variant dropdown show "Sam" twice with no visual distinction; correct shape is "Sam (after disclosure)") |
| **Kimi end-to-end + Claude Opus 4.7 thinking** | **v0.9.54**: Kimi K2.6 now works fully end-to-end (Ideator interview, story generation, runtime AI beats) — forward `reasoning_content` on tool-call replays (Kimi rejects requests without it), use `max_completion_tokens` per Moonshot docs, tool-loop honours user `maxTokens` (was hardcoded 1500 which silently truncated reasoning models mid-arguments-JSON). Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5+ now use Anthropic's new `thinking.type='adaptive'` + `output_config.effort` shape (the legacy `thinking.type='enabled'` was deprecated upstream between sessions); older models keep the legacy `budget_tokens` shape. `max_tokens` scales with reasoning effort because thinking tokens count against it in adaptive mode (xhigh→96k, high→64k, medium→48k, low/none→32k). xhigh effort preserved correctly (low/medium/high/xhigh/max are all valid per Anthropic docs). Truncation errors now report duration, accumulated length, configured cap, and a thinking-eats-budget hint when relevant |
| **Story-gen prompt craft rules** | **v0.9.54**: Four new craft rules added to `storyGenerationEnhanced.ts`. Three universal anti-patterns: (1) transitional infoText required when invisible beats connect dialog scenes with different speakers or locations — no more characters teleporting between beats; (2) escalate or complicate prior information, don't echo it across beats with different wording; (3) choice text declaring "let it go" / "drop the case" must produce a narratively distinct path, not just flip a flag while the next beat behaves identically. One genre-gated for mystery / detective / thriller / crime / noir: evidence beats distribute fragments across discoveries; full reveal reserved for after at least two evidence beats + a path commitment; suspects don't confess the central secret on first meeting |
| **Ideator: provider-agnostic tool-use + interview tightening + Affect Depth in handoff** | **v0.9.54**: Ideator's tool-use loop (Brave Search) now works on **any tool-calling provider** — Claude, OpenAI, Kimi, Moonshot, any OpenAI-compatible — not just Claude. The OpenAIProvider's tool-use path translates between Anthropic and OpenAI function-calling schemas. Interview-loop tightened without disturbing Claude: dropped "err on the side of one more question" (which Kimi read as a hard rule and over-asked), added a recap-then-final-grounding-question pattern, added "do not loop on dimensions already covered" with explicit dimension list. Synthesis now maps content to length/complexity (multi-month + 3+ characters → long, mental-health/relationships foregrounded → complex) instead of reflexively defaulting to medium/moderate. New Affect Depth dropdown in the prompt-preview handoff form (was missing relative to the direct StoryGenerator path); synthesizer pre-populates based on conversation content (rich for emotional drama / mental health, sparse for puzzles / educational). Synthesis maxTokens 4000 → 8000 to give reasoning models room |
| **Runtime AI: Opus 4.7 AI Summary + Kimi reasoning headroom + proxy endpoint** | **v0.9.54**: Three runtime-only AI fixes. Claude `generateContent` and `generateConversationTurn` in the runtime adapter now strip `<thinking>` / `<reasoning>` blocks — fixed AI Summary on Opus 4.7 rendering as title + empty box because unstripped tags reached the renderer and the unknown elements collapsed. Runtime AI adapter uses the same-origin proxy when the Vite dev server is serving (was hardcoded `:3001` which required a separately-running `dev:api` and produced ERR_CONNECTION_REFUSED at play time). `AIInfoTextBeat`'s 250-token budget got an `effectiveMaxTokens(model, requested)` shim that bumps to 4096 floor for reasoning models — visible content was previously empty because `reasoning_content` consumed the whole budget |
| **Ideator: Conversational Ideation Tool** | **v0.9.53**: A pop-out conversational ideation assistant that interviews authors about a complex issue they want to represent with IDN, then synthesizes the transcript into a `StoryGenerationRequest` that flows through the existing AI generator. Built in collaboration with @ChidaluOC on a v0.9.33 fork; integrated into current main with the v0.9.51 schema-driven pipeline + v0.9.52 streaming + Cancel button intact. Conversation runs through Claude with optional Brave Search tool-use (visible search-query chips inline in the transcript), falls back to plain conversation when Brave key isn't set or active provider isn't Claude. Per-project session storage so authors can leave and resume a conversation later. Hand-off message protocol (SUBMIT_REQUEST / GENERATION_COMPLETE / GENERATION_FAILED) via cross-window postMessage. Plus the back-channel recovery fix for the case where the main builder is hard-reloaded mid-flow — the manager captures event.source on every incoming message so a reload doesn't permanently break the GENERATION_COMPLETE return path. Bonus: Claude `temperature` param removed from all five Claude request bodies (newer Anthropic models reject it as deprecated; @ChidaluOC's branch had this fix and was right) |
| **Character ID Clarity** | **v0.9.53**: Character Editor now shows a read-only ID field at the top of the Basic tab (the canonical reference key, frozen because conditions / sentiment refs / AI prompts / saved-state snapshots all key off it). Renamed the misleading "Internal Name" label to "Code Name" with helper text explaining it's a separate, editable label distinct from the ID. Inspector's sentiment-target autocomplete option labels expanded from `"Elena"` → `"Elena (player character)"` so Chrome's two-line `<datalist>` rendering reads as one descriptive entry instead of looking like duplicate `elena` / `Elena` items. Runtime was already tolerant via characterRef.resolveCharacter's id → name → displayName cascade — this release is purely UI clarification |
| **Streaming Generation + Live Progress** | **v0.9.52**: AI story generation now streams content tokens through a Server-Sent-Events proxy path. Two real wins: (1) connection stays warm during long reasoning pauses on slow models, eliminating the 504 timeouts seen with the buffered path (verified live on Kimi: 7,490 upstream chunks over 144s without a single timeout); (2) the StoryGenerator dialog button shows "Generating… N chars" with the count ticking up live, throttled to 10Hz so React 18's automatic batching doesn't swallow the updates. Provider-side: OpenAIProvider.makeProxyRequest gained a streaming branch that reads response.body via getReader() + TextDecoder, accumulates content, and wraps the assembled string in the same shape the buffered path returns so downstream code (schema-driven pipeline, JSON parse, normalize) is identical. Cheap version per the original task scope — no incremental JSON parsing yet. Also fixed: ConditionBeat.updateParameters didn't persist sentimentTarget / sentimentEmotion / moodAxis / emotionName, so AI-generated sentiment conditions showed empty Toward/Emotion fields in the Inspector despite correct values in the saved debug. Plus updateAffect.effects declared in schema (silences the v0.9.45+ multi-row affect-bundle warning) and tolerant non-JSON error bodies on upstream 5xx (Envoy "upstream connect error" plaintext now surfaces as a readable message instead of SyntaxError) |
| **Schema-Driven Normalize/Validate Pipeline** | **v0.9.51**: Architectural release. The four ad-hoc cleaners scattered across OpenAIProvider, AIService (×2), and App.tsx — each with its own hardcoded rules for flattening AI output into canonical shape — replaced with a single schema-driven pipeline in `@asaps/core/normalize`. New beat types and condition variants are now schema-only edits. Schema bumped 2.2 → 2.3 with a `conditionTypes` registry (16 condition variants, each with required/optional/aliases), per-beat `nested` blocks declaring how to flatten, and per-parameter `aliases` / `coerce` / `references` metadata. Pipeline runs at all four entry points: AI generation, MCP injection, zip-import, and project-load. Plus a working Cancel button (was a non-functional placeholder — now plumbs AbortSignal through providers and short-circuits the retry loop), robust 5xx error handling for upstream gateway 503s with plaintext bodies, and a schema-source-of-truth fix that resolved drift across four copies of core-beats.json (root file, public/, dist/, electron build dir) plus the Electron API server's stale in-memory cache. 25 new golden-file regression tests against real captured AI debugs catch any future divergence. Net code reduction: −67 lines in App.tsx alone, plus several hundred lines of duplicated cleanup logic deleted from AIService and AIValidator. 2,541 tests passing across core + builder, 0 failures |
| **AI Generation Fidelity Fixes** | **v0.9.50**: Several fields the AI was emitting got silently dropped before the project saved. Characters: `handleStoryGenerated` never called `setCharacters`, so the AI's character definitions vanished and `syncProjectData` then wrote whatever was in `charactersRef.current` (usually the *previous* project's characters) into the new project — explaining the long-standing "Character Editor empty / shows characters from another story" report. Affect-stack condition subfields: `sentimentTarget`, `sentimentEmotion`, `moodAxis`, `emotionName`, `traitName`, `goalId`, `goalStatus`, `variantId`, `baseline`, plus XR-condition fields, were nested under `condition.*` but neither flattening pass copied them to top-level params before `delete params.condition` — Inspector showed half-filled forms. Cluster strings: AI emits `cluster: "Act II - …"` per beat; builder never created Cluster container objects, so groupings sat unattached. Per-beat author notes (the AI's `notes: "AFFECT BOOKMARK …"` reasoning annotations) reached `beat.notes` for the first time. Inventory `quantity`: schema declares string (so authors can write `$gold`), AI emits number — generic `autoCoerceParameterPrimitives()` pass coerces primitive values to the schema-declared type. AI validator: per-condition-type required-field map replaces the flat list that emitted bogus warnings. EndScreen `connection` aliased to `restartConnection`. Translator `max_tokens` 8192 → 32768 with explicit truncation diagnostic for Brahmic / CJK / RTL targets |
| **Test-Suite Repair** | **v0.9.47**: Hotfix for two production bugs and a sweep of stale tests. ConditionBeat: timeline-reporting code (`context.getStory().getBeat(targetId)` for the diagnostic display) was throwing in story-less contexts and the throw was caught by the outer try/catch that wrapped the whole condition evaluation, returning `getNextBeat(context)` (null) instead of the correctly-computed `trueTarget` / `falseTarget`. Wrapped the timeline reporting in its own defensive try/catch. EndScreenBeat: `reset: true` only fired on the restart path; with `showRestart: false`, exiting the story left state intact. Now applies reset on every exit path. Plus stale-test alignment for TTS providers (streaming-mode result shape, `eleven_v3` default), TTSService (`playSoundFromBlobAndWait` not `playSoundFromBlob`), ConversationPromptBuilder (`CONVERSATION GOALS` not `CONVERSATION RULES`), and ttsWait. Full test suite green for the first time on this branch — 2,384 tests passing |
| **Affect-Aware AI Generation** | **v0.9.46**: Both AI generation paths (in-app providers and the standalone MCP servers) now teach the LLM the full Layer-2 + affect stack — characters as runtime entities, mood / sentiments / emotions / traits / goals / variants / dossier policies, baseline-relative conditions, bookmarks, the symmetry rule between Effects and Conditions. Tiered always-on with an `affectDepth` dial (Auto / Sparse / Standard / Rich): Auto reads the user prompt and picks (state-capitals quiz → sparse; "interactive drama about a friend's mental health crisis" → rich). Single shared module in `@asaps/core/prompts` is the source of truth; MCP servers carry manually-synced copies. Validated across 8 generation runs on GPT-5.4 + 5.5 with various reasoning levels. New `asaps_get_affect_guide` MCP tool for Claude Desktop |
| **Auto-Fix Orphan Bookmark References** | **v0.9.46**: Weaker AI models reliably author `baseline:{bookmark:"X"}` refs without the upstream `bookmarkAffectState` Effect that takes the snapshot. New `autoFixOrphanBookmarkReferences` validator pass detects orphan refs and converts them to `baseline:'initial'` — preserves the delta-from-snapshot intent while sidestepping the runtime-zero bug. Mirrors `autoFixEndingRestartConnections` / `autoFixAiSummaryMaxLength` patterns. 9 unit tests including effect-discovery via choice effects, nested dialogNode choices, and updateAffect.effects[] |
| **Project-Name Uniquify** | **v0.9.46**: AI generation was bypassing the duplicate-name check that other create paths used; convergent AI titles silently collided. New `findUniqueProjectName` helper wired into `createProject` so every entry point benefits — AI gen, manual create, ASML import, Twine import. Returns the desired name if free, else "X 1", "X 2", … skipping holes. Case-insensitive, whitespace-trimmed |
| **Calendar-Day Date Formatter** | **v0.9.46**: Fixed `Today HH:mm / Yesterday / N days ago` labels in the Project Library that used rolling-24h diffs (mislabelled yesterday-evening timestamps as "Today"). Replaced with calendar-day comparison in local timezone; added time-of-day to the Yesterday branch; switched to 24h notation throughout |
| **Affect-Effect Authoring UX** | **v0.9.45**: Inline labels on every numeric input (val/aro/Δ/sal/→) with hover tooltips, palette-backed combobox auto-complete on emotion and target fields, library of 8 intent-shaped effect templates ("empathetic — full support", "pushy / dismissive", "boundary respecting", etc.) accessible via "+ apply template…", and a live "what does this choice do?" plain-language summary block under the rows. Authors can compose multi-row affect bundles in seconds with a sanity check that updates as they tweak |
| **Baseline-Relative Conditions + Bookmarks + Templates** | **v0.9.45**: Mood/emotion/sentiment conditions get a "Compared to" switch — literal threshold (default), delta from initial (story-start / first-touch), or delta from a named bookmark. Runtime captures initials lazily *and* at seed time so off-neutral seeded characters get the right baseline. New `bookmarkAffectState` Effect snapshots affect state under an author-named handle for later comparison. 28-template library covering threshold *and* delta-from-initial flavours across mood/emotion/sentiment/trait/goal/variant, accessible from both the ConditionBeat editor and the per-beat Requirements editor. UpdateAffectBeat (the standalone affect-update beat) also migrated to the ChoiceEffectsEditor surface so it gains all 8 effect templates, the live summary, and bookmark support too — legacy single-row params auto-migrate. Closes the "has X improved?" authoring question without needing absolute thresholds |
| **Affect Condition Operators in Editor** | **v0.9.44**: The six new ConditionBeat operators introduced in v0.9.43 (mood, sentiment, emotion, trait, goal, characterVariant) are now first-class in both the Inspector's ConditionBeat type-dropdown AND the per-beat Requirements editor. Per-type forms with cascading character → goals/variants/traits dropdowns. User Guide updated with fresh screenshots and a broader content audit (Debug Tools section rebuilt, Speaker Display moved to its real home, Settings catalog restructured, Asset Manager tabs corrected). 8 stale images refreshed, 8 new images added |
| **Character Variants** | **v0.9.43**: A single Character record can carry multiple persona overlays (e.g., "introvert Alex" / "extrovert Alex" — same id, same beats, only the affect / portrait / displayName slice swaps). `setCharacterVariant` Effect for player-driven picks at story-start, `characterVariant` ConditionBeat operator for branching, atomic re-seed of mood + sentiments on switch. Linked sub-cards in the Character Manager grid with per-variant inline trait/mood/sentiment editors and portrait override |
| **Mood HUD Overlay** | **v0.9.43**: 2D mood pad on Russell's circumplex mountable as a per-character on-stage HUD or screen-docked overlay. Card layout with portrait + name header, colour-coded quadrant tints (yellow-joy / red-fear / blue-sad / green-serene), emotion-palette markers, optional qualitative descriptor ("pleased, alert"). Available in Preview Window AND deployed standalone web exports |
| **Goals + GAMYGDALA Emotion Firing** | **v0.9.43**: Authored `Character.goals[]` with optional satisfaction predicates. Runtime tracks status (open / met / failed / abandoned) and auto-fires pride+joy on met / shame+sadness on failed (scaled by goal priority, routed through trait modulation). New `setGoalStatus` Effect, new `goal` ConditionBeat operator |
| **Dossier Policy Fork** | **v0.9.43**: Per-character `dossierPolicy: 'reAnchor' \| 'reflection'` switch. Mode A rebuilds dossier from structured state every turn (no drift). Mode B accumulates per-turn reflections so the character grows. `Reflection` runtime state, 32-entry per-character cap with salience-aware eviction, new `addReflection` Effect |
| **Personality Traits + Archetypes** | **v0.9.43**: Static Big Five trait bag per character. Traits modulate emotion deltas at runtime via project-level TraitModulationProfile. New `trait` ConditionBeat operator. 10 psychology-grounded archetype presets (narcissist, anxious-introvert, conscientious-leader, free-spirit, recluse, hothead, peacekeeper, stoic, trickster, balanced) loadable from the editor with self-directed sentiment seeds |
| **Emotion Nodes + Author-Editable Palette** | **v0.9.43**: Per-character runtime emotion levels in [0, 1] decaying each beat. `fireEmotion` Effect auto-nudges mood via palette weights. Default Ekman 6 + pride/shame/interest. EmotionPaletteEditor in the Character Manager lets authors rename/reweight/add/remove |
| **2D Mood Pad in Editor** | **v0.9.43**: Russell's circumplex MoodPad in the Character Editor's Affect tab — click/drag to set initial mood, emotion-palette markers show emotional geography, sliders below for fine-tune |
| **Affect-Driven Story Endings** | **v0.9.43**: Example "Standing Beside Alex" project demonstrates mood+trust gating, three counter buckets (max/partial/failed) tracking choice quality, AI-summary beats writing tier-specific friendship retrospectives via dossier injection |
| **Asset Deletion Round-Trip** | **v0.9.36**: Removing an asset in the UI now removes the binary on disk and prunes the manifest entry for directory-format projects, so deleted assets stop being re-pushed to GitHub |
| **Git LFS Off for Assets** | **v0.9.36**: Auto-generated `.gitattributes` no longer routes assets through LFS — fixes clone/pull losing assets entirely on systems with `git-lfs` installed. Existing projects auto-migrate on next save |
| **History Tab Project Switch** | **v0.9.36**: Switching/cloning into a new repo no longer briefly shows the previous project's commit log — HistoryTab clears state synchronously on `projectPath` change |
| **Missing Assets Dialog Fix** | **v0.9.36**: Locate / Relocate All / Remove Missing now actually persist (manifest path was wrong); Remove Missing also closes the dialog on success so the popup stops re-appearing on every launch |
| **DialogTree NPC Delete** | **v0.9.36**: NPC responses now have an X button — removes the NPC line plus any nested player choices below it; preserves the preceding player choice with its target reset |
| **Background Sound Picker** | **v0.9.36**: Standalone Inspector mount now receives asset handlers, so uploading an MP3 from the Background Sound picker no longer fails with "r is not a function". Also dropped the misleading `sfx` subtype filter |
| **Cluster Drag-Into-Flowchart** | **v0.9.36**: Beats can be dragged directly onto an expanded cluster in the flowchart (not just from the sidebar). Cluster `+ Beat` buttons removed — beat creation is via the sidebar palette |
| **Electron Parity: PW Trace** | **v0.9.35**: Live red flowchart trace now works in the desktop app — added bidirectional IPC channel (`preview:send-to-main`) so the PW's VISITED_BEATS_UPDATE messages reach the main builder window in Electron, not just the web build |
| **Electron Parity: Debug Window** | **v0.9.35**: Pop-out Debug window now opens correctly in the desktop app — full Electron IPC plumbing (`createDebugWindow`, `debug:*` channels, preload `debug` object, `electronWindowOpen` ready-gate) mirroring the Preview Window setup. Was previously rejected by the main window's `setWindowOpenHandler` |
| **Path Tree: Decision Path Panel** | **v0.9.35**: Sticky right-side panel summarises committed selections from the tree as a numbered linear list (same shape as the backward analyzer's decision path), with effects pills per entry and final accumulated state |
| **State Requirements (Runtime)** | **v0.9.34**: `requires` is now a first-class authoring primitive — declare a beat's prerequisite, pick a fallback beat, and the engine redirects at runtime when the requirement is unmet. AND/OR combine modes. Universal Inspector section with condition picker + explanation + fallback + severity |
| **Requirements on the Flowchart** | **v0.9.34**: Requirement redirects render as dashed amber edges labelled with the explanation; analyzers (Reachability, BackwardAnalyzer, PathTree) now treat fallback targets as real edges so gated-only beats aren't mis-flagged as orphaned |
| **Live Current-Beat Marker** | **v0.9.34**: PW red trace now paints on beat *enter* (not after leaving), and the currently-executing beat stands out with a thicker, brighter, pulsing border |
| **Inspector State Dropdowns** | **v0.9.34**: Dropdowns populate from the full working set of items/counters/variables referenced anywhere in the story — not just character/globalSettings declarations. AI-generated stories no longer produce empty pickers |
| **Character & Asset Delete Buttons** | **v0.9.34**: Trash buttons in the character editor (both grid and list views, including selection mode) and in the asset picker. Confirmation prompts prevent accidental deletes |
| **InputText Fixes** | **v0.9.34**: Character dropdown now populated with every project character (including the player); input value no longer leaks between consecutive inputText beats without placeholders |
| **Analyzer Accuracy** | **v0.9.34**: Hub-option retry now scans 6 beats ahead for state-dependent targets (not just immediate conditionBeats); `requires-unfulfillable` is a structural ancestor-writes-state check, not simulation-based; Forward Analysis "Outcomes" count explains its breakdown (endings vs cycles vs dead-ends) |
| **AI Generation Robustness** | **v0.9.34**: `aiSummary.maxLength` numeric values (220, 400, etc.) now auto-coerced to `"short"`/`"medium"`/`"long"` enum instead of bouncing validation |
| **PathTree Analyzer** | **v0.9.33**: New Tree tab in Path Analysis — collapsed tree over simulated paths with hub detection, radio/checkbox selections, scope-aware additive state composition, and state-aware conditional branch rendering |
| **Hub Visit Log** | **v0.9.33**: Interactive visit cards for hub nodes — pick options + items across multiple visits, see accumulated state per visit, visit counterfactual scenarios no single simulator path realises |
| **Story Soft-Lock Detection** | **v0.9.33**: New StoryWarnings analyzer flags keypad soft-locks, ungated puzzles, unfulfillable `requires`, and paths that violate `requires` — with inline warnings on visit chains showing exactly where players get stuck |
| **`requires` Annotations** | **v0.9.33**: New Level-2 `StateRequirement` type on beats — authors (and AI) declare narrative gates; the analyzer validates them against path reachability |
| **Pop-Out Debug Window** | **v0.9.33**: Story Debug Tools (Reachability / Path Analysis / Story Logic) now open in a separate browser window — drag it to a second monitor while editing |
| **Preview Window Trace** | **v0.9.33**: Beats visited during a preview session are painted live on the main flowchart with a red highlight; complements the existing yellow debug highlight |
| **Claude Extended Thinking** | **v0.9.33**: AI Config Dialog exposes extended-thinking effort levels for Claude (minimal…xhigh), mapped to `thinking.budget_tokens`; Max Tokens now visible for all providers |
| **AI Prompt `requires` Teaching** | **v0.9.33**: Internal + MCP generation prompts teach the `requires` convention so AI-authored stories declare narrative gates instead of producing soft-locks |
| **Kimi K2.5 Support** | **v0.9.32**: Full end-to-end support for Kimi K2.5 as an OpenAI-compatible story generation provider (reasoning model handling, 10-minute proxy timeout, JSON repair for unescaped dialogue quotes) |
| **AI Prompt Fixes** | **v0.9.32**: EndScreen/aiSummary now get explicit restart edges to beat_0 (prompt + auto-fix); dialogTree is the default multi-choice beat, movementChoice reserved for spatial hotspots |
| **Undo/Redo for Characters & Global Settings** | **v0.9.32**: Character Editor and Global Settings edits now flow through the command system — Ctrl/Cmd+Z works for these too |
| **InputText Auto-Focus** | **v0.9.32**: Text input beats auto-focus and select sample text on entry — no extra click needed, works for consecutive InputText beats and in HTML exports |
| **SetTimer Expiry Fix** | **v0.9.32**: SetTimer continue connection no longer silently drops on save/load; keypad and inputText beats no longer block the engine on cancel |
| **AI Conversation Beat** | **v0.9.31**: Real-time AI conversations with author-defined steering rules (directions, triggers, actions) and free-form/voice input |
| **Speech-to-Text** | **v0.9.31**: Voice input for AI Conversation beats — Web Speech API (browser-native), whisper.cpp, Vosk, or OpenAI Whisper |
| **NPC Auto-Exit** | **v0.9.31**: DialogTree/AIDialogTree nodes can auto-advance without showing choices (NPC dismissals, forced exits) |
| **VideoBeat VE** | **v0.9.31**: Video selection and playback config fully in Visual Editor, respects position/size, first-frame preview in editor |
| **Local TTS/STT** | **v0.9.31**: Optional self-hosted voice via mlx-audio (Kokoro TTS) and whisper.cpp STT — zero cloud dependency for fully offline stories |
| **LLM Eval Harness** | **v0.9.31**: Automated test suites for benchmarking local LLMs (embedded playback + story generation) |
| **AI Prompt Checklist** | **v0.9.31**: Verification checklist in AI generation prompts (structural integrity, reachability, connection rules) |
| **AI Prefetching** | **v0.9.30**: Background content generation for AI beats — starts while user reads previous beat, hides API latency |
| **Session Logging** | **v0.9.30**: Exportable play session logs (beat path, choices, AI outputs, branch decisions) in PW and HTML exports |
| **Rich Text** | **v0.9.30**: Markdown-lite formatting (**bold**, *italic*, ~~strikethrough~~) in text boxes — VE and Preview |
| **VE Translation** | **v0.9.30**: Visual Editor shows translated text when a translation language is active |
| **AI Dialog Reasoning** | **v0.9.30**: Routing plans, exit reasons, personalization improvements for AIDialogTree |
| **Text-to-Speech** | **v0.9.29**: Cloud TTS (OpenAI, ElevenLabs) and Web Speech API with streaming audio, per-speaker voice routing |
| **Speaker System** | **v0.9.29**: Per-beat speaker assignment with portrait display, translatable names, TTS voice mapping |
| **TTS in HTML Export** | **v0.9.29**: Embedded TTS with language-aware voice switching on translation change |
| **EndScreen Reset Fix** | **v0.9.29**: State properly resets on restart, deferred to Play Again click, selective reset working |
| **Directory Project Safety** | **v0.9.29**: Full disk read on session restore prevents data loss from stale IndexedDB |
| **360° Panorama Beat** | **v0.9.28**: New interactive beat type with hotspot navigation, equirectangular/cylindrical projections, Photo Sphere Viewer |
| **Panorama Visual Editor** | **v0.9.28**: Drag-and-drop hotspot placement, location assignment, image markers, per-element overrides |
| **Panorama HTML Export** | **v0.9.28**: Fixed asset ID extraction, environment node URL resolution, and blob URL handling for file:// contexts |
| **Electron 40** | **v0.9.27**: Upgraded from EOL Electron 33 to latest Electron 40 (Chromium 144, Node 24, supported until June 2026) |
| **MCP SDK Security** | **v0.9.27**: Bumped @modelcontextprotocol/sdk to 1.25.2, fixing 4 high-severity alerts |
| **InputText Autofocus** | **v0.9.27**: Input fields autofocus on render — interactors can type immediately |
| **Debug Analyzer: Variable Recognition** | **v0.9.26**: inputText/keypad beats now recognized as variable/counter setters — no more false "never set" warnings |
| **Debug Analyzer: Keypad Connections** | **v0.9.26**: Keypad failTarget connections visible in flowchart and traversed by reachability analyzer |
| **Translation Bleed Fix** | **v0.9.26**: Translations from open project no longer bleed into AI-generated stories |
| **Translation Staleness Fixes** | **v0.9.26**: Fixed 99% stuck progress, false stale markers on directory load and git reset |
| **AI Generation Safety** | **v0.9.26**: Auto-save paused during AI generation, directory/git projects protected from overwrite |
| **Git Force Push** | **v0.9.26**: Force push option in push rejection dialog, improved git reset stability |
| **AI Prompt Sync (Keypad + Credits)** | **v0.9.25**: Both AI generation systems now document keypad beat and endScreen credits page parameters |
| **HTML Export Credits Translation** | **v0.9.25**: Credits page fields (title, body, close text) now extracted for AI on-the-fly translation |
| **EndScreen Credits Translation** | **v0.9.25**: Credits page fields translatable, continue button translation, language deletion |
| **Visual Editor HUD Fix** | **v0.9.25**: HUD overlays (timer, countdown, fictional time) now render in the Visual Editor |
| **Language-Aware AI Beats** | **v0.9.24**: AI beats generate content in the active translation language with translated preview UI |
| **Bi-directional Textbox Expansion** | **v0.9.24**: Text boxes grow upward when downward space is limited (mirrors horizontal xOffset pattern) |
| **Button Auto-Height** | **v0.9.24**: Buttons with stored dimensions auto-expand height to prevent text clipping |
| **Unified Layout Engine** | **v0.9.23**: Visual Editor and Preview now use identical smart sizing and collision detection |
| **EndScreen Credits Page** | **v0.9.23**: Customizable scrollable credits page for EndScreen beats |
| **Visual Editor Undo/Redo** | **v0.9.23**: Full undo/redo for element moves, resizes, text edits |
| **Granular EndScreen Reset** | **v0.9.23**: Reset variables, inventory, timers independently |
| **Timer Interrupt Fix** | **v0.9.23**: Engine loop no longer stalls on timer interrupt during performAction |
| **Project Switch Fix** | **v0.9.22**: Clear UI state on project switch to prevent cross-project beat leakage |
| **Advisory Editing Locks** | **v0.9.22**: Beat-level editing locks for Git collaboration — purple canvas indicators + Inspector warnings |
| **EndScreen Variables** | **v0.9.22**: `${variable}` interpolation now works in EndScreen button text |
| **MovementChoice/PickProp** | **v0.9.22**: Question text now appears correctly in the Visual Editor |
| **Mobile Font Scaling** | **v0.9.21**: Font scaling decoupled from cover mode — readable text on mobile without edge cropping |
| **Native Mobile Mode** | **v0.9.21**: New option for projects designed at mobile dimensions — disables all mobile adaptations |
| **Mobile Renderer** | **v0.9.21**: Improved mobile-responsive rendering for HUD overlays, inventory, meters, and dialogs |
| **Translation + Undo Fix** | **v0.9.20**: Undo no longer overwrites translations when a translation language is active |
| **Undo/Redo** | **v0.9.19**: All beat operations (edit, add, delete, move) now support Ctrl+Z / Cmd+Z undo/redo |
| **History Panel** | **v0.9.19**: Clickable history dropdown in toolbar — view, jump to, and clear command history |
| **Translation Persistence** | **v0.9.18**: Translations load on startup, survive push/pull, VCS-aware with staleness detection |
| **Multi-Language AI** | **v0.9.18**: AI can generate stories in multiple languages with translation output |
| **Windows Fixes** | **v0.9.18**: EPERM home dir fix, single-instance lock, translation loading on startup |
| **Build Numbering** | **v0.9.18**: CI-driven build numbers for version tracking (v0.9.18.{build}) |
| **Windows Git VCS Fix** | **FIX in v0.9.17**: Git version control now works on Windows (path separators, auto-detect git.exe) |
| **Stability Fixes** | **FIX in v0.9.17**: Cluster crash, VCS double-init, asset loading, UI reset, re-render reduction |
| **AI Prompt Sync** | **v0.9.18**: Internal and MCP prompts fully synchronized with translation support |
| **Test Coverage** | **v0.9.18**: 148 new tests (122 from v0.9.17 + 26 for translation wiring, expandPath, beat extraction) |
| **Fictional Time System** | In-story date/time tracking with set/advance/subtract, condition checking, and Timer HUD display (v0.9.15) |
| **Timer/Countdown HUD** | Timer HUD (countdown, fictional time, or narrative text) and Countdown Meter HUD overlays (v0.9.15) |
| **Recursive Dialog Trees** | `__self__` target for looping dialogs with per-choice visited tracking (v0.9.15) |
| **Keypad Beat** | Numeric keypad for phone, safe lock, PIN entry with code validation (v0.9.15) |
| **Visual Editor UX** | Multi-select, alignment/distribute tools, snap guides, element grouping (v0.9.15) |
| **Choice Effects** | Unified variable/counter/inventory effects on dialog and movement choices (v0.9.15) |
| **Git VCS Integration** | Full Git version control — commit, push, pull, branch, merge conflicts, clone repository (v0.9.14) |
| **AI Dialog Fix** | Fixed AIDialogTree generation across all players, updated OpenAI defaults to GPT-5.2 (v0.9.13) |
| **HTML Export** | Export stories as standalone HTML files with splash screen, counter HUD, and inventory icons (v0.9.12) |
| **Unified Rendering** | WYSIWYG alignment between visual editor and preview (v0.9.12) |
| **Independent Preview Window** | Preview in separate window with path-based presets and InputText value entry (v0.9.11) |
| **UI Tooltips** | Descriptive tooltips throughout app to help beginners (v0.9.11) |
| **Transformation Commands** | Bulk rename/delete/merge for characters, variables, beats (v0.9.9) |
| **AI Runtime Beats** | aiInfoText, aiDurScreen for dynamic AI-generated content during playback (v0.9.9) |
| **Text Variations** | Random text selection for Info Text and Duration Screen beats (v0.9.9) |
| **AI-Based Beats** | AI Summary, Online Content, AI Condition, AI Dialog Tree beats for dynamic content |
| Assets (graphics, sounds, sprite animations) | Fully implemented |
| Visual dialog editor | Supports all phases of dialog trees (v0.9.4) |
| Project switching | Fixed in v0.9.22 — UI state properly cleared on switch |
| Animation system | Fully implemented with visual path editor (v0.9.1) |
| Character meter frames | HUD overlays for counters (v0.9.2) |
| Chat-style dialog mode | New presentation modes for DialogTree (v0.9.3) |
| DialogTree Merge Tool | Auto-detection of mergeable beats, visual merge UI (v0.9.4) |
| Search & Replace | Project-wide search across beats, characters, assets (v0.9.4) |
| Twine Import | Import SugarCube and Harlowe stories with proper boolean handling (v0.9.6) |
| Beat Notes | Author annotations for beats (not shown to players) (v0.9.6) |
| Timer Progress Bar | Visual timer for default target delays (v0.9.6) |
| Visual Inventory System | Interactor-facing inventory display with configurable HUD overlay (v0.9.6) |
| Path Analysis | StateSimulationAnalyzer for accurate hub-and-spoke patterns (v0.9.10) |
| Cluster system (collapsible beat groups) | Implemented: collapsible flowchart clusters, folder view in sidebar, draggable beats in containers |
| Legacy ASML import | Improved in v0.9.0; older format files should now import correctly |

## Feature Deep-Dives by Version

### 🌐 Multi-Language Translation (v0.9.18)

Create interactive narratives in multiple languages with both manual and AI-assisted translation:

- **AI-Generated Translations**: Tell the AI to generate a story in multiple languages (e.g., English + German + French) and it produces the full story with translations included
- **Manual Translation Workflow**: Add target languages, translate strings in the inspector, track completion per language
- **Staleness Detection**: When source text is edited, translations are automatically marked as stale with visual indicators on beats
- **VCS-Aware Persistence**: Translations survive git push/pull cycles, load on startup, and integrate with the version control panel
- **Beat-Level Indicators**: Amber triangle on beats with stale translations, alongside green/orange VCS change dots
- **Full Round-Trip**: Generate → edit → translate → save → reload → edit — translations persist across the entire workflow

### ⏱️ Timer HUD, Fictional Time & Countdown Meter (v0.9.15)

Persistent HUD overlays that display across all beats:

- **Timer HUD**: Auto-detects content — countdown timer, fictional time, manual text, or static text
- **Fictional Time**: Track in-story date/time (e.g. "4 April 1968, 9:00 AM") with set/advance/subtract operations and condition-based branching
- **Countdown Meter**: Counter-driven progress bar with warning/critical color thresholds
- **Per-beat control**: `timeDisplayMode` (fictionalTime / manual / none) on each beat
- **Configurable**: Position, colors, opacity, labels — all in the new Global Settings HUD tab

### 🔢 Keypad Beat (v0.9.15)

New beat type for numeric input interactions:

- **3 layouts**: Numeric, Phone, PIN — each with appropriate button labels
- **Code validation**: Set a correct code with max attempts and fail-target beat
- **Masked input**: Show dots for PIN entry, configurable digit display
- **Full editor support**: Interactive keypad in both visual editor and preview

### 🎨 Visual Editor UX (v0.9.15)

Major usability improvements to the visual beat editor:

- **Multi-select**: Shift+click or rubber-band selection, alignment and distribute tools
- **Snap guides**: Smart alignment guides when dragging elements
- **Element grouping**: Group elements that move together
- **Choice effects**: Set variables, counters, and inventory directly from dialog/movement choices

### 🔀 Git Version Control (v0.9.14)

Collaborative story authoring with built-in Git support in the desktop app:

- **VCS panel**: View pending changes, commit history, and branch info in the sidebar
- **Full Git workflow**: Commit, push, pull, branch, and merge — all from within the app
- **Clone Repository**: Clone a remote repo directly from the File menu
- **Merge conflict resolution**: Detect and resolve conflicts with guided UI
- **Directory format**: Projects saved as individual JSON files for clean diffs

### 📦 HTML Export (v0.9.12)

Export your stories as self-contained HTML files that run anywhere:

- **Splash screen**: Professional loading experience
- **Counter HUD**: Visual display of counters/stats during gameplay
- **Inventory icons**: Visual inventory system with item icons
- **Tailwind CSS**: Modern styling that works across browsers
- **Zero dependencies**: Single HTML file runs offline in any browser

**Note**: AI-based beats (aiInfoText, aiDurScreen, aiSummary, aiCondition) are not yet supported in HTML export. aiDialogTree now works in the web player (v0.9.13). Stories using unsupported AI beats will show fallback text instead.

### 🖥️ Independent Preview Window (v0.9.11)

The preview system has been completely redesigned:

- **Separate window**: Preview now opens in its own dedicated window for side-by-side editing and testing
- **Path-based presets**: Automatically analyzes all paths to a beat and generates state presets
- **InputText value entry**: Enter custom values when paths include inputText beats (instead of auto-generated placeholders)
- **Debug panel**: Real-time display of current beat, visited beats, variables, and counters
- **Keyboard shortcuts**: Space (pause/resume), Escape (stop), I (toggle inventory)

**UI Tooltips**: Descriptive tooltips throughout the app help beginners understand beat types, settings, and controls.

### 🚀 Productivity Features (v0.9.9)

**Transformation Commands** - Bulk operations for efficient story editing:
- Rename/delete/merge characters, variables, and beats across entire story
- Deterministic parsing ensures reliable operation without AI hallucination

**Inventory Quantity Functions** - Enhanced inventory system:
- `getInventoryQuantity(item)`, `setInventoryQuantity(item, n)`, `addInventoryQuantity(item, n)`, `removeInventoryQuantity(item, n)`
- Use in conditions or arithmetic operations

**Text Variations** - Random text selection for replay value:
- Add multiple text variations to Info Text and Duration Screen beats
- One randomly selected at runtime for narrative variety

### 🤖 AI-Based Beats (v0.9.8+)

AI beats enable dynamic, personalized story experiences that respond to player choices in real-time:

- **AI Info Text**: AI-generated contextual text with Continue button (v0.9.9)
- **AI Duration Screen**: AI-generated text with auto-advance based on reading speed (v0.9.9)
- **AI Summary Beat**: Generates a narrative summary of the player's journey at story end
- **Online Content Beat**: Fetches and displays real-time information from the web (weather, news, facts)
- **AI Condition Beat**: Uses AI to evaluate complex conditions based on story context
- **AI Dialog Tree Beat**: Dynamically generates dialog choices and responses

**AI Provider Recommendations**:

| Use Case | Recommended Models |
|----------|-------------------|
| AI beats during playback | **Gemma 3 4B** via Ollama (fast, local, capable) |
| Story generation | **Claude**, **GPT**, or **Kimi K2** (superior creative writing) |

Configure AI providers in **Settings → AI Configuration**. Local models via Ollama are recommended for playback to ensure fast response times.

## Older Release Notes

For recent releases, see [`Progress.md`](Progress.md) (narrative notes with
rationale). The entries below preserve the earlier, bullet-style release notes
from before `Progress.md` existed.

### v0.9.18 (2026-02-17)
- **Multi-Language Interactive Narratives**: Support for manual and AI-based translations to create multi-language interactive narratives
  - AI can generate complete stories in multiple languages (e.g., "Create a mystery in English, German, and French")
  - Translation persistence: load on startup, survive git push/pull, persist across sessions
  - Staleness detection: source edits automatically flag affected translations
  - Internal and MCP AI prompts fully synchronized with translation key format documentation
- **Windows Fixes**: EPERM home directory resolution, single-instance lock (no duplicate windows), translation loading on startup
- **CI Build Numbering**: Automatic build number tracking for version identification (v0.9.18.{build})
- **26 New Tests**: expandPath async resolution, extractBeatSourceStrings for all beat types, DirectoryAdapter translation wiring

### v0.9.10 (2026-01-26)
- **Improved Path Analysis**: New StateSimulationAnalyzer for accurate hub-and-spoke story patterns
  - Simulates actual gameplay with full state tracking
  - Correctly handles patterns where players visit multiple locations in any order
  - Finds all valid orderings (e.g., 24 orderings × 4 endings = 96 paths)
  - Properly highlights condition-gated beats (e.g., `beat_incomplete`)
- **ASML Fix**: Parse `<connection>` elements within titleScreen beats

### v0.9.9 (2026-01-25)
- **Transformation Commands**: Bulk rename/delete/merge operations for characters, variables, and beats
  - Deterministic sentence-based parsing for reliable operation
  - Full undo support for all transformation commands
- **Inventory Quantity Functions**: Enhanced inventory with quantity tracking
  - `getInventoryQuantity`, `setInventoryQuantity`, `addInventoryQuantity`, `removeInventoryQuantity`
  - Use in conditions and arithmetic expressions
- **Text Variations**: Random text selection for Info Text and Duration Screen beats
  - Add multiple text variations that combine with main text
  - One randomly selected at runtime for narrative variety
- **AI Info Text Beat**: AI-generated contextual text with Continue button
  - Personalized narrative that adapts to player state
  - Response caching based on context hash
- **AI Duration Screen Beat**: AI-generated text with auto-advance
  - Calculates display time based on reading speed (words per minute)
  - Configurable min/max duration bounds
- **Beat Rename**: introText → infoText (automatic migration for existing projects)
- **Documentation**: Comprehensive USER_GUIDE.md replaces tutorial folder

### v0.9.7 (2026-01-16)
- **AI Provider Improvements**: Fixed external AI providers (OpenAI, Claude, Kimi) in desktop app
  - Proxy now works for default OpenAI endpoint (not just custom URLs)
  - Added default base URLs for OpenAI and Claude APIs
  - GPT-5 reasoning models: increased token limit to 32000 for output
  - Added 5-minute timeout for slow AI responses
- **MCP Integration Toggle**: New app settings option to enable/disable MCP WebSocket
  - Disabled by default to reduce console noise
  - Access via app menu (macOS) or Settings menu (Windows/Linux)
  - Setting persists across app restarts
- **Ren'Py Theme Import (Initial)**: Early support for importing Ren'Py visual novel themes
  - Parse gui.rpy for colors, fonts, and textbox positioning
  - Extract and apply textbox.png frame graphics
  - Map Ren'Py color variables to ASAPS theme system
- **AI Config Dialog**: Fixed scrolling on smaller screens
- **Example Stories**: Removed from git tracking (will be re-added with project storage integration)

### v0.9.6 (2026-01-13)
- **Visual Inventory System**: Implemented interactor-facing inventory display with configurable HUD overlay
  - Grid layout with item icons, names, and quantity badges
  - Configurable positioning (dock to character or screen anchor)
  - Style options: background, border, opacity, item size
- **Beat Notes**: Author annotations for any beat (not shown to players)
  - Collapsible section at bottom of Inspector
  - Persists with beat and exports to ASML
- **Timer Progress Bar**: Visual progress indicator for default target delays
  - Horizontal bar at top of preview stage
  - Color gradient from green to red as time expires
- **Twine Import Fixes**: Critical bug fixes for variable handling
  - Fixed boolean type consistency between set and check operations
  - Fixed empty parameters in additional beats (ConditionBeat)
  - Fixed boolean `false` display in SetVariable inspector
- **ConditionBeat Cleanup**: Removed deprecated `left`/`right` properties (use `variableName`/`value`)
- **Test Coverage**: Added comprehensive tests for ConditionBeat, SetVariableBeat, SetTimerBeat, AddRemoveInventoryBeat, MovementChoiceBeat, RandomTargetBeat, StoryContext, BackwardAnalyzer

### v0.9.5 (2026-01-12)
- **Twine Import**: Import interactive fiction stories from Twine (SugarCube 2.x and Harlowe 3.x formats)
  - Automatic beat type classification from passage analysis
  - Variable conversion from Twine `$var` to ASAPS `$var$` format
  - Conditional branching support with ConditionBeat conversion
  - Link position detection (inline vs. end-of-passage choices)
- **AI Documentation**: Enhanced MCP server documentation for better story generation
  - Animation system overview, expanded beat type descriptions
  - DialogTree presentation modes, visited beat tracking
- **Bug fixes**: Fixed Twine import project naming, paused auto-save during preview

### v0.9.4 (2026-01-10)
- **DialogTree Merge Tool**: New tool to consolidate multiple DialogTree beats into nested conversations
  - Auto-detection of mergeable beat groups (DialogTree→DialogTree with single incoming links)
  - Suggested merges displayed in purple-highlighted section
  - Manual selection with drag-to-reorder and live preview
  - Visual Editor properly updates after merge with correct phases
- **Project-wide Search & Replace**: Find and replace text across all story content
  - Search options: case-sensitive, whole word, regex
  - Scope toggles: beats, characters, assets, metadata
  - Results with context highlighting, click to navigate
- **Chat dialog mode fix**: Fixed subsequent NPC messages not appearing after player choices
- **Visual Editor improvements**: Beat version tracking for reliable UI updates, improved button autosizing

### v0.9.3 (2026-01-09)
- **Bug fixes and stability improvements**:
  - Fixed cluster naming modal not appearing in Electron app (replaced `prompt()` with custom modal)
  - Fixed MovementChoice/PickProp targets not being added when set after initial beat creation
  - Fixed backgrounds persisting between beats (centralized background clearing in Beat.execute)
  - Fixed chat dialog mode not showing NPC text after first message (proper chat history management)
- **Centralized background handling**: Background state now managed in base Beat class, eliminating redundant code in individual beats
- **Chat mode improvements**: Added `clearChatHistory` to IRenderer interface for proper message reset between dialogs

### v0.9.2 (2026-01-07)
- **Character meter frame HUD**: Configurable overlay for displaying character counters (health, energy, etc.) as visual bars
- **Meter frame docking**: Dock to character (8 anchor positions) or fixed to screen corners
- **Meter frame styling**: Background, border, opacity, meter dimensions, and label visibility options
- **Simplified counter display**: All visible counters auto-appear when meter frame is enabled
- **Character image fix**: Fixed character images not showing in Character Manager grid/list view

### v0.9.1 (2026-01-05)
- **Path animation system**: Complete implementation for moving elements along curves during playback
- **Visual animation editor**: PathCanvas with actual element rendering, bezier curve editing
- **Waypoint controls**: Duration, easing, scale, rotation, opacity, flip H/V per waypoint
- **Animation playback**: RequestAnimationFrame-based engine with play/pause/stop/seek
- **Transform interpolation**: Smooth interpolation of all transform properties along paths

### v0.9.0 (2024-12-29)
- **Unified Import/Export menus**: Dropdown menus in header consolidating all import/export options, including new "Export ASML with Assets" option that creates a ZIP with organized asset folders
- **Enhanced beat selection**: Cyan highlighting for selected beats (distinct from path analysis highlighting), auto-center and zoom (80%) when selecting beats in flowchart
- **Visual editor resize handles**: Corner resize handles for elements in the visual editor, allowing direct drag-to-resize
- **Project Library improvements**: Select All checkbox in list view, individual checkboxes always visible in list view for quick multi-select
- **Auto-save fix**: Empty default projects (only title/intro/end beats) no longer auto-saved, reducing clutter
- **Cluster beat collision detection**: Beats inside clusters are properly spaced during auto-arrange to prevent overlapping
- **Legacy ASML import fixes**: globalTimer beats now correctly mapped to setTimer, timer values auto-converted from milliseconds to seconds, endScreen title/button elements properly parsed
- **Button sound completion**: Button sounds now play completely before transitioning to the next beat

### v0.8.9 (2024-12-24)
- **Theme system**: Comprehensive theme management with built-in presets (Visual Novel, Text Adventure, Point & Click), custom theme creation, and theme inheritance
- **Built-in theme presets**: Three professionally designed themes matching popular interactive fiction styles
- **Theme UI**: Theme selector dropdown in Global Settings, "Save as Theme" button, modified indicator
- **Hotspot visibility controls**: New settings for hotspot opacity, show/hide hotspots, show/hide labels, and preview mode visibility (visible, on hover, invisible)
- **Per-element hotspot overrides**: Individual hotspots can override global visibility settings
- **Custom tooltips**: Themed tooltips replace browser native tooltips with immediate display
- **Typewriter text animation**: True character-by-character text reveal with stable positioning (no text shifting)
- **Sequential title animation**: Title animates first, then author, with configurable speed
- **Database upgrade**: IndexedDB v3 with theme storage (themes, theme-assets, theme-asset-metadata stores)

### v0.8.8 (2024-12-12)
- **Preview zoom controls**: Add zoom in/out buttons, percentage indicator, and "Fit" button for auto-scale to window
- **Preview scaling**: Stage automatically scales to fit dialog window while maintaining aspect ratio
- **Default theme change**: New projects now use a light blue background (#87CEEB) with white text boxes and black text instead of dark theme
- **Theme settings applied before preview**: Global settings (colors, backgrounds) are now applied before preview starts
- **Self-contained stories**: Environment.nodes populated from builder assets for standalone story support
- **ReactRenderer refactoring**: Simplified and cleaned up rendering code

### v0.8.7 (2025-12-11)
- **Cluster background images**: Add optional floorplan/map images to clusters with independent scale and opacity
- **Cluster map UI**: Popover controls for selecting, scaling, and adjusting opacity of cluster background images
- **ASML cluster map support**: Serialize mapScale and mapOpacity attributes for cluster background images
- **Beat positions persistence**: Fix beat positions within clusters not saving after project reload
- **Beat renaming fix**: Fix beat name changes not persisting (name field now triggers immediate update)
- **Flowchart stability**: Fix flowchart becoming empty after closing Asset Manager (ref pattern fix)
- **Type consistency**: Fix containerBeatPositions fallback from object to array format

### v0.8.6 (2025-12-10)
- **Enhanced cluster system**: Clusters are containers to help organize projects into sections (e.g., "In the House", "In the Forest"). They appear as collapsible mini-flowcharts in the main graph and as folders in the sidebar.
- **Cluster UI controls**: Mini-flowchart view with zoom controls, fit view, and auto-arrange buttons
- **Cluster internal connections**: Visual connections between beats inside clusters with proper handle alignment
- **Cluster external connections**: Visual indicators for connections entering/leaving clusters
- **Edge routing around clusters**: Returning connections automatically route above or below clusters instead of through them
- **Cluster drag improvements**: Fix beat drag constraints allowing positioning at cluster top edge
- **Cluster resize fix**: Fix resize jump issue when starting to drag cluster viewport
- **Sidebar cluster folders**: Collapsible folder view showing beats organized by cluster
- **Drag beats to clusters**: Drag beats from sidebar into cluster folders or expanded cluster viewports
- **AI cluster awareness**: AI story generation (both internal and MCP) now understands clusters and can organize stories into sections

### v0.8.5 (2025-12-09)
- **Auto-layout**: Add auto-layout button for automatic flowchart arrangement
- **Tree layout algorithm**: Improved Reingold-Tilford layout with external connections support
- **Test suites**: Comprehensive test coverage for MCP servers and AI functions
- **Bulk delete**: Add bulk delete for projects in project modal
- **Local LLM support**: Add Ollama/Local LLM preset option to AI configuration
- **MCP connection fixes**: Fix dialogTree connections not being extracted from MCP-injected stories
- **AI validation**: Improved AI story validation and debug tools
- **Fresh clone fixes**: Fix build issues on fresh clone (generate-beat-types.ts now tracked)
- **UI improvements**: Various UI fixes and empty project handling
- **ConditionBeat fix**: Fix counter conditions not exporting/validating correctly (variableName/value fields)
- **setVariable AI prompts**: Clarify that setVariable beats can only modify one variable per beat (prevents AI misgeneration)

### v0.8.0 (2025-12-07)
- Initial beta release
- Visual story builder with drag-and-drop interface
- Graph-based story editor with ReactFlow
- 14+ beat types for interactive narratives
- AI-assisted content generation (OpenAI, Anthropic)
- MCP server integration for AI assistants
- ASML XML import/export
- Legacy ASML file support with automatic migration
