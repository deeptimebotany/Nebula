"use client";

// Petite présentation "page par page" affichée dès l'arrivée sur le site,
// dans un bloc glassmorphism (fond flou) — permet de comprendre en quelques
// clics ce que permet Nebula sans avoir à créer de compte.

import { useState } from "react";
import { clsx } from "@/lib/clsx";

interface Slide {
  eyebrow: string;
  title: string;
  desc: string;
  accent: string;
}

const SLIDES: Slide[] = [
  {
    eyebrow: "1. Composer",
    title: "Un post, tous vos réseaux",
    desc: "Un média, un titre, une description — adaptez le texte par plateforme si besoin, avec un bouton IA sur chaque champ (titre YouTube, légende Instagram...).",
    accent: "from-nebula-500 to-accent-cyan"
  },
  {
    eyebrow: "2. Calendrier",
    title: "Planifiez, publiez, dupliquez",
    desc: "Programmez vos publications à l'avance sur un calendrier visuel. Un post resté bloqué ? Dupliquez-le en un clic pour retenter l'envoi, sans tout ressaisir.",
    accent: "from-accent-violet to-nebula-500"
  },
  {
    eyebrow: "3. Comptes & analytics",
    title: "Plusieurs comptes, une seule vue",
    desc: "Connectez plusieurs comptes Instagram, pages Facebook ou chaînes par réseau, et suivez abonnés, portée et engagement dans un cockpit unique.",
    accent: "from-accent-cyan to-aurora-400"
  },
  {
    eyebrow: "4. Assistant IA",
    title: "Un assistant qui connaît vos stats",
    desc: "Chat intégré pour vous aider à utiliser le site, génération de titres/légendes, miniatures extraites de vos vidéos, et analyse de rétention façon YouTube Studio.",
    accent: "from-aurora-400 to-accent-magenta"
  },
  {
    eyebrow: "5. Paliers",
    title: "Gratuit pour commencer, illimité pour grandir",
    desc: "1 marque, 4 comptes et 20 publications par mois offerts. Passez Pro pour l'IA et plusieurs marques, ou Agence pour l'illimité et la publication en masse — au mois ou à l'année, en choisissant combien de marques vous voulez gérer.",
    accent: "from-accent-magenta to-nebula-500"
  }
];

export function OnboardingCarousel() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  function go(delta: number) {
    setIndex((v) => (v + delta + SLIDES.length) % SLIDES.length);
  }

  return (
    <div className="relative mx-auto mt-12 max-w-2xl">
      <div className="absolute inset-0 -z-10 rounded-[28px] bg-aurora-radial blur-2xl" />
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-1 shadow-glow-lg backdrop-blur-2xl">
        <div className="relative overflow-hidden rounded-[24px] bg-void-900/60 px-6 py-8 sm:px-10 sm:py-10">
          <div className={clsx("pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br opacity-20 blur-3xl", slide.accent)} />

          <div key={index} className="relative animate-fade-in-up text-left">
            <span className="text-xs font-medium uppercase tracking-wider text-aurora-300">{slide.eyebrow}</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-white sm:text-2xl">{slide.title}</h3>
            <p className="mt-3 max-w-lg text-sm text-slate-400 sm:text-base">{slide.desc}</p>
          </div>

          <div className="relative mt-7 flex items-center justify-between">
            <button
              onClick={() => go(-1)}
              aria-label="Slide précédente"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-aurora-400/50 hover:text-white"
            >
              ←
            </button>

            <div className="flex items-center gap-1.5">
              {SLIDES.map((s, i) => (
                <button
                  key={s.title}
                  onClick={() => setIndex(i)}
                  aria-label={`Aller à la slide ${i + 1}`}
                  className={clsx(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-6 bg-aurora-400" : "w-1.5 bg-white/15 hover:bg-white/30"
                  )}
                />
              ))}
            </div>

            <button
              onClick={() => go(1)}
              aria-label="Slide suivante"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-aurora-400/50 hover:text-white"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
