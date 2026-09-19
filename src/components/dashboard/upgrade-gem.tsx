"use client";

import { useId } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";

// Gemme dégradée + lueur, dans les couleurs du design system (nebula →
// aurora), pour évoquer la mise à niveau d'abonnement sans recourir à
// l'emoji 💎. useId() évite les collisions d'ids de <linearGradient> quand
// plusieurs instances apparaissent sur la même page (topnav + cartes de
// quota, par ex.).
export function UpgradeGem({ className = "h-4 w-4" }: { className?: string }) {
  const id = useId();
  const gradId = `upgrade-gem-${id}`;
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7ee3ff" />
          <stop offset="55%" stopColor="#8b7bff" />
          <stop offset="100%" stopColor="#d68bff" />
        </linearGradient>
      </defs>
      <path
        d="M8.5 3.5h7L19.5 9 12 20.5 4.5 9l4-5.5Z"
        fill={`url(#${gradId})`}
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 9h15M9.2 3.5 7.6 9 12 20.5M14.8 3.5 16.4 9l-4.4 11.5"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Bouton/CTA de mise à niveau réutilisable — pilule dégradée fine avec la
// gemme, remplace l'ancien bouton "💎" texte brut partout dans l'app
// (topnav, cartes de quota atteint, verrouillage d'une marque en plus...).
export function UpgradeButton({
  className,
  size = "md",
  label = "Mettre à jour votre plan"
}: {
  className?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <Link
      href="/billing"
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-nebula-500 via-[#8b7bff] to-accent-cyan font-semibold text-white shadow-glow transition hover:brightness-110",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        className
      )}
    >
      <UpgradeGem className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </Link>
  );
}

// Petit badge verrouillé (gemme grisée + cadenas discret) pour indiquer
// qu'une action (ajouter une marque, un compte...) est bloquée par le
// palier actuel, avec lien direct vers Facturation.
export function LockedUpgradeBadge({ label = "Passer à un palier supérieur" }: { label?: string }) {
  return (
    <Link
      href="/billing"
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-aurora-400/40 hover:text-white"
    >
      <UpgradeGem className="h-3.5 w-3.5 opacity-80" />
      {label}
    </Link>
  );
}
