"use client";

// Voile blanc plein écran qui accueille l'intro de création de compte
// (account-intro.tsx, chargée à la demande). Ce fichier reste minuscule : il
// est inclus dans la page d'inscription et dans le tableau de bord, alors que
// l'intro elle-même (shader, son, logo) n'est téléchargée que lorsqu'elle joue.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";

const AccountIntro = dynamic(() => import("./account-intro"), { ssr: false, loading: () => null });

/** Télécharge l'intro en avance (au clic sur « Créer mon espace »), pour qu'elle démarre sans attente. */
export function preloadAccountIntro(): void {
  void import("./account-intro").catch(() => undefined);
}

/** Filet de sécurité : si l'intro ne se charge pas (réseau coupé), on n'attend pas plus. */
const FAILSAFE_MS = 10_000;

interface IntroOverlayProps {
  /** Contexte audio débloqué au clic ; `undefined` : l'intro essaie seule (souvent muette). */
  audio?: AudioContext | null;
  onDone: () => void;
  /** Le voile apparaît en fondu (inscription) ou d'emblée (arrivée après Google, déjà rendu par le serveur). */
  appear?: "fade" | "instant";
  /** Fin de l'intro : le voile s'efface en fondu et laisse voir la page. */
  exiting?: boolean;
}

export function IntroOverlay({ audio, onDone, appear = "fade", exiting = false }: IntroOverlayProps) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const doneRef = useRef(false);
  // Voile créé côté navigateur (inscription) : directement sous <body>. Voile
  // rendu par le serveur (arrivée après Google) : d'abord en place, pour que
  // l'hydratation retrouve le même HTML, puis déplacé au montage.
  const [mounted, setMounted] = useState(() => appear === "fade" && typeof document !== "undefined");

  useEffect(() => {
    setMounted(true);
    const id = window.setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    }, FAILSAFE_MS);
    return () => window.clearTimeout(id);
  }, []);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  const node = (
    <div className={clsx("nb-intro-cover", appear === "instant" && "nb-intro-cover--instant", exiting && "nb-intro-cover--exit")}>
      {mounted && <AccountIntro audio={audio} onDone={finish} />}
    </div>
  );
  // Sous <body> : aucun parent (animation, transformation) ne peut décaler ce
  // calque plein écran.
  return mounted ? createPortal(node, document.body) : node;
}
