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
import { integrationRedirectUri } from "./config";
import { ImportError } from "./remote-media";
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

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const { id, secret } = creds();
  const res = await fetch(`${LOGIN}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: SCOPES.join(" "), redirect_uri: integrationRedirectUri("onedrive"), ...body }),
    cache: "no-store"
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new ImportError(json.error_description?.split("\r\n")[0] || `Microsoft a refusé la connexion (${res.status}).`, 502);
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

export const exchangeOneDriveCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code });
export const refreshOneDriveToken = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

async function graph<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401) throw new ImportError("Connexion OneDrive expirée : reliez à nouveau votre compte.", 401);
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new ImportError(json.error?.message || `OneDrive a répondu ${res.status}.`, 502);
  return json;
}

export async function oneDriveDisplayName(token: string): Promise<string | null> {
  const me = await graph<{ displayName?: string; userPrincipalName?: string }>(token, "/me").catch(() => null);
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

interface GraphItem {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount: number };
  file?: { mimeType?: string };
  image?: object;
  video?: object;
  thumbnails?: { medium?: { url: string }; large?: { url: string } }[];
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
  const data = await graph<{ value: GraphItem[] }>(token, path);
  const items = data.value.map(toItem).filter((i) => i.kind !== "other");
  return items.sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || a.name.localeCompare(b.name, "fr"));
}

export async function oneDriveItem(token: string, id: string): Promise<OneDriveItem> {
  if (!/^[A-Za-z0-9!_.-]{1,200}$/.test(id)) throw new ImportError("Fichier introuvable.", 404);
  return toItem(await graph<GraphItem>(token, `/me/drive/items/${id}?$select=id,name,size,folder,file,image,video`));
}
