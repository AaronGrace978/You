import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// Served from https://aarongrace978.github.io/You/ in production
// (the path is case-sensitive and must match the repo name), but from "/"
// during local dev.
const base = process.env.NODE_ENV === "production" ? "/You/" : "/";

export default defineConfig(async () => ({
  plugins: [react()],

  base,

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
