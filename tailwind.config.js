/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: "rgb(var(--c-deep) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        warm: {
          50: "rgb(var(--c-text) / <alpha-value>)",
          100: "#e0d5cb",
          200: "#c9b8a8",
          300: "#b09a87",
          400: "rgb(var(--c-accent) / <alpha-value>)",
          500: "#a87d55",
          600: "#8a6544",
          700: "#6b4d33",
          800: "#4d3623",
          900: "#2e2015",
        },
        rose: {
          400: "#b8797a",
        },
        muted: "rgb(var(--c-muted) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Cormorant", "serif"],
        body: ["Karla", "sans-serif"],
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
        glow: "glow 6s ease-in-out infinite",
        "fade-in": "fadeIn 1.2s ease-out forwards",
        "fade-in-slow": "fadeIn 2s ease-out forwards",
        "fade-in-up": "fadeInUp 1s ease-out forwards",
        "slide-up": "slideUp 0.6s ease-out forwards",
        "voice-pulse": "voicePulse 2s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        glow: {
          "0%, 100%": {
            textShadow: "0 0 40px rgba(201, 149, 107, 0.08)",
          },
          "50%": {
            textShadow:
              "0 0 80px rgba(201, 149, 107, 0.2), 0 0 120px rgba(201, 149, 107, 0.1)",
          },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(40px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        voicePulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.15)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
