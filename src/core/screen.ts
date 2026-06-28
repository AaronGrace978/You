/** Screen capture — periodic frames of the player's screen for a vision model. */

import { captureVideoFrame, attachStreamToVideo } from "./camera";

export function isScreenShareSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

/**
 * Open a screen/window share. Must be called from a user gesture (the browser
 * shows a native picker). A low frame rate is plenty — we only sample a still
 * image every few seconds, never the full video.
 */
export async function openScreenStream(): Promise<MediaStream> {
  if (!isScreenShareSupported()) {
    throw new Error("Screen sharing isn't supported here — try Desktop Mode in a Chromium or Firefox browser.");
  }
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 8, max: 15 },
      width: { ideal: 1280 },
      height: { ideal: 800 },
    },
    audio: false,
  });
}

export function stopScreenStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export { captureVideoFrame, attachStreamToVideo };
