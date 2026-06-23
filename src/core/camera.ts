/** Camera capture — live preview frames for vision models. */

export async function openCameraStream(
  facing: "environment" | "user" = "environment"
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

export function stopCameraStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Grab a JPEG data URL from a live video element, scaled for API limits. */
export function captureVideoFrame(video: HTMLVideoElement, maxWidth = 1024): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream): void {
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  void video.play().catch(() => {});
}

export function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}
