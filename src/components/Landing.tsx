import { useState, useEffect } from "react";
import { useStore } from "../store";

export default function Landing() {
  const setView = useStore((s) => s.setView);
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(() => setView("gateway"), 800);
  };

  return (
    <div
      className={`h-full w-full flex flex-col items-center justify-center transition-opacity duration-700 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* breathing light core — the word seems to emanate it */}
      <div
        className={`landing-core transition-opacity duration-[2000ms] ${ready ? "opacity-100" : "opacity-0"}`}
        aria-hidden
      />

      {/* a quiet current of light rising beneath the word */}
      <div
        className={`river-line transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
        style={{ height: "min(34vh, 280px)", bottom: "calc(50% + 4.5rem)" }}
        aria-hidden
      />

      {/* concentric rings — depth behind the word */}
      <div
        className={`absolute w-72 h-72 rounded-full border border-warm-400/10 animate-pulse-ring ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{ transition: "opacity 2s ease", transitionDelay: "1s" }}
        aria-hidden
      />
      <div
        className={`absolute w-[28rem] h-[28rem] rounded-full border border-warm-400/[0.06] animate-pulse-ring ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{ transition: "opacity 2.4s ease", transitionDelay: "1.3s", animationDelay: "1.2s" }}
        aria-hidden
      />

      {/* the word */}
      <div className="flex flex-col items-center gap-3 relative z-10">
        <h1
          className="font-display font-light text-warm-50"
          style={{
            fontSize: "clamp(5rem, 12vw, 9rem)",
            lineHeight: 1,
            letterSpacing: "0.04em",
          }}
        >
          {ready && (
            <span className="title-resolve animate-glow inline-block">You</span>
          )}
        </h1>

        {/* subtle accent line */}
        <div
          className={`h-px bg-gradient-to-r from-transparent via-warm-400/40 to-transparent transition-all duration-[1500ms] ${
            ready ? "w-36 opacity-100" : "w-0 opacity-0"
          }`}
          style={{ transitionDelay: "0.7s" }}
        />
      </div>

      {/* enter */}
      <button
        onClick={handleEnter}
        className={`group absolute flex flex-col items-center gap-2 font-body text-sm tracking-[0.25em] uppercase text-warm-400
          transition-all duration-500 cursor-pointer ${
            ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        style={{ transitionDelay: "1.4s", bottom: "max(4rem, calc(env(safe-area-inset-bottom) + 2rem))" }}
      >
        <span className="animate-breathe" style={{ animationDelay: "2s" }}>enter</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="opacity-50 group-hover:opacity-90 group-hover:translate-y-0.5 transition-all duration-300"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}
