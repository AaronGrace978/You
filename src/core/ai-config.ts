/** Pre-deployed Cloudflare proxy — Ollama key lives on the worker, not in the browser. */
export const OLLAMA_PROXY_URL =
  "https://offlinequest-ollama-proxy.aromatic-game.workers.dev";

export const OLLAMA_CLOUD_API = "https://ollama.com/api";

/**
 * Curated model lists — see https://ollama.com/search?c=cloud
 *
 * Cloud models are addressed by their bare catalog name because the app talks
 * to ollama.com's API directly (via the Cloudflare proxy). The ":cloud" /
 * "-cloud" suffixes are only used when proxying through a *local* Ollama host.
 * Kept current as of June 2026; Ollama retires older cloud models over time.
 */
export const OLLAMA_CLOUD_TEXT_MODELS = [
  { id: "glm-5.2", name: "GLM 5.2", tag: "Flagship · long-horizon" },
  { id: "minimax-m3", name: "MiniMax M3", tag: "1M context · multimodal" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", tag: "Fast · 1M context" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", tag: "Frontier reasoning" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7", tag: "Agentic · multimodal" },
  { id: "qwen3.5", name: "Qwen 3.5", tag: "Multimodal · versatile" },
  { id: "nemotron-3-ultra", name: "Nemotron 3 Ultra", tag: "Long-running agents" },
  { id: "gpt-oss:120b", name: "GPT-OSS 120B", tag: "OpenAI open-weight" },
  { id: "glm-5.1", name: "GLM 5.1", tag: "Agentic engineering" },
] as const;

export const OLLAMA_CLOUD_VISION_MODELS = [
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", tag: "Fast · clean · recommended" },
  { id: "minimax-m3", name: "MiniMax M3", tag: "1M context · multimodal" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7", tag: "Agentic multimodal" },
  { id: "gemma4:31b", name: "Gemma 4 31B", tag: "Strong all-round vision" },
  { id: "kimi-k2.6", name: "Kimi K2.6", tag: "Native multimodal" },
  { id: "qwen3.5", name: "Qwen 3.5", tag: "Vision + text" },
] as const;

export const OLLAMA_LOCAL_MODELS = [
  { id: "qwen3.5", name: "Qwen 3.5", tag: "Great default" },
  { id: "gemma4:12b", name: "Gemma 4 12B", tag: "Balanced · vision" },
  { id: "llama3.3", name: "Llama 3.3", tag: "Strong general" },
  { id: "deepseek-r1", name: "DeepSeek R1", tag: "Reasoning" },
  { id: "glm-4.7-flash", name: "GLM 4.7 Flash", tag: "Fast · lightweight" },
  { id: "gpt-oss:20b", name: "GPT-OSS 20B", tag: "Efficient reasoning" },
  { id: "qwen3-vl", name: "Qwen 3 VL", tag: "Vision" },
  { id: "llava", name: "LLaVA", tag: "Classic vision" },
] as const;

export const OPENAI_MODELS = [
  { id: "gpt-5.4", name: "GPT-5.4", tag: "Latest flagship" },
  { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", tag: "Highest quality" },
  { id: "gpt-4o", name: "GPT-4o", tag: "Multimodal" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", tag: "Fast · efficient" },
  { id: "o4-mini", name: "o4 Mini", tag: "Reasoning" },
] as const;

export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", tag: "Balanced" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", tag: "Most capable" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", tag: "Fast" },
] as const;

export const VOICE_PRESETS = [
  { id: "5cVNuMBWdU6DJjJJdH0A", name: "Aaron Grace", vibe: "Personal" },
  { id: "43h528xJq9pKxgRXoEKH", name: "ActivatePrime", vibe: "Prime" },
  { id: "FOfJ2PMgU6HOGbNYnzto", name: "Amira", vibe: "Custom" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", vibe: "Soft & clear" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", vibe: "Warm & calm" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", vibe: "Deep & grounding" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", vibe: "Gentle & steady" },
] as const;

export function isHostedApp(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("github.io") || h.includes("pages.dev");
}

/** True when opened from home screen / installed PWA (no browser chrome). */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}
