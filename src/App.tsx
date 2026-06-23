import { useEffect } from "react";
import { useStore } from "./store";
import Landing from "./components/Landing";
import Gateway from "./components/Gateway";
import Sanctuary from "./components/Sanctuary";
import Settings from "./components/Settings";
import VoiceMode from "./components/VoiceMode";
import InstallHint from "./components/InstallHint";
import { applyThemeChrome, watchThemeChrome } from "./core/theme-chrome";
import { initMemoryStore } from "./core/memory";
import { enterAndroidImmersive, exitAndroidImmersive } from "./core/immersive";

export default function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const immersiveNav = useStore((s) => s.immersiveNav);
  const voiceMode = useStore((s) => s.voiceMode);

  useEffect(() => {
    applyThemeChrome(theme);
    return watchThemeChrome(theme);
  }, [theme]);

  useEffect(() => {
    if (!immersiveNav) {
      void exitAndroidImmersive();
      return;
    }

    const tryImmersive = () => {
      if (!useStore.getState().voiceMode) void enterAndroidImmersive();
    };

    tryImmersive();
    const onPointer = () => tryImmersive();
    document.addEventListener("pointerdown", onPointer, { once: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") tryImmersive();
    };
    window.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("visibilitychange", onVisible);
    };
  }, [immersiveNav, voiceMode]);

  useEffect(() => {
    void initMemoryStore();
  }, []);

  return (
    <div className="app-shell">
      <div className="pwa-top-bleed" aria-hidden />
      <div className="pwa-bottom-bleed" aria-hidden />
      <div className="app-bg" aria-hidden />
      <div className="app-content h-full w-full">
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
    </div>
  );
}
