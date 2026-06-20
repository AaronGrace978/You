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

/** Collapse "hey hey hey hey" stutter from duplicate recognition chunks. */
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

export function startListening(callbacks: RecognitionCallbacks): void {
  if (!SpeechRecognitionAPI) {
    callbacks.onError("Speech recognition not supported — try Chrome");
    return;
  }

  stopListening();
  const session = listenSession;

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
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
    callbacks.onInterim(lastTranscript);

    if (silenceTimer) clearTimeout(silenceTimer);
    if (lastTranscript) {
      silenceTimer = setTimeout(() => deliver(lastTranscript), 1600);
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
    if (!delivered && lastTranscript) deliver(lastTranscript);
    callbacks.onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : "Could not start microphone");
  }
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

function elevenLabsUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
}

/** Pull a readable message out of any ElevenLabs error body shape. */
async function extractError(response: Response): Promise<string> {
  try {
    const err = await response.json();
    const d = err?.detail ?? err;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d[0]?.msg || d[0]?.message || JSON.stringify(d[0]);
    return d?.message || d?.status || err?.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Turn raw API failures into something a human can act on. */
function friendlyElevenLabsError(status: number, detail: string): string {
  switch (status) {
    case 401:
      return "Invalid or expired API key — copy a fresh key from elevenlabs.io → Profile.";
    case 403:
      return "This API key isn't allowed to use text-to-speech (check key permissions).";
    case 422:
      return `Voice or settings rejected by ElevenLabs (${detail}). Try a different voice.`;
    case 429:
      return "Rate limit or out of credits on your ElevenLabs plan.";
    default:
      return `ElevenLabs error ${status}: ${detail}`;
  }
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

  const response = await fetch(elevenLabsUrl(voiceId), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey.trim(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: prepared,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(friendlyElevenLabsError(response.status, await extractError(response)));
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
  voiceId: string
): Promise<{ engine: "elevenlabs" | "browser"; warning?: string }> {
  if (apiKey.trim()) {
    try {
      await speakWithElevenLabs(text, apiKey.trim(), voiceId);
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

export async function testElevenLabsVoice(
  apiKey: string,
  voiceId: string
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { ok: false, message: "Add your ElevenLabs API key first." };
  }

  try {
    await unlockAudioForPlayback();
    await speakWithElevenLabs("Hello. I can hear you.", apiKey.trim(), voiceId);
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
