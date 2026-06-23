import { useStore } from "../store";

const guideSrc = `${import.meta.env.BASE_URL}guide.html?app=1`;

export default function UserGuide() {
  const setView = useStore((s) => s.setView);

  return (
    <div className="h-full w-full flex flex-col animate-fade-in">
      <header
        className="chat-header safe-top safe-x flex items-center justify-between px-6 py-3.5 themed-border shrink-0"
        style={{ borderBottomWidth: 1, borderBottomStyle: "solid" }}
      >
        <button
          onClick={() => setView("settings")}
          className="flex items-center gap-2 font-body text-xs tracking-[0.15em] uppercase transition-colors cursor-pointer"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Settings
        </button>
        <h2 className="font-display text-lg tracking-wide" style={{ color: "rgb(var(--c-text))" }}>
          User Guide
        </h2>
        <a
          href={`${import.meta.env.BASE_URL}guide.html`}
          target="_blank"
          rel="noreferrer"
          className="font-body text-[10px] tracking-wider uppercase w-14 text-right"
          style={{ color: "rgb(var(--c-muted))" }}
          title="Open guide in new tab"
        >
          Open
        </a>
      </header>

      <iframe
        src={guideSrc}
        title="You User Guide"
        className="flex-1 w-full border-0 bg-transparent"
        style={{ colorScheme: "normal" }}
      />
    </div>
  );
}
