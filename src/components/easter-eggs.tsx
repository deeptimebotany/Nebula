"use client";

// Petits clins d'œil cachés, sans impact sur l'usage normal du site :
//  1. Code Konami (↑ ↑ ↓ ↓ ← → ← → B A) → une pluie de confettis + un message.
//  2. Taper "nebula" n'importe où (hors champ de saisie) → même effet, plus
//     facile à trouver pour qui n'a pas de manette en tête.
//  3. Un petit message signé, caché dans la console du navigateur, pour les
//     curieux qui l'ouvrent.
//  4. À minuit pile, 2 ou 3 étoiles filantes traversent l'écran (une seule
//     fois par jour).
//  5. Le vendredi 13, un chat noir traverse l'écran une fois dans la
//     journée, avec un petit message.
//  6. Le 21 septembre (anniversaire du lancement de Nebula), confettis +
//     message d'anniversaire, une fois par jour.
// Rien de tout ça n'apparaît ni ne se déclenche pendant une utilisation
// normale : aucune UI visible, aucun raccourci qui entre en conflit avec la
// saisie de texte.

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/dashboard/toast";

// Hypothèse : Nebula a été lancé le 21 septembre 2025 — à corriger ici si la
// vraie date de lancement diffère (seule cette constante calcule "Nebula a
// X ans" ci-dessous, rien d'autre n'en dépend).
const LAUNCH_YEAR = 2025;

// Un seul déclenchement par jour et par easter egg, même si la page est
// rechargée plusieurs fois — clé datée (année-mois-jour) dans localStorage.
function todayFlagKey(prefix: string): string {
  const d = new Date();
  return `nebula:${prefix}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function hasFiredToday(prefix: string): boolean {
  try {
    return localStorage.getItem(todayFlagKey(prefix)) === "1";
  } catch {
    return false;
  }
}
function markFiredToday(prefix: string) {
  try {
    localStorage.setItem(todayFlagKey(prefix), "1");
  } catch {
    // stockage indisponible — tant pis, l'egg pourra se redéclencher
  }
}

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

interface ShootingStar {
  id: number;
  top: number;
  left: number;
  delay: number;
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable || tag === "SELECT";
}

export function EasterEggs() {
  const toast = useToast();
  const [confetti, setConfetti] = useState<ConfettiPiece[] | null>(null);
  const [shootingStars, setShootingStars] = useState<ShootingStar[] | null>(null);
  const [blackCat, setBlackCat] = useState(false);
  const konamiProgress = useRef(0);
  const wordProgress = useRef(0);
  const nextId = useRef(0);
  const cooldown = useRef(false);

  // Minuit : 2 ou 3 étoiles filantes traversent l'écran en diagonale — pas
  // de confettis ici (trop bruyant pour un effet censé être discret), pas
  // de son, juste un joli passage.
  function fireShootingStars() {
    const count = 2 + Math.floor(Math.random() * 2);
    const stars: ShootingStar[] = Array.from({ length: count }, () => ({
      id: nextId.current++,
      top: 5 + Math.random() * 40,
      left: Math.random() * 35,
      delay: Math.random() * 1.6
    }));
    setShootingStars(stars);
    window.setTimeout(() => setShootingStars(null), 4200);
  }

  // Vendredi 13 : un chat noir traverse l'écran une seule fois dans la
  // journée (voir hasFiredToday), avec un petit message.
  function fireBlackCat() {
    setBlackCat(true);
    toast.info("🐈‍⬛ Vendredi 13... un chat noir traverse Nebula. Bonne chance aujourd'hui !");
    window.setTimeout(() => setBlackCat(false), 3600);
  }

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

  // Easter eggs liés à la date/heure : vérifiés au chargement ET toutes les
  // minutes (au cas où l'onglet reste ouvert pendant qu'on franchit minuit,
  // ou jusqu'au 13 ou au 21 septembre). hasFiredToday/markFiredToday
  // garantissent un seul déclenchement par jour et par egg, même si la page
  // est rechargée plusieurs fois dans la journée.
  useEffect(() => {
    function checkDateEggs() {
      const now = new Date();
      const isMidnight = now.getHours() === 0 && now.getMinutes() < 2;
      const isFriday13 = now.getDay() === 5 && now.getDate() === 13;
      const isAnniversary = now.getMonth() === 8 && now.getDate() === 21; // septembre = index 8

      if (isAnniversary && !hasFiredToday("anniversary")) {
        markFiredToday("anniversary");
        const years = now.getFullYear() - LAUNCH_YEAR;
        window.setTimeout(
          () => fire(`🎂 Nebula a ${years} an${years > 1 ? "s" : ""} aujourd'hui — merci d'en faire partie !`),
          500
        );
      } else if (isFriday13 && !hasFiredToday("friday13")) {
        markFiredToday("friday13");
        window.setTimeout(fireBlackCat, 500);
      } else if (isMidnight && !hasFiredToday("midnight-stars")) {
        markFiredToday("midnight-stars");
        window.setTimeout(fireShootingStars, 500);
      }
    }

    checkDateEggs();
    const interval = window.setInterval(checkDateEggs, 60000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!confetti && !shootingStars && !blackCat) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {shootingStars &&
        shootingStars.map((s) => (
          <span
            key={s.id}
            className="absolute h-px w-24 bg-gradient-to-r from-transparent via-white to-transparent"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              animation: `nebula-shooting-star 1.4s ease-in ${s.delay}s forwards`
            }}
          />
        ))}
      {blackCat && (
        <span className="absolute top-1/3 text-4xl" style={{ animation: "nebula-cat-cross 3.5s linear forwards" }}>
          🐈‍⬛
        </span>
      )}
      {confetti?.map((p) => (
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
        @keyframes nebula-shooting-star {
          0% {
            transform: translate(0, 0) rotate(45deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: translate(55vw, 55vh) rotate(45deg);
            opacity: 0;
          }
        }
        @keyframes nebula-cat-cross {
          0% {
            left: -10%;
          }
          100% {
            left: 110%;
          }
        }
      `}</style>
    </div>
  );
}
