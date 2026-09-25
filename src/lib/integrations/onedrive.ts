// OneDrive (lot 3, 25/09/2026) — Microsoft Graph, gratuit.
//
// Prérequis (côté Lucas) : inscrire une application sur portal.azure.com
// (Microsoft Entra ID → Inscriptions d'applications), type de comptes
// « comptes personnels Microsoft et comptes professionnels », URL de retour
// Web <site>/api/integrations/onedrive/callback, créer un secret client,
// autorisations déléguées Files.Read, User.Read et offline_access, puis
// renseigner ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET.
//
// Plutôt que le sélecteur de fichiers de Microsoft (lourd à intégrer),
// Nebula affiche lui-même les dossiers et fichiers du OneDrive relié.
import type { ZodType, ZodTypeDef } from "zod";
import { idSchema, opt, soft, textSchema, z } from "@/lib/social/contract";
import { integrationRedirectUri } from "./config";
import { ImportError } from "./errors";
import { importJson, tokenRefusal } from "./http";
import type { TokenSet } from "./oauth-accounts";

const LOGIN = "https://login.microsoftonline.com/common/oauth2/v2.0";
export const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["offline_access", "User.Read", "Files.Read"];

function creds() {
  const id = process.env.ONEDRIVE_CLIENT_ID;
  const secret = process.env.ONEDRIVE_CLIENT_SECRET;
  if (!id || !secret) throw new ImportError("OneDrive n'est pas configuré.", 503);
  return { id, secret };
}

export function oneDriveAuthUrl(state: string): string {
  const url = new URL(`${LOGIN}/authorize`);
  url.searchParams.set("client_id", creds().id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", integrationRedirectUri("onedrive"));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

// --- Contrat des réponses (lot 8, voir social/contract.ts) -------------------
// Doc : https://learn.microsoft.com/graph/api/driveitem-list-children et
//       https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
// Réponses types : tests/contracts/fixtures/onedrive.
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: opt(z.string().min(1)), expires_in: soft(z.number()) });
const itemSchema = z.object({
  id: idSchema,
  name: z.string(),
  size: soft(z.number()),
  folder: soft(z.object({ childCount: soft(z.number()) })),
  file: soft(z.object({ mimeType: textSchema })),
  image: soft(z.object({}).passthrough()),
  video: soft(z.object({}).passthrough()),
  thumbnails: soft(z.array(z.object({ medium: soft(z.object({ url: z.string() })), large: soft(z.object({ url: z.string() })) })))
});
type GraphItem = z.output<typeof itemSchema>;

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const { id, secret } = creds();
  const json = await importJson(
    "ONEDRIVE",
    `${LOGIN}/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, scope: SCOPES.join(" "), redirect_uri: integrationRedirectUri("onedrive"), ...body }),
      schema: tokenSchema
    },
    tokenRefusal("ONEDRIVE")
  );
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

export const exchangeOneDriveCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code });
export const refreshOneDriveToken = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

function graph<T>(token: string, path: string, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  return importJson("ONEDRIVE", `${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` }, schema });
}

export async function oneDriveDisplayName(token: string): Promise<string | null> {
  const me = await graph(token, "/me", z.object({ displayName: textSchema, userPrincipalName: textSchema })).catch(() => null);
  return me?.displayName || me?.userPrincipalName || null;
}

export interface OneDriveItem {
  id: string;
  name: string;
  kind: "folder" | "image" | "video" | "other";
  childCount?: number;
  thumbnailUrl: string | null;
  size: number;
  mimeType: string | null;
}

function toItem(i: GraphItem): OneDriveItem {
  const mime = i.file?.mimeType ?? null;
  const kind: OneDriveItem["kind"] = i.folder ? "folder" : i.video || mime?.startsWith("video/") ? "video" : i.image || mime?.startsWith("image/") ? "image" : "other";
  return { id: i.id, name: i.name, kind, childCount: i.folder?.childCount, thumbnailUrl: i.thumbnails?.[0]?.medium?.url ?? null, size: i.size ?? 0, mimeType: mime };
}

const SELECT = "$expand=thumbnails&$select=id,name,size,folder,file,image,video&$top=200";

export async function listOneDrive(token: string, opts: { folderId?: string; query?: string }): Promise<OneDriveItem[]> {
  if (opts.folderId && !/^[A-Za-z0-9!_.-]{1,200}$/.test(opts.folderId)) throw new ImportError("Dossier introuvable.", 404);
  const path = opts.query
    ? `/me/drive/root/search(q='${encodeURIComponent(opts.query.replace(/'/g, "''"))}')?${SELECT}`
    : opts.folderId
      ? `/me/drive/items/${opts.folderId}/children?${SELECT}`
      : `/me/drive/root/children?${SELECT}`;
  // Liste stricte : « value » obligatoire (Microsoft Graph renvoie [] pour un dossier vide).
  const data = await graph(token, path, z.object({ value: z.array(itemSchema) }));
  const items = data.value.map(toItem).filter((i) => i.kind !== "other");
  return items.sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || a.name.localeCompare(b.name, "fr"));
}

export async function oneDriveItem(token: string, id: string): Promise<OneDriveItem> {
  if (!/^[A-Za-z0-9!_.-]{1,200}$/.test(id)) throw new ImportError("Fichier introuvable.", 404);
  return toItem(await graph(token, `/me/drive/items/${id}?$select=id,name,size,folder,file,image,video`, itemSchema));
}
