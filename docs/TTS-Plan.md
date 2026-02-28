# Feature: Text-to-Speech (TTS) for Story Playback

## Context

ASAPS stories contain narrative text spoken by NPC characters (via DialogTree beats), introductory/descriptive text (IntroText, DurScreen), and interactor-facing prompts (choices, inputs). The goal is to add TTS so that **NPC and narrative text is read aloud** during preview/playback, while **interactor choices and input prompts are not**. The system should:
- Support multiple TTS backends (free built-in + cloud APIs for quality)
- Integrate with the existing translation system so translated stories use language-appropriate voices
- Allow different voices for different characters (using DialogTree's `speaker` field)
- Work in both the browser (preview) and Electron (desktop) environments

---

## Phase 1: Core TTS Infrastructure + Web Speech API

### 1.1 Create TTSManager (`packages/renderer/src/audio/TTSManager.ts`)

A singleton manager (same pattern as `AudioManager`) with:

```typescript
interface TTSVoiceConfig {
  voiceURI?: string;    // Web Speech API voice identifier
  pitch?: number;       // 0-2, default 1
  rate?: number;        // 0.1-10, default 1
  volume?: number;      // 0-1, default 1
  lang?: string;        // BCP 47 language code override
}

interface TTSManagerOptions {
  enabled?: boolean;
  defaultVoice?: TTSVoiceConfig;
  speakerVoices?: Map<string, TTSVoiceConfig>;  // speaker name → voice config
}
```

Core methods:
- `speak(text: string, speaker?: string): Promise<void>` — speaks text, resolves when utterance ends. Looks up speaker voice config, falls back to default.
- `speakPrompt(text: string): Promise<void>` — speaks interactor-facing prompt text, but only if `readPrompts` is enabled.
- `stop(): void` — cancel current utterance immediately
- `pause() / resume()` — for pause/resume support
- `setLanguage(langCode: string): void` — set active language, auto-selects best matching voice
- `setSpeakerVoice(speaker: string, config: TTSVoiceConfig): void`
- `getAvailableVoices(): SpeechSynthesisVoice[]` — list browser-available voices
- `setEnabled(enabled: boolean): void`
- `isEnabled(): boolean`
- `setReadPrompts(enabled: boolean): void` — toggle reading interactor prompts
- `isSpeaking(): boolean`

Implementation: Use `window.speechSynthesis` and `SpeechSynthesisUtterance`. Handle Chrome's quirk where voices load asynchronously (`voiceschanged` event).

### 1.2 Text Categorization — What Gets Read

Use **beat type** as the natural discriminator (no new markers needed):

| Beat Type | Text Read Aloud? | Source Field |
|-----------|-------------------|--------------|
| DialogTree | Yes — NPC speech | `currentNode.text` (with `speaker` for voice selection) |
| IntroText | Yes — narrative | `parameters.text` |
| DurScreen | Yes — timed narrative | `parameters.text` |
| TitleScreen | Optional — title+author | `parameters.title`, `parameters.author` |
| HyperText | Yes — body text | `parameters.text` (strip link markup) |
| EndScreen | Optional — closing message | `parameters.text` |
| MovementChoice | **Configurable** — question prompt | `parameters.question` |
| PickProp | **Configurable** — question prompt | `parameters.question` |
| InputText | **Configurable** — prompt text | `parameters.prompt` |
| Keypad | **Configurable** — prompt text | `parameters.prompt` |
| SetVariable/Condition | No (invisible beats) | — |

DialogTree **choice labels** are NOT read (those are interactor actions). Only the NPC's spoken text in each dialog node.

**Global TTS setting: "Read prompts aloud"** (default: on) — controls whether the question/prompt text posed to the interactor by MovementChoice, PickProp, InputText, and Keypad is spoken. This is a single global toggle in TTS settings, not per-beat.

### 1.3 Hook Into Renderer Flow

**File:** `packages/renderer/src/renderers/ReactRenderer.tsx`

The renderer already calls methods like `renderDialog(speaker, text, ...)`, `renderText(text, ...)`, etc. Add TTS calls at the beginning of these render methods:

```typescript
// In renderDialog:
if (ttsManager.isEnabled()) {
  await ttsManager.speak(text, speaker);
}

// In renderText:
if (ttsManager.isEnabled()) {
  await ttsManager.speak(text);
}
```

**Key decision**: TTS should be **non-blocking** — the beat renders visually immediately, and TTS plays alongside. When the user clicks "continue", any in-progress TTS is cancelled via `ttsManager.stop()`. This avoids making the user wait for long narrations.

### 1.4 IRenderer Interface Addition

**File:** `packages/core/src/types/index.ts`

Add optional TTS methods to `IRenderer`:
```typescript
setTTSEnabled?(enabled: boolean): void;
setTTSLanguage?(langCode: string): void;
setTTSSpeakerVoice?(speaker: string, config: TTSVoiceConfig): void;
```

### 1.5 UI: TTS Controls in Preview

**File:** `packages/builder/src/pages/PreviewWindow.tsx`

Add TTS controls to the preview toolbar (near the existing mute/volume controls):
- **TTS on/off toggle** — speaker icon button, toggles `ttsManager.setEnabled()`
- **"Read prompts" checkbox** — toggles whether interactor-facing prompts (MovementChoice questions, InputText prompts, etc.) are spoken. Stored as `ttsManager.setReadPrompts(boolean)`, default `true`.

These settings persist in `localStorage` so they survive preview restarts.

---

## Phase 2: Translation Integration

### 2.1 Language-Aware Voice Selection

When the user switches the preview language (via the translation system), call `ttsManager.setLanguage(langCode)`. The TTSManager:
1. Filters `speechSynthesis.getVoices()` by the BCP 47 language code
2. Prefers voices marked `localService: true` (faster, offline)
3. Falls back to any voice matching the language prefix (e.g., `de` matches `de-DE`)
4. Updates `speakerVoices` to use language-matched voices while preserving pitch/rate/volume settings

**File:** `packages/builder/src/contexts/TranslationContext.tsx`

When `activeLanguage` changes, notify the TTSManager:
```typescript
ttsManager.setLanguage(activeLanguage || sourceLanguage);
```

### 2.2 Voice Picker UI (Optional Enhancement)

Add a voice dropdown in the preview settings that lists available voices for the current language, so authors can preview different voices.

---

## Phase 3: Character Voice Differentiation

### 3.1 Speaker → Voice Mapping

DialogTree already has a `speaker` field per dialog node (e.g., "Inspector", "Witness", "Narrator"). The TTSManager's `speakerVoices` map allows assigning distinct voice configs to each speaker.

### 3.2 Character Voice Configuration UI

**File:** New section in the Story Inspector or Character Editor

For each character/speaker, allow setting:
- Voice selection (from available system voices)
- Pitch adjustment (slider, 0.5-2.0)
- Rate adjustment (slider, 0.5-2.0)
- Volume (slider)

Store in story metadata under `ttsConfig.speakerVoices`:
```json
{
  "ttsConfig": {
    "enabled": true,
    "speakerVoices": {
      "Inspector": { "pitch": 0.8, "rate": 0.9 },
      "Witness": { "pitch": 1.3, "rate": 1.1 }
    }
  }
}
```

### 3.3 Narrator Voice

For non-dialog beats (IntroText, DurScreen, HyperText), use a "Narrator" speaker key that authors can configure separately.

---

## Phase 4: Cloud TTS (Future — Not in Initial Implementation)

For higher-quality voices in exported/published stories, add optional cloud TTS backends:

| Provider | Pros | Cons |
|----------|------|------|
| **Web Speech API** | Free, offline, no API key, instant | Quality varies by OS, limited voice control |
| **Google Cloud TTS** | 220+ voices, WaveNet/Neural2, SSML | Requires API key, usage costs |
| **Azure Cognitive Speech** | Best neural voices, SSML, emotion styles | Requires API key, costs |
| **ElevenLabs** | Most natural, voice cloning | Expensive, limited free tier |
| **OpenAI TTS** | Simple API, good quality | Requires API key, costs |

Phase 4 would add a `TTSBackend` interface allowing pluggable backends:
```typescript
interface TTSBackend {
  name: string;
  synthesize(text: string, voice: TTSVoiceConfig): Promise<AudioBuffer>;
  getAvailableVoices(lang: string): Promise<VoiceInfo[]>;
}
```

Cloud-generated audio would be played through the existing `AudioManager.playSoundFromBlob()`.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/renderer/src/audio/TTSManager.ts` | **Create** | Core TTS manager singleton |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Modify | Add TTS calls in render methods |
| `packages/core/src/types/index.ts` | Modify | Add optional TTS methods to IRenderer |
| `packages/builder/src/pages/PreviewWindow.tsx` | Modify | Add TTS toggle button |
| `packages/builder/src/contexts/TranslationContext.tsx` | Modify | Notify TTSManager on language change |

---

## Verification

1. `npm run build` — all packages build
2. `npm run test -w @asaps/core` and `npm run test -w @asaps/builder` — tests pass
3. Open preview with a DialogTree story — NPC dialog text is spoken aloud with Web Speech API
4. Click "continue" mid-speech — speech stops, next beat renders
5. Switch preview language to German — voice switches to a German voice
6. Toggle TTS off — no speech, visual rendering unaffected
7. Two different speakers in same story — distinguishable voices (different pitch/rate)
