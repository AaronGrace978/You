/** Track real viewport chrome so bottom controls stay put when Android nav peeks in/out. */

import { isAndroid, isStandaloneApp } from "./ai-config";

function probeEnvInset(edge: "top" | "bottom"): number {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    `padding-${edge}:env(safe-area-inset-${edge},0px)`,
  ].join(";");
  document.documentElement.appendChild(el);
  const px =
    parseFloat(getComputedStyle(el).getPropertyValue(`padding-${edge}`)) || 0;
  document.documentElement.removeChild(el);
  return px;
}

function bottomChromeOffset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  // Large gap = keyboard, not nav bar — ignore so the dock can sit above the keyboard.
  if (gap > 120) return 0;
  return Math.round(gap);
}

function computeInsets(): { top: number; bottom: number } {
  const safeTop = probeEnvInset("top");
  const safeBottom = probeEnvInset("bottom");
  const chromeBottom = bottomChromeOffset();
  const standaloneAndroid = isStandaloneApp() && isAndroid();

  const top =
    safeTop > 0
      ? safeTop
      : standaloneAndroid
        ? 24
        : 0;

  const bottom =
    Math.max(safeBottom, chromeBottom) ||
    (standaloneAndroid ? 12 : 0);

  return { top, bottom };
}

export function applyViewportInsets(): void {
  const { top, bottom } = computeInsets();
  const root = document.documentElement;
  root.style.setProperty("--inset-top", `${top}px`);
  root.style.setProperty("--inset-bottom", `${bottom}px`);
}

export function watchViewportChrome(): () => void {
  let raf = 0;
  let lastTop = -1;
  let lastBottom = -1;

  const update = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const { top, bottom } = computeInsets();
      const root = document.documentElement;
      if (top !== lastTop) {
        lastTop = top;
        root.style.setProperty("--inset-top", `${top}px`);
      }
      if (bottom !== lastBottom) {
        lastBottom = bottom;
        root.style.setProperty("--inset-bottom", `${bottom}px`);
      }
    });
  };

  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("fullscreenchange", update);
  update();

  return () => {
    cancelAnimationFrame(raf);
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    document.removeEventListener("fullscreenchange", update);
  };
}
