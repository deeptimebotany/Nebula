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
import { reportEasterEggFound } from "@/lib/report-easter-egg";

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
const WORD_BANANA = "banana";

// Session "marathon" (4h en continu) : horodatage de début posé une seule
// fois par onglet dans sessionStorage (pas localStorage : on veut vraiment
// "une session", remise à zéro à la fermeture de l'onglet).
const SESSION_START_KEY = "nebula:session-start";
const MARATHON_THRESHOLD_MS = 4 * 60 * 60 * 1000;
// "Statue" : immobilité totale du curseur pendant ce délai.
const STATUE_THRESHOLD_MS = 60 * 1000;
// "Zoom extrême" : ratio taille fenêtre externe / interne — grossit avec le
// niveau de zoom du navigateur (heuristique, pas une vraie API de zoom).
const EXTREME_ZOOM_RATIO = 4;

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

interface BananaDrop {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotate: number;
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
  const [bananas, setBananas] = useState<BananaDrop[] | null>(null);
  const konamiProgress = useRef(0);
  const wordProgress = useRef(0);
  const bananaProgress = useRef(0);
  const nextId = useRef(0);
  const cooldown = useRef(false);
  const bananaCooldown = useRef(false);

  // Easter egg "banana" : pluie de bananes pendant 2s, indépendante du
  // cooldown confettis (fire()) pour pouvoir se déclencher juste après.
  function fireBananaRain() {
    if (bananaCooldown.current) return;
    bananaCooldown.current = true;
    reportEasterEggFound("banana-word");
    const drops: BananaDrop[] = Array.from({ length: 40 }, () => ({
      id: nextId.current++,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.8 + Math.random() * 1.2,
      rotate: Math.random() * 360
    }));
    setBananas(drops);
    toast.success("🍌 Vous avez trouvé la banane !");
    window.setTimeout(() => setBananas(null), 2600);
    window.setTimeout(() => {
      bananaCooldown.current = false;
    }, 2600);
  }

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
    reportEasterEggFound("midnight-stars");
    window.setTimeout(() => setShootingStars(null), 4200);
  }

  // Vendredi 13 : un chat noir traverse l'écran une seule fois dans la
  // journée (voir hasFiredToday), avec un petit message.
  function fireBlackCat() {
    setBlackCat(true);
    toast.info("🐈‍⬛ Vendredi 13... un chat noir traverse Nebula. Bonne chance aujourd'hui !");
    reportEasterEggFound("friday-13");
    window.setTimeout(() => setBlackCat(false), 3600);
  }

  function fire(message: string, key?: string) {
    if (cooldown.current) return;
    cooldown.current = true;
    if (key) reportEasterEggFound(key);
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
    // Indétectable par nature (on ne peut pas savoir si la console a été
    // lue) : marqué trouvé dès que ce message s'affiche, comme pour le
    // commentaire caché dans le code source (voir "hidden-comment").
    reportEasterEggFound("console-signature");

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Code Konami.
      const expectedKonami = KONAMI[konamiProgress.current];
      if (key === expectedKonami) {
        konamiProgress.current += 1;
        if (konamiProgress.current === KONAMI.length) {
          konamiProgress.current = 0;
          fire("🎉 Code Konami activé — bravo à l'ancienne !", "konami");
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
          fire("🌌 Vous avez trouvé le mot secret !", "nebula-word");
        }
      } else {
        wordProgress.current = key === WORD[0] ? 1 : 0;
      }

      // Le mot "banana".
      const expectedBanana = WORD_BANANA[bananaProgress.current];
      if (key === expectedBanana) {
        bananaProgress.current += 1;
        if (bananaProgress.current === WORD_BANANA.length) {
          bananaProgress.current = 0;
          fireBananaRain();
        }
      } else {
        bananaProgress.current = key === WORD_BANANA[0] ? 1 : 0;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toast]);

  // Easter eggs "ambiants", vérifiés en continu tant que le dashboard est
  // monté : marathon (session ouverte 4h+), statue (curseur immobile 60s),
  // zoom extrême (ratio fenêtre externe/interne). Rien de tout ça n'affiche
  // de UI bloquante — juste un toast, une fois.
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_START_KEY)) {
        sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
      }
    } catch {
      // stockage indisponible — l'egg "marathon" ne pourra pas se déclencher
    }

    // Curseur immobile : un mouvement de souris note seulement l'heure (pas
    // de minuterie recréée des dizaines de fois par seconde) ; une seule
    // minuterie vérifie ensuite si le seuil est atteint (lot 4).
    let statueTimer: number | null = null;
    let statueFired = false;
    let lastMove = Date.now();
    function onMouseMove() {
      lastMove = Date.now();
    }
    function checkStatue() {
      if (statueFired) return;
      const idle = Date.now() - lastMove;
      if (idle >= STATUE_THRESHOLD_MS && document.visibilityState === "visible") {
        statueFired = true;
        window.removeEventListener("mousemove", onMouseMove);
        toast.info("💤 Toujours là ?");
        reportEasterEggFound("cursor-statue");
        return;
      }
      statueTimer = window.setTimeout(checkStatue, Math.max(1000, STATUE_THRESHOLD_MS - idle));
    }
    statueTimer = window.setTimeout(checkStatue, STATUE_THRESHOLD_MS);
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    let zoomFired = false;
    function checkZoom() {
      if (zoomFired) return;
      const ratio = window.outerWidth / window.innerWidth;
      if (ratio >= EXTREME_ZOOM_RATIO) {
        zoomFired = true;
        toast.info("🔍 On dirait que vous cherchez quelque chose de très précis...");
        reportEasterEggFound("extreme-zoom");
      }
    }
    window.addEventListener("resize", checkZoom);

    let marathonFired = false;
    const marathonInterval = window.setInterval(() => {
      if (marathonFired) return;
      let start: number | null = null;
      try {
        const raw = sessionStorage.getItem(SESSION_START_KEY);
        start = raw ? Number(raw) : null;
      } catch {
        start = null;
      }
      if (start && Date.now() - start >= MARATHON_THRESHOLD_MS) {
        marathonFired = true;
        toast.info("⏳ 4h sur Nebula — pensez à faire une pause !");
        reportEasterEggFound("marathon-session");
      }
    }, 5 * 60 * 1000);

    return () => {
      if (statueTimer) window.clearTimeout(statueTimer);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", checkZoom);
      window.clearInterval(marathonInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Easter egg "Multi-fenêtres" : 5 onglets Nebula ouverts EN MÊME TEMPS.
  // Chaque onglet qui s'ouvre (ou redevient visible) demande « qui est là ? »
  // sur un canal partagé entre les onglets du site ; les autres répondent.
  // Aucune minuterie : l'ancienne version écrivait dans localStorage toutes
  // les 4 secondes dans chaque onglet (audit performance, lot 4).
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = new BroadcastChannel("nebula:tabs");
    const seen = new Set<string>();
    let fired = false;
    let collectTimer: number | null = null;

    channel.onmessage = (e: MessageEvent<{ type?: string; id?: string }>) => {
      const msg = e.data;
      if (!msg || typeof msg.id !== "string" || msg.id === tabId) return;
      if (msg.type === "hello") channel.postMessage({ type: "here", id: tabId });
      if (msg.type === "here" || msg.type === "hello") seen.add(msg.id);
    };

    function ask() {
      if (fired) return;
      seen.clear();
      channel.postMessage({ type: "hello", id: tabId });
      if (collectTimer) window.clearTimeout(collectTimer);
      collectTimer = window.setTimeout(() => {
        // Cet onglet + au moins 4 autres qui ont répondu.
        if (!fired && seen.size + 1 >= 5) {
          fired = true;
          reportEasterEggFound("multi-tab");
        }
      }, 800);
    }
    function onVisible() {
      if (document.visibilityState === "visible") ask();
    }
    ask();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (collectTimer) window.clearTimeout(collectTimer);
      document.removeEventListener("visibilitychange", onVisible);
      channel.close();
    };
  }, []);

  // Easter egg "Va-et-vient" : revenir sur cet onglet (visibilitychange →
  // "visible") au moins 10 fois en 30 secondes — signe qu'on bascule
  // frénétiquement entre deux fenêtres/onglets Nebula.
  useEffect(() => {
    let count = 0;
    let resetTimer: number | null = null;

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      count += 1;
      if (resetTimer) window.clearTimeout(resetTimer);
      if (count >= 10) {
        count = 0;
        reportEasterEggFound("tab-switch-loop");
      } else {
        resetTimer = window.setTimeout(() => {
          count = 0;
        }, 30000);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (resetTimer) window.clearTimeout(resetTimer);
    };
  }, []);

  // Easter eggs liés à la date/heure : vérifiés au chargement ET toutes les
  // minutes (au cas où l'onglet reste ouvert pendant qu'on franchit minuit,
  // ou jusqu'au 13 ou au 21 septembre). hasFiredToday/markFiredToday
  // garantissent un seul déclenchement par jour et par egg, même si la page
  // est rechargée plusieurs fois dans la journée.
  useEffect(() => {
    function checkDateEggs() {
      if (document.visibilityState !== "visible") return;
      const now = new Date();
      const isMidnight = now.getHours() === 0 && now.getMinutes() < 2;
      const isFriday13 = now.getDay() === 5 && now.getDate() === 13;
      const isAnniversary = now.getMonth() === 8 && now.getDate() === 21; // septembre = index 8

      if (isAnniversary && !hasFiredToday("anniversary")) {
        markFiredToday("anniversary");
        const years = now.getFullYear() - LAUNCH_YEAR;
        window.setTimeout(
          () => fire(`🎂 Nebula a ${years} an${years > 1 ? "s" : ""} aujourd'hui — merci d'en faire partie !`, "anniversary"),
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

  if (!confetti && !shootingStars && !blackCat && !bananas) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {bananas &&
        bananas.map((b) => (
          <span
            key={b.id}
            className="absolute top-[-8%] text-2xl"
            style={{
              left: `${b.left}%`,
              animation: `nebula-confetti-fall ${b.duration}s ease-in ${b.delay}s forwards`,
              // @ts-expect-error propriété custom lue par l'animation nebula-confetti-fall
              "--drift": "0px",
              "--rotate": `${b.rotate}deg`
            }}
          >
            🍌
          </span>
        ))}
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
