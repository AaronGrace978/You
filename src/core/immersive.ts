/** Best-effort hide of on-screen system navigation via the Fullscreen API (mainly Android). */

import { isAndroid } from "./ai-config";

export function isInstalledPwa(): boolean {
  return window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
}

export async function enterAndroidImmersive(): Promise<boolean> {
  if (!isAndroid()) return false;
  const el = document.documentElement;
  try {
    if (document.fullscreenElement) return true;
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
  } catch {
    // Blocked without a user gesture, or unsupported.
  }
  return false;
}

export async function exitAndroidImmersive(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // ignore
  }
}
