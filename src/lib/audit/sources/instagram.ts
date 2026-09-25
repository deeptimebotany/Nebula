// Audit de présence — source Instagram : « Business Discovery » de l'API
// Graph de Meta, appelée avec le compte Instagram professionnel du
// propriétaire du site (IG_DISCOVERY_USER_ID + IG_DISCOVERY_TOKEN, jeton
// utilisateur longue durée de l'app Meta de Nebula).
//
// Seuls les comptes PROFESSIONNELS (Créateur ou Entreprise) sont lisibles :
// un compte personnel répond « introuvable », et le rapport le dit (passer en
// compte professionnel est d'ailleurs un bon conseil). Limite de Meta : 200
// appels par heure pour le compte appelant. Jeton à renouveler tous les 60
// jours : s'il expire, Instagram passe en « indisponible » (le propriétaire
// est prévenu) sans casser l'outil.
//
// Doc : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
// Réponses types : tests/contracts/fixtures/audit.
import { SocialApiError } from "@/lib/social/base";
import { countSchema, graphList, soft, textSchema, z } from "@/lib/social/contract";
import { graph } from "@/lib/social/meta";
import { alertOwner } from "@/lib/owner-alerts";
import type { InstagramFacts, SourceOutcome } from "../types";

export const INSTAGRAM_AUDIT_MEDIA = 25;

const discoverySchema = z.object({
  business_discovery: z.object({
    username: z.string().min(1),
    name: textSchema,
    biography: textSchema,
    website: textSchema,
    followers_count: countSchema,
    follows_count: countSchema,
    media_count: countSchema,
    profile_picture_url: textSchema,
    media: soft(
      graphList(
        z.object({
          caption: textSchema,
          comments_count: countSchema,
          // Absent quand le propriétaire masque le nombre de « J'aime ».
          like_count: countSchema,
          media_type: textSchema,
          media_product_type: textSchema,
          permalink: textSchema,
          timestamp: z.string()
        })
      )
    )
  })
});

const FIELDS = `business_discovery.username(%USER%){username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url,media.limit(${INSTAGRAM_AUDIT_MEDIA}){caption,comments_count,like_count,media_type,media_product_type,permalink,timestamp}}`;

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;

export async function auditInstagram(username: string, timeoutMs = 6_000): Promise<SourceOutcome<InstagramFacts>> {
  const userId = process.env.IG_DISCOVERY_USER_ID;
  const token = process.env.IG_DISCOVERY_TOKEN;
  if (!userId || !token) return { status: "disabled", message: "L'analyse Instagram n'est pas encore activée sur Nebula." };
  try {
    const data = await graph("INSTAGRAM", `/${encodeURIComponent(userId)}`, token, {
      params: { fields: FIELDS.replace("%USER%", username) },
      timeoutMs,
      schema: discoverySchema
    });
    const b = data.business_discovery;
    const media = (b.media?.data ?? [])
      .map((m) => ({
        type: m.media_type ?? "IMAGE",
        product: m.media_product_type ?? null,
        timestamp: m.timestamp,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        captionLength: (m.caption ?? "").trim().length,
        hashtags: (m.caption ?? "").match(HASHTAG)?.length ?? 0,
        permalink: m.permalink ?? null
      }))
      .filter((m) => !Number.isNaN(new Date(m.timestamp).getTime()))
      .sort((a, c) => new Date(c.timestamp).getTime() - new Date(a.timestamp).getTime());
    return {
      status: "ok",
      facts: {
        username: b.username,
        name: b.name?.trim() || null,
        biography: b.biography ?? "",
        website: b.website?.trim() || null,
        followers: b.followers_count ?? null,
        follows: b.follows_count ?? null,
        mediaCount: b.media_count ?? null,
        avatarUrl: b.profile_picture_url ?? null,
        media
      }
    };
  } catch (err) {
    if (err instanceof SocialApiError) {
      const [code, subcode] = (err.code ?? "").split("/");
      // Compte introuvable ou personnel (Meta ne distingue pas les deux).
      if (code === "110" || subcode === "2207013" || /cannot be found|Cannot find User|Invalid user/i.test(err.message)) {
        return {
          status: "private",
          message: "Compte introuvable, ou compte personnel : seuls les comptes Instagram professionnels (Créateur ou Entreprise) sont lisibles sans connexion."
        };
      }
      if (code === "190" || err.status === 401) {
        void alertOwner({
          title: "Audit : jeton Instagram expiré",
          body: "Meta refuse IG_DISCOVERY_TOKEN : l'audit de présence ne lit plus les comptes Instagram. Générez un nouveau jeton longue durée (60 jours) depuis l'app Meta de Nebula et remplacez-le sur Vercel.",
          dedupeKey: "audit:instagram-token"
        });
        return { status: "unavailable", message: "L'analyse Instagram est momentanément indisponible." };
      }
      if (["4", "17", "32", "613"].includes(code) || err.status === 429) {
        return { status: "unavailable", message: "Limite horaire d'Instagram atteinte pour l'audit : réessayez dans une heure." };
      }
    }
    console.warn("[audit] Instagram :", (err as Error).message);
    return { status: "unavailable", message: "Instagram n'a pas répondu à temps : réessayez dans un instant." };
  }
}
