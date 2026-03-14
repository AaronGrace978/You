import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import {
  startListening,
  stopListening,
  speakWithElevenLabs,
  stopAll,
  isSpeechRecognitionSupported,
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
  const ollamaCloudUrl = useStore((s) => s.ollamaCloudUrl);
  const ollamaCloudApiKey = useStore((s) => s.ollamaCloudApiKey);
  const userName = useStore((s) => s.userName);
  const elevenlabsApiKey = useStore((s) => s.elevenlabsApiKey);
  const elevenlabsVoiceId = useStore((s) => s.elevenlabsVoiceId);

  const [state, setState] = useState<VoiceState>("listening");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [entered, setEntered] = useState(false);
  const conversationRef = useRef<{ role: string; content: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleClose = useCallback(() => {
    stopAll();
    setVoiceMode(false);
  }, [setVoiceMode]);

  const startConversation = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setState("error");
      return;
    }

    setState("listening");
    setTranscript("");
    setResponse("");

    startListening({
      onInterim: (text) => setTranscript(text),
      onFinal: async (text) => {
        stopListening();
        setState("processing");
        setTranscript(text);

        conversationRef.current.push({ role: "user", content: text });

        const store = useStore.getState();
        const uid = crypto.randomUUID();
        const userMsg = { id: uid, role: "user" as const, content: text, timestamp: Date.now() };
        useStore.setState((s) => ({ messages: [...s.messages, userMsg] }));
        rememberMessage(userMsg);

        try {
          const relationalContext = getRelationalContext();
          const systemPrompt = buildSystemPrompt(store.userName, relationalContext);

          const aiResponse = await chat({
            provider,
            model: model || "llama3.1",
            messages: [
              { role: "system", content: systemPrompt },
              ...conversationRef.current,
            ],
            apiKey: provider === "ollama-cloud" ? ollamaCloudApiKey : apiKey,
            ollamaUrl: provider === "ollama-cloud" ? ollamaCloudUrl : ollamaUrl,
          });

          conversationRef.current.push({ role: "assistant", content: aiResponse });
          setResponse(aiResponse);

          const assistantUid = crypto.randomUUID();
          const assistantMsg = { id: assistantUid, role: "assistant" as const, content: aiResponse, timestamp: Date.now() };
          useStore.setState((s) => ({
            messages: [...s.messages, assistantMsg],
            sessionCount: s.sessionCount + 1,
          }));
          rememberMessage(assistantMsg);

          setState("speaking");

          if (elevenlabsApiKey) {
            await speakWithElevenLabs(aiResponse, elevenlabsApiKey, elevenlabsVoiceId);
          }

          setState("listening");
          setTranscript("");
          setResponse("");
          startListening({
            onInterim: (t) => setTranscript(t),
            onFinal: async () => {},
            onError: () => setState("error"),
            onEnd: () => {},
          });
          startConversation();
        } catch (err) {
          console.error("Voice mode error:", err);
          setState("error");
          setTimeout(() => {
            setState("listening");
            startConversation();
          }, 2000);
        }
      },
      onError: (error) => {
        console.error("Recognition error:", error);
        setState("error");
      },
      onEnd: () => {},
    });
  }, [provider, model, apiKey, ollamaUrl, ollamaCloudUrl, ollamaCloudApiKey, userName, elevenlabsApiKey, elevenlabsVoiceId]);

  useEffect(() => {
    startConversation();
    return () => stopAll();
  }, []);

  const statusText = {
    listening: "Listening...",
    processing: "Thinking...",
    speaking: "Speaking...",
    error: "Something went wrong. Retrying...",
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "rgba(9, 9, 15, 0.95)" }}
    >
      {/* close */}
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:border-white/30 transition-all cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* orb */}
      <div className="relative flex items-center justify-center mb-12">
        {/* outer rings */}
        {state === "listening" && (
          <>
            <div className="absolute w-48 h-48 rounded-full border border-warm-400/10 animate-voice-ring" />
            <div className="absolute w-48 h-48 rounded-full border border-warm-400/10 animate-voice-ring" style={{ animationDelay: "0.7s" }} />
          </>
        )}

        {/* main orb */}
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
          <div className={`w-16 h-16 rounded-full ${
            state === "error" ? "bg-red-500/30" : "bg-warm-400/20"
          }`} />
        </div>
      </div>

      {/* status */}
      <p className="font-body text-sm tracking-[0.15em] uppercase text-white/50 mb-4">
        {statusText[state]}
      </p>

      {/* transcript / response */}
      <div className="max-w-md px-8 text-center min-h-[3rem]">
        {state === "listening" && transcript && (
          <p className="font-body text-white/70 text-base leading-relaxed animate-fade-in">
            {transcript}
          </p>
        )}
        {state === "processing" && transcript && (
          <p className="font-body text-white/40 text-sm leading-relaxed italic">
            "{transcript}"
          </p>
        )}
        {(state === "speaking") && response && (
          <p className="font-body text-white/70 text-base leading-relaxed animate-fade-in">
            {response.length > 200 ? response.slice(0, 200) + "..." : response}
          </p>
        )}
      </div>

      {/* end button */}
      <button
        onClick={handleClose}
        className="absolute bottom-12 px-8 py-3 rounded-full border border-white/10 font-body text-xs tracking-[0.2em] uppercase text-white/40 hover:text-white/80 hover:border-white/30 transition-all cursor-pointer"
      >
        End
      </button>
    </div>
  );
}
