import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, chatComplete, GeminiQuotaError, type ChatMessage } from "@/lib/ai/gemini";
import { gateAppAi } from "@/lib/ai/guard";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isAssistantContextKey, type AssistantContextKey } from "@/lib/ai/assistant-contexts";
import { CONTEXT_PROMPTS, buildSystemInstruction, extractThumbnailBrief, toolContextLines, trimHistory } from "@/lib/ai/assistant-prompts";
import { getToolContext } from "@/lib/tools/app-context";
import { saveConversation } from "@/lib/ai/assistant-conversations";
import { z } from "zod";

// Durée maximale de la fonction Vercel (07/10/2026) : l'appel à Gemini est
// borné à 55 s, relances comprises (src/lib/ai/gemini.ts). Sans ce réglage,
// la fonction dépendait du défaut du projet Vercel.
export const maxDuration = 60;

// POST /api/ai/chat — l'assistant « Demander à Nebula ».
//
// Économie de l'IA (Gemini en version payante depuis le 30/09/2026 : chaque
// jeton se paie), en quatre points (voir aussi
// src/lib/ai/assistant-prompts.ts) :
//   1. le navigateur n'envoie qu'une CLÉ de contexte (l'onglet actif), le
//      serveur assemble une instruction courte et n'injecte que les données
//      utiles à cet onglet ;
//   2. l'historique est tronqué aux 10 derniers messages, chacun plafonné ;
//   3. un nombre de messages par mois (ou pendant l'essai) et par compte
//      selon le palier (porte de l'IA, lib/ai/guard.ts) et une rafale par
//      utilisateur (AI_CHAT_LIMIT messages / fenêtre) : une boucle ou un
//      enthousiasme excessif ne vide pas le quota du mois ;
//   4. un 429 Gemini est renvoyé en 429 (et non 500) avec un délai, pour
//      que le tiroir affiche un compte à rebours au lieu d'une erreur.
// L'accueil et les suggestions du tiroir ne passent JAMAIS par ici : ils
// sont statiques (assistant-contexts.ts) et ne coûtent rien.

const bodySchema = z.object({
  brandId: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(8000) })).min(1),
  /** Onglet actif — voir assistant-contexts.ts. Inconnu ou absent → « generic ». */
  contextKey: z.string().optional(),
  // Contexte optionnel : limite le scope au post en cours si on discute
  // depuis la page /posts/[id] plutôt que de l'assistant global.
  postId: z.string().optional(),
  // Conversations enregistrées (09/10/2026) : le tiroir « Demander à Nebula »
  // envoie save: true et l'identifiant de la conversation en cours (null au
  // premier message). La réponse renvoie l'identifiant à réutiliser.
  save: z.boolean().optional(),
  conversationId: z.string().max(64).nullable().optional()
});

/** Messages par utilisateur et par fenêtre glissante. 30 / 10 min laisse une
 *  vraie conversation, mais coupe court à une rafale accidentelle. */
const AI_CHAT_LIMIT = 30;
const AI_CHAT_WINDOW_MINUTES = 10;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, messages, postId, save, conversationId } = parsed.data;
  const contextKey: AssistantContextKey = isAssistantContextKey(parsed.data.contextKey) ? parsed.data.contextKey : "generic";
  const userId = (session.user as { id: string }).id;

  // L'assistant reçoit dans son prompt les stats et les derniers posts de la
  // marque : la marque doit donc être une de celles de l'utilisateur.
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  // Réponse envoyée : la conversation (fil + réponse) est enregistrée. Un
  // échec d'enregistrement ne prive jamais la personne de sa réponse.
  const reply = async (body: Record<string, unknown> & { reply: string }) => {
    let savedId: string | null = null;
    if (save) {
      savedId = await saveConversation({ userId, brandId, conversationId, messages: [...messages, { role: "model", text: body.reply }] }).catch((err) => {
        console.error("[assistant] conversation non enregistrée :", (err as Error).message);
        return null;
      });
    }
    return NextResponse.json({ ...body, conversationId: savedId ?? conversationId ?? null });
  };

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  // Porte de l'IA (lot E2) : palier de la marque, messages du jour du compte
  // (Essai 20, Pro 100, Agence 300 — plans.ts), adresse confirmée et budget
  // global pendant l'essai. Vérifiée APRÈS les easter eggs (gratuits).
  const gate = await gateAppAi({ userId, brandId, kind: "assistant" });
  if (!gate.ok) return gate.response;
  const plan = gate.info.plan;

  // Rafale par utilisateur — AVANT toute lecture de données ou appel Gemini.
  const limit = await consumeRateLimit("ai-chat", userId, AI_CHAT_LIMIT, AI_CHAT_WINDOW_MINUTES);
  if (!limit.ok) {
    await gate.allowance.release();
    return NextResponse.json(
      {
        error: `Vous avez envoyé beaucoup de questions d'un coup — l'assistant reprend dans ${Math.ceil(limit.retryAfterSeconds / 60)} min. Rien n'a été décompté.`,
        retryAfterSeconds: limit.retryAfterSeconds
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  // Données de la marque : on ne charge que ce que le module du contexte
  // déclare utile (needs) — moins de requêtes Prisma ET moins de tokens.
  const mod = CONTEXT_PROMPTS[contextKey];
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      connections: mod.needs.stats
        ? { where: { status: "CONNECTED" }, include: { analytics: { orderBy: { capturedAt: "desc" }, take: 1 } } }
        : false,
      posts: mod.needs.recentPosts ? { orderBy: { createdAt: "desc" }, take: 5, include: { targets: true } } : false,
      linkPage: mod.needs.bioPage ? { include: { links: { orderBy: { order: "asc" }, take: 8 } } } : false
    }
  });
  if (!brand) {
    await gate.allowance.release();
    return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
  }

  type Connection = { network: string; displayName: string; analytics: { followers: number; impressions: number; reach: number }[] };
  type Post = { title: string | null; caption: string; status: string; targets: { network: string }[] };
  type LinkPage = { title: string; bio: string; published: boolean; links: { label: string; clicks: number; enabled: boolean }[] };

  const connections = ((brand as unknown as { connections?: Connection[] }).connections ?? []) as Connection[];
  const posts = ((brand as unknown as { posts?: Post[] }).posts ?? []) as Post[];
  const linkPage = ((brand as unknown as { linkPage?: LinkPage | null }).linkPage ?? null) as LinkPage | null;

  const statsLines = connections.map((c) => {
    const last = c.analytics[0];
    return `- ${c.network} (${c.displayName}) : ${last ? `${last.followers} abonnés, ${last.impressions} impressions, ${last.reach} portée (dernière synchro)` : "pas encore synchronisé"}`;
  });
  const recentPostsLines = posts.map(
    (p) => `- "${p.title || p.caption.slice(0, 40) || "(sans titre)"}" — statut ${p.status}, ${p.targets.length} réseau(x) ciblé(s)`
  );
  const bioSummary = linkPage
    ? [
        `Titre : « ${linkPage.title || "(vide)"} » — ${linkPage.published ? "publiée" : "non publiée"}`,
        `Bio : « ${linkPage.bio || "(vide)"} »`,
        linkPage.links.length
          ? "Liens (dans l'ordre) :\n" + linkPage.links.map((l) => `- ${l.label} — ${l.clicks} clic(s)${l.enabled ? "" : " (désactivé)"}`).join("\n")
          : "Aucun lien pour le moment."
      ].join("\n")
    : "";

  // Métriques d'engagement (page Engagements) : 12 dernières publications
  // synchronisées, une ligne chacune — seulement pour le module qui le
  // demande (chaque ligne coûte des tokens).
  let postMetricsLines: string[] = [];
  if (mod.needs.postMetrics) {
    const metrics = await prisma.postMetric.findMany({
      where: { connection: { brandId } },
      orderBy: { publishedAt: "desc" },
      take: 12
    });
    const fmt = (v: number | null) => (v === null ? "n/d" : String(v));
    postMetricsLines = metrics.map(
      (m) => `- "${(m.title || m.postExternalId).slice(0, 60)}" (${m.network}) : ${fmt(m.views)} vues, ${fmt(m.likes)} likes, ${fmt(m.comments)} commentaires, ${fmt(m.shares)} partages, ${fmt(m.saves)} enregistrements`
    );
  }

  // Outils (02/10/2026) : les mêmes chiffres que la page de l'outil.
  const toolLines = mod.needs.toolData ? toolContextLines(await getToolContext(brandId)) : [];

  let postContext = "";
  if (postId) {
    // Restreint à la marque déjà vérifiée ci-dessus : un postId d'une autre
    // marque est simplement ignoré.
    const post = await prisma.post.findFirst({ where: { id: postId, brandId }, include: { targets: true } });
    if (post) {
      postContext = `Publication actuellement discutée : titre="${post.title}", description="${post.caption.slice(0, 600)}", statut=${post.status}, réseaux=${post.targets.map((t: (typeof post.targets)[number]) => t.network).join(", ")}.`;
    }
  }

  const systemInstruction = buildSystemInstruction(contextKey, {
    brandName: brand.name,
    plan,
    statsLines,
    recentPostsLines,
    bioSummary,
    postContext,
    postMetricsLines,
    toolLines
  });

  try {
    const history = trimHistory(messages as ChatMessage[]);
    const raw = await gate.allowance.run(() => chatComplete(history, systemInstruction, { maxOutputTokens: mod.maxOutputTokens }));

    if (contextKey === "thumbnails") {
      const { text, brief } = extractThumbnailBrief(raw);
      return reply({ reply: text, thumbnail: brief, contextKey });
    }
    return reply({ reply: raw, contextKey });
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      return NextResponse.json(
        { error: err.message, retryAfterSeconds: err.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
