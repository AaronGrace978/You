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
      {/* the word */}
      <div className="flex flex-col items-center gap-2">
        <h1
          className={`font-display font-light tracking-wide text-warm-50 transition-all duration-1000 ${
            ready
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
          style={{
            fontSize: "clamp(5rem, 12vw, 9rem)",
            lineHeight: 1,
            letterSpacing: "0.04em",
          }}
        >
          <span className="animate-glow inline-block">You</span>
        </h1>

        {/* subtle accent line */}
        <div
          className={`h-px bg-gradient-to-r from-transparent via-warm-400/30 to-transparent transition-all duration-1500 ${
            ready ? "w-32 opacity-100" : "w-0 opacity-0"
          }`}
          style={{ transitionDelay: "0.6s" }}
        />
      </div>

      {/* enter */}
      <button
        onClick={handleEnter}
        className={`absolute bottom-16 font-body text-sm tracking-[0.25em] uppercase text-warm-400/60 
          hover:text-warm-400 transition-all duration-500 cursor-pointer
          animate-breathe ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        style={{ transitionDelay: "1.4s", animationDelay: "2s" }}
      >
        enter
      </button>

      {/* pulse ring behind "You" */}
      <div
        className={`absolute w-64 h-64 rounded-full border border-warm-400/10 animate-pulse-ring ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDelay: "1s", transition: "opacity 2s ease" }}
      />
    </div>
  );
}
