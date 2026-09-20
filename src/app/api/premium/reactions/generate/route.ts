import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { isAiEnabled, generateStickerPack } from "@/lib/ai/gemini";
import { saveGeneratedImage } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

// Le pack par défaut — cohérent avec l'identité "Or Impérial" du statut
// Premium (voir globals.css::.glow-border-gold). Modifiable librement :
// changez cette liste et relancez la génération pour renouveler le pack
// (les clés déjà utilisées sont mises à jour plutôt que dupliquées).
const PACK: { key: string; label: string; prompt: string }[] = [
  { key: "gold-fire", label: "Feu doré", prompt: "une flamme stylisée en dégradé d'or, lumineuse, façon néon liquide" },
  { key: "gold-crown", label: "Couronne", prompt: "une petite couronne royale dorée scintillante, avec un éclat de lumière" },
  { key: "gold-heart", label: "Cœur doré", prompt: "un cœur en verre doré translucide avec un halo lumineux autour" },
  { key: "gold-star", label: "Étoile filante", prompt: "une étoile à cinq branches dorée avec une traînée de particules scintillantes" },
  { key: "gold-clap", label: "Applaudissements", prompt: "deux mains stylisées dorées qui applaudissent, avec de petites étincelles" },
  { key: "gold-laugh", label: "Fou rire doré", prompt: "un visage souriant stylisé aux traits dorés minimalistes, très expressif" },
  { key: "gold-wow", label: "Whaou doré", prompt: "un visage stylisé surpris aux traits dorés minimalistes, bouche ouverte" },
  { key: "gold-thumbsup", label: "Pouce doré", prompt: "un pouce levé stylisé en dégradé d'or avec un léger halo lumineux" }
];

// POST /api/premium/reactions/generate — génère (ou régénère) le pack
// d'emojis exclusifs Premium via Gemini (texte → image, voir gemini.ts::
// generateStickerPack), stocke chaque image via le même mécanisme que les
// médias uploadés (Vercel Blob ou disque local, voir storage.ts), et
// enregistre ou met à jour les lignes PremiumReaction correspondantes.
// Réservé à l'admin (ADMIN_EMAILS, voir src/lib/admin.ts) : c'est une action
// coûteuse (8 appels IA) destinée à être lancée une fois, pas par n'importe
// quel utilisateur.
export async function POST() {
  const session = await getServerSession(authOptions);
  const email = (session?.user as { email?: string } | undefined)?.email;
  if (!session?.user || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Réservé à l'administrateur de la plateforme." }, { status: 403 });
  }

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  const results: { key: string; ok: boolean; error?: string }[] = [];

  for (const item of PACK) {
    try {
      const { base64, mimeType } = await generateStickerPack({ prompt: item.prompt });
      const { url } = await saveGeneratedImage({ base64, mimeType, baseName: item.key });
      await prisma.premiumReaction.upsert({
        where: { key: item.key },
        update: { label: item.label, imageUrl: url },
        create: { key: item.key, label: item.label, imageUrl: url }
      });
      results.push({ key: item.key, ok: true });
    } catch (err) {
      // Une image qui échoue (modèle indisponible, quota...) ne doit pas
      // empêcher les autres d'être générées — on continue le pack et on
      // remonte le détail des échecs au lieu de tout faire échouer.
      results.push({ key: item.key, ok: false, error: (err as Error).message });
    }
  }

  const reactions = await prisma.premiumReaction.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ results, reactions });
}
