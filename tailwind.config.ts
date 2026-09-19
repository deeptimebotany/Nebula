import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        void: {
          950: "#02040a",
          900: "#050810",
          800: "#0a0f1c",
          700: "#0f1729",
          600: "#161f38"
        },
        nebula: {
          900: "#071033",
          800: "#0b1a4d",
          700: "#122a6e",
          600: "#1a3d94",
          500: "#2955c4",
          400: "#4d78e8",
          300: "#7ea1f5",
          200: "#b4c8fa",
          100: "#dfe9fd"
        },
        aurora: {
          500: "#5b8def",
          400: "#7fb2ff",
          300: "#63e6ff",
          glow: "#8fd7ff"
        },
        accent: {
          violet: "#7c6cf0",
          cyan: "#3ee6dd",
          magenta: "#e857b0"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(94,146,255,0.15), 0 8px 30px -6px rgba(41,85,196,0.45)",
        "glow-lg": "0 0 40px -5px rgba(94,146,255,0.35), 0 20px 60px -20px rgba(0,0,0,0.6)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.55)"
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, transparent, rgba(2,4,10,0.9)), radial-gradient(circle at 1px 1px, rgba(120,150,255,0.18) 1px, transparent 0)",
        "aurora-radial":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(45,90,220,0.35), transparent 70%)",
        "nebula-mesh":
          "radial-gradient(circle at 20% 20%, rgba(124,108,240,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(62,230,221,0.15), transparent 40%), radial-gradient(circle at 50% 100%, rgba(41,85,196,0.35), transparent 50%)"
      },
      animation: {
        "pulse-slow": "pulse 5s cubic-bezier(0.4,0,0.6,1) infinite",
        float: "float 8s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-in-up": "fadeInUp 0.35s ease-out"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
