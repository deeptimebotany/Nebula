// Canva (lot 3, 25/09/2026) — API « Connect » officielle, gratuite.
// Doc : https://www.canva.dev/docs/connect/
//
// Prérequis (côté Lucas) : créer une intégration sur canva.com/developers,
// scopes design:meta:read, design:content:read et profile:read, URL de
// retour <site>/api/integrations/canva/callback, puis renseigner
// CANVA_CLIENT_ID / CANVA_CLIENT_SECRET. Tant que Canva n'a pas validé
// l'intégration (« Submit for review »), seul son créateur peut la relier.
//
// Fonctionnement : la personne relie son compte Canva une fois (OAuth avec
// PKCE), choisit un design dans Publier, Nebula lance l'export (PNG ou MP4)
// et récupère le fichier quand il est prêt.
import type { ZodType, ZodTypeDef } from "zod";
import { idSchema, opt, soft, textSchema, z } from "@/lib/social/contract";
import { integrationRedirectUri } from "./config";
import { ImportError } from "./errors";
import { importJson, tokenRefusal } from "./http";
import type { TokenSet } from "./oauth-accounts";

const AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const API = "https://api.canva.com/rest/v1";
export const CANVA_SCOPES = ["design:meta:read", "design:content:read", "profile:read"];

// --- Contrat des réponses (lot 8, voir social/contract.ts) -------------------
// Doc : https://www.canva.dev/docs/connect/api-reference/ (oauth/token,
//       users/me/profile, designs, exports). Réponses types : tests/contracts/fixtures/canva.
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: opt(z.string().min(1)), expires_in: soft(z.number()) });
const designSchema = z.object({
  id: idSchema,
  title: textSchema,
  thumbnail: soft(z.object({ url: z.string(), width: soft(z.number()), height: soft(z.number()) })),
  updated_at: soft(z.number())
});
const jobSchema = z.object({
  job: z.object({
    id: idSchema,
    status: z.enum(["in_progress", "success", "failed"]),
    urls: opt(z.array(z.string().url())),
    error: soft(z.object({ code: textSchema, message: textSchema }))
  })
});

function creds() {
  const id = process.env.CANVA_CLIENT_ID;
  const secret = process.env.CANVA_CLIENT_SECRET;
  if (!id || !secret) throw new ImportError("Canva n'est pas configuré.", 503);
  return { id, secret };
}

export function canvaAuthUrl(state: string, challenge: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", creds().id);
  url.searchParams.set("redirect_uri", integrationRedirectUri("canva"));
  url.searchParams.set("scope", CANVA_SCOPES.join(" "));
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const { id, secret } = creds();
  const json = await importJson(
    "CANVA",
    `${API}/oauth/token`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      schema: tokenSchema
    },
    tokenRefusal("CANVA")
  );
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

export function exchangeCanvaCode(code: string, verifier: string) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: integrationRedirectUri("canva") });
}

export function refreshCanvaToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

function api<T>(token: string, path: string, schema: ZodType<T, ZodTypeDef, unknown>, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  return importJson("CANVA", `${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    schema
  });
}

export async function canvaDisplayName(token: string): Promise<string | null> {
  const me = await api(token, "/users/me/profile", z.object({ profile: soft(z.object({ display_name: textSchema })) })).catch(() => null);
  return me?.profile?.display_name ?? null;
}

export interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  updatedAt: string | null;
}

export async function listCanvaDesigns(token: string, opts: { query?: string; continuation?: string }): Promise<{ designs: CanvaDesign[]; continuation: string | null }> {
  const params = new URLSearchParams({ ownership: "any", sort_by: "modified_descending" });
  if (opts.query) params.set("query", opts.query);
  if (opts.continuation) params.set("continuation", opts.continuation);
  const data = await api(token, `/designs?${params.toString()}`, z.object({ items: z.array(designSchema), continuation: textSchema }));
  return {
    designs: data.items.map((d) => ({
      id: d.id,
      title: d.title || "Sans titre",
      thumbnailUrl: d.thumbnail?.url ?? null,
      width: d.thumbnail?.width ?? null,
      height: d.thumbnail?.height ?? null,
      updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null
    })),
    continuation: data.continuation ?? null
  };
}

/** Lance l'export de la première page d'un design, en image (PNG) ou en vidéo (MP4). */
export async function startCanvaExport(token: string, designId: string, kind: "image" | "video", portrait: boolean): Promise<string> {
  const format = kind === "video" ? { type: "mp4", quality: portrait ? "vertical_1080p" : "horizontal_1080p", pages: [1] } : { type: "png", pages: [1] };
  const data = await api(token, "/exports", jobSchema, { method: "POST", body: { design_id: designId, format } });
  return data.job.id;
}

export async function getCanvaExport(token: string, jobId: string): Promise<{ status: "in_progress" | "success" | "failed"; urls: string[]; error?: string }> {
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(jobId)) throw new ImportError("Export introuvable.", 404);
  const data = await api(token, `/exports/${jobId}`, jobSchema);
  return { status: data.job.status, urls: data.job.urls ?? [], error: data.job.error?.message };
}
