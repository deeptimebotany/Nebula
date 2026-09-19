"use client";

// Petits clins d'œil cachés, sans impact sur l'usage normal du site :
//  1. Code Konami (↑ ↑ ↓ ↓ ← → ← → B A) → une pluie de confettis + un message.
//  2. Taper "nebula" n'importe où (hors champ de saisie) → même effet, plus
//     facile à trouver pour qui n'a pas de manette en tête.
//  3. Un petit message signé, caché dans la console du navigateur, pour les
//     curieux qui l'ouvrent.
// Rien de tout ça n'apparaît ni ne se déclenche pendant une utilisation
// normale : aucune UI visible, aucun raccourci qui entre en conflit avec la
// saisie de texte.

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/dashboard/toast";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a"
];

const WORD = "nebula";

const CONFETTI_COLORS = [
  "rgb(var(--c-nebula-500))",
  "rgb(var(--c-aurora-400))",
  "rgb(var(--c-aurora-300))",
  "rgb(var(--c-accent-violet))",
  "rgb(var(--c-accent-cyan))",
  "rgb(var(--c-accent-magenta))"
];

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  drift: number;
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable || tag === "SELECT";
}

export function EasterEggs() {
  const toast = useToast();
  const [confetti, setConfetti] = useState<ConfettiPiece[] | null>(null);
  const konamiProgress = useRef(0);
  const wordProgress = useRef(0);
  const nextId = useRef(0);
  const cooldown = useRef(false);

  function fire(message: string) {
    if (cooldown.current) return;
    cooldown.current = true;
    const pieces: ConfettiPiece[] = Array.from({ length: 60 }, () => ({
      id: nextId.current++,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2.6 + Math.random() * 1.4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 140
    }));
    setConfetti(pieces);
    toast.success(message);
    window.setTimeout(() => setConfetti(null), 4200);
    window.setTimeout(() => {
      cooldown.current = false;
    }, 4200);
  }

  useEffect(() => {
    // Message signé, visible uniquement dans la console — n'affecte rien à
    // l'écran. Un petit clin d'œil pour qui ouvre les outils de développement.
    // eslint-disable-next-line no-console
    console.log(
      "%c✨ Nebula",
      "font-size:20px;font-weight:700;color:#7fb2ff;text-shadow:0 0 12px rgba(127,178,255,0.6);"
    );
    // eslint-disable-next-line no-console
    console.log(
      "%cVous cherchez quelque chose ? Essayez le code Konami, ou tapez simplement « nebula ».",
      "color:#8fd7ff;font-size:12px;"
    );

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Code Konami.
      const expectedKonami = KONAMI[konamiProgress.current];
      if (key === expectedKonami) {
        konamiProgress.current += 1;
        if (konamiProgress.current === KONAMI.length) {
          konamiProgress.current = 0;
          fire("🎉 Code Konami activé — bravo à l'ancienne !");
        }
      } else {
        konamiProgress.current = key === KONAMI[0] ? 1 : 0;
      }

      // Le mot "nebula".
      const expectedWord = WORD[wordProgress.current];
      if (key === expectedWord) {
        wordProgress.current += 1;
        if (wordProgress.current === WORD.length) {
          wordProgress.current = 0;
          fire("🌌 Vous avez trouvé le mot secret !");
        }
      } else {
        wordProgress.current = key === WORD[0] ? 1 : 0;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toast]);

  if (!confetti) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {confetti.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-5%] h-2.5 w-2.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animation: `nebula-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            // @ts-expect-error propriétés custom lues par l'animation ci-dessous
            "--drift": `${p.drift}px`,
            "--rotate": `${p.rotate}deg`
          }}
        />
      ))}
      <style jsx>{`
        @keyframes nebula-confetti-fall {
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
      `}</style>
    </div>
  );
}
