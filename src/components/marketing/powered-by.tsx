// Crédit « Propulsé par Nebula » des pages partagées avec des tiers (rapport
// client, calendrier client, lien d'approbation, page « link in bio »).
// Décision de Lucas : ce crédit reste affiché sans condition (pas de marque
// blanche sur les pages publiques). Avant ce composant il était en
// text-slate-600 / text-white/30 (quasi invisible) et jamais cliquable —
// c'est pourtant la seule porte d'entrée vers Nebula pour le client d'une
// agence qui découvre le service par ce biais.
import Link from "next/link";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";
import { clsx } from "@/lib/clsx";

export function PoweredByNebula({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <p className={clsx("flex justify-center", className)}>
      <Link
        href="/"
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
          tone === "dark"
            ? "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
            : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
        )}
      >
        <NebulaIcon size={16} />
        Propulsé par <span className="font-semibold">Nebula</span>
      </Link>
    </p>
  );
}
