import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePublicQuota } from "@/lib/public-tools-limit";
import { isAiEnabled, generateFreeList } from "@/lib/ai/gemini";

// POST /api/public/tools/generate — moteur commun des micro-outils IA
// gratuits de /outils (brief growth, lot G4.c) : bio Instagram, hashtags,
// reformulations de titre YouTube. Sans compte, quota par IP et par jour
// (même mécanisme que légendes/miniatures, bonus lead compris). Les outils
// SANS IA (taux d'engagement, meilleur moment) n'appellent jamais cette
// route : ils n'entament pas le quota Gemini.
const DAILY_LIMIT = 8;

const bodySchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("bio-instagram"),
    activity: z.string().trim().min(3).max(200),
    tone: z.enum(["chaleureux", "pro", "fun", "inspirant"]).default("chaleureux"),
    keywords: z.string().trim().max(200).optional(),
    cta: z.string().trim().max(120).optional()
  }),
  z.object({
    tool: z.literal("hashtags"),
    niche: z.string().trim().min(3).max(200),
    network: z.string().max(20).optional()
  }),
  z.object({
    tool: z.literal("titre-youtube"),
    title: z.string().trim().min(3).max(200),
    topic: z.string().trim().max(300).optional()
  })
]);

export async function POST(req: NextRequest) {
  if (!isAiEnabled()) return NextResponse.json({ error: "L'IA n'est pas configurée sur cette instance." }, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complétez le formulaire (3 caractères minimum)." }, { status: 400 });
  const input = parsed.data;

  const quota = await consumePublicQuota(req, input.tool, DAILY_LIMIT);
  if (!quota.ok) {
    return NextResponse.json({ error: `Limite gratuite atteinte (${quota.limit} générations/jour). Créez un compte Nebula gratuit pour continuer.` }, { status: 429 });
  }

  try {
    let items: string[] = [];
    let groups: { label: string; items: string[] }[] | undefined;
    if (input.tool === "bio-instagram") {
      items = await generateFreeList(
        [
          `Rédige 5 propositions de bio Instagram en français pour ce compte. Activité : ${input.activity}.`,
          `Ton : ${input.tone}.`,
          input.keywords ? `Mots-clés à placer : ${input.keywords}.` : "",
          input.cta ? `Appel à l'action à inclure : ${input.cta}.` : "",
          "Chaque bio fait 150 caractères MAXIMUM, peut utiliser 1 ou 2 émojis, pas de hashtag, pas de guillemets."
        ]
          .filter(Boolean)
          .join("\n"),
        5
      );
      items = items.map((b) => b.slice(0, 150));
    } else if (input.tool === "hashtags") {
      const net = input.network ? ` pour ${input.network}` : "";
      const [large, medium, niche] = await Promise.all([
        generateFreeList(`Donne 8 hashtags LARGES (très populaires, généralistes) en lien avec la niche « ${input.niche} »${net}. Chaque élément commence par #, sans espace, sans accent.`, 8),
        generateFreeList(`Donne 8 hashtags MOYENS (thématiques, communauté engagée) en lien avec la niche « ${input.niche} »${net}. Chaque élément commence par #, sans espace, sans accent.`, 8),
        generateFreeList(`Donne 8 hashtags DE NICHE (précis, peu concurrentiels) en lien avec la niche « ${input.niche} »${net}. Chaque élément commence par #, sans espace, sans accent.`, 8)
      ]);
      const clean = (arr: string[]) => arr.map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")).filter((h) => h.length > 1);
      groups = [
        { label: "Larges", items: clean(large) },
        { label: "Moyens", items: clean(medium) },
        { label: "De niche", items: clean(niche) }
      ];
    } else {
      items = await generateFreeList(
        [
          `Voici un titre de vidéo YouTube : « ${input.title} ».`,
          input.topic ? `Sujet de la vidéo : ${input.topic}.` : "",
          "Propose 3 reformulations plus accrocheuses en français, 60 caractères maximum chacune, sans clickbait mensonger : une avec un chiffre, une sous forme de question ou de promesse, une avec un mot fort. Sans guillemets."
        ]
          .filter(Boolean)
          .join("\n"),
        3
      );
    }
    return NextResponse.json({ items, groups, remaining: quota.remaining, limit: quota.limit, used: quota.used });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
