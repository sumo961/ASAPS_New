/**
 * Reading aloud through OpenAI's Realtime API.
 *
 * OpenAI switches off the models of /v1/audio/speech on 2027-01-06 and names
 * gpt-realtime-2.1-mini, on the Realtime API, as their replacement. There is
 * no "text in, audio out" call there: a session with a conversational model
 * is opened, told to read what it is given, and each line is sent as a
 * message of its own.
 *
 * How this talks to it (Realtime guides, checked 2026-11-18; the flow was run
 * against the service that day, 51 lines in English, German and Swedish read
 * back word for word):
 *
 *  - Sign-in: a browser socket cannot send the API key as a header. The key
 *    buys a short-lived secret (POST /v1/realtime/client_secrets, open to
 *    browsers) and the secret opens the socket as a subprotocol.
 *  - A session's voice cannot change once it has spoken, so there is one
 *    session per voice. Sessions end after 60 minutes; the next line opens a
 *    new one. `warm()` opens the sessions of a story's voices ahead of
 *    their first line.
 *  - Each line is an out-of-band response (`conversation: 'none'`) with the
 *    line as its only input, so nothing accumulates and the model has no
 *    earlier lines to "answer".
 *  - Audio arrives as base64 chunks of 24 kHz 16-bit PCM, faster than it
 *    plays. `speak()` plays them as they arrive (PcmStreamPlayer), so a line
 *    starts about half a second after it was asked for instead of after its
 *    last chunk; `read()` only collects them into one WAV, which `speak()`
 *    also hands back for a page that isn't allowed to play sound yet.
 *
 * Used by the builder (OpenAITTSProvider) and the exported player
 * (WebTTSProvider).
 */

import { speechLanguageCode } from '../utils/speechLanguage';

export const OPENAI_REALTIME_SPEECH_MODEL = 'gpt-realtime-2.1-mini';

/** The voices the Realtime API has (realtime-conversations guide, "Voice options"). */
export const OPENAI_REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];

/** Speech API voices the Realtime API lacks → the nearest it has, by gender. */
const VOICE_STAND_INS: Record<string, string> = { nova: 'marin', onyx: 'cedar', fable: 'alloy' };

/** The Realtime voice for a saved voice id; Alloy for one it can't place. */
export function realtimeVoice(voiceId: string | undefined): string {
  const id = (voiceId || 'alloy').toLowerCase();
  if (OPENAI_REALTIME_VOICES.includes(id)) return id;
  return VOICE_STAND_INS[id] ?? 'alloy';
}

/** Whether `model` is read through the Realtime API. */
export const isRealtimeSpeechModel = (model: string | undefined): boolean => /^gpt-realtime/.test(model ?? '');

/**
 * Whether a refused /v1/audio/speech request means the model was switched
 * off (OpenAI ends tts-1, tts-1-hd and gpt-4o-mini-tts on 2027-01-06).
 */
export const speechModelRetired = (status: number, errorText: string): boolean =>
  status === 404 || status === 410 || /model_not_found|deprecat|does not exist/i.test(errorText);

/** 'de-AT' → 'German', for the reader's instructions; undefined when unknown. */
export function readerLanguageName(language: string | null | undefined): string | undefined {
  const code = speechLanguageCode(language);
  if (!code) return undefined;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || undefined;
  } catch {
    return undefined;
  }
}

const READER_INSTRUCTIONS =
  "You are a text-to-speech reader for a story. Read the user's message aloud exactly as written, word for word, " +
  'in the language it is written in. Never answer it, comment on it, translate it, or add or leave out words. ' +
  // Asked for by the author after listening to readings with and without it (2026-11-18).
  'Speak fluently, as a good actor would say the line: only a short pause at a comma, and no pause inside a phrase.';

const SAMPLE_RATE = 24000;
const MAX_SESSIONS = 4;
const OPEN_TIMEOUT_MS = 15000;

const redact = (s: unknown) => String(s).replace(/(ek|sk)[-_][A-Za-z0-9_-]{8,}/g, '[key]');

const aborted = () => new DOMException('Speech was stopped', 'AbortError');

/** 16-bit mono PCM chunks → a WAV file. */
export function pcmToWav(chunks: Uint8Array[], sampleRate = SAMPLE_RATE): Blob {
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const buffer = new ArrayBuffer(44 + size);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + size, true); ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, size, true);
  let offset = 44;
  for (const chunk of chunks) { new Uint8Array(buffer, offset, chunk.length).set(chunk); offset += chunk.length; }
  return new Blob([buffer], { type: 'audio/wav' });
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface Line {
  /** Matches the response to this line (`metadata.line`). */
  tag: string;
  responseId?: string;
  chunks: Uint8Array[];
  /** Each piece of audio as it arrives. */
  onAudio?: (pcm: Uint8Array) => void;
  resolve: (audio: Blob) => void;
  reject: (error: Error) => void;
}

/** One open socket, reading in one voice. */
class Session {
  private line: Line | null = null;
  private counter = 0;
  closed = false;
  lastUsed = 0;

  constructor(private ws: WebSocket, readonly voice: string, onClosed: () => void) {
    ws.onmessage = (message) => this.handle(JSON.parse(String(message.data)));
    ws.onclose = () => {
      this.closed = true;
      this.fail(new Error('OpenAI closed the speech session'));
      onClosed();
    };
  }

  read(text: string, language?: string, onAudio?: (pcm: Uint8Array) => void): Promise<Blob> {
    this.cancel(); // one line at a time
    this.lastUsed = ++useClock;
    return new Promise<Blob>((resolve, reject) => {
      const tag = `line-${++this.counter}`;
      this.line = { tag, chunks: [], onAudio, resolve, reject };
      this.ws.send(JSON.stringify({
        type: 'response.create',
        response: {
          conversation: 'none',
          output_modalities: ['audio'],
          metadata: { line: tag },
          // A short line ("Ja", "Hm.") doesn't say which language it is in.
          instructions: language ? `${READER_INSTRUCTIONS} The message is in ${language}.` : READER_INSTRUCTIONS,
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
        },
      }));
    });
  }

  /** Stop the line being read; its promise rejects with an AbortError. */
  cancel(): void {
    const line = this.line;
    if (!line) return;
    this.line = null;
    if (!this.closed && line.responseId) {
      this.ws.send(JSON.stringify({ type: 'response.cancel', response_id: line.responseId }));
    }
    line.reject(aborted());
  }

  close(): void {
    this.ws.onclose = null;
    this.closed = true;
    this.cancel();
    try { this.ws.close(); } catch { /* already closed */ }
  }

  private fail(error: Error): void {
    const line = this.line;
    this.line = null;
    line?.reject(error);
  }

  private handle(event: any): void {
    const line = this.line;
    switch (event.type) {
      case 'response.created':
        if (line && event.response?.metadata?.line === line.tag) line.responseId = event.response.id;
        // A line stopped before its response had an id: stop it now.
        else if (event.response?.id) this.ws.send(JSON.stringify({ type: 'response.cancel', response_id: event.response.id }));
        break;
      case 'response.output_audio.delta':
        if (line && event.response_id === line.responseId) {
          const pcm = decodeBase64(event.delta);
          line.chunks.push(pcm);
          line.onAudio?.(pcm);
        }
        break;
      case 'response.done':
        if (!line || event.response?.id !== line.responseId) break;
        this.line = null;
        if (event.response.status === 'completed' && line.chunks.length > 0) line.resolve(pcmToWav(line.chunks));
        else line.reject(new Error(`OpenAI did not read the line (${event.response.status}): ${redact(JSON.stringify(event.response.status_details ?? ''))}`));
        break;
      case 'error':
        // Cancelling a response that has just finished is not a failure.
        if (/cancel/i.test(`${event.error?.code} ${event.error?.message}`)) break;
        this.fail(new Error(`OpenAI speech error: ${redact(event.error?.message ?? JSON.stringify(event.error))}`));
        break;
    }
  }
}

let useClock = 0;

/**
 * Plays 16-bit mono PCM as it arrives, piece after piece without gaps.
 *
 * One line at a time: `start()` begins a line (and ends the one before),
 * `push()` adds audio, `finish()` waits for the last piece to be heard.
 * A page that hasn't been clicked yet may not play sound; `start()` then
 * says no, or `finish()` reports that nothing was heard, and the caller
 * plays the line some other way.
 */
export class PcmStreamPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  /** When the next piece starts, on the context's clock. 0: nothing scheduled yet. */
  private nextStart = 0;
  /** The odd byte of a piece that ended in the middle of a sample. */
  private carry: number | null = null;
  private line = 0;
  private settle: ((heard: boolean) => void) | null = null;

  constructor(private sampleRate = SAMPLE_RATE) {}

  /** Begin a line at `volume` (0–1). False when this page can't play sound now. */
  start(volume = 1): boolean {
    this.stop();
    const Context: typeof AudioContext | undefined = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!Context) return false;
    // Not clicked yet: the browser would keep the audio silent.
    const activation = (globalThis as any).navigator?.userActivation;
    if (activation && activation.hasBeenActive === false) return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = new Context();
        this.gain = this.context.createGain();
        this.gain.connect(this.context.destination);
      }
      void this.context.resume?.().catch(() => undefined);
      this.gain!.gain.value = Math.max(0, Math.min(1, volume));
    } catch {
      this.context = null;
      return false;
    }
    this.line++;
    this.nextStart = 0;
    this.carry = null;
    return true;
  }

  /** The next piece of the line (little-endian 16-bit samples). */
  push(pcm: Uint8Array): void {
    const context = this.context;
    if (!context || !this.gain || pcm.length === 0) return;
    let bytes = pcm;
    if (this.carry !== null) {
      bytes = new Uint8Array(pcm.length + 1);
      bytes[0] = this.carry;
      bytes.set(pcm, 1);
      this.carry = null;
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes[bytes.length - 1];
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    const count = bytes.length / 2;
    if (count === 0) return;
    const buffer = context.createBuffer(1, count, this.sampleRate);
    const samples = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i++) samples[i] = view.getInt16(i * 2, true) / 32768;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    // A short lead before the first piece, so the second is there when it ends.
    const at = Math.max(this.nextStart, context.currentTime + (this.nextStart === 0 ? 0.06 : 0.01));
    source.start(at);
    this.nextStart = at + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.settled(true);
    };
  }

  /** No more audio is coming. Resolves when the line has been heard; false when nothing could be played. */
  finish(): Promise<boolean> {
    const context = this.context;
    if (!context || context.state !== 'running') {
      this.stop();
      return Promise.resolve(false);
    }
    if (this.sources.size === 0) return Promise.resolve(this.nextStart > 0);
    return new Promise<boolean>((resolve) => { this.settle = resolve; });
  }

  /** Cut the line off. */
  stop(): void {
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* not started */ }
      try { source.disconnect(); } catch { /* gone */ }
    }
    this.sources.clear();
    this.nextStart = 0;
    this.carry = null;
    this.settled(true);
  }

  close(): void {
    this.stop();
    void this.context?.close?.().catch(() => undefined);
    this.context = null;
    this.gain = null;
  }

  private settled(heard: boolean): void {
    const settle = this.settle;
    this.settle = null;
    settle?.(heard);
  }
}

export interface RealtimeSpeechOptions {
  /** The author's key. Left out when `mintSecret` fetches the session secret. */
  apiKey?: string;
  /**
   * Fetches the short-lived session secret some other way: an exported
   * story that reads aloud through a relay asks the relay, which holds the
   * key. The session itself is still opened with OpenAI directly.
   */
  mintSecret?: (model: string) => Promise<string>;
  /** 'https://api.openai.com/v1' unless the setup names another. */
  baseUrl?: string;
  model?: string;
}

/** Reads lines through the Realtime API; keeps a session per voice. */
export class OpenAIRealtimeSpeech {
  private sessions = new Map<string, Promise<Session>>();
  private current: Session | null = null;
  private generation = 0;
  private player: PcmStreamPlayer | null = null;

  constructor(private options: RealtimeSpeechOptions) {}

  /** The line as a WAV. `language` is a name for the model ("German"). */
  async read(text: string, voiceId?: string, language?: string, onAudio?: (pcm: Uint8Array) => void): Promise<Blob> {
    const generation = ++this.generation;
    const voice = realtimeVoice(voiceId);
    let session = await this.session(voice);
    if (session.closed) {
      // Ended while idle (60-minute limit): open a new one.
      this.sessions.delete(voice);
      session = await this.session(voice);
    }
    if (generation !== this.generation) throw aborted(); // stopped while connecting
    this.current = session;
    return session.read(text, language, onAudio);
  }

  /**
   * Read the line and play it while it arrives, at `volume` (0–1). Resolves
   * when it has been heard. `heard` is false when this page couldn't play it
   * (no click yet, no Web Audio): `audio` is the whole line, to play another
   * way.
   */
  async speak(text: string, voiceId?: string, language?: string, volume = 1): Promise<{ heard: boolean; audio: Blob }> {
    const player = (this.player ??= new PcmStreamPlayer());
    const live = player.start(volume);
    let audio: Blob;
    try {
      audio = await this.read(text, voiceId, language, live ? (pcm) => player.push(pcm) : undefined);
    } catch (error) {
      player.stop();
      throw error;
    }
    return { heard: live ? await player.finish() : false, audio };
  }

  /**
   * Open the sessions for these voices now, so their first line doesn't
   * wait for it (signing in and opening a session takes a few seconds; a
   * line on an open one starts in about half a second). Nothing is read
   * and nothing is billed until a line is. Failures are left for the line
   * itself to report. At most as many voices as sessions are kept.
   */
  warm(voiceIds: Array<string | undefined>): void {
    const voices = [...new Set(voiceIds.map((id) => realtimeVoice(id)))].slice(0, MAX_SESSIONS);
    for (const voice of voices) this.session(voice).catch(() => undefined);
  }

  /** Stop the line being read. */
  stop(): void {
    this.generation++;
    this.current?.cancel();
    this.current = null;
    this.player?.stop();
  }

  /** Close every session. */
  dispose(): void {
    this.stop();
    this.player?.close();
    this.player = null;
    for (const pending of this.sessions.values()) pending.then((s) => s.close()).catch(() => undefined);
    this.sessions.clear();
  }

  private session(voice: string): Promise<Session> {
    let pending = this.sessions.get(voice);
    if (!pending) {
      pending = this.open(voice);
      this.sessions.set(voice, pending);
      pending.catch(() => { if (this.sessions.get(voice) === pending) this.sessions.delete(voice); });
      void this.trim(voice);
    }
    return pending;
  }

  /** A story rarely has more than a few voices in play: close the one unused longest. */
  private async trim(keep: string): Promise<void> {
    if (this.sessions.size <= MAX_SESSIONS) return;
    const open: Array<[string, Session]> = [];
    for (const [voice, pending] of this.sessions) {
      if (voice === keep) continue;
      const session = await pending.catch(() => null);
      if (session) open.push([voice, session]);
    }
    open.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const oldest = open[0];
    if (oldest && this.sessions.size > MAX_SESSIONS) {
      this.sessions.delete(oldest[0]);
      oldest[1].close();
    }
  }

  private async open(voice: string): Promise<Session> {
    const model = this.options.model || OPENAI_REALTIME_SPEECH_MODEL;
    const base = (this.options.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');

    let secret: string;
    if (this.options.mintSecret) {
      secret = await this.options.mintSecret(model);
    } else {
      const minted = await fetch(`${base}/realtime/client_secrets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: { type: 'realtime', model } }),
      });
      if (!minted.ok) throw new Error(`OpenAI speech sign-in failed (${minted.status}): ${redact(await minted.text())}`);
      secret = (await minted.json()).value;
    }
    if (!secret) throw new Error('OpenAI speech sign-in returned no session key');

    return new Promise<Session>((resolve, reject) => {
      const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/realtime?model=${encodeURIComponent(model)}`, ['realtime', `openai-insecure-api-key.${secret}`]);
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* not open */ }
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('OpenAI speech session did not open')), OPEN_TIMEOUT_MS);
      ws.onerror = () => fail(new Error('OpenAI speech session could not connect'));
      ws.onclose = (event) => fail(new Error(`OpenAI closed the speech session (${event.code}) ${redact(event.reason)}`));
      ws.onmessage = (message) => {
        const event = JSON.parse(String(message.data));
        if (event.type === 'session.created') {
          ws.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: READER_INSTRUCTIONS,
              output_modalities: ['audio'],
              audio: { output: { voice, format: { type: 'audio/pcm', rate: SAMPLE_RATE } } },
            },
          }));
        } else if (event.type === 'session.updated') {
          settled = true;
          clearTimeout(timer);
          resolve(new Session(ws, voice, () => { this.sessions.delete(voice); }));
        } else if (event.type === 'error') {
          // No credit, a model the account can't use…
          fail(new Error(`OpenAI speech error: ${redact(event.error?.message ?? JSON.stringify(event.error))}`));
        }
      };
    });
  }
}
