"use client";

// Preuve sociale dynamique (page d'accueil, Hero) : une notification
// discrète en bas à gauche + un compteur d'heures économisées cumulées.
// Entièrement basée sur /api/public/social-proof, qui calcule ces chiffres
// à partir des VRAIES publications de l'instance (voir ce fichier route.ts
// pour le détail de l'anonymisation et de l'hypothèse de calcul) — jamais
// un exemple inventé ou un chiffre statique codé en dur.

import { useEffect, useState } from "react";
import { IconSparkle } from "@/components/dashboard/icons";

interface SocialProofData {
  hasActivity: boolean;
  network?: string;
  networkLabel?: string;
  action?: string;
  minutesAgo?: number;
  savedHours: number;
}

function formatMinutesAgo(minutes: number): string {
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export function SocialProof() {
  const [data, setData] = useState<SocialProofData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/public/social-proof")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return null;

  return (
    <>
      {data.savedHours > 0 && (
        <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-3.5 py-1.5 text-xs text-emerald-200">
          <IconSparkle className="h-3.5 w-3.5" />
          ≈ {data.savedHours.toLocaleString("fr-FR")} heures économisées au total par les utilisateurs de Nebula
        </div>
      )}

      {data.hasActivity && !dismissed && (
        <div className="fixed bottom-5 left-5 z-40 max-w-xs animate-fade-in-up">
          <div className="glass-panel-solid flex items-start gap-2.5 rounded-2xl p-3.5 pr-8 shadow-lg">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            <p className="text-xs leading-relaxed text-slate-200">
              Un utilisateur {data.action} un post <span className="font-medium text-white">{data.networkLabel}</span>{" "}
              <span className="text-slate-500">· {formatMinutesAgo(data.minutesAgo ?? 0)}</span>
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="absolute right-2.5 top-2.5 text-slate-500 transition hover:text-white"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
