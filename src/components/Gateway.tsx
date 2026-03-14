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
      className={`h-full w-full flex items-center justify-center transition-opacity duration-700 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="max-w-2xl mx-auto px-8 flex flex-col items-center gap-12">
        {/* epigraph */}
        <div
          className={`text-center transition-all duration-1000 ${
            phase >= 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-display italic text-2xl md:text-3xl text-warm-50/90 leading-relaxed">
            "In the dark night of the soul, bright flows the river of God."
          </p>
          <p className="font-body text-sm text-muted mt-4 tracking-wide">
            — Saint John of the Cross
          </p>
        </div>

        {/* divider */}
        <div
          className={`h-px w-16 bg-warm-400/20 transition-all duration-700 ${
            phase >= 2 ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* creator story */}
        <div
          className={`text-center space-y-6 transition-all duration-1000 ${
            phase >= 2
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-body text-warm-50/80 leading-relaxed text-base md:text-lg">
            This was built by someone who knows what it means to carry pain
            you never asked for. Burned. Broken. Told that silence was
            survival. The kind of childhood where hurt was the only constant
            and love was something you had to teach yourself.
          </p>
          <p className="font-body text-warm-50/70 leading-relaxed text-base md:text-lg">
            Therapy says{" "}
            <span className="italic text-warm-400/80">organize your pain.</span>{" "}
            This says{" "}
            <span className="italic text-warm-400">
              transform it into something that heals others.
            </span>
          </p>
          <p className="font-body text-warm-50/60 leading-relaxed text-base md:text-lg">
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
          <p className="font-display text-xl md:text-2xl text-warm-400/90 leading-relaxed">
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
          <span className="font-body text-xs tracking-[0.3em] uppercase text-warm-400/50 group-hover:text-warm-400 transition-colors duration-300">
            continue
          </span>
        </button>
      </div>
    </div>
  );
}
