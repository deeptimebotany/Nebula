import { prisma } from "@/lib/prisma";
import {
  isValidEasterEggKey,
  EASTER_EGGS,
  ORIGINAL_TWENTY_KEYS,
  META_ACHIEVEMENT_KEYS
} from "@/lib/easter-eggs-registry";

/**
 * Marque un easter egg comme trouvé pour ce compte (idempotent — retrouver
 * le même easter egg plusieurs fois ne fait rien de plus). Utilisé :
 *  - directement depuis une route serveur qui détecte elle-même l'egg
 *    (ex : /api/ai/chat pour "ai-identity", publishPost() pour
 *    "publish-milestone") ;
 *  - depuis POST /api/easter-eggs/found, pour les eggs détectés uniquement
 *    côté client (clavier, clics, minuit...).
 *
 * Ne lève jamais : un easter egg est un bonus, jamais une raison de faire
 * échouer l'action réelle à laquelle il est accroché (réponse IA,
 * publication d'un post...).
 *
 * @returns true si c'est la toute première fois que ce compte le trouve
 * (utile pour déclencher un toast "succès débloqué" uniquement à cet
 * instant-là), false s'il était déjà trouvé ou si la clé est invalide.
 */
export async function markEasterEggFound(userId: string, key: string): Promise<boolean> {
  if (!isValidEasterEggKey(key)) return false;
  try {
    const existing = await prisma.easterEggFound.findUnique({
      where: { userId_key: { userId, key } },
      select: { id: true }
    });
    if (existing) return false;
    await prisma.easterEggFound.create({ data: { userId, key } });

    // Succès "méta" (voir META_ACHIEVEMENT_KEYS) : jamais déclenchés eux-mêmes
    // ci-dessus (isValidEasterEggKey les accepterait, mais rien dans le site
    // n'appelle markEasterEggFound avec ces clés directement) — on les
    // vérifie APRÈS chaque nouvelle trouvaille normale. Récursion volontaire
    // (checkMetaAchievements peut lui-même appeler markEasterEggFound) :
    // elle s'arrête forcément, les clés méta étant exclues de leurs propres
    // conditions.
    if (!META_ACHIEVEMENT_KEYS.includes(key)) {
      await checkMetaAchievements(userId);
    }

    return true;
  } catch (err) {
    console.error(`[easter-eggs] échec de l'enregistrement de "${key}" pour ${userId} :`, err);
    return false;
  }
}

// Vérifie et débloque, si besoin, les deux succès "méta" : avoir trouvé les
// 20 easter eggs d'origine, et avoir tout trouvé (hors succès méta
// eux-mêmes — voir META_ACHIEVEMENT_KEYS). Appelée après chaque nouvelle
// trouvaille plutôt que sur une tâche planifiée : le résultat est toujours
// à jour, au prix d'une requête de comptage supplémentaire par trouvaille
// (négligeable comparé au reste de l'opération qui accroche l'easter egg,
// ex : publier un post).
async function checkMetaAchievements(userId: string): Promise<void> {
  const found = await prisma.easterEggFound.findMany({ where: { userId }, select: { key: true } });
  const foundKeys = new Set((found as { key: string }[]).map((f) => f.key));

  if (
    !foundKeys.has("original-20-found") &&
    ORIGINAL_TWENTY_KEYS.every((k) => foundKeys.has(k))
  ) {
    await markEasterEggFound(userId, "original-20-found");
    foundKeys.add("original-20-found");
  }

  const requiredKeys = EASTER_EGGS.map((e) => e.key).filter((k) => !META_ACHIEVEMENT_KEYS.includes(k));
  if (!foundKeys.has("all-eggs-100pct") && requiredKeys.every((k) => foundKeys.has(k))) {
    await markEasterEggFound(userId, "all-eggs-100pct");
  }
}
