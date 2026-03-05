# Feature: Text-to-Speech (TTS) for Story Playback

## Context

ASAPS stories contain narrative text spoken by NPC characters (via DialogTree beats), introductory/descriptive text (IntroText, DurScreen), and interactor-facing prompts (choices, inputs). The goal is to add TTS so that **NPC and narrative text is read aloud** during preview/playback, while **interactor choices and input prompts are not**. The system should:
- Support multiple TTS backends (free built-in + commercial APIs) via a **vendor-agnostic provider architecture**, mirroring the existing AI provider pattern
- Integrate with the existing translation system so translated stories use language-appropriate voices
- Allow different voices for different characters (using DialogTree's `speaker` field)
- Work in both the browser (preview) and Electron (desktop) environments

---

## Architecture: Vendor-Agnostic TTS Provider System

Follows the same pattern as the AI provider system (`IAIProvider` / `BaseAIProvider` / `AIService`).

### Provider Interface (`packages/builder/src/types/tts.ts`)

```typescript
/** Provider identity */
export type TTSProviderType = 'web-speech' | 'openai' | 'elevenlabs' | 'custom';

/** Configuration for TTS providers */
export interface TTSProviderConfig {
  provider: TTSProviderType;
  apiKey?: string;          // Not needed for web-speech
  baseUrl?: string;         // Custom endpoint (e.g., local TTS server)
  model?: string;           // Provider-specific model (e.g., 'tts-1-hd', 'eleven_multilingual_v2')
  defaultVoiceId?: string;  // Provider-specific voice identifier
}

/** Normalized voice info returned by all providers */
export interface TTSVoiceInfo {
  id: string;               // Provider-specific voice ID
  name: string;             // Human-readable name
  lang: string;             // BCP 47 language code
  gender?: 'male' | 'female' | 'neutral';
  preview?: string;         // URL to audio preview (cloud providers)
  isLocal?: boolean;        // True for offline/local voices
}

/** Per-speaker voice configuration (stored with project) */
export interface TTSVoiceConfig {
  voiceId?: string;         // Provider-specific voice identifier
  pitch?: number;           // 0-2, default 1 (Web Speech only — cloud providers use voice selection)
  rate?: number;            // 0.5-2.0, default 1
  volume?: number;          // 0-1, default 1
  lang?: string;            // BCP 47 language code override
}

/** Result of a synthesis call */
export interface TTSSynthesisResult {
  /** Audio data — null for Web Speech API (plays directly via browser) */
  audio: Blob | null;
  /** Duration estimate in ms (if known) */
  durationMs?: number;
}

/** The provider interface — all backends implement this */
export interface ITTSProvider {
  readonly name: string;
  readonly requiresApiKey: boolean;

  configure(config: TTSProviderConfig): void;
  isReady(): boolean;

  /** Synthesize text to audio. Returns blob for cloud, null for Web Speech (plays natively). */
  synthesize(text: string, voice?: TTSVoiceConfig): Promise<TTSSynthesisResult>;

  /** Stop any in-progress speech */
  stop(): void;

  /** List available voices, optionally filtered by language */
  getVoices(lang?: string): Promise<TTSVoiceInfo[]>;
}
```

### Base Provider Class (`packages/builder/src/services/tts/BaseTTSProvider.ts`)

```typescript
export abstract class BaseTTSProvider implements ITTSProvider {
  protected config: TTSProviderConfig | null = null;
  protected _isReady: boolean = false;

  abstract readonly name: string;
  abstract readonly requiresApiKey: boolean;

  configure(config: TTSProviderConfig): void {
    this.config = config;
    this._isReady = this.validateConfig(config);
  }

  isReady(): boolean { return this._isReady; }

  protected validateConfig(config: TTSProviderConfig): boolean {
    if (this.requiresApiKey && !config.apiKey) return false;
    return true;
  }

  abstract synthesize(text: string, voice?: TTSVoiceConfig): Promise<TTSSynthesisResult>;
  abstract stop(): void;
  abstract getVoices(lang?: string): Promise<TTSVoiceInfo[]>;
}
```

### Provider Presets (for config dialog UI)

```typescript
const TTS_PROVIDER_PRESETS: Record<TTSProviderType, TTSProviderPreset> = {
  'web-speech': {
    name: 'Built-in Voices',
    description: 'Free, offline — uses your OS text-to-speech',
    apiKeyRequired: false,
    models: [],  // N/A
  },
  openai: {
    name: 'OpenAI TTS',
    description: 'High-quality neural voices',
    apiKeyRequired: true,
    apiKeyHelp: 'Uses your existing OpenAI API key',
    models: [
      { id: 'tts-1', name: 'TTS-1 (fast)' },
      { id: 'tts-1-hd', name: 'TTS-1 HD (quality)' },
    ],
    defaultVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  },
  elevenlabs: {
    name: 'ElevenLabs',
    description: 'Ultra-realistic voices, voice cloning',
    apiKeyRequired: true,
    apiKeyHelp: 'Get your API key from elevenlabs.io',
    models: [
      { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
      { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (fast)' },
    ],
  },
  custom: {
    name: 'Custom Server',
    description: 'OpenAI-compatible TTS endpoint',
    apiKeyRequired: false,
    baseUrlRequired: true,
    baseUrlPlaceholder: 'http://localhost:8080/v1',
  },
};
```

---

## Phase 1: Core TTS Infrastructure + Web Speech Provider

### 1.1 TTSService (`packages/builder/src/services/tts/TTSService.ts`)

Singleton coordinator (mirrors `AIService`):

```typescript
export class TTSService {
  private providers: Map<string, ITTSProvider> = new Map();
  private activeProvider: ITTSProvider | null = null;
  private speakerVoices: Map<string, TTSVoiceConfig> = new Map();
  private enabled: boolean = false;
  private readPrompts: boolean = true;
  private language: string = 'en';

  registerProvider(provider: ITTSProvider): void;
  setProvider(providerName: string): void;
  getActiveProvider(): ITTSProvider | null;
  getAvailableProviders(): string[];

  // High-level API used by the renderer
  async speak(text: string, speaker?: string): Promise<void>;
  async speakPrompt(text: string): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;

  // Configuration
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  setReadPrompts(enabled: boolean): void;
  setLanguage(langCode: string): void;
  setSpeakerVoice(speaker: string, config: TTSVoiceConfig): void;
  isSpeaking(): boolean;
}
```

The `speak()` method:
1. Looks up `speakerVoices` for the given speaker (falls back to default)
2. Calls `activeProvider.synthesize(text, voiceConfig)`
3. If result has `audio` blob (cloud provider), plays via `AudioManager.playSoundFromBlob()`
4. If result has no blob (Web Speech), the provider played it directly

### 1.2 Web Speech Provider (`packages/builder/src/services/tts/WebSpeechProvider.ts`)

The free, built-in provider:

```typescript
export class WebSpeechProvider extends BaseTTSProvider {
  readonly name = 'web-speech';
  readonly requiresApiKey = false;

  private synth: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  configure(config: TTSProviderConfig): void {
    this.synth = window.speechSynthesis;
    this._isReady = !!this.synth;
  }

  async synthesize(text: string, voice?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    // Create SpeechSynthesisUtterance, apply voice config
    // Play directly via speechSynthesis.speak()
    // Return { audio: null } since browser handles playback
  }

  stop(): void { this.synth.cancel(); }

  async getVoices(lang?: string): Promise<TTSVoiceInfo[]> {
    // Map speechSynthesis.getVoices() to TTSVoiceInfo[]
    // Filter by lang if provided
    // Handle Chrome async voice loading (voiceschanged event)
  }
}
```

### 1.3 Text Categorization — What Gets Read

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
| PanoramaBeat | **Configurable** — prompt text | `parameters.prompt` |
| SetVariable/Condition | No (invisible beats) | — |

DialogTree **choice labels** are NOT read (those are interactor actions). Only the NPC's spoken text in each dialog node.

**Global TTS setting: "Read prompts aloud"** (default: on) — controls whether the question/prompt text posed to the interactor by MovementChoice, PickProp, InputText, Keypad, and PanoramaBeat is spoken. This is a single global toggle in TTS settings, not per-beat.

### 1.4 Hook Into Renderer Flow

**File:** `packages/renderer/src/renderers/ReactRenderer.tsx`

The renderer already calls methods like `renderDialog(speaker, text, ...)`, `renderText(text, ...)`, etc. Add TTS calls at the beginning of these render methods:

```typescript
// In renderDialog:
if (ttsService.isEnabled()) {
  ttsService.speak(text, speaker);  // fire-and-forget (non-blocking)
}

// In renderText:
if (ttsService.isEnabled()) {
  ttsService.speak(text);
}
```

**Key decision**: TTS should be **non-blocking** — the beat renders visually immediately, and TTS plays alongside. When the user clicks "continue", any in-progress TTS is cancelled via `ttsService.stop()`. This avoids making the user wait for long narrations.

### 1.5 IRenderer Interface Addition

**File:** `packages/core/src/types/index.ts`

Add optional TTS methods to `IRenderer`:
```typescript
setTTSEnabled?(enabled: boolean): void;
setTTSLanguage?(langCode: string): void;
setTTSSpeakerVoice?(speaker: string, config: TTSVoiceConfig): void;
```

### 1.6 React Hook: `useTTS()`

**File:** `packages/builder/src/hooks/useTTS.ts`

```typescript
export interface SavedTTSConfig {
  provider: TTSProviderType;
  providerType: TTSProviderType;  // UI label
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  defaultVoiceId?: string;
}

export function useTTS() {
  return {
    isConfigured: boolean;
    isSpeaking: boolean;
    isEnabled: boolean;
    currentProvider: string | null;

    configure(config: SavedTTSConfig): void;
    setEnabled(enabled: boolean): void;
    setReadPrompts(enabled: boolean): void;
    getVoices(lang?: string): Promise<TTSVoiceInfo[]>;
    testVoice(text: string, voice?: TTSVoiceConfig): Promise<void>;
    clearError(): void;
  };
}
```

Persists config to `localStorage` (mirrors `useAI` pattern). API keys stored in localStorage only, not in project settings — same security model as AI.

### 1.7 GlobalSettings TTS Configuration

**File:** `packages/builder/src/storage/types.ts`

Add to `GlobalSettings`:
```typescript
tts?: {
  provider?: TTSProviderType;
  providerType?: TTSProviderType;
  model?: string;
  baseUrl?: string;
  defaultVoiceId?: string;
  readPrompts?: boolean;        // Read interactor prompts (default: true)
};
```

Note: `apiKey` is NOT stored in GlobalSettings (same pattern as AI — keys stay in localStorage).

### 1.8 UI: TTS Controls in Preview

**File:** `packages/builder/src/pages/PreviewWindow.tsx`

Add TTS controls to the preview toolbar (near the existing mute/volume controls):
- **TTS on/off toggle** — speaker icon button, toggles `ttsService.setEnabled()`
- **"Read prompts" checkbox** — toggles whether interactor-facing prompts are spoken

These settings persist in `localStorage` so they survive preview restarts.

### 1.9 TTS Configuration Dialog

**File:** `packages/builder/src/components/tts/TTSConfigDialog.tsx`

Mirrors `AIConfigDialog.tsx` — three-tab provider picker:

| Tab | Provider | Notes |
|-----|----------|-------|
| Built-in Voices | `web-speech` | No API key, voice picker from OS voices |
| OpenAI TTS | `openai` | API key, model picker (tts-1 / tts-1-hd), voice picker (alloy, echo, ...) |
| ElevenLabs | `elevenlabs` | API key, model picker, voice picker (fetched from API) |
| Custom Server | `custom` | Base URL, optional API key |

Each tab shows a "Test Voice" button that speaks a sample sentence.

Access: From the preview toolbar TTS dropdown, or from Settings > Project tab.

---

## Phase 2: Translation Integration

### 2.1 Language-Aware Voice Selection

When the user switches the preview language (via the translation system), call `ttsService.setLanguage(langCode)`. The active provider:
1. Filters available voices by the BCP 47 language code
2. Web Speech: prefers voices marked `localService: true` (faster, offline), falls back to matching language prefix (e.g., `de` matches `de-DE`)
3. Cloud providers: filters their voice catalog by language
4. Updates speaker voice mappings to use language-matched voices while preserving rate/volume settings

**File:** `packages/builder/src/contexts/TranslationContext.tsx`

When `activeLanguage` changes, notify the TTSService:
```typescript
ttsService.setLanguage(activeLanguage || sourceLanguage);
```

### 2.2 Voice Picker UI (Optional Enhancement)

Add a voice dropdown in the preview settings that lists available voices for the current language, so authors can preview different voices.

---

## Phase 3: Character Voice Differentiation

### 3.1 Speaker -> Voice Mapping

DialogTree already has a `speaker` field per dialog node (e.g., "Inspector", "Witness", "Narrator"). The TTSService's `speakerVoices` map allows assigning distinct voice configs to each speaker.

### 3.2 Character Voice Configuration UI

**File:** New section in the Story Inspector or Character Editor

For each character/speaker, allow setting:
- Voice selection (from the active provider's available voices)
- Rate adjustment (slider, 0.5-2.0) — all providers
- Pitch adjustment (slider, 0.5-2.0) — Web Speech only (cloud providers use voice selection for tone)
- Volume (slider) — all providers

Store in story metadata under `ttsConfig.speakerVoices`:
```json
{
  "ttsConfig": {
    "speakerVoices": {
      "Inspector": { "voiceId": "onyx", "rate": 0.9 },
      "Witness": { "voiceId": "nova", "rate": 1.1 }
    }
  }
}
```

### 3.3 Narrator Voice

For non-dialog beats (IntroText, DurScreen, HyperText), use a "Narrator" speaker key that authors can configure separately.

---

## Phase 4: Cloud Providers

### 4.1 OpenAI TTS Provider (`packages/builder/src/services/tts/OpenAITTSProvider.ts`)

```typescript
export class OpenAITTSProvider extends BaseTTSProvider {
  readonly name = 'openai';
  readonly requiresApiKey = true;

  async synthesize(text: string, voice?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    // POST to /v1/audio/speech with { model, input, voice }
    // Returns audio blob (mp3)
    // Uses proxy for CORS (same pattern as AI providers)
    return { audio: blob, durationMs: estimated };
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    // Static list: alloy, echo, fable, onyx, nova, shimmer
    // All support all languages
  }
}
```

### 4.2 ElevenLabs Provider (`packages/builder/src/services/tts/ElevenLabsProvider.ts`)

```typescript
export class ElevenLabsProvider extends BaseTTSProvider {
  readonly name = 'elevenlabs';
  readonly requiresApiKey = true;

  async synthesize(text: string, voice?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    // POST to /v1/text-to-speech/{voice_id}
    // Returns audio blob (mp3)
  }

  async getVoices(lang?: string): Promise<TTSVoiceInfo[]> {
    // GET /v1/voices — returns user's available voices
    // Filter by language if provided
  }
}
```

### 4.3 Custom Provider (`packages/builder/src/services/tts/CustomTTSProvider.ts`)

For OpenAI-compatible TTS servers (local Piper, Coqui, etc.):

```typescript
export class CustomTTSProvider extends BaseTTSProvider {
  readonly name = 'custom';
  readonly requiresApiKey = false;

  // Same API shape as OpenAI TTS, but uses config.baseUrl
}
```

### Provider Comparison

| Provider | Cost | Quality | Offline | Languages | Voices | Latency |
|----------|------|---------|---------|-----------|--------|---------|
| **Built-in (Web Speech)** | Free | Varies by OS | Yes | Many | OS-dependent | Instant |
| **OpenAI TTS** | ~$0.015/1K chars (tts-1) | High | No | 50+ | 6 built-in | ~1s |
| **ElevenLabs** | Free tier (10K chars/mo) | Very high | No | 30+ | Custom + library | ~1-2s |
| **Custom Server** | Self-hosted | Varies | Yes (local) | Depends | Depends | Varies |

---

## Files to Create/Modify

### New Files

| File | Description |
|------|-------------|
| `packages/builder/src/types/tts.ts` | TTS type definitions (provider config, voice info, interfaces) |
| `packages/builder/src/services/tts/BaseTTSProvider.ts` | Abstract base provider class |
| `packages/builder/src/services/tts/TTSService.ts` | Singleton service coordinator |
| `packages/builder/src/services/tts/WebSpeechProvider.ts` | Free built-in Web Speech API provider |
| `packages/builder/src/services/tts/OpenAITTSProvider.ts` | OpenAI TTS provider (Phase 4) |
| `packages/builder/src/services/tts/ElevenLabsProvider.ts` | ElevenLabs provider (Phase 4) |
| `packages/builder/src/services/tts/CustomTTSProvider.ts` | Custom server provider (Phase 4) |
| `packages/builder/src/services/tts/index.ts` | Barrel exports |
| `packages/builder/src/hooks/useTTS.ts` | React hook for TTS services |
| `packages/builder/src/components/tts/TTSConfigDialog.tsx` | Provider configuration dialog |

### Modified Files

| File | Change |
|------|--------|
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Add TTS calls in render methods |
| `packages/core/src/types/index.ts` | Add optional TTS methods to IRenderer |
| `packages/builder/src/pages/PreviewWindow.tsx` | Add TTS toggle button in toolbar |
| `packages/builder/src/contexts/TranslationContext.tsx` | Notify TTS on language change |
| `packages/builder/src/storage/types.ts` | Add `tts` section to GlobalSettings |

---

## Implementation Order

1. **Phase 1a** — Types + TTSService + WebSpeechProvider + hook (infrastructure) ✅ Done
2. **Phase 1b** — Renderer integration + preview UI (visible feature) ✅ Done
3. **Phase 2** — Translation-aware voice selection ✅ Done
4. **Phase 3** — Character voice configuration ✅ Done
5. **Phase 4** — Cloud providers (OpenAI TTS, ElevenLabs, Custom) ✅ Done

Each phase is independently shippable. Phase 1 delivers a working free TTS experience. Phases 4 adds premium quality for authors who want it.

---

## Verification

1. `npm run build` — all packages build
2. `npm run test -w @asaps/core` and `npm run test -w @asaps/builder` — tests pass
3. Open preview with a DialogTree story — NPC dialog text is spoken aloud with Web Speech API
4. Click "continue" mid-speech — speech stops, next beat renders
5. Switch preview language to German — voice switches to a German voice
6. Toggle TTS off — no speech, visual rendering unaffected
7. Two different speakers in same story — distinguishable voices (different pitch/rate)
8. Configure OpenAI TTS — higher quality audio plays via AudioManager
9. Configure ElevenLabs — voice list fetched from API, synthesis works
10. Configure custom server — OpenAI-compatible endpoint works
