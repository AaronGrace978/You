import { useState } from "react";
import { useStore, type Provider } from "../store";
import { getMemoryStats } from "../core/memory";
import { testOllamaConnection, effectiveProxyUrl } from "../core/providers";
import {
  isHostedApp,
  OLLAMA_PROXY_URL,
  OLLAMA_CLOUD_TEXT_MODELS,
  OLLAMA_CLOUD_VISION_MODELS,
  OLLAMA_LOCAL_MODELS,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  VOICE_PRESETS,
} from "../core/ai-config";

export default function Settings() {
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const provider = useStore((s) => s.provider);
  const model = useStore((s) => s.model);
  const apiKey = useStore((s) => s.apiKey);
  const ollamaUrl = useStore((s) => s.ollamaUrl);
  const ollamaProxyUrl = useStore((s) => s.ollamaProxyUrl);
  const ollamaCloudApiKey = useStore((s) => s.ollamaCloudApiKey);
  const ollamaVisionModel = useStore((s) => s.ollamaVisionModel);
  const userName = useStore((s) => s.userName);
  const elevenlabsApiKey = useStore((s) => s.elevenlabsApiKey);
  const elevenlabsVoiceId = useStore((s) => s.elevenlabsVoiceId);
  const setProvider = useStore((s) => s.setProvider);
  const setModel = useStore((s) => s.setModel);
  const setApiKey = useStore((s) => s.setApiKey);
  const setOllamaUrl = useStore((s) => s.setOllamaUrl);
  const setOllamaProxyUrl = useStore((s) => s.setOllamaProxyUrl);
  const setOllamaCloudApiKey = useStore((s) => s.setOllamaCloudApiKey);
  const setOllamaVisionModel = useStore((s) => s.setOllamaVisionModel);
  const setUserName = useStore((s) => s.setUserName);
  const setElevenlabsApiKey = useStore((s) => s.setElevenlabsApiKey);
  const setElevenlabsVoiceId = useStore((s) => s.setElevenlabsVoiceId);

  const [testingOllama, setTestingOllama] = useState<"cloud" | "local" | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);

  const providers: { id: Provider; label: string; sub: string }[] = [
    { id: "ollama", label: "Ollama", sub: "Local" },
    { id: "ollama-cloud", label: "Ollama", sub: "Cloud" },
    { id: "openai", label: "OpenAI", sub: "API" },
    { id: "anthropic", label: "Anthropic", sub: "API" },
  ];

  const cloudSettings = {
    ollamaProxyUrl,
    ollamaCloudApiKey,
  };

  const showStatus = (ok: boolean, message: string) => {
    setStatusOk(ok);
    setStatusMsg(message);
  };

  const testOllama = async (host: "cloud" | "local") => {
    setTestingOllama(host);
    setStatusMsg(null);
    const r = await testOllamaConnection(
      host === "cloud" ? cloudSettings : { ...cloudSettings, ollamaUrl },
      host
    );
    showStatus(r.ok, r.message);
    setTestingOllama(null);
  };

  const currentTextModel =
    model ||
    (provider === "ollama-cloud"
      ? OLLAMA_CLOUD_TEXT_MODELS[1].id
      : provider === "ollama"
        ? OLLAMA_LOCAL_MODELS[0].id
        : provider === "openai"
          ? OPENAI_MODELS[0].id
          : ANTHROPIC_MODELS[0].id);

  const proxyActive = effectiveProxyUrl(cloudSettings).length > 0;

  return (
    <div className="h-full w-full flex flex-col animate-fade-in">
      <header className="flex items-center justify-between px-6 py-4 themed-border" style={{ borderBottomWidth: 1, borderBottomStyle: "solid" }}>
        <button
          onClick={() => setView("sanctuary")}
          className="flex items-center gap-2 font-body text-xs tracking-[0.15em] uppercase transition-colors cursor-pointer"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className="font-display text-lg tracking-wide" style={{ color: "rgb(var(--c-text) / 0.8)" }}>
          Settings
        </h2>
        <div className="w-14" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-8 space-y-8">

          <Section title="Profile" icon={<UserIcon />}>
            <div className="settings-card space-y-4">
              <Field label="Your Name">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="What should I call you?"
                  className="input-field"
                />
              </Field>
            </div>
          </Section>

          <Section title="AI Provider" icon={<CpuIcon />}>
            <div className="settings-card space-y-5">
              {isHostedApp() && (
                <div
                  className="rounded-xl px-4 py-3 font-body text-xs leading-relaxed"
                  style={{
                    background: "rgb(var(--c-accent) / 0.08)",
                    border: "1px solid rgb(var(--c-accent) / 0.2)",
                    color: "rgb(var(--c-muted))",
                  }}
                >
                  <span style={{ color: "rgb(var(--c-accent))" }}>GitHub Pages — </span>
                  Ollama Cloud uses the Cloudflare proxy automatically. Paste your OpenAI or Anthropic key below for those providers.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className="flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl font-body text-xs tracking-wide transition-all cursor-pointer"
                    style={{
                      background: provider === p.id
                        ? "rgb(var(--c-accent) / 0.15)"
                        : "rgb(var(--c-elevated) / 0.5)",
                      color: provider === p.id
                        ? "rgb(var(--c-accent))"
                        : "rgb(var(--c-muted))",
                      border: provider === p.id
                        ? "1px solid rgb(var(--c-accent) / 0.3)"
                        : "1px solid rgb(var(--c-accent) / 0.05)",
                    }}
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="text-[10px] opacity-60">{p.sub}</span>
                  </button>
                ))}
              </div>

              {provider === "ollama" && (
                <>
                  <p className="font-body text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>
                    Runs on your PC at localhost:11434 — private, no API key needed.
                  </p>
                  <Field label="Ollama URL">
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="input-field"
                    />
                  </Field>
                  <ModelSelect
                    label="Model"
                    value={currentTextModel}
                    onChange={setModel}
                    options={OLLAMA_LOCAL_MODELS}
                  />
                  <div className="flex gap-3">
                    <a
                      href="https://ollama.com/download"
                      target="_blank"
                      rel="noreferrer"
                      className="font-body text-xs underline"
                      style={{ color: "rgb(var(--c-muted) / 0.6)" }}
                    >
                      Download Ollama ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => testOllama("local")}
                      disabled={testingOllama === "local"}
                      className="font-body text-xs cursor-pointer disabled:opacity-50"
                      style={{ color: "rgb(var(--c-muted) / 0.6)" }}
                    >
                      {testingOllama === "local" ? "Testing…" : "Test local connection"}
                    </button>
                  </div>
                </>
              )}

              {provider === "ollama-cloud" && (
                <>
                  <p className="font-body text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>
                    GLM 5.2, MiniMax M3, DeepSeek V4, Kimi K2.7 — frontier models via{" "}
                    <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">
                      ollama.com
                    </a>
                    . On the web, a Cloudflare proxy is required (CORS).
                  </p>

                  <Field label="Ollama API Key">
                    <input
                      type="password"
                      value={ollamaCloudApiKey}
                      onChange={(e) => setOllamaCloudApiKey(e.target.value)}
                      placeholder="Optional if proxy has key baked in"
                      className="input-field"
                      autoComplete="off"
                    />
                  </Field>

                  <Field label="Cloudflare Proxy URL">
                    <input
                      type="text"
                      value={ollamaProxyUrl}
                      onChange={(e) => setOllamaProxyUrl(e.target.value)}
                      placeholder={OLLAMA_PROXY_URL}
                      className="input-field"
                    />
                    <p className="font-body text-[10px] mt-1" style={{ color: "rgb(var(--c-muted) / 0.4)" }}>
                      {proxyActive
                        ? `Active: ${effectiveProxyUrl(cloudSettings)}`
                        : "Leave blank on GitHub Pages to use the built-in proxy."}
                    </p>
                  </Field>

                  <ModelSelect
                    label="Text Model"
                    value={currentTextModel}
                    onChange={setModel}
                    options={OLLAMA_CLOUD_TEXT_MODELS}
                  />
                  <ModelSelect
                    label="Vision Model"
                    value={ollamaVisionModel}
                    onChange={setOllamaVisionModel}
                    options={OLLAMA_CLOUD_VISION_MODELS}
                  />

                  <div className="flex flex-wrap gap-3">
                    <a
                      href="https://ollama.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="font-body text-xs underline"
                      style={{ color: "rgb(var(--c-muted) / 0.6)" }}
                    >
                      Get Ollama key ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => testOllama("cloud")}
                      disabled={testingOllama === "cloud"}
                      className="font-body text-xs cursor-pointer disabled:opacity-50"
                      style={{ color: "rgb(var(--c-muted) / 0.6)" }}
                    >
                      {testingOllama === "cloud" ? "Testing…" : "Test connection"}
                    </button>
                  </div>
                </>
              )}

              {provider === "openai" && (
                <>
                  <Field label="API Key">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="input-field"
                      autoComplete="off"
                    />
                  </Field>
                  <ModelSelect
                    label="Model"
                    value={currentTextModel}
                    onChange={setModel}
                    options={OPENAI_MODELS}
                  />
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="font-body text-xs underline"
                    style={{ color: "rgb(var(--c-muted) / 0.6)" }}
                  >
                    Get OpenAI key ↗
                  </a>
                </>
              )}

              {provider === "anthropic" && (
                <>
                  <Field label="API Key">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="input-field"
                      autoComplete="off"
                    />
                  </Field>
                  <ModelSelect
                    label="Model"
                    value={currentTextModel}
                    onChange={setModel}
                    options={ANTHROPIC_MODELS}
                  />
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="font-body text-xs underline"
                    style={{ color: "rgb(var(--c-muted) / 0.6)" }}
                  >
                    Get Anthropic key ↗
                  </a>
                </>
              )}

              {statusMsg && (
                <p
                  className="font-body text-xs leading-relaxed rounded-xl px-3 py-2"
                  style={{
                    color: statusOk ? "rgb(120 180 120)" : "rgb(200 100 100)",
                    background: statusOk ? "rgb(120 180 120 / 0.1)" : "rgb(200 100 100 / 0.1)",
                  }}
                >
                  {statusMsg}
                </p>
              )}
            </div>
          </Section>

          <Section title="Voice" icon={<MicIcon />}>
            <div className="settings-card space-y-4">
              <Field label="ElevenLabs API Key">
                <input
                  type="password"
                  value={elevenlabsApiKey}
                  onChange={(e) => setElevenlabsApiKey(e.target.value.replace(/\s+/g, ""))}
                  placeholder="xi-..."
                  className="input-field"
                  autoComplete="off"
                />
              </Field>
              <Field label="Voice">
                <select
                  value={elevenlabsVoiceId}
                  onChange={(e) => setElevenlabsVoiceId(e.target.value)}
                  className="input-field"
                >
                  {VOICE_PRESETS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.vibe}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="font-body text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>
                Voice mode uses ElevenLabs for natural speech.{" "}
                <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="underline">
                  Get key ↗
                </a>
              </p>
            </div>
          </Section>

          <Section title="Appearance" icon={<PaletteIcon />}>
            <div className="settings-card">
              <Field label="Theme">
                <div className="flex gap-2">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { if (theme !== t) toggleTheme(); }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-xs tracking-wide transition-all cursor-pointer"
                      style={{
                        background: theme === t
                          ? "rgb(var(--c-accent) / 0.15)"
                          : "rgb(var(--c-elevated) / 0.5)",
                        color: theme === t
                          ? "rgb(var(--c-accent))"
                          : "rgb(var(--c-muted))",
                        border: theme === t
                          ? "1px solid rgb(var(--c-accent) / 0.3)"
                          : "1px solid rgb(var(--c-accent) / 0.05)",
                      }}
                    >
                      <span className="text-sm">{t === "dark" ? "◑" : "○"}</span>
                      {t === "dark" ? "Dark" : "Light"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          <SupportSection />

          <MemorySection />

          <div className="safe-bottom" />
        </div>
      </div>
    </div>
  );
}

function ModelSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { id: string; name: string; tag: string }[];
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} — {m.tag}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <span style={{ color: "rgb(var(--c-accent) / 0.6)" }}>{icon}</span>
        <h3 className="font-body text-xs tracking-[0.2em] uppercase font-medium" style={{ color: "rgb(var(--c-muted) / 0.7)" }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="font-body text-xs tracking-wide" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.15" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function LifelineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function SupportSection() {
  return (
    <Section title="In Crisis" icon={<LifelineIcon />}>
      <div className="settings-card space-y-3">
        <p className="font-body text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted) / 0.7)" }}>
          You are this space, and it will always be here. But if the weight ever becomes too
          much to carry alone, please reach out to a real person who can hold it with you.
          You deserve that.
        </p>
        <div className="grid gap-2">
          <a
            href="tel:988"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all cursor-pointer"
            style={{ background: "rgb(var(--c-elevated) / 0.5)", border: "1px solid rgb(var(--c-accent) / 0.08)" }}
          >
            <span className="font-body text-xs" style={{ color: "rgb(var(--c-text) / 0.8)" }}>
              988 — Suicide &amp; Crisis Lifeline
            </span>
            <span className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-accent) / 0.8)" }}>
              Call / Text
            </span>
          </a>
          <a
            href="sms:741741?&body=HOME"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all cursor-pointer"
            style={{ background: "rgb(var(--c-elevated) / 0.5)", border: "1px solid rgb(var(--c-accent) / 0.08)" }}
          >
            <span className="font-body text-xs" style={{ color: "rgb(var(--c-text) / 0.8)" }}>
              Crisis Text Line — text HOME
            </span>
            <span className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-accent) / 0.8)" }}>
              741741
            </span>
          </a>
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all cursor-pointer"
            style={{ background: "rgb(var(--c-elevated) / 0.5)", border: "1px solid rgb(var(--c-accent) / 0.08)" }}
          >
            <span className="font-body text-xs" style={{ color: "rgb(var(--c-text) / 0.8)" }}>
              Find a helpline — worldwide
            </span>
            <span className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-accent) / 0.8)" }}>
              ↗
            </span>
          </a>
        </div>
      </div>
    </Section>
  );
}

function MemorySection() {
  const clearConversation = useStore((s) => s.clearConversation);
  const messages = useStore((s) => s.messages);
  const [confirming, setConfirming] = useState(false);

  const stats = getMemoryStats();

  const handleClearAll = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    localStorage.removeItem("you-relational-memory");
    clearConversation();
    setConfirming(false);
    window.location.reload();
  };

  return (
    <Section title="Memory & Data" icon={<HeartIcon />}>
      <div className="settings-card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgb(var(--c-elevated) / 0.5)" }}>
            <p className="font-display text-lg" style={{ color: "rgb(var(--c-text) / 0.8)" }}>{stats.interactions}</p>
            <p className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>exchanges</p>
          </div>
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgb(var(--c-elevated) / 0.5)" }}>
            <p className="font-display text-lg" style={{ color: "rgb(var(--c-text) / 0.8)" }}>{stats.daysTogether || "< 1"}</p>
            <p className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>days together</p>
          </div>
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgb(var(--c-elevated) / 0.5)" }}>
            <p className="font-display text-lg" style={{ color: "rgb(var(--c-text) / 0.8)" }}>{stats.themes}</p>
            <p className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>themes</p>
          </div>
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgb(var(--c-elevated) / 0.5)" }}>
            <p className="font-display text-lg" style={{ color: "rgb(var(--c-text) / 0.8)" }}>{messages.length}</p>
            <p className="font-body text-[10px] tracking-wider uppercase" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>messages</p>
          </div>
        </div>

        <p className="font-body text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>
          Your conversations and relational memory are stored locally on your device. API keys stay in your browser only.
        </p>

        <button
          onClick={handleClearAll}
          className="w-full px-4 py-2.5 rounded-xl font-body text-xs tracking-wide transition-all cursor-pointer"
          style={{
            background: confirming ? "rgb(180 60 60 / 0.2)" : "rgb(var(--c-elevated) / 0.5)",
            color: confirming ? "rgb(200 80 80)" : "rgb(var(--c-muted))",
            border: confirming ? "1px solid rgb(180 60 60 / 0.3)" : "1px solid rgb(var(--c-accent) / 0.05)",
          }}
        >
          {confirming ? "Click again to confirm — this cannot be undone" : "Clear all data"}
        </button>
      </div>
    </Section>
  );
}
