"use client";

// Célébration des paliers GLOBAUX de publications envoyées depuis Nebula
// (100 / 1 000 / 100 000 / 1 000 000 — voir GLOBAL_PUBLISH_MILESTONES dans
// src/lib/publish.ts). Déclenchée uniquement quand LA personne qui vient de
// publier voit la réponse de l'API (composer, composition rapide, ou "Publier
// maintenant" sur la page d'un post) — jamais pour les publications
// programmées envoyées par le worker/cron, puisque personne ne regarde
// l'écran à ce moment-là.
//
// Chaque palier a sa propre intensité (plus de confettis, plus de salves,
// plus longtemps), de plus en plus impressionnante à mesure qu'on monte —
// jusqu'au message plein écran pour le millionième post.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useToast } from "@/components/dashboard/toast";

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  drift: number;
}

interface Tier {
  message: string;
  pieceCount: number;
  bursts: number;
  durationMs: number;
  colors: string[];
  showTrophy?: boolean;
}

const TIERS: Record<number, Tier> = {
  100: {
    message: "🎉 100ᵉ publication envoyée depuis Nebula !",
    pieceCount: 70,
    bursts: 1,
    durationMs: 4200,
    colors: ["rgb(var(--c-nebula-500))", "rgb(var(--c-aurora-400))", "rgb(var(--c-accent-cyan))"]
  },
  1000: {
    message: "🎉🎉 1 000ᵉ publication envoyée depuis Nebula — merci !",
    pieceCount: 150,
    bursts: 2,
    durationMs: 5200,
    colors: [
      "rgb(var(--c-nebula-500))",
      "rgb(var(--c-aurora-400))",
      "rgb(var(--c-accent-cyan))",
      "rgb(var(--c-accent-violet))"
    ]
  },
  100000: {
    message: "🎆 100 000ᵉ publication envoyée depuis Nebula — un jalon énorme !",
    pieceCount: 240,
    bursts: 4,
    durationMs: 7000,
    colors: [
      "rgb(var(--c-nebula-500))",
      "rgb(var(--c-aurora-400))",
      "rgb(var(--c-accent-cyan))",
      "rgb(var(--c-accent-violet))",
      "rgb(var(--c-accent-magenta))"
    ]
  },
  1000000: {
    message: "🏆 1 000 000ᵉ publication envoyée depuis Nebula ! Merci à toute la communauté.",
    pieceCount: 360,
    bursts: 7,
    durationMs: 9000,
    colors: [
      "rgb(var(--c-nebula-500))",
      "rgb(var(--c-aurora-400))",
      "rgb(var(--c-accent-cyan))",
      "rgb(var(--c-accent-violet))",
      "rgb(var(--c-accent-magenta))",
      "#ffd76a"
    ],
    showTrophy: true
  }
};

interface MilestoneContextValue {
  celebrateMilestone: (milestone: number) => void;
}

const MilestoneContext = createContext<MilestoneContextValue>({ celebrateMilestone: () => undefined });

export function useMilestoneCelebration() {
  return useContext(MilestoneContext);
}

export function MilestoneCelebrationProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [pieces, setPieces] = useState<ConfettiPiece[] | null>(null);
  const [trophy, setTrophy] = useState(false);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  const celebrateMilestone = useCallback(
    (milestone: number) => {
      const tier = TIERS[milestone];
      if (!tier) return; // valeur inattendue (jamais renvoyée par l'API en pratique) : on ignore plutôt que planter

      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];

      toast.success(tier.message);
      setTrophy(Boolean(tier.showTrophy));

      const perBurst = Math.max(1, Math.round(tier.pieceCount / tier.bursts));
      const burstGap = Math.max(500, tier.durationMs / tier.bursts / 1.5);

      for (let burst = 0; burst < tier.bursts; burst++) {
        const t = window.setTimeout(() => {
          const newPieces: ConfettiPiece[] = Array.from({ length: perBurst }, () => ({
            id: nextId.current++,
            left: Math.random() * 100,
            delay: Math.random() * 0.4,
            duration: 2.6 + Math.random() * 1.6,
            color: tier.colors[Math.floor(Math.random() * tier.colors.length)],
            rotate: Math.random() * 360,
            drift: (Math.random() - 0.5) * 160
          }));
          setPieces((prev) => [...(prev ?? []), ...newPieces]);
        }, burst * burstGap);
        timers.current.push(t);
      }

      const endTimer = window.setTimeout(() => {
        setPieces(null);
        setTrophy(false);
      }, tier.durationMs);
      timers.current.push(endTimer);
    },
    [toast]
  );

  return (
    <MilestoneContext.Provider value={{ celebrateMilestone }}>
      {children}
      {((pieces && pieces.length > 0) || trophy) && (
        <div className="pointer-events-none fixed inset-0 z-[210] overflow-hidden">
          {trophy && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <span
                className="text-center text-3xl font-display font-bold text-amber-300 drop-shadow-[0_0_25px_rgba(255,215,100,0.75)] sm:text-5xl"
                style={{ animation: "nebula-milestone-pulse 1.6s ease-in-out infinite" }}
              >
                1 000 000 🏆
              </span>
            </div>
          )}
          {pieces?.map((p) => (
            <span
              key={p.id}
              className="absolute top-[-5%] h-2.5 w-2.5 rounded-sm"
              style={{
                left: `${p.left}%`,
                backgroundColor: p.color,
                animation: `nebula-milestone-fall ${p.duration}s ease-in ${p.delay}s forwards`,
                // @ts-expect-error propriétés custom lues par l'animation ci-dessous
                "--drift": `${p.drift}px`,
                "--rotate": `${p.rotate}deg`
              }}
            />
          ))}
          <style jsx>{`
            @keyframes nebula-milestone-fall {
              0% {
                transform: translate(0, 0) rotate(0deg);
                opacity: 0;
              }
              8% {
                opacity: 1;
              }
              100% {
                transform: translate(var(--drift), 108vh) rotate(var(--rotate));
                opacity: 0;
              }
            }
            @keyframes nebula-milestone-pulse {
              0%,
              100% {
                transform: scale(1);
                opacity: 0.9;
              }
              50% {
                transform: scale(1.08);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}
    </MilestoneContext.Provider>
  );
}
