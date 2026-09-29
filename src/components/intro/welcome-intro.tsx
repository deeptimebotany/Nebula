"use client";

// Arrivée sur le tableau de bord juste après une inscription Google / Apple /
// Facebook (cookie nb_welcome, voir lib/intro/welcome.ts) : l'intro se joue
// une fois par-dessus la page, qui se charge derrière, puis s'efface en fondu.
// Pas de clic juste avant (retour du fournisseur) : le navigateur bloque en
// général le son, l'intro est alors muette.

import { useEffect, useState } from "react";
import { WELCOME_INTRO_COOKIE } from "@/lib/intro/welcome";
import { IntroOverlay } from "./intro-overlay";

function forgetWelcomeCookie() {
  document.cookie = `${WELCOME_INTRO_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function WelcomeIntro() {
  const [phase, setPhase] = useState<"play" | "exit" | "gone">("play");

  // Cookie effacé à la FIN de l'intro (pas au début) : si la mise en page
  // était recalculée par le serveur pendant l'animation, elle garderait
  // l'intro au lieu de la couper net. Effacé aussi si le composant disparaît.
  useEffect(() => forgetWelcomeCookie, []);

  useEffect(() => {
    if (phase !== "exit") return;
    forgetWelcomeCookie();
    const id = window.setTimeout(() => setPhase("gone"), 750);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;
  return <IntroOverlay appear="instant" exiting={phase === "exit"} onDone={() => setPhase("exit")} />;
}
