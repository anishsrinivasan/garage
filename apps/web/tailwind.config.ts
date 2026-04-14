import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#09090B",
          900: "#0F0F11",
          850: "#141417",
          800: "#1C1C20",
          700: "#27272A",
          600: "#3F3F46",
          500: "#52525B",
          400: "#71717A",
          300: "#A1A1AA",
          200: "#D4D4D8",
          100: "#E4E4E7",
          50: "#FAFAFA",
        },
        accent: {
          DEFAULT: "#FB923C",
          glow: "#F97316",
          soft: "#FED7AA",
        },
        electric: {
          DEFAULT: "#22D3EE",
          glow: "#06B6D4",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(251,146,60,0.4), 0 20px 60px -20px rgba(251,146,60,0.35)",
        "glow-electric":
          "0 0 0 1px rgba(34,211,238,0.4), 0 20px 60px -20px rgba(34,211,238,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 32px -12px rgba(0,0,0,0.6)",
        "card-hover":
          "0 1px 0 0 rgba(255,255,255,0.08) inset, 0 20px 60px -20px rgba(251,146,60,0.25)",
      },
      backgroundImage: {
        "grid-pattern":
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
        "hero-glow":
          "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(251,146,60,0.18), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(34,211,238,0.12), transparent 60%)",
        "accent-gradient":
          "linear-gradient(135deg, #FB923C 0%, #F472B6 100%)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "gradient-pan": "gradient-pan 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
