/**
 * Voice Engine — ElevenLabs TTS + Web Speech API recognition.
 *
 * ElevenLabs sends permissive CORS headers (Allow-Origin: *), so we call it
 * directly from the browser — no proxy needed. The key is user-provided and
 * lives only in their browser.
 */

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

let recognition: any = null;
let currentAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
/** Bumped on stopListening — stale recognition callbacks are ignored. */
let listenSession = 0;
/** Live transcript while PTT is held. */
let pttTranscript = "";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

export async function unlockAudioForPlayback(): Promise<void> {
  if (audioUnlocked || typeof window === "undefined") return;

  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      await ctx.resume();
      await ctx.close();
    }
  } catch {}

  try {
    const primer = new Audio(SILENT_WAV);
    primer.volume = 0.01;
    primer.setAttribute("playsinline", "true");
    await primer.play();
    primer.pause();
    audioUnlocked = true;
  } catch {}
}

export function isSpeechRecognitionSupported(): boolean {
  return SpeechRecognitionAPI !== null;
}

export interface RecognitionCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

export interface ListeningOptions {
  /** Push-to-talk: no silence auto-send; call endPttCapture() on release. */
  ptt?: boolean;
}

export function collapseRepeatedSpeech(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return text.trim();

  const deduped: string[] = [];
  for (const word of words) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.toLowerCase() !== word.toLowerCase()) {
      deduped.push(word);
    }
  }

  return deduped.join(" ");
}

function composeTranscript(event: any): string {
  let text = "";
  for (let i = 0; i < event.results.length; i++) {
    text += event.results[i][0].transcript;
  }
  return collapseRepeatedSpeech(text.trim());
}

export function startListening(
  callbacks: RecognitionCallbacks,
  options?: ListeningOptions
): void {
  if (!SpeechRecognitionAPI) {
    callbacks.onError("Speech recognition isn't supported in this browser — try Safari or Chrome on your phone.");
    return;
  }

  const ptt = options?.ptt ?? false;
  stopListening();
  const session = listenSession;
  pttTranscript = "";

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = ptt;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  let lastTranscript = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let delivered = false;

  const deliver = (text: string) => {
    if (delivered || session !== listenSession) return;
    const clean = collapseRepeatedSpeech(text);
    if (!clean) return;
    delivered = true;
    if (silenceTimer) clearTimeout(silenceTimer);
    callbacks.onFinal(clean);
  };

  recognition.onresult = (event: any) => {
    if (session !== listenSession) return;

    lastTranscript = composeTranscript(event);
    pttTranscript = lastTranscript;
    callbacks.onInterim(lastTranscript);

    if (!ptt) {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (lastTranscript) {
        silenceTimer = setTimeout(() => deliver(lastTranscript), 1600);
      }
    }
  };

  recognition.onerror = (event: any) => {
    if (session !== listenSession) return;
    if (event.error === "no-speech" || event.error === "aborted") return;
    callbacks.onError(event.error);
  };

  recognition.onend = () => {
    if (session !== listenSession) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    if (!ptt && !delivered && lastTranscript) deliver(lastTranscript);
    callbacks.onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : "Could not start microphone");
  }
}

/** End PTT hold — deliver transcript and stop mic. */
export function endPttCapture(onFinal: (text: string) => void): void {
  const text = collapseRepeatedSpeech(pttTranscript);
  stopListening();
  pttTranscript = "";
  if (text) onFinal(text);
}

export function stopListening(): void {
  listenSession++;
  if (recognition) {
    try {
      recognition.abort();
    } catch {}
    recognition = null;
  }
}

export function prepareTextForSpeech(text: string, maxChars = 2500): string {
  let clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[-*•]\s+/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (clean.length > maxChars) {
    const cut = clean.slice(0, maxChars);
    const lastPeriod = cut.lastIndexOf(".");
    clean = (lastPeriod > maxChars * 0.5 ? cut.slice(0, lastPeriod + 1) : cut) + "...";
  }

  return clean;
}

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
/** Docs default; widely available on free plans. */
const ELEVENLABS_TTS_MODEL = "eleven_multilingual_v2";

export const ELEVENLABS_KEY_URL = "https://elevenlabs.io/app/settings/api-keys";

/** Strip common paste mistakes (header name, Bearer, quotes, whitespace). */
export function normalizeElevenLabsApiKey(raw: string): string {
  let key = raw.trim();
  key = key.replace(/^xi-api-key\s*:\s*/i, "");
  key = key.replace(/^authorization\s*:\s*bearer\s+/i, "");
  key = key.replace(/^bearer\s+/i, "");
  key = key.replace(/^["'`]|["'`]$/g, "");
  return key.replace(/\s+/g, "");
}

interface ElevenLabsErrorDetail {
  message: string;
  code?: string;
  type?: string;
}

/** Parse ElevenLabs JSON error bodies (detail may be object, string, or array). */
async function parseElevenLabsError(response: Response): Promise<ElevenLabsErrorDetail> {
  try {
    const err = await response.json();
    const d = err?.detail ?? err;
    if (typeof d === "string") return { message: d };
    if (Array.isArray(d)) {
      const first = d[0];
      return {
        message: first?.msg || first?.message || JSON.stringify(first),
        code: first?.code || first?.type,
      };
    }
    return {
      message: d?.message || d?.status || err?.message || `HTTP ${response.status}`,
      code: d?.code || d?.status,
      type: d?.type,
    };
  } catch {
    return { message: `HTTP ${response.status}` };
  }
}

const KEY_SETUP_HELP =
  "Create a key at elevenlabs.io/app/settings/api-keys — enable Text to Speech (or turn off Restrict Key). Paste only the key value (usually sk_…), not xi-api-key:";

/** Turn raw API failures into something a human can act on. */
function friendlyElevenLabsError(status: number, detail: ElevenLabsErrorDetail): string {
  const code = (detail.code || "").toLowerCase();
  const msg = detail.message || "";

  if (code === "invalid_api_key" || code === "missing_api_key" || status === 401) {
    return `Invalid API key. ${KEY_SETUP_HELP}${msg && !msg.includes("invalid") ? ` (${msg})` : ""}`;
  }
  if (code === "insufficient_permissions" || status === 403) {
    return `This key cannot use text-to-speech. ${KEY_SETUP_HELP}`;
  }
  if (code === "insufficient_credits" || status === 402) {
    return "Your ElevenLabs account has no credits — add credits or upgrade your plan.";
  }
  if (code === "voice_not_found" || code === "invalid_voice_id") {
    return `Voice not found: ${msg || "check the Voice ID or pick a preset."}`;
  }
  if (code === "voice_access_denied") {
    return "You do not have access to this voice — try a preset or a voice from your account.";
  }
  if (code === "model_not_found" || code === "unsupported_model" || code === "model_access_denied") {
    return `Model issue: ${msg || code}`;
  }
  if (status === 422) {
    return `Request rejected: ${msg || "check voice ID and settings."}`;
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return "Rate limit hit — wait a moment and try again.";
  }
  return msg || `ElevenLabs error ${status}`;
}

function elevenLabsUrl(voiceId: string): string {
  return `${ELEVENLABS_API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
}

/** Lightweight check — GET /v1/models only needs Models Read permission. */
export async function validateElevenLabsKey(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  const key = normalizeElevenLabsApiKey(apiKey);
  if (!key) return { ok: false, message: "No API key entered." };
  if (key.length < 16) {
    return {
      ok: false,
      message: "Key looks incomplete — copy the full key from ElevenLabs (usually starts with sk_).",
    };
  }

  const response = await fetch(`${ELEVENLABS_API}/models`, {
    headers: { "xi-api-key": key },
  });

  if (response.ok) return { ok: true, message: "API key is valid." };

  const detail = await parseElevenLabsError(response);
  const code = (detail.code || "").toLowerCase();

  // Restricted keys may allow TTS but not Models Read — still worth trying speech.
  if (response.status === 403 && code === "insufficient_permissions") {
    return {
      ok: true,
      message: "Key looks valid but lacks Models Read — use Test voice to confirm TTS works.",
    };
  }

  return { ok: false, message: friendlyElevenLabsError(response.status, detail) };
}

async function playAudioBlob(blob: Blob): Promise<void> {
  const type = blob.type || "";
  if (!type.startsWith("audio/") && blob.size < 200) {
    const errText = await blob.text();
    throw new Error(errText || "No audio returned");
  }

  await unlockAudioForPlayback();
  const audioUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl);
    audio.setAttribute("playsinline", "true");
    audio.volume = 1;
    currentAudio = audio;

    const cleanup = () => {
      URL.revokeObjectURL(audioUrl);
      if (currentAudio === audio) currentAudio = null;
    };

    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Playback failed — check phone volume"));
    };
    audio.play().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export async function speakWithElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<void> {
  stopSpeaking();

  const prepared = prepareTextForSpeech(text);
  if (!prepared) return;

  const key = normalizeElevenLabsApiKey(apiKey);
  if (!key) throw new Error("No ElevenLabs API key configured.");

  const response = await fetch(elevenLabsUrl(voiceId), {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: prepared,
      model_id: ELEVENLABS_TTS_MODEL,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const detail = await parseElevenLabsError(response);
    throw new Error(friendlyElevenLabsError(response.status, detail));
  }

  await playAudioBlob(await response.blob());
}

export function speakWithBrowser(text: string): Promise<void> {
  stopSpeaking();

  const prepared = prepareTextForSpeech(text);
  if (!prepared || typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(prepared);
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakAloud(
  text: string,
  apiKey: string,
  voiceId: string,
  options?: { useElevenLabs?: boolean }
): Promise<{ engine: "elevenlabs" | "browser"; warning?: string }> {
  const useElevenLabs = options?.useElevenLabs ?? true;

  if (useElevenLabs && normalizeElevenLabsApiKey(apiKey)) {
    try {
      await speakWithElevenLabs(text, apiKey, voiceId);
      return { engine: "elevenlabs" };
    } catch (err) {
      console.warn("ElevenLabs failed, using device voice:", err);
      await speakWithBrowser(text);
      return {
        engine: "browser",
        warning:
          err instanceof Error
            ? `${err.message} — using device voice instead`
            : "ElevenLabs unavailable — using device voice",
      };
    }
  }

  await speakWithBrowser(text);
  return { engine: "browser" };
}

export async function testBrowserVoice(): Promise<{ ok: boolean; message: string }> {
  try {
    await unlockAudioForPlayback();
    await speakWithBrowser("Hello. This is your device voice.");
    return { ok: true, message: "Played device voice — did you hear it?" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Device voice test failed" };
  }
}

export async function testElevenLabsVoice(
  apiKey: string,
  voiceId: string
): Promise<{ ok: boolean; message: string }> {
  const key = normalizeElevenLabsApiKey(apiKey);
  if (!key) {
    return { ok: false, message: "Add your ElevenLabs API key first." };
  }

  const keyCheck = await validateElevenLabsKey(key);
  if (!keyCheck.ok) return keyCheck;

  try {
    await unlockAudioForPlayback();
    await speakWithElevenLabs("Hello. I can hear you.", key, voiceId);
    return { ok: true, message: "Played a test greeting — did you hear it?" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Test failed" };
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function stopAll(): void {
  stopListening();
  stopSpeaking();
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SpeechStreamOptions {
  useElevenLabs?: boolean;
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
}

/** Speak LLM tokens sentence-by-sentence as they arrive. */
export class SpeechStreamQueue {
  private buffer = "";
  private spokenChars = 0;
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private options: SpeechStreamOptions;

  constructor(options: SpeechStreamOptions = {}) {
    this.options = options;
  }

  feed(token: string): void {
    if (this.stopped) return;
    this.buffer += token;
    this.drainSentences();
  }

  private drainSentences(): void {
    const rest = this.buffer.slice(this.spokenChars);
    const match = rest.match(/^([\s\S]*?[.!?…]+)(\s+|$)/);
    if (!match) return;

    const sentence = match[1].trim();
    this.spokenChars += match[0].length;
    if (sentence.length >= 8) {
      this.enqueue(sentence);
    }
    this.drainSentences();
  }

  private enqueue(text: string): void {
    this.queue = this.queue.then(() => {
      if (this.stopped) return;
      return speakAloud(text, this.options.elevenlabsApiKey || "", this.options.elevenlabsVoiceId || "", {
        useElevenLabs: this.options.useElevenLabs,
      }).then(() => {});
    });
  }

  async flush(): Promise<void> {
    const remainder = this.buffer.slice(this.spokenChars).trim();
    if (remainder.length >= 4 && !this.stopped) {
      this.enqueue(remainder);
    }
    await this.queue;
  }

  stop(): void {
    this.stopped = true;
    stopSpeaking();
  }
}

