// Thèmes de couleurs disponibles dans Paramètres. Chaque thème redéfinit les
// mêmes variables CSS que globals.css (:root) : appliquer un thème revient à
// réécrire ces variables sur <html>, et TOUTE l'appli suit automatiquement
// puisque tailwind.config.ts fait pointer nebula-*/aurora-*/accent-* dessus.
//
// requiresPlan (optionnel) réserve un thème aux comptes ayant AU MOINS ce
// palier — voir src/lib/plans.ts pour la hiérarchie FREE < PRO < AGENCY. Un
// thème sans requiresPlan reste disponible à tout le monde. Important :
// souscrire au palier requis ne CHANGE jamais le thème actif tout seul, ça
// débloque simplement l'option dans Paramètres — c'est la personne qui doit
// ensuite le sélectionner elle-même (voir /api/settings/theme, qui refait la
// même vérification côté serveur pour ne jamais faire confiance au client).
import type { Plan } from "./plans";

export interface ThemeDefinition {
  key: string;
  label: string;
  vars: Record<string, string>;
  requiresPlan?: Plan;
  // Thème easter egg : jamais listé dans la grille de Paramètres tant qu'on
  // ne l'a pas débloqué (voir settings/page.tsx, qui détecte un mot-clé
  // caché tapé sur la page pour le révéler) — gratuit pour tout le monde
  // une fois trouvé, jamais de requiresPlan associé.
  hidden?: boolean;
}

function v(rgb: number[]): string {
  return rgb.join(" ");
}

export const THEMES: ThemeDefinition[] = [
  {
    key: "nebula",
    label: "Nébuleuse (défaut)",
    vars: {
      "--c-nebula-900": v([11, 21, 56]),
      "--c-nebula-800": v([16, 33, 86]),
      "--c-nebula-700": v([23, 46, 120]),
      "--c-nebula-600": v([30, 60, 159]),
      "--c-nebula-500": v([38, 76, 201]),
      "--c-nebula-400": v([75, 109, 221]),
      "--c-nebula-300": v([118, 144, 229]),
      "--c-nebula-200": v([161, 179, 237]),
      "--c-nebula-100": v([204, 213, 245]),
      "--c-aurora-500": v([59, 100, 237]),
      "--c-aurora-400": v([106, 137, 241]),
      "--c-aurora-300": v([152, 174, 245]),
      "--c-aurora-glow": v([171, 189, 247]),
      "--c-accent-violet": v([113, 73, 233]),
      "--c-accent-cyan": v([83, 234, 219]),
      "--c-accent-magenta": v([233, 73, 174]),
    }
  },
  {
    key: "emeraude",
    label: "Émeraude",
    vars: {
      "--c-nebula-900": v([13, 53, 37]),
      "--c-nebula-800": v([20, 82, 57]),
      "--c-nebula-700": v([29, 114, 80]),
      "--c-nebula-600": v([38, 151, 106]),
      "--c-nebula-500": v([48, 192, 134]),
      "--c-nebula-400": v([84, 212, 161]),
      "--c-nebula-300": v([124, 222, 183]),
      "--c-nebula-200": v([165, 233, 206]),
      "--c-nebula-100": v([206, 243, 228]),
      "--c-aurora-500": v([68, 228, 164]),
      "--c-aurora-400": v([112, 235, 186]),
      "--c-aurora-300": v([157, 241, 207]),
      "--c-aurora-glow": v([175, 244, 216]),
      "--c-accent-violet": v([82, 224, 129]),
      "--c-accent-cyan": v([90, 226, 212]),
      "--c-accent-magenta": v([148, 224, 82]),
    }
  },
  {
    key: "corail",
    label: "Corail",
    vars: {
      "--c-nebula-900": v([59, 19, 7]),
      "--c-nebula-800": v([91, 30, 11]),
      "--c-nebula-700": v([127, 42, 16]),
      "--c-nebula-600": v([168, 55, 21]),
      "--c-nebula-500": v([213, 70, 26]),
      "--c-nebula-400": v([231, 103, 64]),
      "--c-nebula-300": v([237, 139, 110]),
      "--c-nebula-200": v([243, 176, 155]),
      "--c-nebula-100": v([248, 212, 201]),
      "--c-aurora-500": v([244, 96, 52]),
      "--c-aurora-400": v([247, 134, 100]),
      "--c-aurora-300": v([249, 172, 148]),
      "--c-aurora-glow": v([250, 187, 168]),
      "--c-accent-violet": v([240, 66, 124]),
      "--c-accent-cyan": v([240, 180, 76]),
      "--c-accent-magenta": v([240, 89, 66]),
    }
  },
  {
    key: "rose",
    label: "Rose poudré",
    vars: {
      "--c-nebula-900": v([54, 13, 33]),
      "--c-nebula-800": v([83, 19, 51]),
      "--c-nebula-700": v([116, 27, 71]),
      "--c-nebula-600": v([153, 36, 94]),
      "--c-nebula-500": v([194, 46, 120]),
      "--c-nebula-400": v([214, 81, 148]),
      "--c-nebula-300": v([224, 123, 173]),
      "--c-nebula-200": v([234, 164, 199]),
      "--c-nebula-100": v([243, 205, 224]),
      "--c-aurora-500": v([230, 65, 148]),
      "--c-aurora-400": v([236, 111, 173]),
      "--c-aurora-300": v([242, 156, 199]),
      "--c-aurora-glow": v([244, 174, 209]),
      "--c-accent-violet": v([226, 80, 226]),
      "--c-accent-cyan": v([88, 205, 228]),
      "--c-accent-magenta": v([226, 80, 104]),
    }
  },
  {
    key: "ocean",
    label: "Océan profond",
    vars: {
      "--c-nebula-900": v([10, 42, 56]),
      "--c-nebula-800": v([15, 65, 87]),
      "--c-nebula-700": v([21, 91, 121]),
      "--c-nebula-600": v([28, 121, 160]),
      "--c-nebula-500": v([36, 153, 204]),
      "--c-nebula-400": v([73, 178, 223]),
      "--c-nebula-300": v([116, 196, 231]),
      "--c-nebula-200": v([160, 215, 238]),
      "--c-nebula-100": v([203, 233, 246]),
      "--c-aurora-500": v([57, 184, 239]),
      "--c-aurora-400": v([104, 201, 243]),
      "--c-aurora-300": v([151, 218, 247]),
      "--c-aurora-glow": v([170, 225, 248]),
      "--c-accent-violet": v([71, 213, 235]),
      "--c-accent-cyan": v([81, 158, 236]),
      "--c-accent-magenta": v([71, 235, 180]),
    }
  },
  {
    key: "lavande",
    label: "Lavande",
    vars: {
      "--c-nebula-900": v([28, 15, 51]),
      "--c-nebula-800": v([44, 23, 79]),
      "--c-nebula-700": v([61, 32, 111]),
      "--c-nebula-600": v([81, 42, 146]),
      "--c-nebula-500": v([102, 54, 186]),
      "--c-nebula-400": v([132, 89, 207]),
      "--c-nebula-300": v([161, 129, 218]),
      "--c-nebula-200": v([191, 168, 230]),
      "--c-nebula-100": v([220, 208, 241]),
      "--c-aurora-500": v([128, 73, 223]),
      "--c-aurora-400": v([158, 116, 231]),
      "--c-aurora-300": v([188, 160, 238]),
      "--c-aurora-glow": v([201, 177, 241]),
      "--c-accent-violet": v([175, 87, 219]),
      "--c-accent-cyan": v([95, 179, 221]),
      "--c-accent-magenta": v([219, 87, 175]),
    }
  },
  {
    key: "rubis",
    label: "Rubis",
    vars: {
      "--c-nebula-900": v([56, 11, 18]),
      "--c-nebula-800": v([86, 16, 28]),
      "--c-nebula-700": v([120, 23, 39]),
      "--c-nebula-600": v([159, 30, 52]),
      "--c-nebula-500": v([201, 38, 66]),
      "--c-nebula-400": v([221, 75, 99]),
      "--c-nebula-300": v([229, 118, 136]),
      "--c-nebula-200": v([237, 161, 173]),
      "--c-nebula-100": v([245, 204, 211]),
      "--c-aurora-500": v([237, 59, 89]),
      "--c-aurora-400": v([241, 106, 128]),
      "--c-aurora-300": v([245, 152, 168]),
      "--c-aurora-glow": v([247, 171, 184]),
      "--c-accent-violet": v([233, 100, 73]),
      "--c-accent-cyan": v([234, 83, 183]),
      "--c-accent-magenta": v([233, 180, 73]),
    }
  },
  {
    key: "foret",
    label: "Forêt",
    vars: {
      "--c-nebula-900": v([18, 48, 27]),
      "--c-nebula-800": v([28, 74, 42]),
      "--c-nebula-700": v([39, 104, 59]),
      "--c-nebula-600": v([52, 137, 77]),
      "--c-nebula-500": v([66, 174, 98]),
      "--c-nebula-400": v([100, 196, 129]),
      "--c-nebula-300": v([137, 210, 159]),
      "--c-nebula-200": v([174, 224, 189]),
      "--c-nebula-100": v([211, 238, 219]),
      "--c-aurora-500": v([84, 212, 122]),
      "--c-aurora-400": v([124, 222, 154]),
      "--c-aurora-300": v([165, 233, 185]),
      "--c-aurora-glow": v([182, 237, 198]),
      "--c-accent-violet": v([153, 209, 97]),
      "--c-accent-cyan": v([105, 211, 194]),
      "--c-accent-magenta": v([209, 209, 97]),
    }
  },
  {
    key: "graphite",
    label: "Graphite",
    vars: {
      "--c-nebula-900": v([27, 31, 39]),
      "--c-nebula-800": v([42, 48, 60]),
      "--c-nebula-700": v([59, 67, 84]),
      "--c-nebula-600": v([77, 89, 111]),
      "--c-nebula-500": v([98, 113, 141]),
      "--c-nebula-400": v([129, 141, 167]),
      "--c-nebula-300": v([159, 169, 188]),
      "--c-nebula-200": v([189, 196, 209]),
      "--c-nebula-100": v([219, 223, 230]),
      "--c-aurora-500": v([113, 136, 183]),
      "--c-aurora-400": v([146, 164, 200]),
      "--c-aurora-300": v([180, 193, 217]),
      "--c-aurora-glow": v([194, 204, 224]),
      "--c-accent-violet": v([124, 143, 182]),
      "--c-accent-cyan": v([131, 176, 185]),
      "--c-accent-magenta": v([143, 124, 182]),
    }
  },
  {
    key: "cerise",
    label: "Cerise",
    vars: {
      "--c-nebula-900": v([54, 10, 26]),
      "--c-nebula-800": v([84, 15, 40]),
      "--c-nebula-700": v([117, 22, 56]),
      "--c-nebula-600": v([153, 29, 74]),
      "--c-nebula-500": v([194, 38, 94]),
      "--c-nebula-400": v([214, 74, 124]),
      "--c-nebula-300": v([224, 116, 152]),
      "--c-nebula-200": v([234, 158, 180]),
      "--c-nebula-100": v([243, 201, 209]),
      "--c-aurora-500": v([230, 53, 120]),
      "--c-aurora-400": v([236, 98, 145]),
      "--c-aurora-300": v([242, 143, 171]),
      "--c-aurora-glow": v([244, 161, 184]),
      "--c-accent-violet": v([226, 68, 165]),
      "--c-accent-cyan": v([88, 205, 200]),
      "--c-accent-magenta": v([226, 68, 90]),
    }
  },
  {
    key: "menthe",
    label: "Menthe",
    vars: {
      "--c-nebula-900": v([8, 48, 40]),
      "--c-nebula-800": v([13, 74, 62]),
      "--c-nebula-700": v([19, 104, 87]),
      "--c-nebula-600": v([26, 137, 115]),
      "--c-nebula-500": v([34, 174, 146]),
      "--c-nebula-400": v([72, 196, 171]),
      "--c-nebula-300": v([115, 210, 192]),
      "--c-nebula-200": v([158, 224, 211]),
      "--c-nebula-100": v([203, 239, 231]),
      "--c-aurora-500": v([52, 220, 178]),
      "--c-aurora-400": v([98, 230, 196]),
      "--c-aurora-300": v([144, 238, 214]),
      "--c-aurora-glow": v([163, 241, 222]),
      "--c-accent-violet": v([100, 209, 150]),
      "--c-accent-cyan": v([82, 226, 212]),
      "--c-accent-magenta": v([209, 209, 120]),
    }
  },
  {
    // Palette calquée sur les couleurs exactes d'une interface vidéo bien
    // connue en mode sombre (fond quasi noir #0f0f0f, gris neutres, rouge
    // vif en accent) — voir la capture fournie. Pas de "requiresPlan" :
    // accessible à tout le monde comme les autres thèmes de base.
    key: "studio-rouge",
    label: "Studio Rouge",
    vars: {
      "--c-nebula-900": v([15, 15, 15]),
      "--c-nebula-800": v([24, 24, 24]),
      "--c-nebula-700": v([33, 33, 33]),
      "--c-nebula-600": v([48, 48, 48]),
      "--c-nebula-500": v([63, 63, 63]),
      "--c-nebula-400": v([97, 97, 97]),
      "--c-nebula-300": v([132, 132, 132]),
      "--c-nebula-200": v([170, 170, 170]),
      "--c-nebula-100": v([224, 224, 224]),
      "--c-aurora-500": v([204, 0, 0]),
      "--c-aurora-400": v([255, 0, 0]),
      "--c-aurora-300": v([255, 92, 92]),
      "--c-aurora-glow": v([255, 138, 138]),
      "--c-accent-violet": v([255, 59, 48]),
      "--c-accent-cyan": v([255, 99, 71]),
      "--c-accent-magenta": v([220, 20, 60]),
    }
  },
  {
    key: "saphir",
    label: "Saphir",
    requiresPlan: "PRO",
    vars: {
      "--c-nebula-900": v([8, 20, 56]),
      "--c-nebula-800": v([12, 31, 87]),
      "--c-nebula-700": v([17, 44, 121]),
      "--c-nebula-600": v([23, 58, 160]),
      "--c-nebula-500": v([29, 74, 204]),
      "--c-nebula-400": v([66, 109, 223]),
      "--c-nebula-300": v([109, 146, 231]),
      "--c-nebula-200": v([153, 183, 238]),
      "--c-nebula-100": v([199, 215, 246]),
      "--c-aurora-500": v([47, 99, 239]),
      "--c-aurora-400": v([94, 134, 243]),
      "--c-aurora-300": v([141, 170, 247]),
      "--c-aurora-glow": v([160, 184, 248]),
      "--c-accent-violet": v([113, 90, 235]),
      "--c-accent-cyan": v([62, 201, 230]),
      "--c-accent-magenta": v([214, 73, 196]),
    }
  },
  {
    key: "or-imperial",
    label: "Or Impérial (Agence)",
    requiresPlan: "AGENCY",
    vars: {
      "--c-nebula-900": v([20, 16, 8]),
      "--c-nebula-800": v([33, 26, 11]),
      "--c-nebula-700": v([51, 39, 14]),
      "--c-nebula-600": v([74, 56, 18]),
      "--c-nebula-500": v([181, 138, 36]),
      "--c-nebula-400": v([214, 171, 74]),
      "--c-nebula-300": v([227, 196, 124]),
      "--c-nebula-200": v([238, 216, 168]),
      "--c-nebula-100": v([247, 236, 211]),
      "--c-aurora-500": v([224, 175, 56]),
      "--c-aurora-400": v([232, 193, 99]),
      "--c-aurora-300": v([240, 211, 142]),
      "--c-aurora-glow": v([243, 220, 161]),
      "--c-accent-violet": v([201, 140, 235]),
      "--c-accent-cyan": v([99, 214, 196]),
      "--c-accent-magenta": v([235, 140, 90]),
    }
  },
  {
    // Thème easter egg — voir hidden ci-dessus et settings/page.tsx pour le
    // mot-clé caché qui le révèle. Palette "supernova" : or et blanc
    // incandescent, sans rapport avec un palier payant (gratuit une fois
    // trouvé, pour tout le monde).
    key: "nova",
    label: "Nova",
    hidden: true,
    vars: {
      "--c-nebula-900": v([22, 18, 10]),
      "--c-nebula-800": v([37, 30, 15]),
      "--c-nebula-700": v([56, 46, 20]),
      "--c-nebula-600": v([84, 68, 28]),
      "--c-nebula-500": v([214, 178, 90]),
      "--c-nebula-400": v([230, 200, 130]),
      "--c-nebula-300": v([240, 220, 165]),
      "--c-nebula-200": v([247, 235, 200]),
      "--c-nebula-100": v([252, 247, 230]),
      "--c-aurora-500": v([255, 255, 255]),
      "--c-aurora-400": v([255, 250, 235]),
      "--c-aurora-300": v([255, 244, 214]),
      "--c-aurora-glow": v([255, 248, 224]),
      "--c-accent-violet": v([200, 210, 255]),
      "--c-accent-cyan": v([190, 240, 255]),
      "--c-accent-magenta": v([255, 210, 150]),
    }
  },
];

export const DEFAULT_THEME_KEY = "nebula";

/** true si ce compte (selon son palier) peut sélectionner ce thème. */
export function canUseTheme(theme: ThemeDefinition, plan: Plan): boolean {
  if (!theme.requiresPlan) return true;
  const order: Plan[] = ["FREE", "PRO", "AGENCY"];
  return order.indexOf(plan) >= order.indexOf(theme.requiresPlan);
}

export function findTheme(key: string | null | undefined): ThemeDefinition {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}
