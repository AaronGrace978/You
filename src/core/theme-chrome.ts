export const THEME_COLORS = { dark: "#09090f", light: "#f8f5f0" } as const;

/** Keep OS chrome (status bar, overscroll) matched to the in-app theme. */
export function applyThemeChrome(theme: keyof typeof THEME_COLORS): void {
  const color = THEME_COLORS[theme];
  const root = document.documentElement;

  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  root.style.backgroundColor = color;
  document.body.style.backgroundColor = color;

  const metas = Array.from(
    document.querySelectorAll('meta[name="theme-color"]')
  ) as HTMLMetaElement[];
  metas.slice(1).forEach((m) => m.remove());

  let meta = metas[0];
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.removeAttribute("media");
  meta.content = color;
}
