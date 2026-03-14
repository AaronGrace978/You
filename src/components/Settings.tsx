import { useStore, type Provider } from "../store";

const MODEL_OPTIONS: Record<Provider, { value: string; label: string }[]> = {
  ollama: [
    { value: "qwen3.5", label: "Qwen 3.5" },
    { value: "qwen3", label: "Qwen 3" },
    { value: "qwen3-coder", label: "Qwen 3 Coder" },
    { value: "deepseek-r1", label: "DeepSeek R1" },
    { value: "llama3.3", label: "Llama 3.3" },
    { value: "glm-4.7-flash", label: "GLM 4.7 Flash" },
    { value: "gemma2", label: "Gemma 2" },
    { value: "mistral", label: "Mistral" },
    { value: "qwen3-vl", label: "Qwen 3 VL (Vision)" },
    { value: "llava", label: "LLaVA (Vision)" },
  ],
  "ollama-cloud": [
    { value: "qwen3.5", label: "Qwen 3.5" },
    { value: "qwen3-vl", label: "Qwen 3 VL (Vision)" },
    { value: "qwen3-coder-next", label: "Qwen 3 Coder Next" },
    { value: "qwen3-next", label: "Qwen 3 Next" },
    { value: "deepseek-v3.2", label: "DeepSeek V3.2" },
    { value: "kimi-k2.5", label: "Kimi K2.5" },
    { value: "glm-5", label: "GLM 5" },
    { value: "nemotron-3-super", label: "Nemotron 3 Super 120B" },
    { value: "nemotron-3-nano", label: "Nemotron 3 Nano" },
    { value: "devstral-small-2", label: "Devstral Small 2" },
    { value: "devstral-2", label: "Devstral 2 123B" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { value: "minimax-m2.5", label: "MiniMax M2.5" },
    { value: "cogito-2.1", label: "Cogito 2.1" },
    { value: "ministral-3", label: "Ministral 3" },
  ],
  openai: [
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
    { value: "o3", label: "o3" },
    { value: "o3-pro", label: "o3 Pro" },
    { value: "o4-mini", label: "o4 Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  ],
};

export default function Settings() {
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const provider = useStore((s) => s.provider);
  const model = useStore((s) => s.model);
  const apiKey = useStore((s) => s.apiKey);
  const ollamaUrl = useStore((s) => s.ollamaUrl);
  const ollamaCloudUrl = useStore((s) => s.ollamaCloudUrl);
  const ollamaCloudApiKey = useStore((s) => s.ollamaCloudApiKey);
  const userName = useStore((s) => s.userName);
  const elevenlabsApiKey = useStore((s) => s.elevenlabsApiKey);
  const elevenlabsVoiceId = useStore((s) => s.elevenlabsVoiceId);
  const setProvider = useStore((s) => s.setProvider);
  const setModel = useStore((s) => s.setModel);
  const setApiKey = useStore((s) => s.setApiKey);
  const setOllamaUrl = useStore((s) => s.setOllamaUrl);
  const setOllamaCloudUrl = useStore((s) => s.setOllamaCloudUrl);
  const setOllamaCloudApiKey = useStore((s) => s.setOllamaCloudApiKey);
  const setUserName = useStore((s) => s.setUserName);
  const setElevenlabsApiKey = useStore((s) => s.setElevenlabsApiKey);
  const setElevenlabsVoiceId = useStore((s) => s.setElevenlabsVoiceId);

  const providers: { id: Provider; label: string; sub: string }[] = [
    { id: "ollama", label: "Ollama", sub: "Local" },
    { id: "ollama-cloud", label: "Ollama", sub: "Cloud" },
    { id: "openai", label: "OpenAI", sub: "API" },
    { id: "anthropic", label: "Anthropic", sub: "API" },
  ];

  const models = MODEL_OPTIONS[provider] || [];
  const currentModel = model || models[0]?.value || "";

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

          {/* profile */}
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

          {/* ai provider */}
          <Section title="AI Provider" icon={<CpuIcon />}>
            <div className="settings-card space-y-5">
              <div className="grid grid-cols-4 gap-2">
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

              <Field label="Model">
                <select
                  value={currentModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="input-field"
                >
                  {models.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>

              {provider === "ollama" && (
                <Field label="Ollama URL">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="input-field"
                  />
                </Field>
              )}

              {provider === "ollama-cloud" && (
                <>
                  <Field label="Cloud Endpoint">
                    <input
                      type="text"
                      value={ollamaCloudUrl}
                      onChange={(e) => setOllamaCloudUrl(e.target.value)}
                      placeholder="https://your-cloud-ollama.com"
                      className="input-field"
                    />
                  </Field>
                  <Field label="API Key">
                    <input
                      type="password"
                      value={ollamaCloudApiKey}
                      onChange={(e) => setOllamaCloudApiKey(e.target.value)}
                      placeholder="Optional"
                      className="input-field"
                    />
                  </Field>
                </>
              )}

              {(provider === "openai" || provider === "anthropic") && (
                <Field label="API Key">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="input-field"
                  />
                </Field>
              )}
            </div>
          </Section>

          {/* voice */}
          <Section title="Voice" icon={<MicIcon />}>
            <div className="settings-card space-y-4">
              <Field label="ElevenLabs API Key">
                <input
                  type="password"
                  value={elevenlabsApiKey}
                  onChange={(e) => setElevenlabsApiKey(e.target.value)}
                  placeholder="xi-..."
                  className="input-field"
                />
              </Field>
              <Field label="Voice ID">
                <input
                  type="text"
                  value={elevenlabsVoiceId}
                  onChange={(e) => setElevenlabsVoiceId(e.target.value)}
                  placeholder="21m00Tcm4TlvDq8ikWAM"
                  className="input-field"
                />
              </Field>
              <p className="font-body text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted) / 0.5)" }}>
                Voice mode uses ElevenLabs for natural speech. Get your API key at elevenlabs.io.
              </p>
            </div>
          </Section>

          {/* appearance */}
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

          <div className="pb-8" />
        </div>
      </div>
    </div>
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
