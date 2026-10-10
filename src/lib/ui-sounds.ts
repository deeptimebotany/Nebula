// Sons courts de l'interface (lot U5, brief « Essai 14 jours », 29/09/2026).
// Créés pour Nebula, synthétisés avec Web Audio (aucun fichier) ; le code
// des sons (ui-sounds-synth.ts) n'est chargé qu'au premier son.
//
// Moments : « Suivant » de la visite guidée (« Bulle »), fin de la visite
// (« Accord qui s'ouvre »), première publication programmée ou publiée
// (« Grand pulsar ») — sons refaits le 10/10/2026 dans le style du Pulsar,
// voir ui-sounds-synth.ts —, mission réussie et coffre ouvert (son des
// célébrations). La création du compte garde le son de l'intro, inchangé.
//
// Règles :
//   - réglage « Sons de l'interface » (Paramètres → Sons),
//     activé par défaut, enregistré sur le compte : coupé → aucun son nulle
//     part ;
//   - seulement après un geste de l'utilisateur (jamais au chargement d'une
//     page), jamais sur une erreur (l'appelant ne joue qu'après un succès) ;
//   - au plus un son par seconde ;
//   - Mode focus (actif par défaut) : les sons de la visite jouent quand
//     même (première session) ; les autres suivent le Mode focus.

export type UiSound = "tick" | "finish" | "first-post" | "celebration";

const MIN_GAP_MS = 1000;
let lastPlayedAt = 0;
let gestureSeen = false;
let ctx: AudioContext | null = null;
let installed = false;

/** Écoute le premier geste (clic, touche) : aucun son avant. À appeler une fois côté client. */
export function installUiSoundGesture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const onGesture = () => {
    gestureSeen = true;
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}

function hasUserGesture(): boolean {
  if (gestureSeen) return true;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return Boolean(activation?.hasBeenActive);
}

function audioContext(): AudioContext | null {
  try {
    if (ctx && ctx.state !== "closed") {
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      return ctx;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

export interface UiSoundOptions {
  /** Réglage du compte (me.uiSounds). */
  enabled: boolean;
  /** Mode focus actif. */
  focusMode: boolean;
  /** Joue même en Mode focus (sons de la visite guidée). */
  allowInFocus?: boolean;
  now?: number;
}

/** Décide si un son peut partir (fonction pure, testée). */
export function canPlayUiSound(opts: UiSoundOptions & { gesture: boolean; lastPlayedAt: number }): boolean {
  if (!opts.enabled || !opts.gesture) return false;
  if (opts.focusMode && !opts.allowInFocus) return false;
  return (opts.now ?? Date.now()) - opts.lastPlayedAt >= MIN_GAP_MS;
}

/** Joue un son court si les règles le permettent. Ne lève jamais. */
export function playUiSound(kind: UiSound, opts: UiSoundOptions): void {
  if (typeof window === "undefined") return;
  const now = opts.now ?? Date.now();
  if (!canPlayUiSound({ ...opts, now, gesture: hasUserGesture(), lastPlayedAt })) return;
  lastPlayedAt = now;
  if (kind === "celebration") {
    void import("@/lib/cosmic-audio").then((m) => m.playAchievementArpeggio()).catch(() => undefined);
    return;
  }
  const audio = audioContext();
  if (!audio) return;
  void import("@/lib/ui-sounds-synth").then((m) => m.synthUiSound(audio, kind)).catch(() => undefined);
}
