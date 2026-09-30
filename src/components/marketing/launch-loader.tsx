"use client";

// Page « Bientôt » (pré-lancement, 30/09/2026) : logo en orbite et barre de
// chargement. Le pourcentage vient des étapes de src/lib/launch.ts (terminé
// = 1, en cours = 0,5) : il monte de 0 à sa valeur à l'affichage, puis la
// barre continue de « travailler » (rayures, reflet) et une phrase change
// toutes les quelques secondes. Styles .launch-* dans globals.css ; tout est
// figé si le visiteur a demandé moins d'animations.
import { useEffect, useState } from "react";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";

const STATUS = [
  "Réglage des orbites",
  "Vérification des accès aux réseaux",
  "Derniers essais avec les partenaires",
  "Polissage des pixels",
  "Préparation de la rampe de lancement"
];

const STARS = [
  { top: "6%", left: "18%", d: "2.4s", delay: "-0.3s" },
  { top: "14%", left: "86%", d: "3.1s", delay: "-1.2s" },
  { top: "48%", left: "2%", d: "2.7s", delay: "-2s" },
  { top: "84%", left: "12%", d: "3.4s", delay: "-0.8s" },
  { top: "92%", left: "72%", d: "2.2s", delay: "-1.6s" },
  { top: "40%", left: "97%", d: "2.9s", delay: "-0.1s" }
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Logo Nebula entouré de trois orbites. */
export function LaunchOrbit() {
  return (
    <div className="launch-stage mx-auto" aria-hidden="true">
      {STARS.map((s, i) => (
        <span key={i} className="launch-star" style={{ top: s.top, left: s.left, ["--launch-twinkle" as string]: s.d, animationDelay: s.delay }} />
      ))}
      <div className="launch-glow" />
      <div className="launch-ring text-accent-cyan" style={{ inset: "0%", ["--launch-spin" as string]: "16s" }}>
        <span className="launch-planet" />
      </div>
      <div className="launch-ring launch-ring--reverse text-accent-magenta" style={{ inset: "13%", ["--launch-spin" as string]: "11s" }}>
        <span className="launch-planet" style={{ width: 8, height: 8, top: -4, left: "calc(50% - 4px)" }} />
      </div>
      <div className="launch-ring text-aurora-300" style={{ inset: "26%", ["--launch-spin" as string]: "7s" }}>
        <span className="launch-planet" style={{ width: 6, height: 6, top: -3, left: "calc(50% - 3px)" }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <NebulaIcon size={64} />
      </div>
    </div>
  );
}

/** Barre de chargement du lancement, avec son pourcentage. */
export function LaunchProgress({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [status, setStatus] = useState(0);

  // Montée du pourcentage (0 → valeur) à l'affichage.
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = 1600;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  // Phrase d'état qui change (décorative : lue une seule fois par les
  // lecteurs d'écran grâce à la barre de progression ci-dessous).
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setStatus((s) => (s + 1) % STATUS.length), 2800);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-2 flex items-end justify-between gap-3 text-sm">
        <span className="font-medium text-white">Préparation du lancement</span>
        <span className="font-display text-2xl font-semibold tabular-nums text-white">{shown}&nbsp;%</span>
      </div>
      <div className="launch-bar" role="progressbar" aria-label="Avancement avant l'ouverture de Nebula" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="launch-bar-fill" style={{ width: `${Math.max(4, shown)}%` }} />
      </div>
      <p className="mt-3 h-5 text-center text-xs text-slate-400" aria-hidden="true">
        <span key={status} className="launch-status-enter launch-dots inline-block">
          {STATUS[status]}
        </span>
      </p>
    </div>
  );
}
