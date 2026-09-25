// Rappels de Meta (lot 2) : quand une personne retire l'application Nebula
// de ses réglages Facebook, Instagram ou Threads, Meta appelle :
//  - /api/meta/deauthorize : l'accès est retiré → on déconnecte ses comptes ;
//  - /api/meta/data-deletion : elle demande l'effacement de ses données →
//    on déconnecte, on efface les jetons et les données synchronisées
//    (statistiques, commentaires, métriques), et on renvoie un code de suivi.
// Ces deux adresses sont exigées par Meta pour la validation de l'application.
//
// Meta signe la requête (signed_request) avec la clé secrète de l'app :
// signature HMAC-SHA256 vérifiée ici en temps constant.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export type MetaApp = "meta" | "threads";

interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

function secretFor(app: MetaApp): string | undefined {
  return app === "threads" ? process.env.THREADS_APP_SECRET : process.env.META_APP_SECRET;
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function parseSignedRequest(signedRequest: string, secret: string): SignedRequestPayload | null {
  const [signature, payload] = signedRequest.split(".", 2);
  if (!signature || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = fromBase64Url(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(fromBase64Url(payload).toString("utf8")) as SignedRequestPayload;
    if (typeof data.algorithm !== "string" || data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return data;
  } catch {
    return null;
  }
}

/** Lit et vérifie le signed_request d'un rappel Meta (formulaire POST). */
export async function readSignedRequest(req: Request, app: MetaApp): Promise<SignedRequestPayload | null> {
  const secret = secretFor(app);
  if (!secret) return null;
  const form = await req.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string" || signed.length > 4000) return null;
  const payload = parseSignedRequest(signed, secret);
  return payload?.user_id ? payload : null;
}

function connectionsFilter(app: MetaApp, userId: string) {
  return app === "threads"
    ? { network: "THREADS", OR: [{ authUserId: userId }, { externalAccountId: userId }] }
    : { network: { in: ["FACEBOOK", "INSTAGRAM"] }, authUserId: userId };
}

/** Accès retiré chez Meta : les comptes de cette personne sont déconnectés et leurs jetons effacés. */
export async function handleDeauthorize(app: MetaApp, userId: string): Promise<number> {
  const { count } = await prisma.socialConnection.updateMany({
    where: connectionsFilter(app, userId),
    data: {
      status: "DISCONNECTED",
      accessToken: "",
      refreshToken: null,
      tokenExpiresAt: null,
      lastError: "Accès retiré depuis les réglages du réseau."
    }
  });
  return count;
}

/** Demande d'effacement : déconnexion + suppression des données synchronisées. Renvoie le code de suivi. */
export async function handleDataDeletion(app: MetaApp, userId: string): Promise<{ code: string; connections: number }> {
  const code = randomBytes(8).toString("hex").toUpperCase();
  await prisma.dataDeletionRequest.create({ data: { id: code, provider: app === "threads" ? "THREADS" : "META" } });
  const rows = await prisma.socialConnection.findMany({ where: connectionsFilter(app, userId), select: { id: true } });
  const ids = rows.map((r: { id: string }) => r.id);
  if (ids.length) {
    await prisma.$transaction([
      prisma.analyticsSnapshot.deleteMany({ where: { connectionId: { in: ids } } }),
      prisma.videoInsight.deleteMany({ where: { connectionId: { in: ids } } }),
      prisma.engagementItem.deleteMany({ where: { connectionId: { in: ids } } }),
      prisma.postMetric.deleteMany({ where: { connectionId: { in: ids } } }),
      // La ligne de connexion est gardée (anonymisée) pour ne pas effacer
      // l'historique des publications faites depuis Nebula.
      prisma.socialConnection.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "DISCONNECTED",
          accessToken: "",
          refreshToken: null,
          tokenExpiresAt: null,
          displayName: "Compte supprimé",
          handle: null,
          avatarUrl: null,
          authUserId: null,
          lastError: "Données supprimées à la demande de la personne."
        }
      })
    ]);
  }
  await prisma.dataDeletionRequest.update({ where: { id: code }, data: { status: "COMPLETED", connections: ids.length, completedAt: new Date() } });
  return { code, connections: ids.length };
}
