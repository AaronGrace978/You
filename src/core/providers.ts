import {
  isHostedApp,
  OLLAMA_CLOUD_API,
  OLLAMA_PROXY_URL,
} from "./ai-config";

export interface OllamaCloudSettings {
  ollamaProxyUrl: string;
  ollamaCloudApiKey: string;
  /** Legacy custom endpoint — used when no proxy is set on desktop */
  ollamaCloudUrl?: string;
}

interface ChatRequest {
  provider: "ollama" | "ollama-cloud" | "openai" | "anthropic";
  model: string;
  ollamaVisionModel?: string;
  messages: { role: string; content: string; image?: string }[];
  apiKey?: string;
  ollamaUrl?: string;
  ollamaProxyUrl?: string;
  ollamaCloudApiKey?: string;
  ollamaCloudUrl?: string;
  onToken?: (token: string) => void;
}

/** Resolve proxy URL — auto-use built-in proxy on GitHub Pages. */
export function effectiveProxyUrl(settings: OllamaCloudSettings): string {
  const custom = settings.ollamaProxyUrl.trim();
  if (custom) return custom.replace(/\/$/, "");
  if (isHostedApp()) return OLLAMA_PROXY_URL;
  return "";
}

export function hasOllamaCloud(settings: OllamaCloudSettings): boolean {
  return (
    settings.ollamaCloudApiKey.trim().length > 0 ||
    effectiveProxyUrl(settings).length > 0 ||
    (settings.ollamaCloudUrl?.trim().length ?? 0) > 0
  );
}

function ollamaCloudApiBase(settings: OllamaCloudSettings): string {
  const proxy = effectiveProxyUrl(settings);
  if (proxy) return `${proxy}/api`;
  const legacy = settings.ollamaCloudUrl?.trim();
  if (legacy) return legacy.replace(/\/$/, "").replace(/\/api$/, "") + "/api";
  return OLLAMA_CLOUD_API;
}

function ollamaCloudHeaders(settings: OllamaCloudSettings): Record<string, string> {
  const headers: Record<string, string> = {};
  if (settings.ollamaCloudApiKey.trim()) {
    headers.Authorization = `Bearer ${settings.ollamaCloudApiKey.trim()}`;
  }
  return headers;
}

function resolveModel(req: ChatRequest): string {
  const hasImage = req.messages.some((m) => m.image);
  if (req.provider === "ollama-cloud" && hasImage && req.ollamaVisionModel) {
    return req.ollamaVisionModel;
  }
  return req.model;
}

export async function chat(req: ChatRequest): Promise<string> {
  switch (req.provider) {
    case "ollama":
      return chatOllama(req);
    case "ollama-cloud":
      return chatOllamaCloud(req);
    case "openai":
      return chatOpenAI(req);
    case "anthropic":
      return chatAnthropic(req);
    default:
      throw new Error(`Unknown provider: ${req.provider}`);
  }
}

function buildOllamaMessages(messages: ChatRequest["messages"]) {
  return messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.image) {
      msg.images = [m.image.replace(/^data:image\/\w+;base64,/, "")];
    }
    return msg;
  });
}

async function streamOllama(
  url: string,
  body: object,
  onToken?: (t: string) => void,
  headers?: Record<string, string>
): Promise<string> {
  const stream = !!onToken;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...body, stream }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  if (!stream) {
    const data = await response.json();
    return data.message?.content || "";
  }

  let full = "";
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error("No response stream");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n").filter(Boolean)) {
      try {
        const json = JSON.parse(line);
        const token = json.message?.content || "";
        if (token) {
          full += token;
          onToken(token);
        }
      } catch {}
    }
  }
  return full;
}

async function chatOllama(req: ChatRequest): Promise<string> {
  const url = `${req.ollamaUrl || "http://localhost:11434"}/api/chat`;
  return streamOllama(
    url,
    { model: resolveModel(req), messages: buildOllamaMessages(req.messages) },
    req.onToken
  );
}

async function chatOllamaCloud(req: ChatRequest): Promise<string> {
  const settings: OllamaCloudSettings = {
    ollamaProxyUrl: req.ollamaProxyUrl || "",
    ollamaCloudApiKey: req.ollamaCloudApiKey || req.apiKey || "",
    ollamaCloudUrl: req.ollamaCloudUrl,
  };

  if (!hasOllamaCloud(settings)) {
    throw new Error("Ollama Cloud is not configured — add a proxy URL or API key in Settings");
  }

  const base = ollamaCloudApiBase(settings);
  const url = `${base}/chat`;
  return streamOllama(
    url,
    { model: resolveModel(req), messages: buildOllamaMessages(req.messages) },
    req.onToken,
    ollamaCloudHeaders(settings)
  );
}

export async function testOllamaConnection(
  settings: OllamaCloudSettings & { ollamaUrl?: string },
  host: "cloud" | "local"
): Promise<{ ok: boolean; message: string }> {
  if (host === "cloud" && isHostedApp() && !effectiveProxyUrl(settings)) {
    return {
      ok: false,
      message:
        "Ollama Cloud is blocked by browser security on GitHub Pages. Add a proxy URL below.",
    };
  }

  const base =
    host === "cloud"
      ? ollamaCloudApiBase(settings).replace(/\/api$/, "")
      : (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
  const url = `${base}/api/tags`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (host === "cloud") {
    Object.assign(headers, ollamaCloudHeaders(settings));
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (host === "local") {
        return {
          ok: false,
          message: "Ollama not running. Install from ollama.com and run `ollama serve`.",
        };
      }
      return { ok: false, message: `HTTP ${res.status} — check your API key or proxy URL.` };
    }
    const data = await res.json();
    const count = data?.models?.length ?? 0;
    return {
      ok: true,
      message:
        host === "cloud"
          ? `Ollama Cloud connected${effectiveProxyUrl(settings) ? " via proxy" : ""}`
          : `${count} local model(s) found`,
    };
  } catch {
    return host === "local"
      ? { ok: false, message: "Cannot reach localhost:11434 — is Ollama running on this device?" }
      : { ok: false, message: "Cannot reach Ollama — check proxy URL and API key." };
  }
}

async function chatOpenAI(req: ChatRequest): Promise<string> {
  if (!req.apiKey) throw new Error("OpenAI API key is required");

  const messages = req.messages.map((m) => {
    if (m.image && m.role === "user") {
      return {
        role: m.role,
        content: [
          { type: "text" as const, text: m.content },
          { type: "image_url" as const, image_url: { url: m.image } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const stream = !!req.onToken;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
      stream,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${text}`);
  }

  if (!stream) {
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  let full = "";
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error("No response stream");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      const trimmed = line.replace(/^data: /, "").trim();
      if (!trimmed || trimmed === "[DONE]") continue;
      try {
        const json = JSON.parse(trimmed);
        const token = json.choices?.[0]?.delta?.content || "";
        if (token) {
          full += token;
          req.onToken!(token);
        }
      } catch {}
    }
  }
  return full;
}

async function chatAnthropic(req: ChatRequest): Promise<string> {
  if (!req.apiKey) throw new Error("Anthropic API key is required");

  const systemMsg = req.messages.find((m) => m.role === "system");
  const conversationMsgs = req.messages.filter((m) => m.role !== "system");

  const messages = conversationMsgs.map((m) => {
    const role = m.role === "user" ? "user" : "assistant";
    if (m.image && m.role === "user") {
      const base64 = m.image.replace(/^data:image\/\w+;base64,/, "");
      const mediaMatch = m.image.match(/^data:(image\/\w+);base64,/);
      const mediaType = mediaMatch ? mediaMatch[1] : "image/png";
      return {
        role,
        content: [
          {
            type: "image" as const,
            source: { type: "base64" as const, media_type: mediaType, data: base64 },
          },
          { type: "text" as const, text: m.content },
        ],
      };
    }
    return { role, content: m.content };
  });

  const stream = !!req.onToken;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 2048,
      system: systemMsg?.content || "",
      messages,
      stream,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic error (${response.status}): ${text}`);
  }

  if (!stream) {
    const data = await response.json();
    return data.content?.[0]?.text || "";
  }

  let full = "";
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error("No response stream");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      const trimmed = line.replace(/^data: /, "").trim();
      if (!trimmed || trimmed.startsWith("event:")) continue;
      try {
        const json = JSON.parse(trimmed);
        if (json.type === "content_block_delta") {
          const token = json.delta?.text || "";
          if (token) {
            full += token;
            req.onToken!(token);
          }
        }
      } catch {}
    }
  }
  return full;
}
