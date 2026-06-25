import { useEffect, useRef } from "react";
import type { Theme } from "../store";

/**
 * AmbientField — a quiet, living backdrop.
 *
 * "In the dark night of the soul, bright flows the river of God."
 * Soft motes of light drift upward like a slow river, with a few large
 * aurora blooms breathing behind them. Theme-aware (reads the live accent
 * + base colors from CSS variables), DPR-capped, pauses when hidden, and
 * collapses to a single still gradient when reduced motion is requested.
 */

interface Mote {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
}

interface Bloom {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  hueShift: number;
  alpha: number;
}

type RGB = [number, number, number];

function readVar(styles: CSSStyleDeclaration, name: string, fallback: RGB): RGB {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  return fallback;
}

function luminance([r, g, b]: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mix([r1, g1, b1]: RGB, [r2, g2, b2]: RGB, t: number): RGB {
  return [
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  ];
}

export default function AmbientField({ theme }: { theme: Theme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let motes: Mote[] = [];
    let blooms: Bloom[] = [];
    let raf = 0;
    let running = true;
    let t = 0;

    // Live palette, refreshed on theme change.
    let accent: RGB = [218, 178, 132];
    let rose: RGB = [184, 121, 122];
    let deep: RGB = [22, 22, 24];
    let isDark = true;

    const refreshPalette = () => {
      const styles = getComputedStyle(document.documentElement);
      accent = readVar(styles, "--c-accent", accent);
      deep = readVar(styles, "--c-deep", deep);
      isDark = luminance(deep) < 0.4;
      // A complementary cooler/rose tone for depth.
      rose = isDark ? [184, 121, 122] : mix(accent, [150, 100, 110], 0.5);
    };

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const makeMote = (seedY?: number): Mote => ({
      x: rand(0, width),
      y: seedY ?? rand(0, height),
      r: rand(0.6, 2.6),
      speed: rand(4, 16),
      sway: rand(8, 34),
      phase: rand(0, Math.PI * 2),
      alpha: rand(0.18, 0.7),
    });

    // Anchored toward the edges so the center stays deep and "You" can glow.
    const BLOOM_ANCHORS: Array<[number, number, number]> = [
      [0.12, 0.1, 0],
      [0.9, 0.82, 0.7],
      [0.5, 1.18, 1],
    ];

    const makeBloom = (anchor: [number, number, number]): Bloom => ({
      x: (anchor[0] + rand(-0.05, 0.05)) * width,
      y: (anchor[1] + rand(-0.05, 0.05)) * height,
      r: rand(0.26, 0.38) * Math.max(width, height),
      dx: rand(-5, 5),
      dy: rand(-5, 5),
      hueShift: anchor[2],
      alpha: rand(0.7, 1),
    });

    const build = () => {
      const area = width * height;
      // Density scales with screen area, capped for performance.
      const count = Math.round(Math.min(70, Math.max(22, area / 24000)));
      motes = Array.from({ length: count }, () => makeMote());
      blooms = BLOOM_ANCHORS.map(makeBloom);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (reduceMotion) drawStill();
    };

    const paintBlooms = () => {
      for (const b of blooms) {
        const tone = mix(accent, rose, b.hueShift);
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        const peak = (isDark ? 0.05 : 0.05) * b.alpha;
        g.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${peak})`);
        g.addColorStop(1, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const paintMote = (m: Mote, x: number) => {
      const g = ctx.createRadialGradient(x, m.y, 0, x, m.y, m.r * 4);
      const a = m.alpha * (isDark ? 1 : 0.55);
      g.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${a})`);
      g.addColorStop(1, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, m.y, m.r * 4, 0, Math.PI * 2);
      ctx.fill();
    };

    // Single static frame for reduced-motion users.
    const drawStill = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = isDark ? "lighter" : "source-over";
      paintBlooms();
      for (const m of motes) paintMote(m, m.x);
      ctx.globalCompositeOperation = "source-over";
    };

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = isDark ? "lighter" : "source-over";

      for (const b of blooms) {
        b.x += b.dx * dt;
        b.y += b.dy * dt;
        const margin = b.r * 0.5;
        if (b.x < -margin || b.x > width + margin) b.dx *= -1;
        if (b.y < -margin || b.y > height + margin) b.dy *= -1;
      }
      // Blooms breathe softly together.
      const breathe = 0.78 + 0.12 * Math.sin(t * 0.4);
      ctx.save();
      ctx.globalAlpha = breathe;
      paintBlooms();
      ctx.restore();

      for (const m of motes) {
        m.y -= m.speed * dt;
        const x = m.x + Math.sin(t * 0.5 + m.phase) * m.sway;
        if (m.y < -8) {
          m.y = height + 8;
          m.x = rand(0, width);
        }
        // Gentle twinkle.
        const tw = 0.7 + 0.3 * Math.sin(t * 1.3 + m.phase * 2);
        const saved = m.alpha;
        m.alpha = saved * tw;
        paintMote(m, x);
        m.alpha = saved;
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (reduceMotion) {
        drawStill();
        return;
      }
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) start();
      else cancelAnimationFrame(raf);
    };

    refreshPalette();
    resize();
    start();

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="ambient-field" aria-hidden="true" />;
}
