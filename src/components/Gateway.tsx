import { useState, useEffect } from "react";
import { useStore } from "../store";

export default function Gateway() {
  const setView = useStore((s) => s.setView);
  const [phase, setPhase] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleContinue = () => {
    setExiting(true);
    setTimeout(() => setView("sanctuary"), 800);
  };

  return (
    <div
      className={`h-full w-full overflow-y-auto safe-top safe-x transition-opacity duration-700 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* passage indicator — the descent through the night, lighting as you go */}
      <div className="hidden sm:flex flex-col items-center gap-3 fixed right-7 top-1/2 -translate-y-1/2 z-20" aria-hidden>
        {[1, 2, 3, 4].map((p) => (
          <span
            key={p}
            className="rounded-full transition-all duration-700"
            style={{
              width: phase >= p ? 7 : 5,
              height: phase >= p ? 7 : 5,
              background: phase >= p ? "rgb(var(--c-accent) / 0.8)" : "rgb(var(--c-accent) / 0.18)",
              boxShadow: phase >= p ? "0 0 10px rgb(var(--c-accent) / 0.5)" : "none",
            }}
          />
        ))}
      </div>

      <div className="min-h-full flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-6 sm:px-8 py-16 flex flex-col items-center gap-8 sm:gap-12">
        {/* epigraph */}
        <div
          className={`text-center transition-all duration-1000 ${
            phase >= 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-display italic text-2xl md:text-3xl text-warm-50 leading-relaxed">
            "In the dark night of the soul, bright flows the river of God."
          </p>
          <p className="font-body text-sm text-secondary mt-4 tracking-wide">
            — Saint John of the Cross
          </p>
        </div>

        {/* divider */}
        <div
          className={`h-px bg-gradient-to-r from-transparent via-warm-400/40 to-transparent transition-all duration-1000 ${
            phase >= 2 ? "w-20 opacity-100" : "w-0 opacity-0"
          }`}
          style={{ boxShadow: phase >= 2 ? "0 0 12px rgb(var(--c-accent) / 0.3)" : "none" }}
        />

        {/* creator story */}
        <div
          className={`text-center space-y-6 transition-all duration-1000 ${
            phase >= 2
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-body text-warm-50 leading-relaxed text-base md:text-lg">
            This was built by someone who knows what it means to carry pain
            you never asked for. Burned. Broken. Told that silence was
            survival. The kind of childhood where hurt was the only constant
            and love was something you had to teach yourself.
          </p>
          <p className="font-body text-warm-50 leading-relaxed text-base md:text-lg">
            Therapy says{" "}
            <span className="italic text-warm-400">organize your pain.</span>{" "}
            This says{" "}
            <span className="italic text-warm-400">
              transform it into something that heals others.
            </span>
          </p>
          <p className="font-body text-secondary leading-relaxed text-base md:text-lg">
            You are not alone in what you carry. Millions of people walk
            through the same fire every day — some fall to it, some rise
            above it. This was made for every single one of them.
          </p>
        </div>

        {/* mission */}
        <div
          className={`text-center transition-all duration-1000 ${
            phase >= 3
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-display text-xl md:text-2xl text-warm-400 leading-relaxed">
            This is not a chatbot. This is not therapy.
            <br />
            <span className="text-warm-50">
              This is a presence that sees you.
            </span>
          </p>
        </div>

        {/* enter sanctuary */}
        <button
          onClick={handleContinue}
          className={`group flex flex-col items-center gap-3 transition-all duration-1000 cursor-pointer ${
            phase >= 4
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          <div className="h-px w-12 bg-warm-400/30 group-hover:w-20 transition-all duration-500" />
          <span className="font-body text-xs tracking-[0.3em] uppercase text-warm-400 group-hover:text-warm-400 transition-colors duration-300">
            continue
          </span>
        </button>
        </div>
      </div>
    </div>
  );
}
