// Fenêtre « Paramètres » (10/10/2026, demande de Lucas) : plus une page,
// une fenêtre au milieu de l'écran, le site flouté derrière, avec des
// onglets à gauche. Ce fichier ouvre la fenêtre depuis n'importe quel
// composant (menu du profil, palette Cmd/Ctrl+K, liens « /settings ») sans
// embarquer la fenêtre elle-même, chargée à la demande (settings-host.tsx).
// Aucun accès à `window` au chargement : lu aussi côté serveur (plan du site
// donné à l'assistant, assistant-prompts.ts).

export type SettingsTab = "marque" | "apparence" | "focus" | "sons" | "notifications" | "parrainage" | "compte";

/** Onglets de la fenêtre, dans l'ordre (libellés lus aussi par l'assistant et la visite guidée). */
export const SETTINGS_TABS: { value: SettingsTab; label: string; description: string }[] = [
  { value: "marque", label: "Marque", description: "Nom, fuseau horaire et marque blanche de la marque active." },
  { value: "apparence", label: "Apparence", description: "Mode clair ou sombre, couleurs, fond d'écran et ciel étoilé." },
  { value: "focus", label: "Focus et réussites", description: "Mode focus et petits effets à débloquer." },
  { value: "sons", label: "Sons", description: "Les sons de l'interface, des succès et des publications." },
  { value: "notifications", label: "Notifications", description: "Les e-mails que Nebula vous envoie." },
  { value: "parrainage", label: "Parrainage", description: "Votre lien d'invitation." },
  { value: "compte", label: "Compte", description: "Pseudo, mot de passe, vos données et suppression du compte." }
];

export const SETTINGS_TAB_LABELS = SETTINGS_TABS.map((t) => t.label);

export const SETTINGS_OPEN_EVENT = "nebula:open-settings";

/**
 * Onglet demandé avant que la fenêtre n'écoute (page /settings ouverte
 * directement : son effet passe avant celui de la coquille). `undefined` :
 * rien en attente ; `null` : ouvrir sur l'onglet par défaut.
 */
let pending: SettingsTab | null | undefined;

/** Ouvre la fenêtre Paramètres, éventuellement sur un onglet. */
export function openSettings(tab?: SettingsTab) {
  pending = tab ?? null;
  window.dispatchEvent(new CustomEvent<SettingsTab | undefined>(SETTINGS_OPEN_EVENT, { detail: tab }));
}

/** Demande d'ouverture en attente (et l'efface). */
export function takePendingSettings(): SettingsTab | null | undefined {
  const p = pending;
  pending = undefined;
  return p;
}

/**
 * Onglet d'une ancre « /settings#… ». Les anciennes ancres de la page
 * restent valables : #apparence (ex-« Apparence & Succès ») et #compte
 * (ex-onglet Compte : notifications, parrainage, confidentialité).
 */
export function settingsTabFromHash(hash: string): SettingsTab {
  const h = hash.replace(/^#/, "");
  return SETTINGS_TABS.some((t) => t.value === h) ? (h as SettingsTab) : "marque";
}
