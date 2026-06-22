/** Keep screen awake during voice conversations. */

let activeLock: WakeLockSentinel | null = null;
let releaseFn: (() => void) | null = null;

export async function acquireWakeLock(): Promise<() => void> {
  await releaseWakeLock();

  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return () => {};
  }

  try {
    activeLock = await navigator.wakeLock.request("screen");
    const lock = activeLock;
    releaseFn = () => {
      lock.release().catch(() => {});
      if (activeLock === lock) activeLock = null;
    };
    lock.addEventListener("release", () => {
      if (activeLock === lock) activeLock = null;
    });
    return releaseFn;
  } catch {
    return () => {};
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (releaseFn) {
    releaseFn();
    releaseFn = null;
  }
  if (activeLock) {
    try {
      await activeLock.release();
    } catch {}
    activeLock = null;
  }
}

/** Re-acquire after tab becomes visible again (browser releases lock on hide). */
export function watchWakeLockRenew(getActive: () => boolean): () => void {
  const onVis = () => {
    if (document.visibilityState === "visible" && getActive()) {
      acquireWakeLock().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}
