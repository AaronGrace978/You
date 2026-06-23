import { adaptToMessage, applyDinoBuddyTone, shouldReflect, buildReflectPrompt } from "./adapt";
import { getRelationalContext } from "./memory";
import { buildSystemPrompt } from "./soul";
import { chat, type OllamaCloudSettings } from "./providers";
import type { Provider } from "../store";

export interface ConversationMessage {
  role: string;
  content: string;
  image?: string;
}

export interface ConversationConfig {
  provider: Provider;
  model: string;
  ollamaVisionModel?: string;
  apiKey?: string;
  ollamaUrl?: string;
  ollamaProxyUrl?: string;
  ollamaCloudApiKey?: string;
  ollamaCloudUrl?: string;
  userName: string;
  adaptiveLoops?: boolean;
  dinoBuddyMode?: boolean;
  dinoEnergy?: number;
}

function resolveApiKey(cfg: ConversationConfig): string | undefined {
  return cfg.provider === "ollama-cloud" ? cfg.ollamaCloudApiKey : cfg.apiKey;
}

function defaultModel(provider: Provider): string {
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

function likelyNeedsDeepPass(adaptation: ReturnType<typeof adaptToMessage>): boolean {
  return (
    adaptation.mode === "crisis" ||
    adaptation.emotionalWeight >= 0.85 ||
    adaptation.mixed
  );
}

async function tryRevise(
  draft: string,
  userMessage: string,
  adaptation: ReturnType<typeof adaptToMessage>,
  chatReq: Parameters<typeof chat>[0]
): Promise<string> {
  if (!shouldReflect(draft, adaptation, userMessage)) return draft;

  const reflectPrompt = buildReflectPrompt(draft, userMessage, adaptation);
  const revised = await chat({
    ...chatReq,
    messages: [{ role: "user", content: reflectPrompt }],
  });
  const trimmed = revised.trim();
  return trimmed && trimmed !== "UNCHANGED" ? trimmed : draft;
}

/** Emit final text through the stream callback when reflect ran before display. */
function emitFinal(onToken: (t: string) => void, text: string): void {
  onToken(text);
}

export async function generateResponse(
  history: ConversationMessage[],
  cfg: ConversationConfig,
  onToken?: (token: string) => void
): Promise<string> {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const userMessage = lastUser?.content || "";
  const recentUser = history.filter((m) => m.role === "user").slice(-4).map((m) => m.content);

  let adaptation = adaptToMessage(userMessage, recentUser.slice(0, -1));
  if (cfg.dinoBuddyMode) {
    adaptation = applyDinoBuddyTone(adaptation);
  }
  const relationalContext = getRelationalContext(userMessage);
  const systemPrompt = buildSystemPrompt(cfg.userName, relationalContext, adaptation, {
    dinoBuddyMode: cfg.dinoBuddyMode,
    dinoEnergy: cfg.dinoEnergy,
  });

  const chatReq = {
    provider: cfg.provider,
    model: cfg.model || defaultModel(cfg.provider),
    ollamaVisionModel: cfg.ollamaVisionModel,
    messages: [{ role: "system", content: systemPrompt }, ...history],
    apiKey: resolveApiKey(cfg),
    ollamaUrl: cfg.ollamaUrl,
    ollamaProxyUrl: cfg.ollamaProxyUrl,
    ollamaCloudApiKey: cfg.ollamaCloudApiKey,
    ollamaCloudUrl: cfg.ollamaCloudUrl,
  };

  const useLoops = cfg.adaptiveLoops !== false;

  if (useLoops && likelyNeedsDeepPass(adaptation)) {
    const draft = await chat(chatReq);
    const final = await tryRevise(draft, userMessage, adaptation, chatReq);
    if (onToken) emitFinal(onToken, final);
    return final;
  }

  const draft = await chat({ ...chatReq, onToken });

  if (useLoops && !onToken) {
    return tryRevise(draft, userMessage, adaptation, chatReq);
  }

  return draft;
}

export type { OllamaCloudSettings };
