"use client";

// Garde « Trop de comptes connectés » (09/10/2026, demande de Lucas) : quand
// la marque ouverte a plus de comptes que son palier n'en permet (fin
// d'essai, résiliation, palier inférieur), toute l'application est bloquée
// par une fenêtre qu'on ne peut pas fermer, jusqu'à ce que les comptes en
// trop soient déconnectés — ou qu'un abonnement soit pris. Seule la page
// Facturation reste ouverte, pour pouvoir payer.
//
// Léger sur toutes les pages : la vérification réutilise la consommation de
// la marque déjà chargée par la page Comptes et la Facturation
// (/api/billing/usage, même cache) ; la fenêtre n'est téléchargée que si la
// limite est dépassée. Règle côté serveur : src/lib/billing/connection-limit.ts.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useUsage } from "@/lib/data/hooks";

const ConnectionLimitDialog = dynamic(() => import("./connection-limit-dialog").then((m) => m.ConnectionLimitDialog), { ssr: false });

/** Pages laissées ouvertes malgré le dépassement (pour pouvoir payer). */
export const CONNECTION_LIMIT_OPEN_PATHS = ["/billing"];

interface UsageForLimit {
  connectionSlots: number;
  limits: { maxConnections: number };
}

export function ConnectionLimitGate() {
  const pathname = usePathname() ?? "";
  const { activeBrand } = useBrand();
  const { usage } = useUsage<UsageForLimit>(activeBrand?.id);
  const over = Boolean(usage && usage.connectionSlots > usage.limits.maxConnections);
  const open = CONNECTION_LIMIT_OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!over || open || !activeBrand) return null;
  return <ConnectionLimitDialog brandId={activeBrand.id} brandName={activeBrand.name} />;
}
