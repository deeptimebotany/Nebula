// Alertes au propriétaire du site dans la cloche (lots 5 à 8) : incident
// chez un réseau, version d'API refusée, réponse d'un service dans un format
// inattendu (réseau social, régie publicitaire, source d'import).
// Jamais bloquant : une alerte qui échoue ne fait jamais échouer l'appel.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { OWNER_EMAIL } from "@/lib/owner";

export async function alertOwner(input: { title: string; body: string; dedupeKey: string; href?: string | null; actionLabel?: string | null }): Promise<void> {
  try {
    const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner) return;
    await notify(owner.id, { kind: "reminder", ...input });
  } catch (err) {
    console.error("[alerte propriétaire]", (err as Error).message);
  }
}

/**
 * Un service a répondu « OK » dans une forme qui ne respecte plus son
 * contrat (voir src/lib/social/contract.ts) : souvent un changement d'API.
 * Une seule alerte par service (remise en haut à chaque nouvel écart).
 */
export function alertOwnerFormatChange(
  label: string,
  dedupeKey: string,
  message: string,
  opts: { where?: string; href?: string; actionLabel?: string } = {}
): Promise<void> {
  return alertOwner({
    title: `${label} répond dans un nouveau format`,
    body: `${message} Le format de l'API a sans doute changé : forme reçue dans les journaux Vercel (ligne « [contrat] »), contrat à mettre à jour dans ${opts.where ?? "src/lib/social"}.`,
    dedupeKey,
    href: opts.href ?? null,
    actionLabel: opts.actionLabel ?? null
  });
}
