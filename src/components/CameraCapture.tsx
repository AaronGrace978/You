import { useEffect, useRef, useState, useCallback } from "react";
import {
  openCameraStream,
  stopCameraStream,
  captureVideoFrame,
  attachStreamToVideo,
  isCameraSupported,
} from "../core/camera";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const startCamera = useCallback(async (face: "environment" | "user") => {
    setError("");
    setReady(false);
    stopCameraStream(streamRef.current);
    streamRef.current = null;

    try {
      const stream = await openCameraStream(face);
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        attachStreamToVideo(video, stream);
        video.onloadeddata = () => setReady(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open camera");
    }
  }, []);

  useEffect(() => {
    if (!isCameraSupported()) {
      setError("Camera not available — try your phone browser.");
      return;
    }
    void startCamera(facing);
    return () => stopCameraStream(streamRef.current);
  }, [facing, startCamera]);

  const handleShutter = () => {
    const video = videoRef.current;
    if (!video) return;
    const frame = captureVideoFrame(video);
    if (frame) {
      stopCameraStream(streamRef.current);
      onCapture(frame);
    }
  };

  const flip = () => setFacing((f) => (f === "environment" ? "user" : "environment"));

  return (
    <div className="camera-overlay" role="dialog" aria-label="Camera">
      <div className="camera-panel">
        <header className="camera-header">
          <button type="button" onClick={onClose} className="camera-header-btn" aria-label="Close">
            ✕
          </button>
          <span className="font-body text-sm tracking-wide" style={{ color: "rgb(var(--c-text))" }}>
            See
          </span>
          <button type="button" onClick={flip} className="camera-header-btn" aria-label="Flip camera">
            ⟳
          </button>
        </header>

        <div className="camera-preview-wrap">
          {error ? (
            <p className="font-body text-sm text-center px-6" style={{ color: "rgb(var(--c-muted))" }}>
              {error}
            </p>
          ) : (
            <>
              <video ref={videoRef} className="camera-preview" />
              {!ready && (
                <div className="camera-loading font-body text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                  Opening camera…
                </div>
              )}
            </>
          )}
        </div>

        <p className="font-body text-[11px] text-center px-4" style={{ color: "rgb(var(--c-muted))" }}>
          Point at what you want to share. Stays on your device until you send.
        </p>

        <button
          type="button"
          onClick={handleShutter}
          disabled={!ready || !!error}
          className="camera-shutter"
          aria-label="Capture"
        />
      </div>
    </div>
  );
}
