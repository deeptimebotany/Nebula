import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, chatComplete, type ChatMessage } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { z } from "zod";

const bodySchema = z.object({
  brandId: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string() })).min(1),
  // Contexte optionnel : limite le scope au post en cours si on discute
  // depuis la page /posts/[id] plutôt que de l'assistant global.
  postId: z.string().optional()
});

const SYSTEM_BASE = `Tu es l'assistant intégré de Nebula, une app de gestion de réseaux sociaux (planification, publication multi-réseaux, analytics). Tu aides l'utilisateur à utiliser le site (composer, calendrier, comptes, facturation) et à interpréter ses statistiques réelles fournies ci-dessous. Sois concret, concis, en français, et appuie-toi UNIQUEMENT sur les chiffres fournis dans le contexte — n'invente jamais de statistiques. Si une info manque, dis-le et explique comment l'obtenir dans l'app.`;

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

  // L'assistant reçoit dans son prompt les stats et les derniers posts de la
  // marque : la marque doit donc être une de celles de l'utilisateur.
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  // Easter egg "qui es-tu" : répond avant même de vérifier que Gemini est
  // configuré ou que le palier permet l'IA — une réponse maison ne coûte
  // rien et ne doit jamais être bloquée par ces garde-fous.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMessage) {
    const userId = (session.user as { id: string }).id;

    const identityEgg = matchIdentityEasterEgg(lastUserMessage.text);
    if (identityEgg) {
      await markEasterEggFound(userId, "ai-identity");
      return NextResponse.json({ reply: identityEgg });
    }

    const mathEgg = matchMathEasterEgg(lastUserMessage.text);
    if (mathEgg) {
      await markEasterEggFound(userId, "ai-answer-42");
      return NextResponse.json({ reply: mathEgg });
    }

    const thanksEgg = matchThanksEasterEgg(lastUserMessage.text);
    if (thanksEgg) {
      await markEasterEggFound(userId, "support-thanks");
      return NextResponse.json({ reply: thanksEgg });
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

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      connections: { where: { status: "CONNECTED" }, include: { analytics: { orderBy: { capturedAt: "desc" }, take: 1 } } },
      posts: { orderBy: { createdAt: "desc" }, take: 5, include: { targets: true } }
    }
  });
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

  const statsLines = brand.connections.map((c: (typeof brand.connections)[number]) => {
    const last = c.analytics[0];
    return `- ${c.network} (${c.displayName}) : ${last ? `${last.followers} abonnés, ${last.impressions} impressions, ${last.reach} portée (dernière synchro)` : "pas encore synchronisé"}`;
  });
  const recentPostsLines = brand.posts.map(
    (p: (typeof brand.posts)[number]) => `- "${p.title || p.caption.slice(0, 40) || "(sans titre)"}" — statut ${p.status}, ${p.targets.length} réseau(x) ciblé(s)`
  );

  let postContext = "";
  if (postId) {
    // Restreint à la marque déjà vérifiée ci-dessus : un postId d'une autre
    // marque est simplement ignoré.
    const post = await prisma.post.findFirst({ where: { id: postId, brandId }, include: { targets: true } });
    if (post) {
      postContext = `\n\nPublication actuellement discutée : titre="${post.title}", description="${post.caption}", statut=${post.status}, réseaux=${post.targets.map((t: (typeof post.targets)[number]) => t.network).join(", ")}.`;
    }
  }

  const systemInstruction = [
    SYSTEM_BASE,
    `Palier actuel de la marque "${brand.name}" : ${plan}.`,
    "Statistiques des comptes connectés :",
    statsLines.length ? statsLines.join("\n") : "(aucun compte connecté pour le moment)",
    "Dernières publications :",
    recentPostsLines.length ? recentPostsLines.join("\n") : "(aucune publication pour le moment)",
    postContext
  ].join("\n");

  try {
    const reply = await chatComplete(messages as ChatMessage[], systemInstruction);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
