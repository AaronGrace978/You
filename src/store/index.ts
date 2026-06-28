import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateResponse, type ConversationMessage } from "../core/conversation";
import { rememberMessage, importMemories } from "../core/memory";
import { normalizeElevenLabsApiKey } from "../core/voice";
import { applyThemeChrome } from "../core/theme-chrome";
import type { ParsedJournalMessage } from "../core/journal";

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
export type View = "landing" | "gateway" | "sanctuary" | "settings" | "guide";
export type Theme = "dark" | "light" | "dawn" | "deck";

interface AppState {
  view: View;
  setView: (view: View) => void;

  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  /** Hide on-screen system navigation via immersive fullscreen where supported. */
  immersiveNav: boolean;
  setImmersiveNav: (v: boolean) => void;

  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  sendMessage: (content: string, image?: string, attachments?: Attachment[]) => Promise<void>;
  /** Drop the latest reply and generate a fresh one for the same prompt. */
  regenerateLast: () => Promise<void>;
  /** Abort the in-flight reply, keeping whatever streamed so far. */
  stopStreaming: () => void;
  clearConversation: () => void;
  /** Restore a saved journal: merge into the transcript and rebuild memory. */
  importConversation: (parsed: ParsedJournalMessage[]) => Promise<{ added: number; skipped: number }>;

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

  /** When true, uses read-the-room adaptation and reflect-revise on heavy turns. */
  adaptiveLoops: boolean;
  setAdaptiveLoops: (v: boolean) => void;

  /** Dino Buddy — warm, calm brother-energy presence (ActivatePrime persona). */
  dinoBuddyMode: boolean;
  setDinoBuddyMode: (v: boolean) => void;

  /** 0–100 Dino energy (calm → volcanic). Only applies when dinoBuddyMode is on. */
  dinoEnergy: number;
  setDinoEnergy: (v: number) => void;

  /** Game Buddy — co-op gaming companion that watches the screen and reacts. */
  gameBuddyMode: boolean;
  setGameBuddyMode: (v: boolean) => void;

  /** 0–100 hype (chill → unhinged). Only applies when gameBuddyMode is on. */
  gameBuddyHype: number;
  setGameBuddyHype: (v: number) => void;

  /** Seconds between auto screen-watch frames; 0 = manual ("React now") only. */
  screenWatchInterval: number;
  setScreenWatchInterval: (v: number) => void;

  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;

  /** Hold mic to talk (recommended on phone). */
  voicePttMode: boolean;
  setVoicePttMode: (v: boolean) => void;

  /** Attach camera frame with each voice message. */
  voiceSeeMode: boolean;
  setVoiceSeeMode: (v: boolean) => void;

  hasSeenLanding: boolean;
}

const uid = () => crypto.randomUUID();

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      // Tracks the in-flight reply so it can be aborted by the Stop button.
      let activeController: AbortController | null = null;

      const buildConfig = (signal: AbortSignal) => {
        const state = get();
        return {
          provider: state.provider,
          model: state.model || getDefaultModel(state.provider),
          ollamaVisionModel: state.ollamaVisionModel,
          apiKey: state.apiKey,
          ollamaUrl: state.ollamaUrl || "http://localhost:11434",
          ollamaProxyUrl: state.ollamaProxyUrl,
          ollamaCloudApiKey: state.ollamaCloudApiKey,
          ollamaCloudUrl: state.ollamaCloudUrl,
          userName: state.userName,
          adaptiveLoops: state.adaptiveLoops,
          dinoBuddyMode: state.dinoBuddyMode,
          dinoEnergy: state.dinoEnergy,
          gameBuddyMode: state.gameBuddyMode,
          gameBuddyHype: state.gameBuddyHype,
          signal,
        };
      };

      // Shared generation pass — used by both sendMessage and regenerateLast.
      const streamAssistant = async (history: ConversationMessage[]) => {
        const controller = new AbortController();
        activeController = controller;
        set({ isStreaming: true, streamingContent: "" });

        try {
          const response = await generateResponse(
            history,
            buildConfig(controller.signal),
            (token) => set((s) => ({ streamingContent: s.streamingContent + token }))
          );

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
          const aborted =
            controller.signal.aborted ||
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && err.name === "AbortError");

          if (aborted) {
            // Keep whatever streamed before the user pressed Stop.
            const partial = get().streamingContent.trim();
            if (partial) {
              const assistantMsg: Message = {
                id: uid(),
                role: "assistant",
                content: partial,
                timestamp: Date.now(),
              };
              set((s) => ({
                messages: [...s.messages, assistantMsg],
                isStreaming: false,
                streamingContent: "",
              }));
              rememberMessage(assistantMsg);
            } else {
              set({ isStreaming: false, streamingContent: "" });
            }
          } else {
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
        } finally {
          if (activeController === controller) activeController = null;
        }
      };

      return {
      view: "landing",
      setView: (view) => set({ view }),

      theme: "dark",
      toggleTheme: () =>
        set((s) => {
          // Cycle through the passage: night → day → dawn → deck → night.
          const order: Theme[] = ["dark", "light", "dawn", "deck"];
          const next = order[(order.indexOf(s.theme) + 1) % order.length];
          applyThemeChrome(next);
          return { theme: next };
        }),
      setTheme: (next) =>
        set(() => {
          applyThemeChrome(next);
          return { theme: next };
        }),

      immersiveNav: false,
      setImmersiveNav: (immersiveNav) => set({ immersiveNav }),

      messages: [],
      isStreaming: false,
      streamingContent: "",

      sendMessage: async (content: string, image?: string, attachments?: Attachment[]) => {
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

        const history: ConversationMessage[] = get().messages.map((m) => ({
          role: m.role,
          content: m.content,
          image: m.image,
        }));

        await streamAssistant(history);
      },

      regenerateLast: async () => {
        if (get().isStreaming) return;
        const msgs = get().messages;
        let i = msgs.length - 1;
        while (i >= 0 && msgs[i].role !== "assistant") i--;
        if (i < 0) return;

        const trimmed = msgs.slice(0, i);
        set({ messages: trimmed });

        const history: ConversationMessage[] = trimmed.map((m) => ({
          role: m.role,
          content: m.content,
          image: m.image,
        }));

        await streamAssistant(history);
      },

      stopStreaming: () => {
        activeController?.abort();
      },

      clearConversation: () => {
        activeController?.abort();
        set({ messages: [], isStreaming: false, streamingContent: "" });
      },

      importConversation: async (parsed) => {
        if (parsed.length === 0) return { added: 0, skipped: 0 };

        // Merge into the visible transcript, de-duplicating by role + content
        // so re-importing the same (or overlapping) journals stays clean.
        const existing = get().messages;
        const seen = new Set(existing.map((m) => `${m.role}\u0000${m.content.trim()}`));
        const toAdd: Message[] = [];
        for (const p of parsed) {
          const key = `${p.role}\u0000${p.content.trim()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          toAdd.push({ id: uid(), role: p.role, content: p.content, timestamp: p.timestamp });
        }

        if (toAdd.length > 0) {
          const merged = [...existing, ...toAdd].sort((a, b) => a.timestamp - b.timestamp);
          set({ messages: merged, view: "sanctuary", hasSeenLanding: true });
        }

        return importMemories(
          toAdd.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
          }))
        );
      },

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

      adaptiveLoops: true,
      setAdaptiveLoops: (adaptiveLoops) => set({ adaptiveLoops }),

      dinoBuddyMode: false,
      // Personas are mutually exclusive — turning Dino on retires Game Buddy.
      setDinoBuddyMode: (dinoBuddyMode) =>
        set(dinoBuddyMode ? { dinoBuddyMode, gameBuddyMode: false } : { dinoBuddyMode }),

      dinoEnergy: 35,
      setDinoEnergy: (dinoEnergy) => set({ dinoEnergy: Math.max(0, Math.min(100, dinoEnergy)) }),

      gameBuddyMode: false,
      setGameBuddyMode: (gameBuddyMode) =>
        set(gameBuddyMode ? { gameBuddyMode, dinoBuddyMode: false } : { gameBuddyMode }),

      gameBuddyHype: 55,
      setGameBuddyHype: (gameBuddyHype) =>
        set({ gameBuddyHype: Math.max(0, Math.min(100, gameBuddyHype)) }),

      screenWatchInterval: 0,
      setScreenWatchInterval: (screenWatchInterval) =>
        set({ screenWatchInterval: Math.max(0, screenWatchInterval) }),

      voiceMode: false,
      setVoiceMode: (voiceMode) => set({ voiceMode }),

      voicePttMode: true,
      setVoicePttMode: (voicePttMode) => set({ voicePttMode }),

      voiceSeeMode: false,
      setVoiceSeeMode: (voiceSeeMode) => set({ voiceSeeMode }),

      hasSeenLanding: false,
      };
    },
    {
      name: "you-app-state",
      partialize: (state) => ({
        theme: state.theme,
        immersiveNav: state.immersiveNav,
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
        adaptiveLoops: state.adaptiveLoops,
        dinoBuddyMode: state.dinoBuddyMode,
        dinoEnergy: state.dinoEnergy,
        gameBuddyMode: state.gameBuddyMode,
        gameBuddyHype: state.gameBuddyHype,
        screenWatchInterval: state.screenWatchInterval,
        voicePttMode: state.voicePttMode,
        voiceSeeMode: state.voiceSeeMode,
        hasSeenLanding: state.hasSeenLanding,
      }),
      onRehydrateStorage: () => {
        return (state?: AppState) => {
          if (state) {
            applyThemeChrome(state.theme);
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
