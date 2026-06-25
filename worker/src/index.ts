const ALLOWED_ORIGINS = [
  "https://aarongrace978.github.io",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const CORS_HEADERS = (origin: string | null) => ({
  "Access-Control-Allow-Origin":
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
      ? origin
      : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, xi-api-key",
});

function stripSecretPathPrefix(path: string): string {
  return path.replace(/^s_[^/]+\/?/, "");
}

export default {
  async fetch(request: Request, env: { OLLAMA_API_KEY?: string }): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = CORS_HEADERS(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (origin && !ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    const url = new URL(request.url);
    const path = stripSecretPathPrefix(url.pathname.replace(/^\/+/, ""));

    // ElevenLabs TTS proxy — user's xi-api-key is forwarded from the browser (CORS bypass).
    if (path.startsWith("elevenlabs/")) {
      const apiKey = request.headers.get("xi-api-key");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "xi-api-key header required" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const targetPath = path.replace(/^elevenlabs\//, "");
      const target = `https://api.elevenlabs.io/${targetPath}${url.search}`;

      const headers = new Headers();
      headers.set("xi-api-key", apiKey);
      const contentType = request.headers.get("Content-Type");
      if (contentType) headers.set("Content-Type", contentType);
      const accept = request.headers.get("Accept");
      if (accept) headers.set("Accept", accept);

      const res = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" ? undefined : request.body,
      });

      const out = new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: cors,
      });
      const resType = res.headers.get("Content-Type");
      if (resType) out.headers.set("Content-Type", resType);
      return out;
    }

    const userAuth = request.headers.get("Authorization")?.trim();
    const fallbackKey = env.OLLAMA_API_KEY?.trim();
    const authorization =
      userAuth ||
      (fallbackKey ? `Bearer ${fallbackKey}` : "");

    if (!authorization) {
      return new Response(
        JSON.stringify({
          error:
            "Ollama API key required — add your key in You Settings, or configure OLLAMA_API_KEY on the worker.",
        }),
        {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    const targetPath = path.startsWith("api/") ? path : `api/${path || "tags"}`;
    const target = `https://ollama.com/${targetPath}${url.search}`;

    const headers = new Headers();
    headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
    headers.set("Authorization", authorization.startsWith("Bearer ") ? authorization : `Bearer ${authorization}`);

    const res = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : request.body,
    });

    const out = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: cors,
    });
    out.headers.set("Content-Type", res.headers.get("Content-Type") || "application/json");
    return out;
  },
};
