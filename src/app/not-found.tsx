"use client";

// Page 404 — un vaisseau perdu qui dérive dans le vide, plutôt qu'un message
// d'erreur générique. Rendue pour toute route qui ne correspond à rien
// (publique ou dans le tableau de bord), et déjà entourée par <Providers>
// depuis le layout racine, donc le thème de couleurs choisi s'applique aussi
// ici.
//
// Le texte d'ambiance change à chaque visite (tiré au hasard côté client
// seulement, après le montage, pour ne jamais désynchroniser le rendu
// serveur/client) et le champ d'étoiles est généré par une fonction
// déterministe (pas Math.random() direct) pour la même raison.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const FLAVOR_TEXTS = [
  "Ce vaisseau a dérivé hors des cartes connues de Nebula.",
  "Aucun signal sur cette fréquence — la page a peut-être été déplacée, renommée, ou n'a jamais existé.",
  "Vous avez franchi les limites de la carte. Rien à signaler ici, à part du vide.",
  "Erreur de navigation stellaire : cette coordonnée ne correspond à aucune page connue.",
  "Le radar ne détecte rien à cet endroit. Retour à la base recommandé.",
  "Un trou noir a peut-être englouti cette page. Ou alors l'adresse est simplement fausse.",
  "Transmission perdue. Cette page ne répond plus depuis un certain temps déjà."
];

// Positions/tailles/délais des étoiles décoratives, calculés à partir de
// l'index (jamais de Math.random() direct) pour un rendu identique côté
// serveur et client — évite tout avertissement d'hydratation.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 999.37) * 10000;
  return x - Math.floor(x);
}

const STAR_COUNT = 70;
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => ({
  top: pseudoRandom(i * 3 + 1) * 100,
  left: pseudoRandom(i * 3 + 2) * 100,
  size: 1 + pseudoRandom(i * 3 + 3) * 2,
  delay: pseudoRandom(i * 7 + 5) * 4,
  duration: 2 + pseudoRandom(i * 11 + 9) * 3
}));

export default function NotFound() {
  const [flavorIndex, setFlavorIndex] = useState(0);

  useEffect(() => {
    setFlavorIndex(Math.floor(Math.random() * FLAVOR_TEXTS.length));
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#02040a] px-6 py-16">
      <div aria-hidden="true" className="absolute inset-0">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              opacity: 0.6,
              animation: `nebula-404-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 30%, rgb(var(--c-nebula-500) / 0.18), transparent 60%)"
          }}
        />
      </div>

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <div
          aria-hidden="true"
          className="mb-6 text-6xl"
          style={{ animation: "nebula-404-drift 5s ease-in-out infinite" }}
        >
          🛰️
        </div>

        <h1 className="text-gradient font-display text-7xl font-bold sm:text-8xl">404</h1>

        <p className="mt-4 text-lg font-medium text-white">Perdu dans l&apos;espace</p>
        <p className="mt-2 min-h-[3.5rem] text-sm text-slate-400">{FLAVOR_TEXTS[flavorIndex]}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button className="px-6 py-3">Retour à la base</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="px-6 py-3">
              Page d&apos;accueil
            </Button>
          </Link>
        </div>

        {/* Easter egg discret : visible seulement pour qui ouvre le code
            source de cette page précise. */}
        <div
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html: "<!-- Même perdu dans le vide, Nebula garde le sens de l'humour. -->"
          }}
        />
      </div>

      <style jsx>{`
        @keyframes nebula-404-twinkle {
          0%,
          100% {
            opacity: 0.15;
            transform: scale(0.85);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.15);
          }
        }
        @keyframes nebula-404-drift {
          0%,
          100% {
            transform: translate(0, 0) rotate(-4deg);
          }
          50% {
            transform: translate(0, -14px) rotate(4deg);
          }
        }
      `}</style>
    </div>
  );
}
