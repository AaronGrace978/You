/**
 * Voice Engine — ElevenLabs TTS + Web Speech API recognition.
 * Powers the natural voice conversation mode.
 */

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

let recognition: any = null;
let currentAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

/** Tiny silent WAV — primes mobile browsers to allow later playback. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

/**
 * Call this on a user tap (before voice mode opens). Android blocks audio.play()
 * unless playback was unlocked during a recent gesture.
 */
export async function unlockAudioForPlayback(): Promise<void> {
  if (audioUnlocked || typeof window === "undefined") return;

  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      await ctx.resume();
      await ctx.close();
    }
  } catch {
    // AudioContext may be unavailable — still try the Audio element below.
  }

  try {
    const primer = new Audio(SILENT_WAV);
    primer.volume = 0.01;
    primer.setAttribute("playsinline", "true");
    await primer.play();
    primer.pause();
    audioUnlocked = true;
  } catch {
    // Will retry on next user gesture.
  }
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

export function startListening(callbacks: RecognitionCallbacks): void {
  if (!SpeechRecognitionAPI) {
    callbacks.onError("Speech recognition not supported in this browser");
    return;
  }

  stopListening();

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  let finalTranscript = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let delivered = false;

  const deliverFinal = () => {
    if (delivered) return;
    const text = finalTranscript.trim();
    if (!text) return;
    delivered = true;
    if (silenceTimer) clearTimeout(silenceTimer);
    callbacks.onFinal(text);
  };

  recognition.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }

    callbacks.onInterim((finalTranscript + interim).trim());

    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(deliverFinal, 1200);
  };

  recognition.onerror = (event: any) => {
    if (event.error === "no-speech") return;
    if (event.error === "aborted") return;
    callbacks.onError(event.error);
  };

  recognition.onend = () => {
    deliverFinal();
    callbacks.onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : "Could not start microphone");
  }
}

export function stopListening(): void {
  if (recognition) {
    try {
      recognition.abort();
    } catch {}
    recognition = null;
  }
}

/** Strip markdown so TTS doesn't read asterisks and hash marks aloud. */
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

async function playAudioBlob(blob: Blob): Promise<void> {
  if (!blob.type.startsWith("audio/") && blob.size < 200) {
    const errText = await blob.text();
    throw new Error(errText || "ElevenLabs returned no audio");
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
      reject(new Error("Audio playback failed — check your phone volume"));
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

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
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
    }
  );

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err.detail?.message || err.detail || detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(`ElevenLabs: ${detail}`);
  }

  const audioBlob = await response.blob();
  await playAudioBlob(audioBlob);
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
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/** ElevenLabs when configured; device voice as fallback (critical on Android). */
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
        warning: err instanceof Error ? err.message : "ElevenLabs unavailable — using device voice",
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
    return { ok: true, message: "Voice test played — you should have heard a short greeting." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return {
        ok: false,
        message:
          "Cannot reach ElevenLabs from the browser. Try Chrome, or check your key at elevenlabs.io.",
      };
    }
    return { ok: false, message: msg };
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
