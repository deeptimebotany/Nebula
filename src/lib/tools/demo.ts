// Démos des outils IA de /outils (29/09/2026, décision de Lucas) : SANS
// compte, les pages n'appellent plus l'IA. Elles montrent ces exemples,
// écrits à la main à l'avance pour un cas fictif, et le disent clairement
// (« Démo : exemple préparé à l'avance, sans IA »). La vraie génération, à
// partir de ce que le visiteur a saisi, demande un compte gratuit.

export interface DemoCase<T> {
  /** Le cas fictif sur lequel porte l'exemple (affiché au-dessus du résultat). */
  input: string;
  result: T;
}

export const DEMO_BIO_INSTAGRAM: DemoCase<string[]> = {
  input: "Coach sportif à Lyon, remise en forme après 40 ans · ton chaleureux",
  result: [
    "Coach sportif à Lyon 🏋️ Je vous remets en forme après 40 ans, sans régime extrême. Votre séance d'essai est offerte 👇",
    "Reprendre le sport à 40, 50 ans ou plus ? Oui, et en douceur. Coaching à Lyon et en visio. Premier bilan gratuit ⬇️",
    "Forme, énergie, confiance : on reconstruit tout ça ensemble, pas à pas. Coach à Lyon pour les 40 ans et +.",
    "J'aide les 40+ à retrouver un corps qui suit. Programmes simples, suivi humain. Lyon & en ligne. 💪",
    "Plus jamais « je n'ai pas le temps » : 3 séances de 30 min par semaine suffisent. Coach à Lyon. Essai offert 👇"
  ]
};

export const DEMO_HASHTAGS: DemoCase<{ label: string; items: string[] }[]> = {
  input: "Pâtisserie maison, recettes faciles · Instagram",
  result: [
    { label: "Larges", items: ["#patisserie", "#recette", "#faitmaison", "#dessert", "#gourmandise", "#cuisine", "#foodporn", "#homemade"] },
    { label: "Moyens", items: ["#patisseriemaison", "#recettefacile", "#gateaumaison", "#dessertmaison", "#patissierfrancais", "#recettesucree", "#bakingtime", "#cuisinefacile"] },
    { label: "De niche", items: ["#tartecitronmeringuee", "#recettesansrobot", "#patisseriedudimanche", "#gateauenfants", "#dessertrapide", "#patisserieaddict", "#recette15minutes", "#cakemaisonfacile"] }
  ]
};

export const DEMO_TITRE_YOUTUBE: DemoCase<string[]> = {
  input: "Je teste des recettes de pâtes pendant une semaine",
  result: [
    "7 jours, 7 recettes de pâtes : laquelle mérite sa place ?",
    "Peut-on manger des pâtes tous les jours sans se lasser ?",
    "J'ai testé les pâtes les plus virales : la vérité"
  ]
};

export const DEMO_LEGENDES: DemoCase<{ description: string; title: string }> = {
  input: "Ouverture de notre nouvelle boutique à Lyon ce week-end · Instagram",
  result: {
    description:
      "C'est le grand jour 🎉 Notre nouvelle boutique ouvre ses portes à Lyon ce samedi !\n\nVenez découvrir les nouveautés en avant-première, profiter d'une petite surprise pour les 50 premiers et rencontrer toute l'équipe.\n\n📍 Samedi et dimanche, de 10 h à 19 h\n👉 Dites-nous en commentaire avec qui vous venez !\n\n#lyon #nouvelleboutique #ouverture",
    title: "Notre boutique ouvre à Lyon ce week-end : on vous attend !"
  }
};

export const DEMO_MINIATURE = {
  input: "Photo de voyage en montagne · titre « 5 astuces pour randonner léger »",
  title: "5 ASTUCES"
};

/** Texte commun du bandeau de démo. */
export const DEMO_NOTICE = "Démo : exemple préparé à l'avance pour un cas fictif, sans IA. Créez un compte gratuit pour générer le vôtre avec l'IA, à partir de ce que vous avez saisi.";
