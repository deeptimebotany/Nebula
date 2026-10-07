// Étoile de l'IA (06/10/2026, demande de Lucas) : partout où un bouton ou
// un titre signale l'IA, l'étoile est blanche au repos (gris foncé en mode
// clair, où le blanc serait invisible), prend la couleur de l'IA (l'accent
// du thème, violet par défaut) au survol ou au focus du bouton qui la porte,
// et la garde tant que l'IA travaille ou que son panneau est ouvert
// (`active`) : génération en cours, chat « Demander à Nebula » ouvert… Elle
// redevient blanche quand c'est fini. Règles CSS : `.nb-ai-icon` dans
// globals.css.
//  - `tone="onAccent"` : étoile posée sur un bouton plein couleur d'accent
//    (bouton principal) : elle garde la couleur du texte du bouton (blanc),
//    sinon elle disparaîtrait dans le fond au survol.
// Sans hook : utilisable dans un composant serveur.
import { clsx } from "@/lib/clsx";
import { IconSparkle } from "@/components/dashboard/icons";

export function AiIcon({ className, active = false, tone = "default" }: { className?: string; active?: boolean; tone?: "default" | "onAccent" }) {
  return <IconSparkle className={clsx("nb-ai-icon", tone === "onAccent" && "nb-ai-icon-on-accent", active && "nb-ai-icon-active", className)} />;
}
