// Audit de présence — source TikTok : oEmbed public des profils (sans clé).
// Il confirme l'existence du compte et donne son nom affiché et sa
// description. TikTok ne publie AUCUNE statistique sans connexion du compte
// (abonnés, vues) : le rapport le dit, et c'est un argument pour connecter
// le compte à Nebula. Pas de lecture de la page HTML (fragile, contraire
// aux conditions de TikTok).
//
// Doc : https://developers.tiktok.com/doc/embed-creator-profiles
// Réponses types : tests/contracts/fixtures/audit.
import { SocialApiError, fetchJson } from "@/lib/social/base";
import { textSchema, z } from "@/lib/social/contract";
import type { SourceOutcome, TiktokFacts } from "../types";

const oembedSchema = z.object({
  author_name: textSchema,
  author_url: textSchema,
  author_unique_id: textSchema,
  title: textSchema
});

export async function auditTiktok(username: string, timeoutMs = 6_000): Promise<SourceOutcome<TiktokFacts>> {
  const profile = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  try {
    const data = await fetchJson("TIKTOK", `https://www.tiktok.com/oembed?url=${encodeURIComponent(profile)}`, { cache: "no-store", timeoutMs, schema: oembedSchema });
    if (!data.author_name && !data.author_url) return { status: "not_found", message: "Aucun compte TikTok public ne correspond à ce pseudo." };
    return {
      status: "ok",
      facts: {
        username: data.author_unique_id || username,
        displayName: data.author_name?.trim() || null,
        bio: data.title?.trim() || null,
        url: data.author_url || profile
      }
    };
  } catch (err) {
    if (err instanceof SocialApiError && err.status !== undefined && err.status >= 400 && err.status < 500 && err.status !== 429) {
      return { status: "not_found", message: "Aucun compte TikTok public ne correspond à ce pseudo (ou le compte est privé)." };
    }
    console.warn("[audit] TikTok :", (err as Error).message);
    return { status: "unavailable", message: "TikTok n'a pas répondu à temps : réessayez dans un instant." };
  }
}
