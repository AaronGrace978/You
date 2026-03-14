interface ChatRequest {
  provider: "ollama" | "ollama-cloud" | "openai" | "anthropic";
  model: string;
  messages: { role: string; content: string; image?: string }[];
  apiKey?: string;
  ollamaUrl?: string;
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
    const msg: Record<string, unknown> = {
      role: m.role,
      content: m.content,
    };
    if (m.image) {
      msg.images = [m.image.replace(/^data:image\/\w+;base64,/, "")];
    }
    return msg;
  });
}

async function chatOllama(req: ChatRequest): Promise<string> {
  const url = `${req.ollamaUrl || "http://localhost:11434"}/api/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: req.model,
      messages: buildOllamaMessages(req.messages),
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.message?.content || "";
}

async function chatOllamaCloud(req: ChatRequest): Promise<string> {
  if (!req.ollamaUrl) throw new Error("Ollama Cloud URL is required");
  const url = `${req.ollamaUrl}/api/chat`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (req.apiKey) {
    headers["Authorization"] = `Bearer ${req.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: req.model,
      messages: buildOllamaMessages(req.messages),
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama Cloud error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.message?.content || "";
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
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
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
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}
