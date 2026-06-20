import { useState } from "react";
import { isHostedApp, isMobileDevice, isStandaloneApp } from "../core/ai-config";

const DISMISS_KEY = "you-install-hint-dismissed";

export default function InstallHint() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1"
  );

  if (!isHostedApp() || !isMobileDevice() || isStandaloneApp() || dismissed) {
    return null;
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className="absolute left-0 right-0 z-50 px-4"
      style={{ top: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
    >
      <div
        className="mx-auto max-w-md rounded-2xl px-4 py-3 flex items-start gap-3 shadow-lg"
        style={{
          background: "rgb(var(--c-surface) / 0.95)",
          border: "1px solid rgb(var(--c-accent) / 0.2)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-body text-xs font-medium text-warm-50">Fullscreen on your phone</p>
          <p className="font-body text-[11px] leading-relaxed text-secondary mt-1">
            Tap your browser menu → <strong className="text-warm-50">Add to Home screen</strong> or{" "}
            <strong className="text-warm-50">Install app</strong>. Opens edge-to-edge with no browser bar.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 font-body text-[10px] uppercase tracking-wider text-muted hover:text-warm-400 cursor-pointer px-1"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
