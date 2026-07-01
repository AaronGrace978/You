import { useEffect } from "react";
import { useStore } from "../store";
import {
  isGamepadSupported,
  pushGamepadBindings,
  setGamepadEnabled,
  setGamepadNavHandlers,
  type GamepadBindings,
} from "../core/gamepad";
import { unlockAudioForPlayback } from "../core/voice";
import { enterAndroidImmersive } from "../core/immersive";

/** Global Steam Deck / gamepad navigation — back + voice mode toggle. */
export function useGamepadNavigation(): void {
  const gamepadEnabled = useStore((s) => s.gamepadEnabled);

  useEffect(() => {
    setGamepadEnabled(gamepadEnabled);
  }, [gamepadEnabled]);

  useEffect(() => {
    if (!gamepadEnabled || !isGamepadSupported()) return;

    return setGamepadNavHandlers({
      onBack: () => {
        const { view, voiceMode, setView, setVoiceMode } = useStore.getState();
        if (voiceMode) {
          setVoiceMode(false);
          return;
        }
        if (view === "settings" || view === "guide") setView("sanctuary");
        else if (view === "gateway") setView("landing");
      },
      onVoiceMode: () => {
        const { view, voiceMode, setVoiceMode } = useStore.getState();
        if (view !== "sanctuary" && !voiceMode) return;
        if (voiceMode) {
          setVoiceMode(false);
        } else {
          void unlockAudioForPlayback();
          void enterAndroidImmersive();
          setVoiceMode(true);
        }
      },
    });
  }, [gamepadEnabled]);
}

/** Per-view hold-to-talk bindings — Sanctuary chat dock or Voice Mode overlay. */
export function useGamepadPtt(bindings: GamepadBindings): void {
  const gamepadEnabled = useStore((s) => s.gamepadEnabled);

  useEffect(() => {
    if (!gamepadEnabled || !isGamepadSupported()) return;
    if (!bindings.onPttDown && !bindings.onPttUp) return;
    return pushGamepadBindings(bindings);
  }, [gamepadEnabled, bindings.onPttDown, bindings.onPttUp]);
}
