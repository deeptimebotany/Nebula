// Prix de Gemini (lot E5, 29/09/2026) : pour ESTIMER le coût de l'IA, jour
// par jour, dans /admin/ia. Coût estimé = jetons × prix. Ce ne sont pas les
// montants facturés par Google (qui font foi dans Google Cloud →
// Facturation) : à revérifier sur la page officielle des prix
// (https://ai.google.dev/gemini-api/docs/pricing) et à mettre à jour ici,
// avec la date de vérification.
//
// Valeurs du brief (29/09/2026, « à revérifier ») : un appel texte ≈ 0,003 à
// 0,004 $, une image gemini-2.5-flash-image ≈ 0,04 $.

export interface ModelPrice {
  /** Dollars par million de jetons envoyés (texte, images en entrée). */
  inputPerMillion: number;
  /** Dollars par million de jetons produits (réponse, « pensée » comprise). */
  outputPerMillion: number;
  /** Dollars par image générée (modèles d'image). */
  perImage: number;
}

export const AI_PRICING: { verifiedAt: string; text: ModelPrice; image: ModelPrice } = {
  verifiedAt: "2026-09-29",
  // Modèle de texte (GEMINI_MODEL).
  text: { inputPerMillion: 0.3, outputPerMillion: 2.5, perImage: 0 },
  // Modèle d'image (GEMINI_IMAGE_MODEL) : l'image produite est comptée au
  // prix par image (ses jetons de sortie ne sont pas comptés une 2e fois).
  image: { inputPerMillion: 0.3, outputPerMillion: 0, perImage: 0.039 }
};

/** Coût estimé, en dollars, d'un ensemble d'appels. */
export function estimateCostUsd(usage: { inputTokens: number; outputTokens: number; images: number }, model: "text" | "image" = usage.images > 0 ? "image" : "text"): number {
  const p = AI_PRICING[model];
  return (usage.inputTokens / 1_000_000) * p.inputPerMillion + (usage.outputTokens / 1_000_000) * p.outputPerMillion + usage.images * p.perImage;
}
