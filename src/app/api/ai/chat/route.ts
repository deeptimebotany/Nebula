import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, chatComplete, GeminiQuotaError, type ChatMessage } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isAssistantContextKey, type AssistantContextKey } from "@/lib/ai/assistant-contexts";
import { CONTEXT_PROMPTS, buildSystemInstruction, extractThumbnailBrief, trimHistory } from "@/lib/ai/assistant-prompts";
import { z } from "zod";

// POST /api/ai/chat — l'assistant « Demander à Nebula ».
//
// Économie du quota Gemini gratuit, en quatre points (voir aussi
// src/lib/ai/assistant-prompts.ts) :
//   1. le navigateur n'envoie qu'une CLÉ de contexte (l'onglet actif), le
//      serveur assemble une instruction courte et n'injecte que les données
//      utiles à cet onglet ;
//   2. l'historique est tronqué aux 10 derniers messages, chacun plafonné ;
//   3. un plafond par utilisateur (AI_CHAT_LIMIT messages / fenêtre) évite
//      qu'une boucle ou un enthousiasme excessif vide le quota de tout le
//      monde — la limite est partagée par tous les utilisateurs du site
//      puisque la clé Gemini l'est ;
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
  postId: z.string().optional()
});

/** Messages par utilisateur et par fenêtre glissante. 30 / 10 min laisse une
 *  vraie conversation, mais coupe court à une rafale accidentelle. */
const AI_CHAT_LIMIT = 30;
const AI_CHAT_WINDOW_MINUTES = 10;

// Easter egg : quelques questions "méta" classiques (qui es-tu, es-tu
// vivant...) reçoivent une réponse maison au lieu d'être envoyées à Gemini —
// plus sûr d'obtenir quelque chose d'à propos qu'en laissant le modèle
// improviser, et ça économise un appel API pour une question qui revient
// souvent. On ne matche que le DERNIER message de l'utilisateur, normalisé
// (minuscules, accents et ponctuation retirés) pour couvrir les variantes
// d'écriture ("qui es-tu", "Qui es tu ?", ...).
const IDENTITY_TRIGGERS = [
  "qui es tu",
  "qui etes vous",
  "cest qui toi",
  "tes qui",
  "tu es qui",
  "es tu vivant",
  "es tu une ia",
  "es tu une intelligence artificielle",
  "es tu un robot",
  "es tu humain",
  "who are you",
  "are you alive",
  "are you a robot",
  "are you sentient",
  "are you human"
];

const IDENTITY_REPLIES = [
  "Je suis l'assistant intégré de Nebula — une IA, pas un être vivant, mais bien réel dans le sens où je ne travaille qu'avec vos vraies statistiques, jamais des chiffres inventés.",
  "Ni vivant ni humain : je suis le modèle d'IA branché sur votre compte Nebula, pour vous aider à publier au bon moment sur les bons réseaux.",
  "Une intelligence artificielle, oui — née dans le code de Nebula pour lire vos analytics et vous faire gagner du temps. Rien de plus mystérieux que ça !"
];

function normalizeForEasterEgg(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents
    .replace(/[^a-z0-9\s]/g, " ") // ponctuation -> espace
    .replace(/\s+/g, " ")
    .trim();
}

function matchIdentityEasterEgg(lastUserText: string): string | null {
  const normalized = normalizeForEasterEgg(lastUserText);
  if (!normalized) return null;
  if (!IDENTITY_TRIGGERS.some((t) => normalized === t || normalized.includes(t))) return null;
  return IDENTITY_REPLIES[Math.floor(Math.random() * IDENTITY_REPLIES.length)];
}

// Easter egg "42" : deux occurrences du nombre 42 (mot entier) dans le même
// message — pense "42 fois 42", "42 * 42", "42x42"... — reçoivent le vrai
// calcul PLUS un clin d'œil, sans appeler Gemini.
function matchMathEasterEgg(lastUserText: string): string | null {
  const matches = lastUserText.match(/\b42\b/g);
  if (!matches || matches.length < 2) return null;
  return "1764 — et 42 reste la réponse à tout le reste 😉";
}

// Easter egg "merci" : le mot "merci" répété au moins 5 fois dans le même
// message (n'importe où, n'importe quelle casse) — pas besoin d'appeler
// Gemini pour dire merci en retour.
function matchThanksEasterEgg(lastUserText: string): string | null {
  const matches = lastUserText.toLowerCase().match(/merci/g);
  if (!matches || matches.length < 5) return null;
  return "🥹 C'est nous qui vous remercions !";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, messages, postId } = parsed.data;
  const contextKey: AssistantContextKey = isAssistantContextKey(parsed.data.contextKey) ? parsed.data.contextKey : "generic";
  const userId = (session.user as { id: string }).id;

  // L'assistant reçoit dans son prompt les stats et les derniers posts de la
  // marque : la marque doit donc être une de celles de l'utilisateur.
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  // Easter egg "qui es-tu" : répond avant même de vérifier que Gemini est
  // configuré ou que le palier permet l'IA — une réponse maison ne coûte
  // rien et ne doit jamais être bloquée par ces garde-fous.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMessage) {
    const identityEgg = matchIdentityEasterEgg(lastUserMessage.text);
    if (identityEgg) {
      await markEasterEggFound(userId, "ai-identity");
      return NextResponse.json({ reply: identityEgg, contextKey });
    }

    const mathEgg = matchMathEasterEgg(lastUserMessage.text);
    if (mathEgg) {
      await markEasterEggFound(userId, "ai-answer-42");
      return NextResponse.json({ reply: mathEgg, contextKey });
    }

    const thanksEgg = matchThanksEasterEgg(lastUserMessage.text);
    if (thanksEgg) {
      await markEasterEggFound(userId, "support-thanks");
      return NextResponse.json({ reply: thanksEgg, contextKey });
    }
  }

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  const { limits, plan } = await getBrandPlan(brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json(
      { error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
      { status: 402 }
    );
  }

  // Plafond par utilisateur — vérifié APRÈS les easter eggs (gratuits) et
  // AVANT toute lecture de données ou appel Gemini.
  const limit = await consumeRateLimit("ai-chat", userId, AI_CHAT_LIMIT, AI_CHAT_WINDOW_MINUTES);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Vous avez envoyé beaucoup de questions d'un coup — l'assistant reprend dans ${Math.ceil(limit.retryAfterSeconds / 60)} min. (Le quota gratuit de l'IA est partagé entre tous les utilisateurs.)`,
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
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

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
    postMetricsLines
  });

  try {
    const history = trimHistory(messages as ChatMessage[]);
    const raw = await chatComplete(history, systemInstruction, { maxOutputTokens: mod.maxOutputTokens });

    if (contextKey === "thumbnails") {
      const { text, brief } = extractThumbnailBrief(raw);
      return NextResponse.json({ reply: text, thumbnail: brief, contextKey });
    }
    return NextResponse.json({ reply: raw, contextKey });
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
