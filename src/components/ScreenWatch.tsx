import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store";
import {
  openScreenStream,
  stopScreenStream,
  captureVideoFrame,
  attachStreamToVideo,
  isScreenShareSupported,
} from "../core/screen";

const INTERVAL_OPTIONS = [0, 15, 30, 60];

function intervalLabel(seconds: number): string {
  return seconds === 0 ? "Manual" : `${seconds}s`;
}

interface ScreenWatchProps {
  onReact: (dataUrl: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

/**
 * A floating picture-in-picture of the shared screen. Samples a still frame
 * (manually, or on an interval) and hands it to Game Buddy to react to.
 */
export default function ScreenWatch({ onReact, onStop, isStreaming }: ScreenWatchProps) {
  const screenWatchInterval = useStore((s) => s.screenWatchInterval);
  const setScreenWatchInterval = useStore((s) => s.setScreenWatchInterval);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Read latest values inside the interval without re-arming it every render.
  const streamingRef = useRef(isStreaming);
  useEffect(() => {
    streamingRef.current = isStreaming;
  }, [isStreaming]);

  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  // Open the share once — this mounts in response to the user's dock tap.
  useEffect(() => {
    let cancelled = false;

    if (!isScreenShareSupported()) {
      setError("Screen sharing needs Desktop Mode — open in a Chromium or Firefox browser.");
      return;
    }

    (async () => {
      try {
        const stream = await openScreenStream();
        if (cancelled) {
          stopScreenStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          attachStreamToVideo(video, stream);
          video.onloadeddata = () => setReady(true);
        }
        // Closing the share from the browser's own UI ends the session.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => onStopRef.current());
      } catch (err) {
        if (cancelled) return;
        const dismissed =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "AbortError");
        if (dismissed) {
          onStopRef.current();
        } else {
          setError(err instanceof Error ? err.message : "Couldn't start screen share.");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopScreenStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const frame = captureVideoFrame(video, 1024);
    if (frame) onReact(frame);
  }, [onReact]);

  // Auto-react loop — paused while a reply is mid-stream so frames don't pile up.
  useEffect(() => {
    if (screenWatchInterval <= 0 || !ready || error) return;
    const id = setInterval(() => {
      if (!streamingRef.current) grabFrame();
    }, screenWatchInterval * 1000);
    return () => clearInterval(id);
  }, [screenWatchInterval, ready, error, grabFrame]);

  const cycleInterval = () => {
    const idx = INTERVAL_OPTIONS.indexOf(screenWatchInterval);
    const next = INTERVAL_OPTIONS[(idx + 1) % INTERVAL_OPTIONS.length];
    setScreenWatchInterval(next);
  };

  if (error) {
    return (
      <div className="screen-watch-pip" role="dialog" aria-label="Screen watch">
        <div className="screen-watch-error">{error}</div>
        <div className="screen-watch-bar">
          <button className="screen-watch-mini is-stop" style={{ flex: 1 }} onClick={onStop}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-watch-pip" role="dialog" aria-label="Screen watch">
      <div className="screen-watch-video-wrap">
        <video ref={videoRef} className="screen-watch-video" muted playsInline />
        <span className="screen-watch-live">
          <span className="dot" />
          Watching
        </span>
      </div>
      <div className="screen-watch-bar">
        <button
          type="button"
          className="screen-watch-react"
          onClick={grabFrame}
          disabled={!ready || isStreaming}
          title="Send the current frame to Game Buddy"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          React now
        </button>
        <button
          type="button"
          className={`screen-watch-mini ${screenWatchInterval > 0 ? "is-active" : ""}`}
          onClick={cycleInterval}
          title="Auto-react interval"
        >
          {intervalLabel(screenWatchInterval)}
        </button>
        <button
          type="button"
          className="screen-watch-mini is-stop"
          onClick={onStop}
          title="Stop watching"
          aria-label="Stop watching"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
