import { useEffect } from "react";
import { useStore } from "./store";
import Landing from "./components/Landing";
import Gateway from "./components/Gateway";
import Sanctuary from "./components/Sanctuary";
import Settings from "./components/Settings";
import UserGuide from "./components/UserGuide";
import VoiceMode from "./components/VoiceMode";
import InstallHint from "./components/InstallHint";
import { applyThemeChrome, watchThemeChrome } from "./core/theme-chrome";
import { initMemoryStore } from "./core/memory";
import { enterAndroidImmersive, exitAndroidImmersive } from "./core/immersive";
import { applyViewportInsets, watchViewportChrome } from "./core/viewport-chrome";

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
    applyViewportInsets();
    return watchViewportChrome();
  }, []);

  useEffect(() => {
    if (!immersiveNav) {
      void exitAndroidImmersive();
      return;
    }

    // Fullscreen API only applies in the browser tab — PWA is already edge-to-edge.
    const onFirstTap = () => {
      if (!useStore.getState().voiceMode) void enterAndroidImmersive();
    };
    document.addEventListener("pointerdown", onFirstTap, { once: true });

    return () => {
      document.removeEventListener("pointerdown", onFirstTap);
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
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
        <div
          className="orb orb-warm animate-float"
          style={{ width: 480, height: 480, top: "-12%", right: "-12%" }}
        />
        <div
          className="orb orb-rose animate-float-delayed"
          style={{ width: 400, height: 400, bottom: "-10%", left: "-10%" }}
        />
      </div>

      <div className="relative z-10 h-full w-full overflow-hidden">
        {view === "landing" && <Landing />}
        {view === "gateway" && <Gateway />}
        {view === "sanctuary" && <Sanctuary />}
        {view === "settings" && <Settings />}
        {view === "guide" && <UserGuide />}
      </div>

      {voiceMode && <VoiceMode />}
      </div>
    </div>
  );
}
