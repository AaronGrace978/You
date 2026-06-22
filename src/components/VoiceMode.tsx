import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import {
  startListening,
  stopListening,
  speakAloud,
  stopSpeaking,
  stopAll,
  unlockAudioForPlayback,
  isSpeechRecognitionSupported,
  pause,
  SpeechStreamQueue,
} from "../core/voice";
import { generateResponse } from "../core/conversation";
import { rememberMessage } from "../core/memory";
import { acquireWakeLock, releaseWakeLock, watchWakeLockRenew } from "../core/wake-lock";

type VoiceState = "listening" | "processing" | "speaking" | "error" | "paused";

export default function VoiceMode() {
  const setVoiceMode = useStore((s) => s.setVoiceMode);
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

  const [state, setState] = useState<VoiceState>("listening");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [hint, setHint] = useState("");
  const [entered, setEntered] = useState(false);
  const [paused, setPaused] = useState(false);

  const conversationRef = useRef<{ role: string; content: string }[]>([]);
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const handlingRef = useRef(false);
  const pausedRef = useRef(false);

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

  const handleClose = useCallback(() => {
    activeRef.current = false;
    stopAll();
    setVoiceMode(false);
  }, [setVoiceMode]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);

    if (next) {
      stopListening();
      stopSpeaking();
      setState("paused");
      setTranscript("");
    } else {
      setHint("");
      if (!busyRef.current && !handlingRef.current) {
        beginListeningRef.current();
      }
    }
  }, []);

  const processUtterance = useCallback(async (text: string) => {
    if (handlingRef.current || !text.trim()) return;
    handlingRef.current = true;
    busyRef.current = true;

    stopListening();
    setState("processing");
    setTranscript(text);
    setHint("");

    const cfg = configRef.current;
    const store = useStore.getState();

    conversationRef.current.push({ role: "user", content: text });

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: text,
      timestamp: Date.now(),
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
      } else if (cfg.useElevenLabsTts && !cfg.elevenlabsApiKey.trim()) {
        setHint("ElevenLabs is on but no API key — using device voice. Add a key in Settings.");
      }
    } catch (err) {
      console.error("Voice mode error:", err);
      setState("error");
      setHint(err instanceof Error ? err.message : "Something went wrong");
      await pause(2000);
    } finally {
      handlingRef.current = false;
      busyRef.current = false;
      setTranscript("");
      setResponse("");

      if (activeRef.current && !pausedRef.current) {
        // Brief pause so the mic doesn't pick up speaker echo
        await pause(600);
        beginListeningRef.current();
      } else if (pausedRef.current) {
        setState("paused");
      }
    }
  }, []);

  const beginListeningRef = useRef<() => void>(() => {});

  beginListeningRef.current = () => {
    if (!activeRef.current || busyRef.current || handlingRef.current || pausedRef.current) return;

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
        processUtterance(t);
      },
      onError: (error) => {
        if (busyRef.current) return;
        console.warn("Recognition error:", error);
        setState("error");
        setHint(`Mic error: ${error}. Retrying…`);
        setTimeout(() => {
          if (activeRef.current && !busyRef.current) beginListeningRef.current();
        }, 1500);
      },
      onEnd: () => {},
    });
  };

  useEffect(() => {
    activeRef.current = true;
    unlockAudioForPlayback();

    let releaseLock = () => {};
    acquireWakeLock().then((release) => {
      releaseLock = release;
    });
    const unwatchLock = watchWakeLockRenew(() => activeRef.current);

    beginListeningRef.current();
    return () => {
      activeRef.current = false;
      unwatchLock();
      releaseLock();
      void releaseWakeLock();
      stopAll();
    };
  }, []);

  const statusText: Record<VoiceState, string> = {
    listening: "Listening",
    processing: "Thinking",
    speaking: "Speaking",
    error: "Reconnecting",
    paused: "Paused",
  };

  const showDots = state === "listening" || state === "processing" || state === "speaking";

  return (
    <div
      className={`vm-root transition-opacity duration-700 ${entered ? "opacity-100" : "opacity-0"}`}
    >
      <div className="vm-aurora vm-aurora-1" />
      <div className="vm-aurora vm-aurora-2" />
      <div className="vm-aurora vm-aurora-3" />
      <div className="vm-vignette" />

      {/* Top bar */}
      <div
        className="absolute left-0 right-0 flex items-center justify-between px-5"
        style={{ top: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <span className="vm-wordmark text-lg select-none">You</span>
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

      {/* Central presence */}
      <div className="flex flex-col items-center gap-7 px-6 w-full">
        <div
          className={`vm-orb transition-transform duration-700 ${entered ? "scale-100" : "scale-90"}`}
        >
          <div className={`vm-halo ${state === "error" ? "is-error" : ""} ${state === "speaking" ? "is-speaking" : ""}`} />

          {state === "listening" && (
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

        {/* Status */}
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
            <p
              className="font-body text-xs max-w-xs leading-relaxed px-4"
              style={{ color: "rgb(var(--c-text) / 0.5)" }}
            >
              {hint}
            </p>
          )}
        </div>

        {/* Live caption */}
        <div className="min-h-[3.5rem] max-h-[28vh] overflow-y-auto w-full max-w-lg text-center px-2">
          {(state === "listening" || state === "paused") && transcript && (
            <p
              className="font-body text-base leading-relaxed message-appear selectable"
              style={{ color: "rgb(var(--c-text) / 0.9)" }}
            >
              {transcript}
            </p>
          )}
          {state === "processing" && transcript && (
            <p
              className="font-body text-sm leading-relaxed italic message-appear selectable"
              style={{ color: "rgb(var(--c-text) / 0.55)" }}
            >
              “{transcript}”
            </p>
          )}
          {state === "speaking" && response && (
            <p
              className="font-body text-base leading-relaxed message-appear selectable"
              style={{ color: "rgb(var(--c-text) / 0.92)" }}
            >
              {response.length > 320 ? response.slice(0, 320) + "…" : response}
            </p>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div
        className="absolute flex items-end justify-center gap-8"
        style={{ bottom: "max(2.5rem, calc(env(safe-area-inset-bottom) + 1.5rem))" }}
      >
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={togglePause}
            aria-label={paused ? "Resume conversation" : "Pause microphone"}
            className={`vm-icon-btn ${paused ? "is-active" : ""}`}
          >
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
