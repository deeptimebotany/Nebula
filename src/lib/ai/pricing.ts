// Prix de Gemini (palier payant) : pour ESTIMER le coût de l'IA, jour par
// jour, dans /admin/ia. Coût estimé = jetons × prix du MODÈLE appelé, au prix
// en vigueur CE JOUR-LÀ. Ce ne sont pas les montants facturés par Google (qui
// font foi dans Google Cloud → Facturation) : à revérifier sur la page
// officielle (https://ai.google.dev/gemini-api/docs/pricing) et à mettre à
// jour ici, avec la date de vérification.
//
// Vérifié le 30/09/2026 :
//   - gemini-3.8-flash : 0,75 $ / 3,75 $ par million de jetons (entrée /
//     sortie, « pensée » comprise) jusqu'au 31/12/2026, puis 1,50 $ / 7,50 $
//     à partir du 01/01/2027. Les jetons de vidéo comptent comme de l'entrée
//     (l'URL YouTube est en préversion, sans frais pour l'instant : le coût
//     estimé ici est donc un maximum tant que Google ne la facture pas).
//   - gemini-3.1-flash-image : 0,50 $ par million de jetons en entrée ;
//     0,067 $ par image 1K produite (1 120 jetons à 60 $ le million) ; texte
//     et « pensée » en sortie à 3 $ le million.

export interface ModelPrice {
  /** Dollars par million de jetons envoyés (texte, images, vidéo). */
  inputPerMillion: number;
  /** Dollars par million de jetons produits HORS images (réponse, « pensée »). */
  outputPerMillion: number;
  /** Dollars par image produite (modèles d'image, 1K). */
  perImage: number;
}

interface PricePeriod extends ModelPrice {
  /** Premier jour d'application (« AAAA-MM-JJ », heure de Paris). */
  from: string;
}

export const PRICE_VERIFIED_AT = "2026-09-30";
export const DEFAULT_TEXT_MODEL = "gemini-3.8-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
/** Jetons d'une image 1K en sortie (gemini-3.1-flash-image). */
export const TOKENS_PER_IMAGE_1K = 1120;

export const MODEL_PRICES: Record<string, PricePeriod[]> = {
  "gemini-3.8-flash": [
    { from: "2026-01-01", inputPerMillion: 0.75, outputPerMillion: 3.75, perImage: 0 },
    { from: "2027-01-01", inputPerMillion: 1.5, outputPerMillion: 7.5, perImage: 0 }
  ],
  "gemini-3.1-flash-image": [{ from: "2026-01-01", inputPerMillion: 0.5, outputPerMillion: 3, perImage: 0.067 }],
  // Anciens modèles (lignes d'historique de /admin/ia).
  "gemini-3.6-flash": [{ from: "2026-01-01", inputPerMillion: 0.75, outputPerMillion: 3.75, perImage: 0 }],
  "gemini-2.5-flash-image": [{ from: "2025-01-01", inputPerMillion: 0.3, outputPerMillion: 0, perImage: 0.039 }]
};

/** Date de la dernière vérification des prix (affichée dans /admin/ia). */
export const AI_PRICING = { verifiedAt: PRICE_VERIFIED_AT };

function isImageModel(model: string): boolean {
  return /image/i.test(model);
}

/** Prix d'un modèle un jour donné (modèle inconnu → modèle par défaut de même nature). */
export function priceFor(model: string, day: string): ModelPrice {
  const periods = MODEL_PRICES[model] ?? MODEL_PRICES[isImageModel(model) ? DEFAULT_IMAGE_MODEL : DEFAULT_TEXT_MODEL];
  let current = periods[0];
  for (const p of periods) if (p.from <= day) current = p;
  return current;
}

/** Jour « AAAA-MM-JJ » à Paris (copie locale : ce module ne dépend pas de la base). */
function parisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Coût estimé, en dollars, d'un ensemble d'appels. `model` : identifiant du
 * modèle, ou « text » / « image » pour le modèle par défaut (sans modèle :
 * image s'il y a des images) ; `day` : jour des appels (les prix changent le
 * 01/01/2027).
 */
export function estimateCostUsd(usage: { inputTokens: number; outputTokens: number; images: number }, model?: string, day: string = parisToday()): number {
  const id = !model ? (usage.images > 0 ? DEFAULT_IMAGE_MODEL : DEFAULT_TEXT_MODEL) : model === "text" ? DEFAULT_TEXT_MODEL : model === "image" ? DEFAULT_IMAGE_MODEL : model;
  const p = priceFor(id, day);
  return (usage.inputTokens / 1_000_000) * p.inputPerMillion + (usage.outputTokens / 1_000_000) * p.outputPerMillion + usage.images * p.perImage;
}

/** Prix en vigueur un jour donné et prochain changement connu, pour /admin/ia. */
export function pricesInForce(models: string[], day: string = parisToday()): { model: string; price: ModelPrice; next: PricePeriod | null }[] {
  return Array.from(new Set(models.filter(Boolean))).map((model) => ({
    model,
    price: priceFor(model, day),
    next: (MODEL_PRICES[model] ?? []).find((p) => p.from > day) ?? null
  }));
}
