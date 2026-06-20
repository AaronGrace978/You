import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildSystemPrompt } from "../core/soul";
import { chat } from "../core/providers";
import { rememberMessage, getRelationalContext } from "../core/memory";
import { normalizeElevenLabsApiKey } from "../core/voice";

export interface Attachment {
  name: string;
  type: "image" | "pdf" | "file";
  data: string;
  mimeType: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  image?: string;
  attachments?: Attachment[];
}

export type Provider = "ollama" | "ollama-cloud" | "openai" | "anthropic";
export type View = "landing" | "gateway" | "sanctuary" | "settings";
export type Theme = "dark" | "light";

interface AppState {
  view: View;
  setView: (view: View) => void;

  theme: Theme;
  toggleTheme: () => void;

  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  sendMessage: (content: string, image?: string, attachments?: Attachment[]) => Promise<void>;
  clearConversation: () => void;

  provider: Provider;
  model: string;
  apiKey: string;
  ollamaUrl: string;
  ollamaProxyUrl: string;
  ollamaCloudUrl: string;
  ollamaCloudApiKey: string;
  ollamaVisionModel: string;
  setProvider: (p: Provider) => void;
  setModel: (m: string) => void;
  setApiKey: (k: string) => void;
  setOllamaUrl: (u: string) => void;
  setOllamaProxyUrl: (u: string) => void;
  setOllamaCloudUrl: (u: string) => void;
  setOllamaCloudApiKey: (k: string) => void;
  setOllamaVisionModel: (m: string) => void;

  userName: string;
  setUserName: (name: string) => void;
  sessionCount: number;

  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  setElevenlabsApiKey: (k: string) => void;
  setElevenlabsVoiceId: (id: string) => void;

  /** When false, voice mode uses the device/browser TTS instead of ElevenLabs. */
  useElevenLabsTts: boolean;
  setUseElevenLabsTts: (v: boolean) => void;

  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;

  hasSeenLanding: boolean;
}

const uid = () => crypto.randomUUID();

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "landing",
      setView: (view) => set({ view }),

      theme: "dark",
      toggleTheme: () =>
        set((s) => {
          const next = s.theme === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", next);
          return { theme: next };
        }),

      messages: [],
      isStreaming: false,
      streamingContent: "",

      sendMessage: async (content: string, image?: string, attachments?: Attachment[]) => {
        const state = get();
        const userMsg: Message = {
          id: uid(),
          role: "user",
          content,
          timestamp: Date.now(),
          image,
          attachments,
        };

        set((s) => ({ messages: [...s.messages, userMsg] }));
        rememberMessage(userMsg);
        set({ isStreaming: true, streamingContent: "" });

        try {
          const relationalContext = getRelationalContext();
          const systemPrompt = buildSystemPrompt(state.userName, relationalContext);

          const history = [...get().messages].map((m) => ({
            role: m.role,
            content: m.content,
            image: m.image,
          }));

          const response = await chat({
            provider: state.provider,
            model: state.model || getDefaultModel(state.provider),
            ollamaVisionModel: state.ollamaVisionModel,
            messages: [{ role: "system", content: systemPrompt }, ...history],
            apiKey: state.provider === "ollama-cloud" ? state.ollamaCloudApiKey : state.apiKey,
            ollamaUrl: state.ollamaUrl || "http://localhost:11434",
            ollamaProxyUrl: state.ollamaProxyUrl,
            ollamaCloudApiKey: state.ollamaCloudApiKey,
            ollamaCloudUrl: state.ollamaCloudUrl,
            onToken: (token) => {
              set((s) => ({ streamingContent: s.streamingContent + token }));
            },
          });

          const assistantMsg: Message = {
            id: uid(),
            role: "assistant",
            content: response,
            timestamp: Date.now(),
          };

          set((s) => ({
            messages: [...s.messages, assistantMsg],
            isStreaming: false,
            streamingContent: "",
            sessionCount: s.sessionCount + 1,
          }));

          rememberMessage(assistantMsg);
        } catch (err) {
          const errorMsg: Message = {
            id: uid(),
            role: "assistant",
            content: `I'm having trouble connecting right now. Please check your settings and try again.\n\n(${err instanceof Error ? err.message : "Unknown error"})`,
            timestamp: Date.now(),
          };
          set((s) => ({
            messages: [...s.messages, errorMsg],
            isStreaming: false,
            streamingContent: "",
          }));
        }
      },

      clearConversation: () => set({ messages: [] }),

      provider: "ollama",
      model: "",
      apiKey: "",
      ollamaUrl: "http://localhost:11434",
      ollamaProxyUrl: "",
      ollamaCloudUrl: "",
      ollamaCloudApiKey: "",
      ollamaVisionModel: "gemini-3-flash-preview",
      setProvider: (provider) => set({ provider, model: getDefaultModel(provider) }),
      setModel: (model) => set({ model }),
      setApiKey: (apiKey) => set({ apiKey }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
      setOllamaProxyUrl: (ollamaProxyUrl) => set({ ollamaProxyUrl }),
      setOllamaCloudUrl: (ollamaCloudUrl) => set({ ollamaCloudUrl }),
      setOllamaCloudApiKey: (ollamaCloudApiKey) => set({ ollamaCloudApiKey }),
      setOllamaVisionModel: (ollamaVisionModel) => set({ ollamaVisionModel }),

      userName: "",
      setUserName: (userName) => set({ userName }),
      sessionCount: 0,

      elevenlabsApiKey: "",
      elevenlabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
      setElevenlabsApiKey: (elevenlabsApiKey) =>
        set({ elevenlabsApiKey: normalizeElevenLabsApiKey(elevenlabsApiKey) }),
      setElevenlabsVoiceId: (elevenlabsVoiceId) => set({ elevenlabsVoiceId }),

      useElevenLabsTts: false,
      setUseElevenLabsTts: (useElevenLabsTts) => set({ useElevenLabsTts }),

      voiceMode: false,
      setVoiceMode: (voiceMode) => set({ voiceMode }),

      hasSeenLanding: false,
    }),
    {
      name: "you-app-state",
      partialize: (state) => ({
        theme: state.theme,
        messages: state.messages,
        provider: state.provider,
        model: state.model,
        apiKey: state.apiKey,
        ollamaUrl: state.ollamaUrl,
        ollamaProxyUrl: state.ollamaProxyUrl,
        ollamaCloudUrl: state.ollamaCloudUrl,
        ollamaCloudApiKey: state.ollamaCloudApiKey,
        ollamaVisionModel: state.ollamaVisionModel,
        userName: state.userName,
        sessionCount: state.sessionCount,
        elevenlabsApiKey: state.elevenlabsApiKey,
        elevenlabsVoiceId: state.elevenlabsVoiceId,
        useElevenLabsTts: state.useElevenLabsTts,
        hasSeenLanding: state.hasSeenLanding,
      }),
      onRehydrateStorage: () => {
        return (state?: AppState) => {
          if (state) {
            document.documentElement.setAttribute("data-theme", state.theme);
            const normalizedKey = normalizeElevenLabsApiKey(state.elevenlabsApiKey);
            if (normalizedKey !== state.elevenlabsApiKey) {
              useStore.setState({ elevenlabsApiKey: normalizedKey });
            }
            if (state.hasSeenLanding && state.messages.length > 0) {
              useStore.setState({ view: "sanctuary" });
            }
          }
        };
      },
    }
  )
);

function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case "ollama":
      return "qwen3.5";
    case "ollama-cloud":
      return "glm-5.2";
    case "openai":
      return "gpt-5.4";
    case "anthropic":
      return "claude-sonnet-4-6";
  }
}
