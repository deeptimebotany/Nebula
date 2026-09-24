"use client";

// Crédit « Propulsé par Nebula » des pages partagées avec des tiers (rapport
// client, calendrier client, lien d'approbation, page « link in bio »).
// Décision de Lucas : ce crédit reste affiché sans condition (pas de marque
// blanche sur les pages publiques). Avant ce composant il était en
// text-slate-600 / text-white/30 (quasi invisible) et jamais cliquable —
// c'est pourtant la seule porte d'entrée vers Nebula pour le client d'une
// agence qui découvre le service par ce biais.
//
// Brief growth (lot G1.a) : le lien est maintenant TRACKÉ et RÉCOMPENSÉ.
//   - `surface` (bio / rapport / calendrier / approve) choisit la page
//     d'atterrissage : /decouvrir/page-bio ou /decouvrir/rapports-clients ;
//   - `via` (slug de la marque) voyage dans l'URL → cookie d'attribution du
//     middleware → User.acqVia à l'inscription → un mois de Pro offert à la
//     marque quand ce compte devient payant (src/lib/billing/rewards.ts) ;
//   - le clic envoie l'événement `badge_click` (surface, via).
// Le libellé et l'apparence ne changent pas.
import Link from "next/link";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";
import { clsx } from "@/lib/clsx";
import { trackGrowthEvent } from "@/lib/growth-client";

export type PublicSurface = "bio" | "rapport" | "calendrier" | "approve";

export function discoverUrl(surface: PublicSurface, via: string | null | undefined, medium: "badge" | "block"): string {
  const params = new URLSearchParams();
  if (via) params.set("via", via);
  params.set("utm_source", medium === "badge" ? "powered-by" : "public-page");
  params.set("utm_medium", medium);
  params.set("utm_campaign", surface);
  return `${surface === "bio" ? "/decouvrir/page-bio" : "/decouvrir/rapports-clients"}?${params.toString()}`;
}

export function PoweredByNebula({
  className,
  tone = "dark",
  surface,
  via
}: {
  className?: string;
  tone?: "dark" | "light";
  surface?: PublicSurface;
  via?: string | null;
}) {
  const href = surface ? discoverUrl(surface, via, "badge") : "/";
  return (
    <p className={clsx("flex justify-center", className)}>
      <Link
        href={href}
        onClick={() => surface && trackGrowthEvent("badge_click", { surface, via: via ?? "" })}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
          tone === "dark"
            ? "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
            : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
        )}
      >
        {/* tone "light" = badge posé sur le fond coloré d'une page bio : étoile
            blanche forcée ; tone "dark" suit le mode clair/sombre du site. */}
        <NebulaIcon size={16} tone={tone === "dark" ? "auto" : "onDark"} />
        Propulsé par <span className="font-semibold">Nebula</span>
      </Link>
    </p>
  );
}
