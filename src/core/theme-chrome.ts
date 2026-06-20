export const THEME_COLORS = { dark: "#09090f", light: "#f8f5f0" } as const;

/** Chrome Android sometimes ignores theme-color updates — recreate the meta tag. */
function setThemeColorMeta(color: string): void {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = color;
  document.head.appendChild(meta);
}

function setColorSchemeMeta(theme: keyof typeof THEME_COLORS): void {
  let meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "color-scheme";
    document.head.appendChild(meta);
  }
  meta.content = theme === "dark" ? "dark" : "light";
}

/** Keep OS chrome (status bar, overscroll) matched to the in-app theme. */
export function applyThemeChrome(theme: keyof typeof THEME_COLORS): void {
  const color = THEME_COLORS[theme];
  const root = document.documentElement;

  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  root.style.backgroundColor = color;
  document.body.style.backgroundColor = color;

  const appRoot = document.getElementById("root");
  if (appRoot) appRoot.style.backgroundColor = color;

  setThemeColorMeta(color);
  setColorSchemeMeta(theme);
}

/** Re-apply when Android resumes the PWA — status bar color can reset. */
export function watchThemeChrome(theme: keyof typeof THEME_COLORS): () => void {
  const refresh = () => applyThemeChrome(theme);

  const onVisible = () => {
    if (document.visibilityState === "visible") refresh();
  };

  window.addEventListener("pageshow", refresh);
  window.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", refresh);

  return () => {
    window.removeEventListener("pageshow", refresh);
    window.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", refresh);
  };
}
