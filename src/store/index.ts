import { create } from "zustand";
import { buildSystemPrompt } from "../core/soul";
import { chat } from "../core/providers";
import { rememberMessage, getRelationalContext } from "../core/memory";

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
  sendMessage: (content: string, image?: string, attachments?: Attachment[]) => Promise<void>;

  provider: Provider;
  model: string;
  apiKey: string;
  ollamaUrl: string;
  ollamaCloudUrl: string;
  ollamaCloudApiKey: string;
  setProvider: (p: Provider) => void;
  setModel: (m: string) => void;
  setApiKey: (k: string) => void;
  setOllamaUrl: (u: string) => void;
  setOllamaCloudUrl: (u: string) => void;
  setOllamaCloudApiKey: (k: string) => void;

  userName: string;
  setUserName: (name: string) => void;
  sessionCount: number;

  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  setElevenlabsApiKey: (k: string) => void;
  setElevenlabsVoiceId: (id: string) => void;

  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
}

const uid = () => crypto.randomUUID();

export const useStore = create<AppState>((set, get) => ({
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
    set({ isStreaming: true });

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
        messages: [{ role: "system", content: systemPrompt }, ...history],
        apiKey:
          state.provider === "ollama-cloud"
            ? state.ollamaCloudApiKey
            : state.apiKey,
        ollamaUrl:
          state.provider === "ollama-cloud"
            ? state.ollamaCloudUrl
            : state.ollamaUrl || "http://localhost:11434",
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
      }));
    }
  },

  provider: "ollama",
  model: "",
  apiKey: "",
  ollamaUrl: "http://localhost:11434",
  ollamaCloudUrl: "",
  ollamaCloudApiKey: "",
  setProvider: (provider) => set({ provider, model: getDefaultModel(provider) }),
  setModel: (model) => set({ model }),
  setApiKey: (apiKey) => set({ apiKey }),
  setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
  setOllamaCloudUrl: (ollamaCloudUrl) => set({ ollamaCloudUrl }),
  setOllamaCloudApiKey: (ollamaCloudApiKey) => set({ ollamaCloudApiKey }),

  userName: "",
  setUserName: (userName) => set({ userName }),
  sessionCount: 0,

  elevenlabsApiKey: "",
  elevenlabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
  setElevenlabsApiKey: (elevenlabsApiKey) => set({ elevenlabsApiKey }),
  setElevenlabsVoiceId: (elevenlabsVoiceId) => set({ elevenlabsVoiceId }),

  voiceMode: false,
  setVoiceMode: (voiceMode) => set({ voiceMode }),
}));

function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case "ollama":
      return "qwen3.5";
    case "ollama-cloud":
      return "qwen3.5";
    case "openai":
      return "gpt-5.4";
    case "anthropic":
      return "claude-sonnet-4-6";
  }
}
