"use client";

// Bloc de conversion des pages à jeton (brief growth, lot G1.b) : une ligne
// et un bouton secondaire, placé SOUS le contenu et au-dessus du badge —
// jamais au-dessus du contenu client, jamais de modale. Le lien porte
// l'attribution (via + utm) et le clic envoie `conversion_block_click`.
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { trackGrowthEvent } from "@/lib/growth-client";
import { discoverUrl, type PublicSurface } from "./powered-by";

const COPY: Record<Exclude<PublicSurface, "bio">, (brand: string) => string> = {
  rapport: () => "Ce rapport est généré automatiquement par Nebula. Vous gérez aussi des comptes ? Obtenez le même rapport pour vos marques, gratuitement pour commencer.",
  calendrier: () => "Ce calendrier est partagé depuis Nebula. Planifiez vos propres publications avec le même outil.",
  approve: (brand) => `Vous validez les publications de ${brand} en un clic. Pour vos propres réseaux, Nebula programme, publie et mesure.`
};

export function PublicConversionBlock({
  surface,
  brandName,
  via,
  className
}: {
  surface: Exclude<PublicSurface, "bio">;
  brandName: string;
  via?: string | null;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="leading-relaxed">{COPY[surface](brandName)}</p>
      <Link
        href={discoverUrl(surface, via, "block")}
        onClick={() => trackGrowthEvent("conversion_block_click", { surface, via: via ?? "" })}
        className="shrink-0 rounded-xl border border-nebula-500/40 px-4 py-2 text-sm font-medium text-nebula-100 transition hover:border-aurora-400/60 hover:bg-nebula-900/40"
      >
        Découvrir Nebula
      </Link>
    </div>
  );
}
