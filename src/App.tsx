import { useEffect } from "react";
import { useStore } from "./store";
import Landing from "./components/Landing";
import Gateway from "./components/Gateway";
import Sanctuary from "./components/Sanctuary";
import Settings from "./components/Settings";
import VoiceMode from "./components/VoiceMode";
import InstallHint from "./components/InstallHint";

const THEME_COLORS = { dark: "#09090f", light: "#f8f5f0" } as const;

export default function App() {
  const view = useStore((s) => s.view);
  const voiceMode = useStore((s) => s.voiceMode);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const color = THEME_COLORS[theme];

    // Keep exactly one theme-color meta with no media scoping, so the status-bar
    // tint always tracks the in-app theme (not the device's system color scheme).
    // Stray media-scoped metas would otherwise win and paint a mismatched line.
    const metas = Array.from(
      document.querySelectorAll('meta[name="theme-color"]')
    ) as HTMLMetaElement[];
    metas.slice(1).forEach((m) => m.remove());

    let meta = metas[0];
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.removeAttribute("media");
    meta.content = color;
  }, [theme]);

  return (
    <div className="app-shell themed-bg">
      <InstallHint />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="orb orb-warm animate-float"
          style={{ width: 600, height: 600, top: "-10%", right: "-10%" }}
        />
        <div
          className="orb orb-rose animate-float-delayed"
          style={{ width: 500, height: 500, bottom: "-8%", left: "-8%" }}
        />
      </div>

      <div className="relative z-10 h-full w-full overflow-hidden">
        {view === "landing" && <Landing />}
        {view === "gateway" && <Gateway />}
        {view === "sanctuary" && <Sanctuary />}
        {view === "settings" && <Settings />}
      </div>

      {voiceMode && <VoiceMode />}
    </div>
  );
}
