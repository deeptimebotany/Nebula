import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Gris "slate" secondaires ÉCLAIRCIS par rapport aux valeurs par
        // défaut de Tailwind : sur le fond quasi noir du site (#02040a), le
        // slate-500 d'origine (#64748b) ne fait que 4,3:1 et le slate-600
        // (#475569) 2,7:1 — sous le minimum d'accessibilité (4,5:1) pour les
        // ~240 petits textes qui les utilisent. Ces valeurs donnent 5,7:1 et
        // 4,1:1 tout en restant nettement plus discrètes que slate-400.
        // Les classes existantes (text-slate-500...) restent inchangées.
        // Dark UI (24/09/2026) : gris NEUTRES (famille « zinc ») à la place
        // des gris bleutés « slate » — mêmes noms de classes partout
        // (text-slate-400…), seules les valeurs changent. Contrastes sur le
        // fond #0e0e10 : 500 → 5,9:1, 600 → 4,2:1 (comme avant).
        slate: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#8b8b94",
          600: "#71717a",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#0e0e10"
        },
        // Fonds « Dark UI » neutres (décision du 24/09/2026) : gris-noir sans
        // teinte bleue, comme les outils de travail (éditeur, Claude, Vercel).
        void: {
          950: "#0b0b0d",
          900: "#0e0e10",
          800: "#141417",
          700: "#1a1a1e",
          600: "#222227"
        },
        // Pilotées par des variables CSS (voir globals.css + src/lib/themes.ts)
        // plutôt que des hex en dur, pour que les ~10 thèmes de couleurs des
        // Paramètres puissent recolorer TOUTE l'appli (chaque classe
        // bg-nebula-500, text-aurora-300, etc. déjà utilisée partout) sans
        // toucher au moindre composant.
        nebula: {
          900: "rgb(var(--c-nebula-900) / <alpha-value>)",
          800: "rgb(var(--c-nebula-800) / <alpha-value>)",
          700: "rgb(var(--c-nebula-700) / <alpha-value>)",
          600: "rgb(var(--c-nebula-600) / <alpha-value>)",
          500: "rgb(var(--c-nebula-500) / <alpha-value>)",
          400: "rgb(var(--c-nebula-400) / <alpha-value>)",
          300: "rgb(var(--c-nebula-300) / <alpha-value>)",
          200: "rgb(var(--c-nebula-200) / <alpha-value>)",
          100: "rgb(var(--c-nebula-100) / <alpha-value>)"
        },
        aurora: {
          500: "rgb(var(--c-aurora-500) / <alpha-value>)",
          400: "rgb(var(--c-aurora-400) / <alpha-value>)",
          300: "rgb(var(--c-aurora-300) / <alpha-value>)",
          glow: "rgb(var(--c-aurora-glow) / <alpha-value>)"
        },
        accent: {
          violet: "rgb(var(--c-accent-violet) / <alpha-value>)",
          cyan: "rgb(var(--c-accent-cyan) / <alpha-value>)",
          magenta: "rgb(var(--c-accent-magenta) / <alpha-value>)"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px -10px rgba(0,0,0,0.6)",
        "glow-lg": "0 0 0 1px rgba(255,255,255,0.06), 0 20px 50px -20px rgba(0,0,0,0.7)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.55)"
      },
      backgroundImage: {
        // Dark UI (24/09/2026) : décors ramenés à un simple éclairage neutre.
        "grid-fade":
          "linear-gradient(to bottom, transparent, rgba(14,14,16,0.9)), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
        "aurora-radial":
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,255,255,0.05), transparent 70%)",
        "nebula-mesh":
          "radial-gradient(ellipse 80% 45% at 50% -5%, rgba(255,255,255,0.045), transparent 70%)",
        // Fond de connexion "Voie lactée" — réservé à la page de connexion
        // (voir login-form.tsx) : une bande diagonale plus dense d'étoiles et
        // de nébulosité, distincte de "nebula-mesh" (utilisé sur ~13 autres
        // pages publiques) pour ne rien changer ailleurs.
        "nebula-milky-way":
          "radial-gradient(ellipse 80% 45% at 50% -5%, rgba(255,255,255,0.05), transparent 70%)"
      },
      animation: {
        "pulse-slow": "pulse 5s cubic-bezier(0.4,0,0.6,1) infinite",
        float: "float 8s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-in-up": "fadeInUp 0.35s ease-out",
        "ring-pulse": "ringPulse 2.6s ease-in-out infinite",
        // --- V2 : direction artistique "cockpit spatial" ---
        "aurora-drift": "auroraDrift 14s ease-in-out infinite",
        "border-spin": "borderSpin 6s linear infinite",
        orbit: "orbit 24s linear infinite",
        "orbit-reverse": "orbit 32s linear infinite reverse",
        "comet-trail": "cometTrail 2.4s ease-out infinite",
        "tick-pulse": "tickPulse 3s ease-in-out infinite"
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
        },
        ringPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(127,178,255,0.45)" },
          "50%": { boxShadow: "0 0 0 5px rgba(127,178,255,0)" }
        },
        auroraDrift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        },
        borderSpin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        cometTrail: {
          "0%": { transform: "translateX(-6px)", opacity: "0" },
          "15%": { opacity: "1" },
          "100%": { transform: "translateX(6px)", opacity: "0" }
        },
        tickPulse: {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
