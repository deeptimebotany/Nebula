// Testeur de titre YouTube : score heuristique local (longueur, chiffre, mot
// fort, question ou promesse, majuscules), partagé par l'outil public et
// l'outil de l'application. Sans IA.

export const POWER_WORDS = ["secret", "erreur", "erreurs", "vérité", "jamais", "enfin", "pourquoi", "comment", "gratuit", "simple", "rapide", "meilleur", "pire", "incroyable", "avant", "après", "sans", "règle", "règles", "astuce", "astuces", "méthode", "guide", "complet", "ultime", "test", "testé", "vs", "contre"];

export interface TitleCheck {
  label: string;
  ok: boolean;
  hint: string;
}

export function scoreTitle(title: string): { score: number; checks: TitleCheck[] } {
  const t = title.trim();
  const len = t.length;
  const words = t.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const checks: TitleCheck[] = [
    { label: "Longueur 40–60 caractères", ok: len >= 40 && len <= 60, hint: len < 40 ? "Un peu court : ajoutez le bénéfice ou le contexte." : len > 60 ? "Trop long : YouTube coupe après ~60 caractères." : "Bonne longueur." },
    { label: "Contient un chiffre", ok: /\d/.test(t), hint: "Un chiffre (3 erreurs, 7 jours, 10 kg) rend la promesse concrète." },
    { label: "Contient un mot fort", ok: words.some((w) => POWER_WORDS.includes(w)), hint: "Un mot comme « erreur », « secret », « enfin », « sans » crée l'enjeu." },
    { label: "Question ou promesse", ok: /\?$/.test(t) || /^(comment|pourquoi|combien)\b/i.test(t), hint: "Une question ou un « comment… » ouvre une boucle de curiosité." },
    { label: "Pas tout en majuscules", ok: !(len > 8 && t === t.toUpperCase()), hint: "Les majuscules partout se lisent comme un cri : gardez-les pour un mot." }
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  return { score, checks };
}
