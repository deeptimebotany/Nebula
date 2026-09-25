// Audit de présence — source YouTube : données publiques d'une chaîne, avec
// une simple clé d'API (YOUTUBE_API_KEY, projet Google Cloud de Nebula),
// sans connexion du compte.
//
// 3 unités de quota par audit (quota gratuit : 10 000 par jour) :
//  1. channels.list (profil, statistiques, bannière, mots-clés, liste
//     « uploads ») ;
//  2. playlistItems.list (30 dernières vidéos) ;
//  3. videos.list (durée, vues, j'aime, commentaires, tags).
// Jamais search.list (100 unités, et limité à 100 appels par jour).
//
// Doc : https://developers.google.com/youtube/v3/docs/channels/list,
//       .../playlistItems/list, .../videos/list
// Réponses types : tests/contracts/fixtures/audit.
import { SocialApiError, fetchJson } from "@/lib/social/base";
import { countSchema, opt, soft, textSchema, z } from "@/lib/social/contract";
import { alertOwner } from "@/lib/owner-alerts";
import type { SourceOutcome, YoutubeFacts, YoutubeRef, YoutubeVideoFacts } from "../types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_AUDIT_VIDEOS = 30;

const thumbsSchema = soft(
  z.object({
    default: soft(z.object({ url: z.string() })),
    medium: soft(z.object({ url: z.string() })),
    high: soft(z.object({ url: z.string() }))
  })
);

const channelSchema = z.object({
  items: opt(
    z.array(
      z.object({
        id: z.string().min(1),
        snippet: z.object({
          title: z.string(),
          description: z.string().default(""),
          customUrl: textSchema,
          publishedAt: textSchema,
          country: textSchema,
          thumbnails: thumbsSchema
        }),
        statistics: soft(z.object({ viewCount: countSchema, subscriberCount: countSchema, hiddenSubscriberCount: soft(z.boolean()), videoCount: countSchema })),
        brandingSettings: soft(z.object({ channel: soft(z.object({ keywords: textSchema })), image: soft(z.object({ bannerExternalUrl: textSchema })) })),
        contentDetails: soft(z.object({ relatedPlaylists: soft(z.object({ uploads: textSchema })) }))
      })
    )
  )
});

const playlistSchema = z.object({
  items: opt(z.array(z.object({ contentDetails: soft(z.object({ videoId: textSchema, videoPublishedAt: textSchema })) })))
});

const videosSchema = z.object({
  items: opt(
    z.array(
      z.object({
        id: z.string().min(1),
        snippet: z.object({ title: z.string().default(""), description: z.string().default(""), publishedAt: z.string(), tags: soft(z.array(z.string())), thumbnails: thumbsSchema }),
        contentDetails: soft(z.object({ duration: textSchema })),
        statistics: soft(z.object({ viewCount: countSchema, likeCount: countSchema, commentCount: countSchema }))
      })
    )
  )
});

/** Durée ISO 8601 (« PT1H2M3S », « P1DT2H ») en secondes. */
export function isoDurationSeconds(value: string | undefined): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value ?? "");
  if (!m) return 0;
  return Math.round(Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3_600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0));
}

function filterFor(ref: YoutubeRef): string {
  if (ref.kind === "id") return `id=${encodeURIComponent(ref.value)}`;
  if (ref.kind === "username") return `forUsername=${encodeURIComponent(ref.value)}`;
  return `forHandle=${encodeURIComponent(`@${ref.value}`)}`;
}

/** Raisons d'erreur Google (« quotaExceeded », « API_KEY_INVALID »…), toutes à la suite. */
function reasonOf(err: SocialApiError): string {
  const raw = err.raw as { error?: { errors?: { reason?: string }[]; status?: string; details?: { reason?: string }[] } } | undefined;
  return [...(raw?.error?.errors ?? []).map((e) => e.reason), ...(raw?.error?.details ?? []).map((d) => d.reason), raw?.error?.status].filter(Boolean).join(" ");
}

export async function auditYoutube(ref: YoutubeRef, timeoutMs = 6_000): Promise<SourceOutcome<YoutubeFacts>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { status: "disabled", message: "L'analyse YouTube n'est pas encore activée sur Nebula." };
  // Clé dans l'en-tête (jamais dans l'adresse, qui peut finir dans des journaux).
  const init = { headers: { "x-goog-api-key": key }, cache: "no-store" as const, timeoutMs };
  try {
    const channels = await fetchJson("YOUTUBE", `${API_BASE}/channels?part=snippet,statistics,brandingSettings,contentDetails&${filterFor(ref)}`, { ...init, schema: channelSchema });
    const channel = channels.items?.[0];
    if (!channel) return { status: "not_found", message: "Aucune chaîne YouTube ne correspond à cette adresse." };

    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    let videos: YoutubeVideoFacts[] = [];
    if (uploads) {
      const list = await fetchJson("YOUTUBE", `${API_BASE}/playlistItems?part=contentDetails&maxResults=${YOUTUBE_AUDIT_VIDEOS}&playlistId=${encodeURIComponent(uploads)}`, {
        ...init,
        schema: playlistSchema
      }).catch((err: unknown) => {
        // Chaîne sans vidéo : la liste « uploads » n'existe pas encore (404).
        if (err instanceof SocialApiError && err.status === 404) return { items: [] };
        throw err;
      });
      const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => Boolean(id));
      if (ids.length > 0) {
        const data = await fetchJson("YOUTUBE", `${API_BASE}/videos?part=snippet,contentDetails,statistics&id=${ids.map(encodeURIComponent).join(",")}`, { ...init, schema: videosSchema });
        videos = (data.items ?? [])
          .map((v) => ({
            id: v.id,
            title: v.snippet.title,
            descriptionLength: v.snippet.description.trim().length,
            tagsCount: v.snippet.tags?.length ?? 0,
            publishedAt: v.snippet.publishedAt,
            durationSec: isoDurationSeconds(v.contentDetails?.duration),
            views: v.statistics?.viewCount ?? null,
            likes: v.statistics?.likeCount ?? null,
            comments: v.statistics?.commentCount ?? null,
            thumbnailUrl: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`
          }))
          .filter((v) => !Number.isNaN(new Date(v.publishedAt).getTime()))
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      }
    }

    const s = channel.snippet;
    const handle = s.customUrl ? (s.customUrl.startsWith("@") ? s.customUrl : `@${s.customUrl}`) : null;
    const hidden = channel.statistics?.hiddenSubscriberCount === true;
    return {
      status: "ok",
      facts: {
        id: channel.id,
        title: s.title,
        handle,
        url: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${channel.id}`,
        description: s.description,
        avatarUrl: s.thumbnails?.medium?.url ?? s.thumbnails?.default?.url ?? s.thumbnails?.high?.url ?? null,
        bannerUrl: channel.brandingSettings?.image?.bannerExternalUrl ?? null,
        keywords: channel.brandingSettings?.channel?.keywords?.trim() ?? "",
        country: s.country ?? null,
        createdAt: s.publishedAt ?? null,
        subscribers: hidden ? null : (channel.statistics?.subscriberCount ?? null),
        views: channel.statistics?.viewCount ?? null,
        videoCount: channel.statistics?.videoCount ?? null,
        videos
      }
    };
  } catch (err) {
    if (err instanceof SocialApiError) {
      const reason = reasonOf(err);
      if (/quota/i.test(reason) || err.status === 429) {
        return { status: "unavailable", message: "Limite quotidienne de YouTube atteinte pour l'audit : réessayez demain." };
      }
      if (/keyInvalid|API_KEY_INVALID|keyExpired|accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /API key not valid/i.test(err.message) || err.status === 401) {
        void alertOwner({
          title: "Audit : clé YouTube refusée",
          body: `Google refuse YOUTUBE_API_KEY (${reason || err.status}) : l'audit de présence ne lit plus les chaînes YouTube. Vérifiez la clé et que « YouTube Data API v3 » est activée dans le projet Google Cloud.`,
          dedupeKey: "audit:youtube-key"
        });
        return { status: "unavailable", message: "L'analyse YouTube est momentanément indisponible." };
      }
      if (err.status === 404) return { status: "not_found", message: "Aucune chaîne YouTube ne correspond à cette adresse." };
    }
    console.warn("[audit] YouTube :", (err as Error).message);
    return { status: "unavailable", message: "YouTube n'a pas répondu à temps : réessayez dans un instant." };
  }
}
