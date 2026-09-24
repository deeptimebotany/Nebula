"use client";

// Voile plein écran affiché pendant l'envoi d'une publication (voir
// composer/page.tsx :: onSubmit, état `submitting`). Demande explicite :
// tant que « Envoi... » est grisé, TOUTE la page doit l'être — plus aucun
// bloc (Média, Titre, Réseaux cibles...) ne doit être utilisable, avec un
// léger flou et un indicateur de chargement soigné, pour qu'on comprenne
// tout de suite que ça travaille et qu'il ne faut pas toucher.
//
// Pourquoi un vrai voile plutôt que juste désactiver les champs : lors d'une
// publication immédiate, le serveur envoie le fichier vers YouTube/TikTok…
// pendant parfois une à deux minutes. Modifier le formulaire à ce moment-là
// n'aurait aucun effet (les données sont déjà parties) et donnait
// l'impression que le site avait planté. Ici on occupe l'attente
// honnêtement : une « mise en orbite » (les logos des réseaux ciblés
// gravitent autour de la marque Nebula, dans l'esprit cockpit spatial du
// reste du site), des messages d'étape qui tournent, un chrono, et une
// consigne claire de ne pas fermer l'onglet.
//
// Monté via un portail sur <body> (au-dessus du menu latéral et de la barre
// du haut, z-[80] > modales z-40), verrouille le défilement de la page et
// bloque Tab pour qu'on ne puisse pas non plus atteindre un champ au
// clavier. Fonctionne dans les deux modes (sombre/clair) : le fond adapte
// sa teinte via la classe .publish-overlay-backdrop (globals.css).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NETWORK_META, type Network } from "@/lib/types";
import { NetworkLogo } from "@/components/ui/network-badge";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";

interface PublishOverlayProps {
  active: boolean;
  networks: Network[];
  /** "now" : publication immédiate (envoi réel du fichier), "date" : simple programmation. */
  mode: "now" | "date";
  mediaType?: "VIDEO" | "IMAGE";
}

function joinLabels(networks: Network[]): string {
  const labels = networks.map((n) => NETWORK_META[n].label);
  if (labels.length <= 1) return labels[0] ?? "vos réseaux";
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

function buildSteps(networks: Network[], mode: "now" | "date", mediaType: "VIDEO" | "IMAGE"): string[] {
  const media = mediaType === "VIDEO" ? "de la vidéo" : "de l'image";
  if (mode === "date") {
    return ["Enregistrement de la publication…", "Programmation de l'envoi automatique…", "Presque terminé…"];
  }
  return [
    "Préparation de votre publication…",
    `Envoi ${media} vers ${joinLabels(networks)}…`,
    "Selon la taille du fichier, ça peut prendre une à deux minutes.",
    `Vérification côté ${joinLabels(networks)}…`,
    "Ne fermez pas cet onglet tant que l'envoi n'est pas terminé."
  ];
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PublishOverlay({ active, networks, mode, mediaType = "VIDEO" }: PublishOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Défilement de page verrouillé + Tab bloqué + focus déplacé dans le voile :
  // rien en dessous ne doit rester atteignable, ni à la souris ni au clavier.
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab") e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active]);

  // Messages d'étape qui tournent + chrono — remis à zéro à chaque envoi.
  useEffect(() => {
    if (!active) return;
    setStepIndex(0);
    setElapsed(0);
    const stepTimer = window.setInterval(() => setStepIndex((i) => i + 1), 3500);
    const clock = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(clock);
    };
  }, [active]);

  if (!active || typeof document === "undefined") return null;

  const steps = buildSteps(networks, mode, mediaType);
  const step = steps[stepIndex % steps.length];
  const orbiting = networks.length > 0 ? networks : (["YOUTUBE"] as Network[]);

  return createPortal(
    <div
      className="publish-overlay-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label="Envoi de la publication en cours"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="glass-panel relative w-full max-w-md rounded-3xl px-8 py-9 text-center shadow-glow-lg outline-none animate-fade-in-up"
      >
        {/* Halo d'ambiance derrière la carte */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-nebula-mesh opacity-70 blur-2xl" />

        {/* --- Mise en orbite : anneau conique + orbite des réseaux + cœur Nebula --- */}
        <div className="relative mx-auto h-44 w-44">
          {/* Anneau conique qui tourne (progression indéterminée) */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full animate-border-spin"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, rgb(var(--c-nebula-500) / 0.9) 25%, rgb(var(--c-accent-cyan) / 0.9) 50%, transparent 75%)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))"
            }}
          />
          {/* Anneau d'orbite fin, fixe */}
          <div aria-hidden className="absolute inset-[22px] rounded-full border border-dashed border-white/15" />

          {/* Orbite : le conteneur tourne (7 s), chaque logo est placé sur le
              cercle par une rotation fixe, puis contre-tourné (même durée,
              sens inverse) pour rester droit. Rotations fixe et animée sur des
              éléments séparés : une animation CSS écraserait un transform
              inline posé sur le même élément. */}
          <div aria-hidden className="absolute inset-[22px] animate-[orbit_7s_linear_infinite]">
            {orbiting.map((n, i) => {
              const meta = NETWORK_META[n];
              const angle = (360 / orbiting.length) * i;
              return (
                <div
                  key={n}
                  className="absolute left-1/2 top-1/2 h-0 w-0"
                  style={{ transform: `rotate(${angle}deg) translateY(-50px)` }}
                >
                  <div className="h-0 w-0" style={{ transform: `rotate(${-angle}deg)` }}>
                    <div className="h-0 w-0 animate-[orbit_7s_linear_infinite_reverse]">
                      <div
                        className="flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-void-800"
                        style={{ borderColor: `${meta.color}88`, boxShadow: `0 0 18px ${meta.glow}`, color: meta.color }}
                      >
                        <NetworkLogo network={n} className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cœur : marque Nebula qui respire */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 rounded-full bg-gradient-to-br from-nebula-500 to-accent-cyan opacity-40 blur-xl animate-pulse-slow"
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-nebula-600 to-nebula-900 shadow-glow animate-float">
                <NebulaIcon size={40} tone="onDark" />
              </div>
            </div>
          </div>
        </div>

        {/* --- Textes --- */}
        <h2 className="mt-6 font-display text-xl font-semibold text-white">
          {mode === "date" ? "Programmation en cours" : "Mise en orbite…"}
        </h2>
        <p key={stepIndex} className="mt-2 min-h-[2.5rem] text-sm text-slate-300 animate-fade-in">
          {step}
        </p>

        {/* Barre de progression indéterminée (shimmer) */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full w-full animate-shimmer rounded-full bg-[length:200%_100%]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, transparent 0%, rgb(var(--c-nebula-500)) 35%, rgb(var(--c-accent-cyan)) 50%, rgb(var(--c-nebula-500)) 65%, transparent 100%)"
            }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-cyan animate-tick-pulse" />
            Envoi en cours
          </span>
          <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          {mode === "date"
            ? "Vous serez redirigé vers la fiche de la publication dans un instant."
            : "Vous serez redirigé vers la fiche de la publication une fois l'envoi terminé."}
        </p>
      </div>
    </div>,
    document.body
  );
}
