/** Best-effort hide of Android's bottom nav (||| □ <) via the Fullscreen API. */

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

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
