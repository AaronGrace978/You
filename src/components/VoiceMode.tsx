import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import {
  startListening,
  stopListening,
  endPttCapture,
  speakAloud,
  stopSpeaking,
  stopAll,
  unlockAudioForPlayback,
  isSpeechRecognitionSupported,
  pause,
  SpeechStreamQueue,
} from "../core/voice";
import {
  openCameraStream,
  stopCameraStream,
  captureVideoFrame,
  attachStreamToVideo,
  isCameraSupported,
} from "../core/camera";
import { generateResponse } from "../core/conversation";
import { rememberMessage } from "../core/memory";
import { acquireWakeLock, releaseWakeLock, watchWakeLockRenew } from "../core/wake-lock";

type VoiceState = "ready" | "listening" | "processing" | "speaking" | "error" | "paused";

export default function VoiceMode() {
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const voicePttMode = useStore((s) => s.voicePttMode);
  const voiceSeeMode = useStore((s) => s.voiceSeeMode);
  const setVoiceSeeMode = useStore((s) => s.setVoiceSeeMode);
  const dinoBuddyMode = useStore((s) => s.dinoBuddyMode);
  const provider = useStore((s) => s.provider);
  const model = useStore((s) => s.model);
  const apiKey = useStore((s) => s.apiKey);
  const ollamaUrl = useStore((s) => s.ollamaUrl);
  const ollamaProxyUrl = useStore((s) => s.ollamaProxyUrl);
  const ollamaCloudUrl = useStore((s) => s.ollamaCloudUrl);
  const ollamaCloudApiKey = useStore((s) => s.ollamaCloudApiKey);
  const ollamaVisionModel = useStore((s) => s.ollamaVisionModel);
  const elevenlabsApiKey = useStore((s) => s.elevenlabsApiKey);
  const elevenlabsVoiceId = useStore((s) => s.elevenlabsVoiceId);
  const useElevenLabsTts = useStore((s) => s.useElevenLabsTts);

  const [state, setState] = useState<VoiceState>(voicePttMode ? "ready" : "listening");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [hint, setHint] = useState("");
  const [entered, setEntered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pttHolding, setPttHolding] = useState(false);

  const conversationRef = useRef<{ role: string; content: string; image?: string }[]>([]);
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const handlingRef = useRef(false);
  const pausedRef = useRef(false);
  const pttActiveRef = useRef(false);
  const speechQueueRef = useRef<SpeechStreamQueue | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const configRef = useRef({
    provider,
    model,
    apiKey,
    ollamaUrl,
    ollamaProxyUrl,
    ollamaCloudUrl,
    ollamaCloudApiKey,
    ollamaVisionModel,
    elevenlabsApiKey,
    elevenlabsVoiceId,
    useElevenLabsTts,
  });
  configRef.current = {
    provider,
    model,
    apiKey,
    ollamaUrl,
    ollamaProxyUrl,
    ollamaCloudUrl,
    ollamaCloudApiKey,
    ollamaVisionModel,
    elevenlabsApiKey,
    elevenlabsVoiceId,
    useElevenLabsTts,
  };

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(t);
  }, []);

  const stopCamera = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!isCameraSupported()) return;
    stopCamera();
    try {
      const stream = await openCameraStream("environment");
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) attachStreamToVideo(video, stream);
    } catch {
      setHint("Camera unavailable — turn off See mode or allow camera access.");
      setVoiceSeeMode(false);
    }
  }, [setVoiceSeeMode, stopCamera]);

  useEffect(() => {
    if (!voiceSeeMode) {
      stopCamera();
      return;
    }
    const id = window.setTimeout(() => {
      void startCamera();
    }, 80);
    return () => {
      clearTimeout(id);
      stopCamera();
    };
  }, [voiceSeeMode, startCamera, stopCamera]);

  const grabFrame = (): string | undefined => {
    if (!voiceSeeMode || !videoRef.current) return undefined;
    return captureVideoFrame(videoRef.current) || undefined;
  };

  const handleClose = useCallback(() => {
    activeRef.current = false;
    stopAll();
    stopCamera();
    setVoiceMode(false);
  }, [setVoiceMode, stopCamera]);

  const interruptSpeaking = useCallback(() => {
    if (state !== "speaking") return;
    speechQueueRef.current?.stop();
    speechQueueRef.current = null;
    stopSpeaking();
    setResponse("");
    if (voicePttMode) setState("ready");
    else if (!pausedRef.current) beginListeningRef.current();
  }, [state, voicePttMode]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);

    if (next) {
      stopListening();
      stopSpeaking();
      speechQueueRef.current?.stop();
      setState("paused");
      setTranscript("");
    } else {
      setHint("");
      if (!busyRef.current && !handlingRef.current) {
        if (voicePttMode) setState("ready");
        else beginListeningRef.current();
      }
    }
  }, [voicePttMode]);

  const processUtterance = useCallback(
    async (text: string, image?: string) => {
      const trimmed = text.trim();
      const frame = image ?? grabFrame();
      let content = trimmed;
      if (!content && frame) content = "What do you see?";
      if (!content && !frame) return;
      if (handlingRef.current) return;

      handlingRef.current = true;
      busyRef.current = true;
      stopListening();
      setState("processing");
      setTranscript(content);
      setHint(frame ? "Seeing…" : "");

      const cfg = configRef.current;
      const store = useStore.getState();

      const userTurn = { role: "user" as const, content, ...(frame ? { image: frame } : {}) };
      conversationRef.current.push(userTurn);

      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content,
        timestamp: Date.now(),
        image: frame,
      };
      useStore.setState((s) => ({ messages: [...s.messages, userMsg] }));
      rememberMessage(userMsg);

      try {
        const draftRef = { text: "" };
        let speakingStarted = false;

        const speechQueue = new SpeechStreamQueue({
          useElevenLabs: cfg.useElevenLabsTts,
          elevenlabsApiKey: cfg.elevenlabsApiKey,
          elevenlabsVoiceId: cfg.elevenlabsVoiceId,
        });
        speechQueueRef.current = speechQueue;

        const aiResponse = await generateResponse(
          conversationRef.current,
          {
            provider: cfg.provider,
            model: cfg.model || "glm-5.2",
            ollamaVisionModel: cfg.ollamaVisionModel,
            apiKey: cfg.apiKey,
            ollamaUrl: cfg.ollamaUrl,
            ollamaProxyUrl: cfg.ollamaProxyUrl,
            ollamaCloudApiKey: cfg.ollamaCloudApiKey,
            ollamaCloudUrl: cfg.ollamaCloudUrl,
            userName: store.userName,
            adaptiveLoops: store.adaptiveLoops,
            dinoBuddyMode: store.dinoBuddyMode,
            dinoEnergy: store.dinoEnergy,
          },
          (token) => {
            draftRef.text += token;
            setResponse(draftRef.text);
            if (!speakingStarted && draftRef.text.trim().length > 0) {
              speakingStarted = true;
              setState("speaking");
            }
            speechQueue.feed(token);
          }
        );

        await speechQueue.flush();
        speechQueueRef.current = null;

        conversationRef.current.push({ role: "assistant", content: aiResponse });
        setResponse(aiResponse);

        const assistantMsg = {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: aiResponse,
          timestamp: Date.now(),
        };
        useStore.setState((s) => ({
          messages: [...s.messages, assistantMsg],
          sessionCount: s.sessionCount + 1,
        }));
        rememberMessage(assistantMsg);

        if (!speakingStarted && aiResponse.trim()) {
          setState("speaking");
          await speakAloud(aiResponse, cfg.elevenlabsApiKey, cfg.elevenlabsVoiceId, {
            useElevenLabs: cfg.useElevenLabsTts,
          });
        }
        setHint("");
      } catch (err) {
        console.error("Voice mode error:", err);
        setState("error");
        setHint(err instanceof Error ? err.message : "Something went wrong");
        await pause(2000);
      } finally {
        handlingRef.current = false;
        busyRef.current = false;
        speechQueueRef.current = null;
        setTranscript("");
        setResponse("");

        if (activeRef.current && !pausedRef.current) {
          await pause(500);
          if (voicePttMode) setState("ready");
          else beginListeningRef.current();
        } else if (pausedRef.current) {
          setState("paused");
        }
      }
    },
    [voicePttMode]
  );

  const beginListeningRef = useRef<() => void>(() => {});

  beginListeningRef.current = () => {
    if (!activeRef.current || busyRef.current || handlingRef.current || pausedRef.current) return;
    if (voicePttMode) return;

    if (!isSpeechRecognitionSupported()) {
      setState("error");
      setHint("Voice input needs Chrome (Android) or Safari (iPhone).");
      return;
    }

    setState("listening");
    setHint((h) => (h.startsWith("Using device") || h.startsWith("ElevenLabs") ? h : ""));

    startListening({
      onInterim: (t) => {
        if (!busyRef.current) setTranscript(t);
      },
      onFinal: (t) => {
        void processUtterance(t);
      },
      onError: (error) => {
        if (busyRef.current) return;
        setState("error");
        setHint(`Mic error: ${error}. Retrying…`);
        setTimeout(() => {
          if (activeRef.current && !busyRef.current) beginListeningRef.current();
        }, 1500);
      },
      onEnd: () => {},
    });
  };

  const startPtt = useCallback(() => {
    if (pttActiveRef.current || busyRef.current || pausedRef.current) return;
    if (!isSpeechRecognitionSupported()) {
      setHint("Voice input needs Chrome (Android) or Safari (iPhone).");
      return;
    }
    unlockAudioForPlayback();
    pttActiveRef.current = true;
    setPttHolding(true);
    setTranscript("");
    setState("listening");

    startListening(
      {
        onInterim: (t) => setTranscript(t),
        onFinal: () => {},
        onError: (error) => {
          if (error !== "aborted") setHint(`Mic: ${error}`);
        },
        onEnd: () => {},
      },
      { ptt: true }
    );
  }, []);

  const endPtt = useCallback(() => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setPttHolding(false);
    endPttCapture((text) => {
      void processUtterance(text);
    });
  }, [processUtterance]);

  useEffect(() => {
    activeRef.current = true;
    unlockAudioForPlayback();

    let releaseLock = () => {};
    acquireWakeLock().then((release) => {
      releaseLock = release;
    });
    const unwatchLock = watchWakeLockRenew(() => activeRef.current);

    if (!voicePttMode) beginListeningRef.current();

    return () => {
      activeRef.current = false;
      unwatchLock();
      releaseLock();
      void releaseWakeLock();
      stopAll();
      stopCamera();
    };
  }, [voicePttMode, stopCamera]);

  const statusText: Record<VoiceState, string> = {
    ready: voicePttMode ? "Hold to talk" : "Listening",
    listening: voicePttMode && pttHolding ? "Hearing you" : "Listening",
    processing: voiceSeeMode ? "Seeing & thinking" : "Thinking",
    speaking: "Speaking — tap to stop",
    error: "Reconnecting",
    paused: "Paused",
  };

  const showDots = state === "listening" || state === "processing" || state === "speaking";
  const rootClass = `vm-root transition-opacity duration-700 ${entered ? "opacity-100" : "opacity-0"}${dinoBuddyMode ? " vm-root-dino" : ""}`;

  return (
    <div className={rootClass}>
      <div className="vm-aurora vm-aurora-1" />
      <div className="vm-aurora vm-aurora-2" />
      <div className="vm-aurora vm-aurora-3" />
      <div className="vm-vignette" />

      {voiceSeeMode && (
        <div className="vm-camera-pip">
          <video ref={videoRef} className="vm-camera-video" playsInline muted />
          <span className="vm-camera-badge">Seeing</span>
        </div>
      )}

      <div
        className="absolute left-0 right-0 flex items-center justify-between px-5"
        style={{ top: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <span className="vm-wordmark text-lg select-none">
          {dinoBuddyMode ? "Dino 🦖" : "You"}
        </span>
        <button
          onClick={handleClose}
          aria-label="Close voice mode"
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer"
          style={{ color: "rgb(var(--c-text) / 0.45)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col items-center gap-7 px-6 w-full">
        <div
          className={`vm-orb transition-transform duration-700 ${entered ? "scale-100" : "scale-90"}`}
          onClick={state === "speaking" ? interruptSpeaking : undefined}
          role={state === "speaking" ? "button" : undefined}
          aria-label={state === "speaking" ? "Stop speaking" : undefined}
        >
          <div className={`vm-halo ${state === "error" ? "is-error" : ""} ${state === "speaking" ? "is-speaking" : ""}`} />

          {state === "listening" && !voicePttMode && (
            <>
              <span className="vm-ripple" />
              <span className="vm-ripple" style={{ animationDelay: "1.4s" }} />
            </>
          )}
          {state === "processing" && <div className="vm-spinner" />}

          <div
            className={`vm-core ${
              state === "error"
                ? "is-error"
                : state === "paused"
                  ? "is-paused"
                  : state === "speaking"
                    ? "is-speaking"
                    : state === "listening"
                      ? "is-listening"
                      : state === "ready"
                        ? "is-ready"
                        : ""
            }`}
          >
            {state === "speaking" && (
              <div className="vm-wave">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    style={{
                      animationDelay: `${i * 0.12}s`,
                      animationDuration: `${0.7 + (i % 3) * 0.18}s`,
                    }}
                  />
                ))}
              </div>
            )}
            {state === "paused" && (
              <svg className="vm-glyph" width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1.5" />
                <rect x="14" y="5" width="4" height="14" rx="1.5" />
              </svg>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="vm-status">
            {statusText[state]}
            {showDots && (
              <span className="vm-dots" aria-hidden>
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            )}
          </h2>
          {hint && (
            <p className="font-body text-xs max-w-xs leading-relaxed px-4" style={{ color: "rgb(var(--c-text) / 0.5)" }}>
              {hint}
            </p>
          )}
        </div>

        <div className="min-h-[3.5rem] max-h-[28vh] overflow-y-auto w-full max-w-lg text-center px-2">
          {(state === "listening" || state === "ready" || state === "paused") && transcript && (
            <p className="font-body text-base leading-relaxed message-appear selectable" style={{ color: "rgb(var(--c-text) / 0.9)" }}>
              {transcript}
            </p>
          )}
          {state === "processing" && transcript && (
            <p className="font-body text-sm leading-relaxed italic message-appear selectable" style={{ color: "rgb(var(--c-text) / 0.55)" }}>
              “{transcript}”
            </p>
          )}
          {state === "speaking" && response && (
            <p className="font-body text-base leading-relaxed message-appear selectable" style={{ color: "rgb(var(--c-text) / 0.92)" }}>
              {response.length > 320 ? response.slice(0, 320) + "…" : response}
            </p>
          )}
        </div>
      </div>

      <div
        className="absolute left-0 right-0 flex items-end justify-center gap-6 px-6"
        style={{ bottom: "max(2.5rem, calc(env(safe-area-inset-bottom) + 1.5rem))" }}
      >
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setVoiceSeeMode(!voiceSeeMode)}
            aria-label={voiceSeeMode ? "Turn off camera" : "Turn on camera"}
            className={`vm-icon-btn ${voiceSeeMode ? "is-active" : ""}`}
            disabled={!isCameraSupported()}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </button>
          <span className="vm-ctrl-label">{voiceSeeMode ? "Seeing" : "See"}</span>
        </div>

        {voicePttMode ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className={`vm-ptt-btn ${pttHolding ? "is-holding" : ""}`}
              aria-label="Hold to talk"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                startPtt();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                endPtt();
              }}
              onPointerCancel={endPtt}
              onPointerLeave={(e) => {
                if (pttHolding) endPtt();
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
            <span className="vm-ctrl-label">Hold</span>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-2">
          <button onClick={togglePause} aria-label={paused ? "Resume" : "Mute"} className={`vm-icon-btn ${paused ? "is-active" : ""}`}>
            {paused ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                <path d="M5 10v2a7 7 0 0 0 12 5" />
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            )}
          </button>
          <span className="vm-ctrl-label">{paused ? "Resume" : "Mute"}</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button onClick={handleClose} aria-label="End conversation" className="vm-end-btn">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 15.46l-5.27-.61-2.52 2.52a15.05 15.05 0 0 1-6.59-6.59l2.53-2.53L8.54 3H3.03C2.45 13.18 10.82 21.55 21 20.97v-5.51z" transform="rotate(135 12 12)" />
            </svg>
          </button>
          <span className="vm-ctrl-label">End</span>
        </div>
      </div>
    </div>
  );
}
