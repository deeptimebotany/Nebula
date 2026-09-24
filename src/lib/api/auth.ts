// Authentification de l'API publique v1 (lot 4) : en-tête
// « Authorization: Bearer nbk_… ». Vérifie la clé (empreinte), qu'elle
// n'est pas révoquée, le palier Agence, la portée demandée et la limite de
// débit (120 requêtes par minute et par clé).
import { NextRequest, NextResponse } from "next/server";
import { apiKeyDb } from "@/lib/prisma-extra";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hashApiKey, looksLikeApiKey } from "./keys";
import { hasApiAccess } from "./access";

export interface ApiContext {
  userId: string;
  keyId: string;
  scopes: string[];
  brandId: string | null;
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...(extra ?? {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function authenticateApi(req: NextRequest, scope: "read" | "write"): Promise<{ ok: true; ctx: ApiContext } | { ok: false; res: NextResponse }> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!looksLikeApiKey(token)) {
    return { ok: false, res: apiError(401, "unauthorized", "Clé d'API manquante ou invalide. En-tête attendu : Authorization: Bearer nbk_…") };
  }
  const key = await apiKeyDb.findUnique({ where: { keyHash: hashApiKey(token) } });
  if (!key || key.revokedAt) return { ok: false, res: apiError(401, "unauthorized", "Clé d'API inconnue ou révoquée.") };

  const rate = await consumeRateLimit("api-v1", key.id, 120, 1);
  if (!rate.ok) {
    return { ok: false, res: apiError(429, "rate_limited", "Trop de requêtes : 120 par minute et par clé.", { retryAfterSeconds: rate.retryAfterSeconds }) };
  }
  if (!(await hasApiAccess(key.userId))) {
    return { ok: false, res: apiError(403, "plan_required", "L'API Nebula est réservée au palier Agence.") };
  }
  const scopes = key.scopes.split(",").map((s) => s.trim());
  if (!scopes.includes(scope)) {
    return { ok: false, res: apiError(403, "insufficient_scope", "Cette clé est en lecture seule : créez une clé « lecture et écriture » pour cette action.") };
  }
  // Date de dernière utilisation, mise à jour au plus toutes les 5 minutes.
  if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 5 * 60_000) {
    await apiKeyDb.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { ok: true, ctx: { userId: key.userId, keyId: key.id, scopes, brandId: key.brandId } };
}
