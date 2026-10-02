// Enregistrement d'un signal de dépréciation (veille des API, 02/10/2026) :
// une ligne par signal distinct, comptée à chaque nouvelle apparition ;
// alerte au propriétaire (cloche + e-mail) la première fois seulement.
// Chargé à la demande par signals.ts (jamais sur le chemin d'un appel).
import { prisma } from "@/lib/prisma";
import { alertOwnerWithEmail } from "./notify";
import type { ApiSignalInput } from "./signals";

const KIND_LABEL: Record<string, string> = {
  DEPRECATION: "adresse dépréciée",
  SUNSET: "date de retrait annoncée",
  VERSION_UPGRADED: "version d'API dépassée",
  WARNING: "avertissement de dépréciation"
};

export async function recordApiSignal(provider: string, endpoint: string, key: string, signal: ApiSignalInput): Promise<void> {
  const existing = await prisma.apiSignal.findUnique({ where: { key }, select: { id: true } });
  if (existing) {
    await prisma.apiSignal.update({ where: { key }, data: { lastSeenAt: new Date(), count: { increment: 1 }, ...(signal.sunsetAt ? { sunsetAt: signal.sunsetAt } : {}) } });
    return;
  }
  try {
    await prisma.apiSignal.create({ data: { key, provider, kind: signal.kind, endpoint: endpoint.slice(0, 300), detail: signal.detail, sunsetAt: signal.sunsetAt } });
  } catch {
    return; // enregistré au même moment par une autre instance : elle alerte
  }
  const when = signal.sunsetAt ? ` Retrait annoncé le ${signal.sunsetAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.` : "";
  await alertOwnerWithEmail({
    title: `${provider} : ${KIND_LABEL[signal.kind] ?? "changement d'API annoncé"}`,
    body: `${endpoint} — ${signal.detail}.${when} Détails et calendrier dans Veille des API.`,
    dedupeKey: `api-signal:${key}`.slice(0, 180)
  });
}
