import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import {
  startListening,
  stopListening,
  speakAloud,
  stopAll,
  unlockAudioForPlayback,
  isSpeechRecognitionSupported,
  pause,
} from "../core/voice";
import { chat } from "../core/providers";
import { buildSystemPrompt } from "../core/soul";
import { getRelationalContext, rememberMessage } from "../core/memory";

type VoiceState = "listening" | "processing" | "speaking" | "error";

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

  const [state, setState] = useState<VoiceState>("listening");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [hint, setHint] = useState("");
  const [entered, setEntered] = useState(false);

  const conversationRef = useRef<{ role: string; content: string }[]>([]);
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const handlingRef = useRef(false);

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
      const relationalContext = getRelationalContext();
      const systemPrompt = buildSystemPrompt(store.userName, relationalContext);

      const aiResponse = await chat({
        provider: cfg.provider,
        model: cfg.model || "glm-5.2",
        ollamaVisionModel: cfg.ollamaVisionModel,
        messages: [{ role: "system", content: systemPrompt }, ...conversationRef.current],
        apiKey: cfg.provider === "ollama-cloud" ? cfg.ollamaCloudApiKey : cfg.apiKey,
        ollamaUrl: cfg.ollamaUrl,
        ollamaProxyUrl: cfg.ollamaProxyUrl,
        ollamaCloudApiKey: cfg.ollamaCloudApiKey,
        ollamaCloudUrl: cfg.ollamaCloudUrl,
      });

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

      setState("speaking");
      const { engine, warning } = await speakAloud(
        aiResponse,
        cfg.elevenlabsApiKey,
        cfg.elevenlabsVoiceId
      );
      if (warning) setHint(warning);
      else if (engine === "browser" && !cfg.elevenlabsApiKey.trim()) {
        setHint("Using device voice — add ElevenLabs key in Settings for natural speech.");
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

      if (activeRef.current) {
        // Brief pause so the mic doesn't pick up speaker echo
        await pause(600);
        beginListeningRef.current();
      }
    }
  }, []);

  const beginListeningRef = useRef<() => void>(() => {});

  beginListeningRef.current = () => {
    if (!activeRef.current || busyRef.current || handlingRef.current) return;

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
    beginListeningRef.current();
    return () => {
      activeRef.current = false;
      stopAll();
    };
  }, []);

  const statusText = {
    listening: "Listening…",
    processing: "Thinking…",
    speaking: "Speaking…",
    error: "Retrying…",
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "rgba(9, 9, 15, 0.97)" }}
    >
      <button
        onClick={handleClose}
        className="absolute w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:border-white/30 transition-all cursor-pointer"
        style={{
          top: "max(1.5rem, env(safe-area-inset-top))",
          right: "max(1.5rem, env(safe-area-inset-right))",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="relative flex items-center justify-center mb-12">
        {state === "listening" && (
          <>
            <div className="absolute w-48 h-48 rounded-full border border-warm-400/10 animate-voice-ring" />
            <div
              className="absolute w-48 h-48 rounded-full border border-warm-400/10 animate-voice-ring"
              style={{ animationDelay: "0.7s" }}
            />
          </>
        )}

        <div
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
            state === "listening"
              ? "animate-voice-listening bg-warm-400/20 shadow-[0_0_60px_rgba(201,149,107,0.25)]"
              : state === "processing"
                ? "animate-voice-pulse bg-warm-400/15 shadow-[0_0_40px_rgba(201,149,107,0.15)]"
                : state === "speaking"
                  ? "animate-voice-orb bg-warm-400/25 shadow-[0_0_80px_rgba(201,149,107,0.3)]"
                  : "bg-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.2)]"
          }`}
        >
          <div
            className={`w-16 h-16 rounded-full ${
              state === "error" ? "bg-red-500/30" : "bg-warm-400/20"
            }`}
          />
        </div>
      </div>

      <p className="font-body text-sm tracking-[0.15em] uppercase text-white/70 mb-2">
        {statusText[state]}
      </p>

      {hint && (
        <p className="font-body text-[11px] text-white/45 max-w-xs text-center px-6 mb-3 leading-relaxed">
          {hint}
        </p>
      )}

      <div className="max-w-md px-8 text-center min-h-[3rem]">
        {state === "listening" && transcript && (
          <p className="font-body text-white/80 text-base leading-relaxed">{transcript}</p>
        )}
        {state === "processing" && transcript && (
          <p className="font-body text-white/50 text-sm leading-relaxed italic">"{transcript}"</p>
        )}
        {state === "speaking" && response && (
          <p className="font-body text-white/80 text-base leading-relaxed">
            {response.length > 200 ? response.slice(0, 200) + "…" : response}
          </p>
        )}
      </div>

      <button
        onClick={handleClose}
        className="absolute px-8 py-3 rounded-full border border-white/10 font-body text-xs tracking-[0.2em] uppercase text-white/50 hover:text-white/80 hover:border-white/30 transition-all cursor-pointer"
        style={{ bottom: "max(3rem, calc(env(safe-area-inset-bottom) + 1.5rem))" }}
      >
        End
      </button>
    </div>
  );
}
